import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import Redis from "ioredis";
import { MeshServer } from "../server";
import { MeshClient } from "../client";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = process.env.REDIS_PORT
  ? parseInt(process.env.REDIS_PORT, 10)
  : 6379;

const createTestServer = (port: number) =>
  new MeshServer({
    port,
    redisOptions: {
      host: REDIS_HOST,
      port: REDIS_PORT,
    },
    pingInterval: 1000,
    latencyInterval: 500,
  });

const flushRedis = async () => {
  const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });
  await redis.flushdb();
  await redis.quit();
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Presence Subscription", () => {
  const port = 8140;
  let server: MeshServer;
  let client1: MeshClient;
  let client2: MeshClient;

  beforeEach(async () => {
    await flushRedis();

    server = createTestServer(port);
    server.trackPresence(/^test:room:.*/);
    server.trackPresence("guarded:room");
    await server.ready();

    client1 = new MeshClient(`ws://localhost:${port}`);
    client2 = new MeshClient(`ws://localhost:${port}`);
  });

  afterEach(async () => {
    await client1.close();
    await client2.close();
    await server.close();
  });

  test("client can subscribe to presence for a tracked room", async () => {
    const roomName = "test:room:1";
    await client1.connect();

    const callback = vi.fn();
    const { success, present } = await client1.subscribePresence(
      roomName,
      callback
    );

    expect(success).toBe(true);
    expect(Array.isArray(present)).toBe(true);
    expect(present.length).toBe(0);
  });

  test("client cannot subscribe to presence for an untracked room", async () => {
    const roomName = "untracked:room";
    await client1.connect();

    const callback = vi.fn();
    const { success, present } = await client1.subscribePresence(
      roomName,
      callback
    );

    expect(success).toBe(false);
    expect(present.length).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });

  test("presence guard prevents unauthorized subscriptions", async () => {
    await client1.connect();
    await client2.connect();

    const connections = server.connectionManager.getLocalConnections();
    const connection1Id = connections[0]?.id;

    server.trackPresence(
      "guarded:room",
      (connection, roomName) => connection.id === connection1Id
    );

    const callback1 = vi.fn();
    const result1 = await client1.subscribePresence("guarded:room", callback1);

    const callback2 = vi.fn();
    const result2 = await client2.subscribePresence("guarded:room", callback2);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(false);
    expect(callback2).not.toHaveBeenCalled();
  });

  test("client receives presence updates when users join and leave", async () => {
    const roomName = "test:room:updates";
    await client1.connect();
    await client2.connect();

    const updates: any[] = [];
    const callback = vi.fn((update: any) => {
      updates.push(update);
    });

    await client1.subscribePresence(roomName, callback);

    const connections = server.connectionManager.getLocalConnections();

    await server.addToRoom(roomName, connections[1]!);
    await wait(100);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(updates[0].type).toBe("join");
    expect(updates[0].roomName).toBe(roomName);
    expect(typeof updates[0].connectionId).toBe("string");
    expect(typeof updates[0].timestamp).toBe("number");

    await server.removeFromRoom(roomName, connections[1]!);
    await wait(100);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(updates[1].type).toBe("leave");
    expect(updates[1].roomName).toBe(roomName);
    expect(typeof updates[1].connectionId).toBe("string");
    expect(typeof updates[1].timestamp).toBe("number");
  });

  test("client stops receiving presence updates after unsubscribing", async () => {
    const roomName = "test:room:unsub";
    await client1.connect();
    await client2.connect();

    const updates: any[] = [];
    const callback = vi.fn((update: any) => {
      updates.push(update);
    });

    await client1.subscribePresence(roomName, callback);

    const connections = server.connectionManager.getLocalConnections();

    await server.addToRoom(roomName, connections[1]!);
    await wait(100);

    expect(callback).toHaveBeenCalledTimes(1);

    const unsubSuccess = await client1.unsubscribePresence(roomName);
    expect(unsubSuccess).toBe(true);

    callback.mockReset();

    await server.removeFromRoom(roomName, connections[1]!);
    await wait(100);

    expect(callback).not.toHaveBeenCalled();
  });

  test("presence is maintained with custom TTL", async () => {
    const roomName = "test:room:ttl";
    const shortTTL = 200;

    server.trackPresence(roomName, { ttl: shortTTL });

    await client1.connect();
    await client2.connect();

    const connections = server.connectionManager.getLocalConnections();
    const connection2 = connections[1]!;

    await server.addToRoom(roomName, connection2);

    let present = await server.presenceManager.getPresentConnections(roomName);
    expect(present).toContain(connection2.id);

    // wait for less than TTL and verify still present
    await wait(shortTTL / 2);
    present = await server.presenceManager.getPresentConnections(roomName);
    expect(present).toContain(connection2.id);

    // simulate pong to refresh presence
    connection2.emit("pong", connection2.id);

    // wait for more than the original TTL
    await wait(shortTTL + 100);

    // should still be present because of the refresh
    present = await server.presenceManager.getPresentConnections(roomName);
    expect(present).toContain(connection2.id);
  });

  test("initial presence list is correct when subscribing", async () => {
    const roomName = "test:room:initial";
    await client1.connect();
    await client2.connect();

    const connections = server.connectionManager.getLocalConnections();

    await server.addToRoom(roomName, connections[0]!);
    await server.addToRoom(roomName, connections[1]!);
    await wait(100);

    const callback = vi.fn();
    const { success, present } = await client1.subscribePresence(
      roomName,
      callback
    );

    expect(success).toBe(true);
    expect(present.length).toBe(2);
    expect(present).toContain(connections[0]!.id);
    expect(present).toContain(connections[1]!.id);
  });

  test("presence is cleaned up when connection is closed", async () => {
    const roomName = "test:room:cleanup";
    await client1.connect();
    await client2.connect();

    const connections = server.connectionManager.getLocalConnections();
    const connection2 = connections[1]!;

    await server.addToRoom(roomName, connection2);

    let present = await server.presenceManager.getPresentConnections(roomName);
    expect(present).toContain(connection2.id);

    await client2.close();

    await wait(100);

    present = await server.presenceManager.getPresentConnections(roomName);
    expect(present).not.toContain(connection2.id);
  });
});
