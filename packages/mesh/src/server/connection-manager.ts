import type Redis from "ioredis";
import type { Connection } from "./connection";
import type { RoomManager } from "./room-manager";

const CONNECTIONS_HASH_KEY = "mesh:connections";
const INSTANCE_CONNECTIONS_KEY_PREFIX = "mesh:connections:";

export class ConnectionManager {
  private redis: Redis;
  private instanceId: string;
  private localConnections: { [id: string]: Connection } = {};
  private roomManager: RoomManager;

  constructor(redis: Redis, instanceId: string, roomManager: RoomManager) {
    this.redis = redis;
    this.instanceId = instanceId;
    this.roomManager = roomManager;
  }

  getLocalConnections(): Connection[] {
    return Object.values(this.localConnections);
  }

  getLocalConnection(id: string): Connection | null {
    return this.localConnections[id] ?? null;
  }

  async registerConnection(connection: Connection): Promise<void> {
    this.localConnections[connection.id] = connection;

    const pipeline = this.redis.pipeline();
    pipeline.hset(CONNECTIONS_HASH_KEY, connection.id, this.instanceId);
    pipeline.sadd(
      this.getInstanceConnectionsKey(this.instanceId),
      connection.id
    );
    await pipeline.exec();
  }

  private getInstanceConnectionsKey(instanceId: string): string {
    return `${INSTANCE_CONNECTIONS_KEY_PREFIX}${instanceId}`;
  }

  async deregisterConnection(connection: Connection): Promise<void> {
    const instanceId = await this.getInstanceIdForConnection(connection);
    if (!instanceId) {
      return;
    }

    const pipeline = this.redis.pipeline();
    pipeline.hdel(CONNECTIONS_HASH_KEY, connection.id);
    pipeline.srem(this.getInstanceConnectionsKey(instanceId), connection.id);
    await pipeline.exec();
  }

  async getInstanceIdForConnection(
    connection: Connection
  ): Promise<string | null> {
    return this.redis.hget(CONNECTIONS_HASH_KEY, connection.id);
  }

  async getInstanceIdsForConnections(
    connectionIds: string[]
  ): Promise<{ [connectionId: string]: string | null }> {
    if (connectionIds.length === 0) {
      return {};
    }

    const instanceIds = await this.redis.hmget(
      CONNECTIONS_HASH_KEY,
      ...connectionIds
    );
    const result: { [connectionId: string]: string | null } = {};

    connectionIds.forEach((id, index) => {
      result[id] = instanceIds[index] ?? null;
    });

    return result;
  }

  async getAllConnectionIds(): Promise<string[]> {
    return this.redis.hkeys(CONNECTIONS_HASH_KEY);
  }

  async getLocalConnectionIds(): Promise<string[]> {
    return this.redis.smembers(this.getInstanceConnectionsKey(this.instanceId));
  }

  async setMetadata(connection: Connection, metadata: any) {
    const pipeline = this.redis.pipeline();
    pipeline.hset(
      CONNECTIONS_HASH_KEY,
      connection.id,
      JSON.stringify(metadata)
    );
    await pipeline.exec();
  }

  async getMetadata(connection: Connection) {
    const metadata = await this.redis.hget(CONNECTIONS_HASH_KEY, connection.id);
    return metadata ? JSON.parse(metadata) : null;
  }

  async getAllMetadata(): Promise<Array<{ [connectionId: string]: any }>> {
    const connectionIds = await this.getAllConnectionIds();
    const metadata = await this.getInstanceIdsForConnections(connectionIds);
    return connectionIds.map((id) => ({
      [id]: metadata[id] ? JSON.parse(metadata[id]) : null,
    }));
  }

  async getAllMetadataForRoom(
    roomName: string
  ): Promise<Array<{ [connectionId: string]: any }>> {
    const connectionIds = await this.roomManager.getRoomConnectionIds(roomName);
    const metadata = await this.getInstanceIdsForConnections(connectionIds);
    return connectionIds.map((id) => ({
      [id]: metadata[id] ? JSON.parse(metadata[id]) : null,
    }));
  }

  async cleanupConnection(connection: Connection): Promise<void> {
    await this.deregisterConnection(connection);
  }
}
