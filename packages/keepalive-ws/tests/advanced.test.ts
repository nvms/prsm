import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { KeepAliveClient, Status } from "../src/client/client";
import { KeepAliveServer } from "../src/server/index";

// Helper to create a WebSocket server for testing
const createTestServer = (port: number) => {
  return new KeepAliveServer({
    port,
    pingInterval: 1000, // Faster for testing
    latencyInterval: 500, // Faster for testing
  });
};

describe("Advanced KeepAliveClient and KeepAliveServer Tests", () => {
  const port = 8125;
  let server: KeepAliveServer;
  let client: KeepAliveClient;

  beforeEach(async () => {
    server = createTestServer(port);

    // Wait for the server to start
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
    // Close connections in order
    if (client.status === Status.ONLINE) {
      await client.close();
    }

    // Close the server
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
    await server.registerCommand("never-responds", async () => {
      return new Promise(() => {});
    });

    await client.connect();

    // Expect it to fail after a short timeout
    await expect(
      client.command("never-responds", "Should timeout", 500),
    ).rejects.toThrow(/timed out/);
  }, 2000);

  test("server errors are properly serialized to client", async () => {
    await server.registerCommand("throws-error", async () => {
      throw new Error("Custom server error");
    });

    await client.connect();

    // Expect to receive this error
    const result = await client.command("throws-error", "Will error", 1000);
    expect(result).toHaveProperty("error", "Custom server error");
  }, 2000);

  test("multiple concurrent commands are handled correctly", async () => {
    // Register commands with different delays
    await server.registerCommand("fast", async (context) => {
      await new Promise((r) => setTimeout(r, 50));
      return `Fast: ${context.payload}`;
    });

    await server.registerCommand("slow", async (context) => {
      await new Promise((r) => setTimeout(r, 150));
      return `Slow: ${context.payload}`;
    });

    await server.registerCommand("echo", async (context) => {
      return `Echo: ${context.payload}`;
    });

    await client.connect();

    // Send multiple commands concurrently
    const results = await Promise.all([
      client.command("fast", "First", 1000),
      client.command("slow", "Second", 1000),
      client.command("echo", "Third", 1000),
    ]);

    // Verify all commands completed successfully
    expect(results).toEqual(["Fast: First", "Slow: Second", "Echo: Third"]);
  }, 3000);

  test("handles large payloads correctly", async () => {
    await server.registerCommand("echo", async (context) => {
      return context.payload;
    });

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

    // Verify the response contains the expected data
    expect(result).toEqual(largeData);
  }, 10000);

  test("server handles multiple client connections", async () => {
    await server.registerCommand("echo", async (context) => {
      return `Echo: ${context.payload}`;
    });

    // Create multiple clients
    const clients = Array(5)
      .fill(0)
      .map(() => new KeepAliveClient(`ws://localhost:${port}`));

    // Connect all clients
    await Promise.all(clients.map((client) => client.connect()));

    // Send a command from each client
    const results = await Promise.all(
      clients.map((client, i) => client.command("echo", `Client ${i}`, 1000)),
    );

    // Verify all commands succeeded
    results.forEach((result, i) => {
      expect(result).toBe(`Echo: Client ${i}`);
    });

    // Clean up
    await Promise.all(clients.map((client) => client.close()));
  }, 5000);
});
