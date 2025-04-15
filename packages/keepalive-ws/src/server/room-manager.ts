import { Connection } from "./connection";
import Redis from "ioredis";
import type { RedisOptions } from "ioredis";

export interface RoomManager {
  addToRoom(roomName: string, connection: Connection): Promise<void>;
  removeFromRoom(roomName: string, connection: Connection): Promise<void>;
  removeFromAllRooms(connection: Connection | string): Promise<void>;
  getRoom(roomName: string): Promise<Connection[]>;
  clearRoom(roomName: string): Promise<void>;
  broadcastRoom(roomName: string, command: string, payload: any): Promise<void>;
  broadcastRoomExclude(
    roomName: string,
    command: string,
    payload: any,
    connection: Connection | Connection[]
  ): Promise<void>;
}

export class InMemoryRoomManager implements RoomManager {
  private rooms: { [roomName: string]: Set<string> } = {};
  private getConnectionById: (id: string) => Connection | undefined;

  constructor(getConnectionById: (id: string) => Connection | undefined) {
    this.getConnectionById = getConnectionById;
  }

  async addToRoom(roomName: string, connection: Connection): Promise<void> {
    this.rooms[roomName] = this.rooms[roomName] ?? new Set();
    this.rooms[roomName].add(connection.id);
  }

  async removeFromRoom(
    roomName: string,
    connection: Connection
  ): Promise<void> {
    if (!this.rooms[roomName]) return;
    this.rooms[roomName].delete(connection.id);
  }

  async removeFromAllRooms(connection: Connection | string): Promise<void> {
    const connectionId =
      typeof connection === "string" ? connection : connection.id;
    Object.keys(this.rooms).forEach((roomName) => {
      this.rooms[roomName].delete(connectionId);
    });
  }

  async getRoom(roomName: string): Promise<Connection[]> {
    const ids = this.rooms[roomName] || new Set();
    return Array.from(ids)
      .map((id) => this.getConnectionById(id))
      .filter(Boolean) as Connection[];
  }

  async clearRoom(roomName: string): Promise<void> {
    this.rooms[roomName] = new Set();
  }

  async broadcastRoom(
    roomName: string,
    command: string,
    payload: any
  ): Promise<void> {
    const ids = this.rooms[roomName];
    if (!ids) return;
    for (const connectionId of ids) {
      const connection = this.getConnectionById(connectionId);
      if (connection) {
        connection.send({ command, payload });
      }
    }
  }

  async broadcastRoomExclude(
    roomName: string,
    command: string,
    payload: any,
    connection: Connection | Connection[]
  ): Promise<void> {
    const ids = this.rooms[roomName];
    if (!ids) return;
    const excludeIds = Array.isArray(connection)
      ? connection.map((c) => c.id)
      : [connection.id];
    for (const connectionId of ids) {
      if (!excludeIds.includes(connectionId)) {
        const conn = this.getConnectionById(connectionId);
        if (conn) {
          conn.send({ command, payload });
        }
      }
    }
  }
}

export class RedisRoomManager implements RoomManager {
  private redis: Redis;
  private getConnectionById: (id: string) => Connection | undefined;

  constructor(
    redisOptions: RedisOptions,
    getConnectionById: (id: string) => Connection | undefined
  ) {
    this.redis = new Redis(redisOptions);
    this.getConnectionById = getConnectionById;
    // TODO: reconnect logic?
  }

  private roomKey(roomName: string) {
    return `room:${roomName}`;
  }

  private connRoomsKey(connectionId: string) {
    return `connection:${connectionId}:rooms`;
  }

  async addToRoom(roomName: string, connection: Connection): Promise<void> {
    await this.redis.sadd(this.roomKey(roomName), connection.id);
    await this.redis.sadd(this.connRoomsKey(connection.id), roomName);
  }

  async removeFromRoom(
    roomName: string,
    connection: Connection
  ): Promise<void> {
    await this.redis.srem(this.roomKey(roomName), connection.id);
    await this.redis.srem(this.connRoomsKey(connection.id), roomName);
  }

  async removeFromAllRooms(connection: Connection | string): Promise<void> {
    const connectionId =
      typeof connection === "string" ? connection : connection.id;
    const roomNames = await this.redis.smembers(
      this.connRoomsKey(connectionId)
    );

    if (!(roomNames.length > 0)) return;

    const pipeline = this.redis.pipeline();
    for (const roomName of roomNames) {
      pipeline.srem(this.roomKey(roomName), connectionId);
    }
    pipeline.del(this.connRoomsKey(connectionId));
    await pipeline.exec();
  }

  async getRoom(roomName: string): Promise<Connection[]> {
    const ids = await this.redis.smembers(this.roomKey(roomName));
    return ids
      .map((id) => this.getConnectionById(id))
      .filter(Boolean) as Connection[];
  }

  async clearRoom(roomName: string): Promise<void> {
    await this.redis.del(this.roomKey(roomName));
  }

  async broadcastRoom(
    roomName: string,
    command: string,
    payload: any
  ): Promise<void> {
    const ids = await this.redis.smembers(this.roomKey(roomName));
    for (const connectionId of ids) {
      const connection = this.getConnectionById(connectionId);
      if (connection) {
        connection.send({ command, payload });
      }
    }
  }

  async broadcastRoomExclude(
    roomName: string,
    command: string,
    payload: any,
    connection: Connection | Connection[]
  ): Promise<void> {
    const ids = await this.redis.smembers(this.roomKey(roomName));
    const excludeIds = Array.isArray(connection)
      ? connection.map((c) => c.id)
      : [connection.id];
    for (const connectionId of ids) {
      if (!excludeIds.includes(connectionId)) {
        const conn = this.getConnectionById(connectionId);
        if (conn) {
          conn.send({ command, payload });
        }
      }
    }
  }
}
