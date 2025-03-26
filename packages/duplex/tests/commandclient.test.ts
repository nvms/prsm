import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CommandClient, CommandServer } from "../src/index";

describe("CommandClient and CommandServer", () => {
  const serverOptions = { host: "localhost", port: 8124, secure: false };
  const clientOptions = { host: "localhost", port: 8124, secure: false };
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
    if (client.status === 3) {
      // ONLINE
      await new Promise<void>((resolve) => {
        client.once("close", () => resolve());
        client.close();
      });
    }

    if (server.status === 3) {
      // ONLINE
      await new Promise<void>((resolve) => {
        server.once("close", () => resolve());
        server.close();
      });
    }
  });

  test("client-server connection should be online", async () => {
    await server.connect();
    await client.connect();
    expect(client.status).toBe(3); // ONLINE
  }, 1000);

  test("simple echo command", async () => {
    try {
      await server.connect();

      await client.connect();

      return new Promise<void>((resolve, reject) => {
        client.command(100, "Hello", 5000, (result, error) => {
          try {
            expect(error).toBeUndefined();
            expect(result).toBe("Echo: Hello");
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    } catch (err) {
      throw err;
    }
  }, 1000);
});
