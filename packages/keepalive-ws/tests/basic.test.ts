import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { KeepAliveClient, Status } from "../src/client/client";
import { KeepAliveServer } from "../src/server/index";

const createTestServer = (port: number) => {
  return new KeepAliveServer({
    port,
    pingInterval: 1000,
    latencyInterval: 500,
  });
};

describe("Basic KeepAliveClient and KeepAliveServer Tests", () => {
  const port = 8124;
  let server: KeepAliveServer;
  let client: KeepAliveClient;

  beforeEach(async () => {
    server = createTestServer(port);

    await new Promise<void>((resolve) => {
      server.on("listening", () => {
        resolve();
      });

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

    await client.connect();
    expect(client.status).toBe(Status.ONLINE);
  }, 10000);

  test("close should resolve when already closed", async () => {
    await client.close();
    expect(client.status).toBe(Status.OFFLINE);

    await client.close();
    expect(client.status).toBe(Status.OFFLINE);
  }, 10000);
});
