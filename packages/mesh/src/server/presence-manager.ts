import type { Redis } from "ioredis";
import type { Connection } from "./connection";
import type { RoomManager } from "./room-manager";

type ChannelPattern = string | RegExp;

export class PresenceManager {
  private redis: Redis;
  private roomManager: RoomManager;
  private trackedRooms: ChannelPattern[] = [];
  private roomGuards: Map<
    ChannelPattern,
    (connection: Connection, roomName: string) => Promise<boolean> | boolean
  > = new Map();
  private roomTTLs: Map<ChannelPattern, number> = new Map();
  private defaultTTL = 30_000; // 30 seconds default TTL

  constructor(redis: Redis, roomManager: RoomManager) {
    this.redis = redis;
    this.roomManager = roomManager;
  }

  trackRoom(
    roomPattern: ChannelPattern,
    guardOrOptions?:
      | ((
          connection: Connection,
          roomName: string
        ) => Promise<boolean> | boolean)
      | {
          ttl?: number;
          guard?: (
            connection: Connection,
            roomName: string
          ) => Promise<boolean> | boolean;
        }
  ): void {
    this.trackedRooms.push(roomPattern);

    if (typeof guardOrOptions === "function") {
      this.roomGuards.set(roomPattern, guardOrOptions);
    } else if (guardOrOptions && typeof guardOrOptions === "object") {
      if (guardOrOptions.guard) {
        this.roomGuards.set(roomPattern, guardOrOptions.guard);
      }

      if (guardOrOptions.ttl && typeof guardOrOptions.ttl === "number") {
        this.roomTTLs.set(roomPattern, guardOrOptions.ttl);
      }
    }
  }

  async isRoomTracked(
    roomName: string,
    connection?: Connection
  ): Promise<boolean> {
    const matchedPattern = this.trackedRooms.find((pattern) =>
      typeof pattern === "string"
        ? pattern === roomName
        : pattern.test(roomName)
    );

    if (!matchedPattern) {
      return false;
    }

    if (connection) {
      const guard = this.roomGuards.get(matchedPattern);
      if (guard) {
        try {
          return await Promise.resolve(guard(connection, roomName));
        } catch (e) {
          return false;
        }
      }
    }

    return true;
  }

  getRoomTTL(roomName: string): number {
    const matchedPattern = this.trackedRooms.find((pattern) =>
      typeof pattern === "string"
        ? pattern === roomName
        : pattern.test(roomName)
    );

    if (matchedPattern) {
      const ttl = this.roomTTLs.get(matchedPattern);
      if (ttl !== undefined) {
        return ttl;
      }
    }

    return this.defaultTTL;
  }

  private presenceRoomKey(roomName: string): string {
    return `mesh:presence:room:${roomName}`;
  }

  private presenceConnectionKey(
    roomName: string,
    connectionId: string
  ): string {
    return `mesh:presence:room:${roomName}:conn:${connectionId}`;
  }

  async markOnline(connectionId: string, roomName: string): Promise<void> {
    const roomKey = this.presenceRoomKey(roomName);
    const connKey = this.presenceConnectionKey(roomName, connectionId);
    const ttl = this.getRoomTTL(roomName);

    const pipeline = this.redis.pipeline();
    pipeline.sadd(roomKey, connectionId);
    pipeline.set(connKey, "", "EX", Math.floor(ttl / 1000));
    await pipeline.exec();

    await this.publishPresenceUpdate(roomName, connectionId, "join");
  }

  async markOffline(connectionId: string, roomName: string): Promise<void> {
    const roomKey = this.presenceRoomKey(roomName);
    const connKey = this.presenceConnectionKey(roomName, connectionId);

    const pipeline = this.redis.pipeline();
    pipeline.srem(roomKey, connectionId);
    pipeline.del(connKey);
    await pipeline.exec();

    await this.publishPresenceUpdate(roomName, connectionId, "leave");
  }

  async refreshPresence(connectionId: string, roomName: string): Promise<void> {
    const connKey = this.presenceConnectionKey(roomName, connectionId);
    const ttl = this.getRoomTTL(roomName);

    await this.redis.set(connKey, "", "EX", Math.floor(ttl / 1000));
  }

  async getPresentConnections(roomName: string): Promise<string[]> {
    return this.redis.smembers(this.presenceRoomKey(roomName));
  }

  private async publishPresenceUpdate(
    roomName: string,
    connectionId: string,
    type: "join" | "leave"
  ): Promise<void> {
    const channel = `mesh:presence:updates:${roomName}`;
    const message = JSON.stringify({
      type,
      connectionId,
      roomName,
      timestamp: Date.now(),
    });

    await this.redis.publish(channel, message);
  }

  async cleanupConnection(connection: Connection): Promise<void> {
    const connectionId = connection.id;
    const rooms = await this.roomManager.getRoomsForConnection(connectionId);

    for (const roomName of rooms) {
      if (await this.isRoomTracked(roomName)) {
        await this.markOffline(connectionId, roomName);
      }
    }
  }
}
