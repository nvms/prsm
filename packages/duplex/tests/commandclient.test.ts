import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CommandClient, CommandServer } from "../src/index";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  afterEach(() => {
    if (client.status === 3) { // ONLINE
      client.close();
    }
    if (server.status === 3) { // ONLINE
      server.close();
    }
  });

  test("client-server connection should be online", async () => {
    await new Promise<void>((resolve) => {
      server.once("listening", () => {
        client.once("connect", () => {
          expect(client.status).toBe(3); // ONLINE
          resolve();
        });
      });
      server.connect();
    });
  }, 5000);

  test("simple echo command", async () => {
    await new Promise<void>((resolve) => {
      server.once("listening", () => {
        client.once("connect", () => {
          client.command(100, "Hello", 5000, (result, error) => {
            expect(error).toBeUndefined();
            expect(result).toBe("Echo: Hello");
            resolve();
          });
        });
      });
      server.connect();
    });
  }, 5000);

  // test("handle unknown command", async () => {
  //   await sleep(1000);
  //   await new Promise<void>((resolve) => {
  //     server.once("listening", () => {
  //       console.log("Listening! (unknown command)");
  //       client.once("connect", () => {
  //         console.log("Client connected, sending command.");
  //         client.command(55, "Hello", 1000, (result, error) => {
  //           console.log("Client callback CALLED! with result", result, "and error", error);
  //           expect(result).toBeUndefined();
  //           // expect(error).toBeDefined();
  //           // expect(error.code).toBe("ENOTFOUND");
  //           resolve();
  //         });
  //       });
  //     });
  //     server.connect();
  //   });
  // }, 2000); // Increased timeout

  // test("command should timeout without server response", async () => {
  //   await new Promise<void>((resolve) => {
  //     server.once("listening", () => {
  //       client.once("connect", () => {
  //         client.command(101, "No response", 1000, (result, error) => {
  //           expect(result).toBeUndefined();
  //           expect(error).toBeInstanceOf(CodeError);
  //           expect(error.code).toBe("ETIMEOUT");
  //           resolve();
  //         });
  //       });
  //     });
  //     server.connect();
  //   });
  // }, 10000); // Increased timeout

  // test("client should handle server close event", async () => {
  //   await new Promise<void>((resolve) => {
  //     let errorEmitted = false;
  //     client.once("error", () => {
  //       errorEmitted = true;
  //     });
  //
  //     client.once("close", () => {
  //       expect(errorEmitted).toBe(false);
  //       expect(client.status).toBe(0); // OFFLINE
  //       resolve();
  //     });
  //
  //     server.once("listening", () => {
  //       client.once("connect", () => {
  //         server.close(() => {
  //           setTimeout(() => client.close(), 200);
  //         });
  //       });
  //     });
  //
  //     server.connect();
  //   });
  // }, 10000); // Increased timeout
});
