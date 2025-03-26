import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CommandClient, CommandServer, Status } from "../src/index";

describe("Advanced CommandClient and CommandServer Tests", () => {
  const serverOptions = { host: "localhost", port: 8125, secure: false };
  const clientOptions = { host: "localhost", port: 8125, secure: false };
  let server: CommandServer;
  let client: CommandClient;

  beforeEach(() => {
    server = new CommandServer(serverOptions);
    server.command(100, async (payload) => {
      return `Echo: ${payload}`;
    });

    client = new CommandClient(clientOptions);
  });

  afterEach(async () => {
    if (client.status === Status.ONLINE) {
      await new Promise<void>((resolve) => {
        client.once("close", () => resolve());
        client.close();
      });
    }

    if (server.status === Status.ONLINE) {
      await new Promise<void>((resolve) => {
        server.once("close", () => resolve());
        server.close();
      });
    }
  });

  test("client reconnects after server restart", async () => {
    await server.connect();
    await client.connect();

    // Verify initial connection
    expect(client.status).toBe(Status.ONLINE);

    // First close the client gracefully
    await new Promise<void>((resolve) => {
      client.once("close", () => resolve());
      client.close();
    });

    // Then close the server
    await new Promise<void>((resolve) => {
      server.once("close", () => resolve());
      server.close();
    });

    // Restart server
    await server.connect();

    // Reconnect client
    await client.connect();

    // Verify reconnection worked
    expect(client.status).toBe(Status.ONLINE);

    // Verify functionality after reconnection
    return new Promise<void>((resolve, reject) => {
      client.command(100, "After Reconnect", 5000, (result, error) => {
        try {
          expect(error).toBeUndefined();
          expect(result).toBe("Echo: After Reconnect");
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  }, 5000);

  test("command times out when server doesn't respond", async () => {
    await server.connect();
    await client.connect();

    // A command that never responds
    server.command(101, async () => {
      return new Promise(() => {});
    });

    // Expect it to fail after a short timeout
    await expect(
      new Promise((resolve, reject) => {
        client.command(101, "Should timeout", 500, (result, error) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        });
      }),
    ).rejects.toHaveProperty("code", "ETIMEOUT");
  }, 2000);

  test("server errors are properly serialized to client", async () => {
    await server.connect();
    await client.connect();

    server.command(102, async () => {
      const error = new Error("Custom server error") as any;
      error.code = "ECUSTOM";
      error.name = "CustomError";
      throw error;
    });

    // Expect to receive this error
    await expect(
      new Promise((resolve, reject) => {
        client.command(102, "Will error", 1000, (result, error) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        });
      }),
    ).rejects.toMatchObject({
      message: "Custom server error",
      name: "CustomError",
      code: "ECUSTOM",
    });
  }, 2000);

  test("commands are queued when client is offline and sent when reconnected", async () => {
    // Start with server but no client connection
    await server.connect();

    // Create client but don't connect yet
    const queuedClient = new CommandClient(clientOptions);

    // Queue a command while offline
    const commandPromise = new Promise((resolve, reject) => {
      queuedClient.command(100, "Queued Message", 5000, (result, error) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });

    // Now connect the client - the queued command should be sent
    await queuedClient.connect();

    // Verify the queued command was processed
    await expect(commandPromise).resolves.toBe("Echo: Queued Message");

    // Clean up
    await new Promise<void>((resolve) => {
      queuedClient.once("close", () => resolve());
      queuedClient.close();
    });
  }, 3000);

  test("multiple concurrent commands are handled correctly", async () => {
    await server.connect();
    await client.connect();

    // Register commands with different delays
    server.command(103, async (payload) => {
      await new Promise((r) => setTimeout(r, 50));
      return `Fast: ${payload}`;
    });

    server.command(104, async (payload) => {
      await new Promise((r) => setTimeout(r, 150));
      return `Slow: ${payload}`;
    });

    // Send multiple commands concurrently
    const results = await Promise.all([
      new Promise((resolve, reject) => {
        client.command(103, "First", 1000, (result, error) => {
          if (error) reject(error);
          else resolve(result);
        });
      }),
      new Promise((resolve, reject) => {
        client.command(104, "Second", 1000, (result, error) => {
          if (error) reject(error);
          else resolve(result);
        });
      }),
      new Promise((resolve, reject) => {
        client.command(100, "Third", 1000, (result, error) => {
          if (error) reject(error);
          else resolve(result);
        });
      }),
    ]);

    // Verify all commands completed successfully
    expect(results).toEqual(["Fast: First", "Slow: Second", "Echo: Third"]);
  }, 3000);

  test("handles large payloads correctly", async () => {
    await server.connect();
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

    const result = await new Promise((resolve, reject) => {
      client.command(100, largeData, 5000, (result, error) => {
        if (error) reject(error);
        else resolve(result);
      });
    });

    // Verify the response contains the expected prefix
    expect(typeof result).toBe("string");
    expect((result as string).startsWith("Echo: ")).toBe(true);
  }, 10000);

  test("server handles multiple client connections", async () => {
    await server.connect();

    // Create multiple clients
    const clients = Array(5)
      .fill(0)
      .map(() => new CommandClient(clientOptions));

    // Connect all clients
    await Promise.all(clients.map((client) => client.connect()));

    // Send a command from each client
    const results = await Promise.all(
      clients.map(
        (client, i) =>
          new Promise((resolve, reject) => {
            client.command(100, `Client ${i}`, 1000, (result, error) => {
              if (error) reject(error);
              else resolve(result);
            });
          }),
      ),
    );

    // Verify all commands succeeded
    results.forEach((result, i) => {
      expect(result).toBe(`Echo: Client ${i}`);
    });

    // Clean up
    await Promise.all(
      clients.map(
        (client) =>
          new Promise<void>((resolve) => {
            client.once("close", () => resolve());
            client.close();
          }),
      ),
    );
  }, 5000);

  test("command returns promise when no callback provided", async () => {
    await server.connect();
    await client.connect();

    // Use the promise-based API
    const result = await client.command(100, "Promise API");

    // Verify the result
    expect(result).toHaveProperty("result", "Echo: Promise API");
    expect(result).toHaveProperty("error", null);
  }, 2000);
});
