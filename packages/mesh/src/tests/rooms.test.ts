import { describe, test, expect, beforeEach, afterEach } from "vitest";
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
  });

const flushRedis = async () => {
  const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });
  await redis.flushdb();
  await redis.quit();
};

describe("KeepAliveServer", () => {
  const port = 8128;
  let server: MeshServer;
  let clientA: MeshClient;
  let clientB: MeshClient;

  beforeEach(async () => {
    await flushRedis();

    server = createTestServer(port);
    await server.ready();

    clientA = new MeshClient(`ws://localhost:${port}`);
    clientB = new MeshClient(`ws://localhost:${port}`);
  });

  afterEach(async () => {
    await clientA.close();
    await clientB.close();

    await server.close();
  });

  test("isInRoom", async () => {
    server.registerCommand("join-room", async (ctx) => {
      const { roomName } = ctx.payload;
      await server.roomManager.addToRoom(roomName, ctx.connection);
      return { success: true };
    });

    await clientA.connect();
    await clientB.connect();

    await clientA.command("join-room", { roomName: "room1" });
    await clientB.command("join-room", { roomName: "room1" });
    await clientA.command("join-room", { roomName: "room2" });

    const connectionA = server.connectionManager.getLocalConnections()[0]!;
    const connectionB = server.connectionManager.getLocalConnections()[1]!;

    expect(await server.isInRoom("room1", connectionA)).toBe(true);
    expect(await server.isInRoom("room1", connectionB)).toBe(true);
    expect(await server.isInRoom("room2", connectionA)).toBe(true);
    expect(await server.isInRoom("room2", connectionB)).toBe(false);
    expect(await server.isInRoom("room3", connectionA)).toBe(false);
  });
});
