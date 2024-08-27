import {
  KeepAliveServer,
  type KeepAliveServerOptions,
} from "@prsm/keepalive-ws/server";
import { type Server } from "node:http";
import { STATUS_CODES } from "node:http";

const createWsMiddleware = (
  server: Server,
  options: KeepAliveServerOptions = {},
): { middleware: (req, res, next) => Promise<void>; wss: KeepAliveServer } => {
  const wss = new KeepAliveServer({ ...options, noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url, `http://${request.headers.host}`);

    const path = options.path || "/";

    if (pathname !== path) {
      socket.write(
        [
          `HTTP/1.0 400 ${STATUS_CODES[400]}`,
          "Connection: close",
          "Content-Type: text/html",
          `Content-Length: ${Buffer.byteLength(STATUS_CODES[400])}`,
          "",
          STATUS_CODES[400],
        ].join("\r\n"),
      );

      socket.destroy();

      return;
    }

    wss.handleUpgrade(request, socket, head, (client, req) => {
      wss.emit("connection", client, req);
    });
  });

  const middleware = async (req, res, next) => {
    const upgradeHeader: string[] =
      req.headers.upgrade
        ?.toLowerCase()
        .split(",")
        .map((s) => s.trim()) || [];

    if (upgradeHeader.includes("websocket")) {
      req.ws = () =>
        new Promise((resolve) => {
          wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (client) => {
            wss.emit("connection", client, req);
            resolve(client);
          });
        });
    }

    await next();
  };

  return { middleware, wss };
};

export default createWsMiddleware;
export { type WSContext } from "@prsm/keepalive-ws/server";
