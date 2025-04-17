import Redis from "ioredis";
import type { Connection } from "./connection";

export class RoomManager {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  private roomKey(roomName: string) {
    return `room:${roomName}`;
  }

  private connectionsRoomKey(connectionId: string) {
    return `connection:${connectionId}:rooms`;
  }

  async getRoomConnectionIds(roomName: string): Promise<string[]> {
    return this.redis.smembers(this.roomKey(roomName));
  }

  async connectionIsInRoom(
    roomName: string,
    connection: Connection | string
  ): Promise<boolean> {
    const connectionId =
      typeof connection === "string" ? connection : connection.id;
    return !!(await this.redis.sismember(this.roomKey(roomName), connectionId));
  }

  async addToRoom(
    roomName: string,
    connection: Connection | string
  ): Promise<void> {
    const connectionId =
      typeof connection === "string" ? connection : connection.id;
    await this.redis.sadd(this.roomKey(roomName), connectionId);
    await this.redis.sadd(this.connectionsRoomKey(connectionId), roomName);
  }

  async removeFromRoom(
    roomName: string,
    connection: Connection | string
  ): Promise<void> {
    const connectionId =
      typeof connection === "string" ? connection : connection.id;
    const pipeline = this.redis.pipeline();
    pipeline.srem(this.roomKey(roomName), connectionId);
    pipeline.srem(this.connectionsRoomKey(connectionId), roomName);
    await pipeline.exec();
  }

  async removeFromAllRooms(connection: Connection | string) {
    const connectionId =
      typeof connection === "string" ? connection : connection.id;
    const rooms = await this.redis.smembers(
      this.connectionsRoomKey(connectionId)
    );
    const pipeline = this.redis.pipeline();
    for (const room of rooms) {
      pipeline.srem(this.roomKey(room), connectionId);
    }
    pipeline.del(this.connectionsRoomKey(connectionId));
    await pipeline.exec();
  }

  async clearRoom(roomName: string) {
    const connectionIds = await this.getRoomConnectionIds(roomName);
    const pipeline = this.redis.pipeline();
    for (const connectionId of connectionIds) {
      pipeline.srem(this.connectionsRoomKey(connectionId), roomName);
    }
    pipeline.del(this.roomKey(roomName));
    await pipeline.exec();
  }

  async cleanupConnection(connection: Connection): Promise<void> {
    const rooms = await this.redis.smembers(
      this.connectionsRoomKey(connection.id)
    );
    const pipeline = this.redis.pipeline();
    for (const room of rooms) {
      pipeline.srem(this.roomKey(room), connection.id);
    }
    pipeline.del(this.connectionsRoomKey(connection.id));
    await pipeline.exec();
  }
}
