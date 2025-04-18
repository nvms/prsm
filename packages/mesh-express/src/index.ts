import { STATUS_CODES, type Server as HTTPServer } from "node:http";
import { MeshServer, type MeshServerOptions } from "@prsm/mesh/server";

type Middleware = (req, res, next) => Promise<void>;

interface MeshExpressResult {
  middleware: Middleware;
  mesh: MeshServer;
}

const createMeshMiddleware = (
  server: HTTPServer,
  options: MeshServerOptions
): MeshExpressResult => {
  const path = options.path || "/";
  const mesh = new MeshServer({ ...options, noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(
      request.url || "",
      `http://${request.headers.host}`
    );

    if (pathname !== path) {
      socket.write(
        [
          `HTTP/1.1 400 ${STATUS_CODES[400]}`,
          "Connection: close",
          "Content-Type: text/plain",
          `Content-Length: ${Buffer.byteLength(STATUS_CODES[400])}`,
          "",
          STATUS_CODES[400],
        ].join("\r\n")
      );
      socket.destroy();
      return;
    }

    mesh.handleUpgrade(request, socket, head, (client, req) => {
      mesh.emit("connection", client, req);
    });
  });

  const middleware: Middleware = async (req, res, next) => {
    const upgradeHeader =
      req.headers.upgrade
        ?.toLowerCase()
        .split(",")
        .map((s) => s.trim()) || [];

    if (upgradeHeader.includes("websocket")) {
      req.ws = () =>
        new Promise((resolve) => {
          mesh.handleUpgrade(req, req.socket, Buffer.alloc(0), (client) => {
            mesh.emit("connection", client, req);
            resolve(client);
          });
        });
    }

    await next();
  };

  return { middleware, mesh };
};

export default createMeshMiddleware;
export {
  MeshServer,
  type MeshServerOptions,
  type MeshContext,
} from "@prsm/mesh/server";
