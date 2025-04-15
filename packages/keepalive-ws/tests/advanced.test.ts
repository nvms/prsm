import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { KeepAliveClient, Status } from "../src/client/client";
import { KeepAliveServer } from "../src/server/index";

const createTestServer = (port: number) =>
  new KeepAliveServer({
    port,
    pingInterval: 1000,
    latencyInterval: 500,
  });

describe("Advanced KeepAliveClient and KeepAliveServer Tests", () => {
  const port = 8125;
  let server: KeepAliveServer;
  let client: KeepAliveClient;

  beforeEach(async () => {
    server = createTestServer(port);

    await new Promise<void>((resolve) => {
      server.on("listening", () => {
        resolve();
      });

      // In case the server is already listening
      if (server.listening) {
        resolve();
      }
    });

    client = new KeepAliveClient(`ws://localhost:${port}`);
  });

  afterEach(async () => {
    if (client.status === Status.ONLINE) {
      await client.close();
    }

    return new Promise<void>((resolve) => {
      if (server) {
        server.close(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  });

  test("command times out when server doesn't respond", async () => {
    await server.registerCommand(
      "never-responds",
      async () => new Promise(() => {})
    );

    await client.connect();

    await expect(
      client.command("never-responds", "Should timeout", 500)
    ).rejects.toThrow(/timed out/);
  }, 2000);

  test("server errors are properly serialized to client", async () => {
    await server.registerCommand("throws-error", async () => {
      throw new Error("Custom server error");
    });

    await client.connect();

    const result = await client.command("throws-error", "Will error", 1000);
    expect(result).toHaveProperty("error", "Custom server error");
  }, 2000);

  test("multiple concurrent commands are handled correctly", async () => {
    await server.registerCommand("fast", async (context) => {
      await new Promise((r) => setTimeout(r, 50));
      return `Fast: ${context.payload}`;
    });

    await server.registerCommand("slow", async (context) => {
      await new Promise((r) => setTimeout(r, 150));
      return `Slow: ${context.payload}`;
    });

    await server.registerCommand(
      "echo",
      async (context) => `Echo: ${context.payload}`
    );

    await client.connect();

    const results = await Promise.all([
      client.command("fast", "First", 1000),
      client.command("slow", "Second", 1000),
      client.command("echo", "Third", 1000),
    ]);

    expect(results).toEqual(["Fast: First", "Slow: Second", "Echo: Third"]);
  }, 3000);

  test("handles large payloads correctly", async () => {
    await server.registerCommand("echo", async (context) => context.payload);

    await client.connect();

    const largeData = {
      array: Array(1000)
        .fill(0)
        .map((_, i) => `item-${i}`),
      nested: {
        deep: {
          object: {
            with: "lots of data",
          },
        },
      },
    };

    const result = await client.command("echo", largeData, 5000);

    expect(result).toEqual(largeData);
  }, 10000);

  test("server handles multiple client connections", async () => {
    await server.registerCommand(
      "echo",
      async (context) => `Echo: ${context.payload}`
    );

    const clients = Array(5)
      .fill(0)
      .map(() => new KeepAliveClient(`ws://localhost:${port}`));

    await Promise.all(clients.map((client) => client.connect()));

    const results = await Promise.all(
      clients.map((client, i) => client.command("echo", `Client ${i}`, 1000))
    );

    results.forEach((result, i) => {
      expect(result).toBe(`Echo: Client ${i}`);
    });

    await Promise.all(clients.map((client) => client.close()));
  }, 5000);
});
