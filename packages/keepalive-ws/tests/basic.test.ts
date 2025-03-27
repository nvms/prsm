import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { KeepAliveClient, Status } from "../src/client/client";
import { KeepAliveServer } from "../src/server/index";
import { WebSocket, WebSocketServer } from "ws";

// Helper to create a WebSocket server for testing
const createTestServer = (port: number) => {
  return new KeepAliveServer({
    port,
    pingInterval: 1000, // Faster for testing
    latencyInterval: 500, // Faster for testing
  });
};

describe("Basic KeepAliveClient and KeepAliveServer Tests", () => {
  const port = 8124;
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

  test("client-server connection should be online", async () => {
    await server.registerCommand("echo", async (context) => {
      return context.payload;
    });

    await client.connect();
    expect(client.status).toBe(Status.ONLINE);
  }, 10000);

  test("simple echo command", async () => {
    await server.registerCommand("echo", async (context) => {
      return `Echo: ${context.payload}`;
    });

    await client.connect();

    const result = await client.command("echo", "Hello", 5000);
    expect(result).toBe("Echo: Hello");
  }, 10000);

  test("connect should resolve when already connected", async () => {
    await server.registerCommand("echo", async (context) => {
      return context.payload;
    });

    await client.connect();
    expect(client.status).toBe(Status.ONLINE);

    // Second connect should resolve immediately
    await client.connect();
    expect(client.status).toBe(Status.ONLINE);
  }, 10000);

  test("close should resolve when already closed", async () => {
    await client.close();
    expect(client.status).toBe(Status.OFFLINE);

    // Second close should resolve immediately
    await client.close();
    expect(client.status).toBe(Status.OFFLINE);
  }, 10000);
});
