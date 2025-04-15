import { describe, test, expect, beforeEach, afterEach } from "vitest";
import Redis from "ioredis";
import { KeepAliveClient, Status } from "../src/client/client";
import { KeepAliveServer } from "../src/server/index";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = process.env.REDIS_PORT
  ? parseInt(process.env.REDIS_PORT, 10)
  : 6379;

const createRedisServer = (port: number) =>
  new KeepAliveServer({
    port,
    pingInterval: 1000,
    latencyInterval: 500,
    roomBackend: "redis",
    redisOptions: { host: REDIS_HOST, port: REDIS_PORT },
  });

const flushRedis = async () => {
  const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });
  await redis.flushdb();
  await redis.quit();
};

describe("KeepAliveServer with Redis room backend", () => {
  const port = 8126;
  let server: KeepAliveServer;
  let clientA: KeepAliveClient;
  let clientB: KeepAliveClient;

  beforeEach(async () => {
    await flushRedis();

    server = createRedisServer(port);

    await new Promise<void>((resolve) => {
      server.on("listening", () => resolve());
      if (server.listening) resolve();
    });

    clientA = new KeepAliveClient(`ws://localhost:${port}`);
    clientB = new KeepAliveClient(`ws://localhost:${port}`);
  });

  afterEach(async () => {
    if (clientA.status === Status.ONLINE) await clientA.close();
    if (clientB.status === Status.ONLINE) await clientB.close();

    return new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
  });

  test("multi-instance room membership and broadcast with Redis", async () => {
    await server.registerCommand("join-room", async (context) => {
      await server.addToRoom(context.payload.room, context.connection);
      return { joined: true };
    });

    await server.registerCommand("broadcast-room", async (context) => {
      await server.broadcastRoom(
        context.payload.room,
        "room-message",
        context.payload.message
      );
      return { sent: true };
    });

    await clientA.connect();
    await clientB.connect();

    let receivedA = false;
    let receivedB = false;

    clientA.on("room-message", (data) => {
      if (data === "hello") receivedA = true;
    });
    clientB.on("room-message", (data) => {
      if (data === "hello") receivedB = true;
    });

    await clientA.command("join-room", { room: "testroom" });
    await clientB.command("join-room", { room: "testroom" });

    await clientA.command("broadcast-room", {
      room: "testroom",
      message: "hello",
    });

    // Wait for both events or timeout
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, 2000);
      const check = () => {
        if (receivedA && receivedB) {
          clearTimeout(timeout);
          resolve(null);
        }
      };
      clientA.on("room-message", check);
      clientB.on("room-message", check);
    });

    expect(receivedA).toBe(true);
    expect(receivedB).toBe(true);
  }, 10000);

  test("removeFromRoom removes a client from a specific room", async () => {
    await server.registerCommand("join-room", async (context) => {
      await server.addToRoom(context.payload.room, context.connection);
      return { joined: true };
    });
    await server.registerCommand("leave-room", async (context) => {
      await server.removeFromRoom(context.payload.room, context.connection);
      return { left: true };
    });
    await server.registerCommand("broadcast-room", async (context) => {
      await server.broadcastRoom(
        context.payload.room,
        "room-message",
        context.payload.message
      );
      return { sent: true };
    });

    await clientA.connect();
    await clientB.connect();

    let receivedA = false;
    let receivedB = false;

    clientA.on("room-message", (data) => {
      if (data === "hello after leave") receivedA = true;
    });
    clientB.on("room-message", (data) => {
      if (data === "hello after leave") receivedB = true;
    });

    await clientA.command("join-room", { room: "testroom-leave" });
    await clientB.command("join-room", { room: "testroom-leave" });

    // Ensure both are in before leaving
    await new Promise((res) => setTimeout(res, 100)); // Short delay for redis propagation

    await clientA.command("leave-room", { room: "testroom-leave" });

    // Wait a bit for leave command to process
    await new Promise((res) => setTimeout(res, 100));

    await clientB.command("broadcast-room", {
      room: "testroom-leave",
      message: "hello after leave",
    });

    // Wait for potential message or timeout
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(receivedA).toBe(false); // Client A should not receive the message
    expect(receivedB).toBe(true); // Client B should receive the message
  }, 10000);

  test("removeFromAllRooms removes a client from all rooms", async () => {
    await server.registerCommand("join-room", async (context) => {
      await server.addToRoom(context.payload.room, context.connection);
      return { joined: true };
    });
    await server.registerCommand("leave-all-rooms", async (context) => {
      await server.removeFromAllRooms(context.connection);
      return { left_all: true };
    });
    await server.registerCommand("broadcast-room", async (context) => {
      await server.broadcastRoom(
        context.payload.room,
        "room-message",
        context.payload.message
      );
      return { sent: true };
    });

    await clientA.connect();
    await clientB.connect();

    let receivedA_room1 = false;
    let receivedA_room2 = false;
    let receivedB_room1 = false;

    clientA.on("room-message", (data) => {
      if (data === "hello room1 after all") receivedA_room1 = true;
      if (data === "hello room2 after all") receivedA_room2 = true;
    });
    clientB.on("room-message", (data) => {
      if (data === "hello room1 after all") receivedB_room1 = true;
    });

    await clientA.command("join-room", { room: "room1" });
    await clientA.command("join-room", { room: "room2" });
    await clientB.command("join-room", { room: "room1" });

    // Ensure joins are processed
    await new Promise((res) => setTimeout(res, 100));

    await clientA.command("leave-all-rooms", {});

    // Wait a bit for leave command to process
    await new Promise((res) => setTimeout(res, 100));

    // Broadcast to room1
    await clientB.command("broadcast-room", {
      room: "room1",
      message: "hello room1 after all",
    });
    // Broadcast to room2 (no one should be left)
    await clientB.command("broadcast-room", {
      // Client B isn't in room2, but can still broadcast
      room: "room2",
      message: "hello room2 after all",
    });

    // Wait for potential messages or timeout
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(receivedA_room1).toBe(false); // Client A should not receive from room1
    expect(receivedA_room2).toBe(false); // Client A should not receive from room2
    expect(receivedB_room1).toBe(true); // Client B should receive from room1
  }, 10000);

  test("clearRoom removes all clients from a room", async () => {
    await server.registerCommand("join-room", async (context) => {
      await server.addToRoom(context.payload.room, context.connection);
      return { joined: true };
    });
    await server.registerCommand("clear-room", async (context) => {
      await server.clearRoom(context.payload.room);
      return { cleared: true };
    });
    await server.registerCommand("broadcast-room", async (context) => {
      await server.broadcastRoom(
        context.payload.room,
        "room-message",
        context.payload.message
      );
      return { sent: true };
    });

    await clientA.connect();
    await clientB.connect();

    let receivedA = false;
    let receivedB = false;

    clientA.on("room-message", (data) => {
      if (data === "hello after clear") receivedA = true;
    });
    clientB.on("room-message", (data) => {
      if (data === "hello after clear") receivedB = true;
    });

    await clientA.command("join-room", { room: "testroom-clear" });
    await clientB.command("join-room", { room: "testroom-clear" });

    // Ensure joins are processed
    await new Promise((res) => setTimeout(res, 100));

    await clientA.command("clear-room", { room: "testroom-clear" });

    // Wait a bit for clear command to process
    await new Promise((res) => setTimeout(res, 100));

    // Try broadcasting (client A is still connected, just not in room)
    await clientA.command("broadcast-room", {
      room: "testroom-clear",
      message: "hello after clear",
    });

    // Wait for potential messages or timeout
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(receivedA).toBe(false); // Client A should not receive
    expect(receivedB).toBe(false); // Client B should not receive
  }, 10000);

  test("broadcastRoomExclude sends to all except specified clients", async () => {
    const clientC = new KeepAliveClient(`ws://localhost:${port}`);

    await server.registerCommand("join-room", async (context) => {
      await server.addToRoom(context.payload.room, context.connection);
      return { joined: true };
    });
    await server.registerCommand("broadcast-exclude", async (context) => {
      await server.broadcastRoomExclude(
        context.payload.room,
        "room-message",
        context.payload.message,
        context.connection // Exclude sender
      );
      return { sent_exclude: true };
    });

    await clientA.connect();
    await clientB.connect();
    await clientC.connect();

    let receivedA = false;
    let receivedB = false;
    let receivedC = false;

    clientA.on("room-message", (data) => {
      if (data === "hello exclude") receivedA = true;
    });
    clientB.on("room-message", (data) => {
      if (data === "hello exclude") receivedB = true;
    });
    clientC.on("room-message", (data) => {
      if (data === "hello exclude") receivedC = true;
    });

    await clientA.command("join-room", { room: "testroom-exclude" });
    await clientB.command("join-room", { room: "testroom-exclude" });
    await clientC.command("join-room", { room: "testroom-exclude" });

    // Ensure joins are processed
    await new Promise((res) => setTimeout(res, 100));

    // Client A broadcasts, excluding itself
    await clientA.command("broadcast-exclude", {
      room: "testroom-exclude",
      message: "hello exclude",
    });

    // Wait for potential messages or timeout
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(receivedA).toBe(false); // Client A (sender) should not receive
    expect(receivedB).toBe(true); // Client B should receive
    expect(receivedC).toBe(true); // Client C should receive

    if (clientC.status === Status.ONLINE) await clientC.close();
  }, 10000);
});
