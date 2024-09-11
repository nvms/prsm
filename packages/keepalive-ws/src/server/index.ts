import { IncomingMessage } from "node:http";
import { ServerOptions, WebSocket, WebSocketServer } from "ws";
import { bufferToCommand } from "./command";
import { Connection } from "./connection";

export declare interface KeepAliveServer extends WebSocketServer {
  on(
    event: "connection",
    handler: (socket: WebSocket, req: IncomingMessage) => void,
  ): this;
  on(event: "connected", handler: (c: Connection) => void): this;
  on(event: "close", handler: (c: Connection) => void): this;
  on(event: "error", cb: (this: WebSocketServer, error: Error) => void): this;
  on(
    event: "headers",
    cb: (
      this: WebSocketServer,
      headers: string[],
      request: IncomingMessage,
    ) => void,
  ): this;
  on(
    event: string | symbol,
    listener: (this: WebSocketServer, ...args: any[]) => void,
  ): this;

  emit(event: "connection", socket: WebSocket, req: IncomingMessage): boolean;
  emit(event: "connected", connection: Connection): boolean;
  emit(event: "close", connection: Connection): boolean;
  emit(event: "error", connection: Connection): boolean;

  once(
    event: "connection",
    cb: (
      this: WebSocketServer,
      socket: WebSocket,
      request: IncomingMessage,
    ) => void,
  ): this;
  once(event: "error", cb: (this: WebSocketServer, error: Error) => void): this;
  once(
    event: "headers",
    cb: (
      this: WebSocketServer,
      headers: string[],
      request: IncomingMessage,
    ) => void,
  ): this;
  once(event: "close" | "listening", cb: (this: WebSocketServer) => void): this;
  once(
    event: string | symbol,
    listener: (this: WebSocketServer, ...args: any[]) => void,
  ): this;

  off(
    event: "connection",
    cb: (
      this: WebSocketServer,
      socket: WebSocket,
      request: IncomingMessage,
    ) => void,
  ): this;
  off(event: "error", cb: (this: WebSocketServer, error: Error) => void): this;
  off(
    event: "headers",
    cb: (
      this: WebSocketServer,
      headers: string[],
      request: IncomingMessage,
    ) => void,
  ): this;
  off(event: "close" | "listening", cb: (this: WebSocketServer) => void): this;
  off(
    event: string | symbol,
    listener: (this: WebSocketServer, ...args: any[]) => void,
  ): this;

  addListener(
    event: "connection",
    cb: (client: WebSocket, request: IncomingMessage) => void,
  ): this;
  addListener(event: "error", cb: (err: Error) => void): this;
  addListener(
    event: "headers",
    cb: (headers: string[], request: IncomingMessage) => void,
  ): this;
  addListener(event: "close" | "listening", cb: () => void): this;
  addListener(event: string | symbol, listener: (...args: any[]) => void): this;

  removeListener(event: "connection", cb: (client: WebSocket) => void): this;
  removeListener(event: "error", cb: (err: Error) => void): this;
  removeListener(
    event: "headers",
    cb: (headers: string[], request: IncomingMessage) => void,
  ): this;
  removeListener(event: "close" | "listening", cb: () => void): this;
  removeListener(
    event: string | symbol,
    listener: (...args: any[]) => void,
  ): this;
}
export class WSContext<T> {
  wss: KeepAliveServer;
  connection: Connection;
  payload: T;

  constructor(wss: KeepAliveServer, connection: Connection, payload: any) {
    this.wss = wss;
    this.connection = connection;
    this.payload = payload;
  }
}

export type SocketMiddleware = (c: WSContext<any>) => any | Promise<any>;

export type KeepAliveServerOptions = ServerOptions & {
  /**
   * The interval at which to send ping messages to the client.
   * @default 30000
   */
  pingInterval?: number;

  /**
   * The interval at which to send both latency requests and updates to the client.
   * @default 5000
   */
  latencyInterval?: number;
};

export class KeepAliveServer extends WebSocketServer {
  connections: { [id: string]: Connection } = {};
  remoteAddressToConnections: { [address: string]: Connection[] } = {};
  commands: {
    [command: string]: (context: WSContext<any>) => Promise<any> | any;
  } = {};
  globalMiddlewares: SocketMiddleware[] = [];
  middlewares: { [key: string]: SocketMiddleware[] } = {};
  rooms: { [roomName: string]: Set<string> } = {};
  declare serverOptions: KeepAliveServerOptions;

  constructor(opts: KeepAliveServerOptions) {
    super({ ...opts });
    this.serverOptions = {
      ...opts,
      pingInterval: opts.pingInterval ?? 30_000,
      latencyInterval: opts.latencyInterval ?? 5_000,
    };
    this.applyListeners();
  }

  private cleanupConnection(c: Connection) {
    c.stopIntervals();
    delete this.connections[c.id];
    if (this.remoteAddressToConnections[c.remoteAddress]) {
      this.remoteAddressToConnections[c.remoteAddress] =
        this.remoteAddressToConnections[c.remoteAddress].filter(
          (cn) => cn.id !== c.id,
        );
    }

    if (!this.remoteAddressToConnections[c.remoteAddress].length) {
      delete this.remoteAddressToConnections[c.remoteAddress];
    }
  }

  private applyListeners() {
    this.on("connection", (socket: WebSocket, req: IncomingMessage) => {
      const connection = new Connection(socket, req, this.serverOptions);
      this.connections[connection.id] = connection;

      if (!this.remoteAddressToConnections[connection.remoteAddress]) {
        this.remoteAddressToConnections[connection.remoteAddress] = [];
      }

      this.remoteAddressToConnections[connection.remoteAddress].push(
        connection,
      );

      this.emit("connected", connection);

      connection.once("close", () => {
        this.cleanupConnection(connection);
        this.emit("close", connection);

        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }

        Object.keys(this.rooms).forEach((roomName) => {
          this.rooms[roomName].delete(connection.id);
        });
      });

      connection.on("message", (buffer: Buffer) => {
        try {
          const { id, command, payload } = bufferToCommand(buffer);
          this.runCommand(id ?? 0, command, payload, connection);
        } catch (e) {
          this.emit("error", e);
        }
      });
    });
  }

  broadcast(command: string, payload: any, connections?: Connection[]) {
    const cmd = JSON.stringify({ command, payload });

    if (connections) {
      connections.forEach((c) => {
        c.socket.send(cmd);
      });

      return;
    }

    Object.values(this.connections).forEach((c) => {
      c.socket.send(cmd);
    });
  }

  /**
   * Given a Connection, broadcasts only to all other Connections that share
   * the same connection.remoteAddress.
   *
   * Use cases:
   *  - Push notifications.
   *  - Auth changes, e.g., logging out in one tab should log you out in all tabs.
   */
  broadcastRemoteAddress(c: Connection, command: string, payload: any) {
    const cmd = JSON.stringify({ command, payload });
    this.remoteAddressToConnections[c.remoteAddress].forEach((cn) => {
      cn.socket.send(cmd);
    });
  }

  broadcastRemoteAddressById(id: string, command: string, payload: any) {
    const connection = this.connections[id];
    if (connection) {
      this.broadcastRemoteAddress(connection, command, payload);
    }
  }

  /**
   * Given a roomName, a command and a payload, broadcasts to all Connections
   * that are in the room.
   */
  broadcastRoom(roomName: string, command: string, payload: any) {
    const cmd = JSON.stringify({ command, payload });
    const room = this.rooms[roomName];

    if (!room) return;

    room.forEach((connectionId) => {
      const connection = this.connections[connectionId];
      if (connection) {
        connection.socket.send(cmd);
      }
    });
  }

  /**
   * Given a roomName, command, payload, and Connection OR Connection[], broadcasts to all Connections
   * that are in the room except the provided Connection(s).
   */
  broadcastRoomExclude(
    roomName: string,
    command: string,
    payload: any,
    connection: Connection | Connection[],
  ) {
    const cmd = JSON.stringify({ command, payload });
    const room = this.rooms[roomName];

    if (!room) return;

    const excludeIds = Array.isArray(connection)
      ? connection.map((c) => c.id)
      : [connection.id];

    room.forEach((connectionId) => {
      if (!excludeIds.includes(connectionId)) {
        const conn = this.connections[connectionId];
        if (conn) {
          conn.socket.send(cmd);
        }
      }
    });
  }

  /**
   * Given a connection, broadcasts a message to all connections except
   * the provided connection.
   */
  broadcastExclude(connection: Connection, command: string, payload: any) {
    const cmd = JSON.stringify({ command, payload });
    Object.values(this.connections).forEach((c) => {
      if (c.id !== connection.id) {
        c.socket.send(cmd);
      }
    });
  }

  /**
   * @example
   * ```typescript
   * server.registerCommand("join:room", async (payload: { roomName: string }, connection: Connection) => {
   *   server.addToRoom(payload.roomName, connection);
   *   server.broadcastRoom(payload.roomName, "joined", { roomName: payload.roomName });
   * });
   * ```
   */
  addToRoom(roomName: string, connection: Connection) {
    this.rooms[roomName] = this.rooms[roomName] ?? new Set();
    this.rooms[roomName].add(connection.id);
  }

  removeFromRoom(roomName: string, connection: Connection) {
    if (!this.rooms[roomName]) return;
    this.rooms[roomName].delete(connection.id);
  }

  removeFromAllRooms(connection: Connection | string) {
    const connectionId = typeof connection === "string" ? connection : connection.id;
    Object.keys(this.rooms).forEach((roomName) => {
      this.rooms[roomName].delete(connectionId);
    });
  }

  /**
   * Returns a "room", which is simply a Set of Connection ids.
   * @param roomName
   */
  getRoom(roomName: string): Connection[] {
    const ids = this.rooms[roomName] || new Set();
    return Array.from(ids).map((id) => this.connections[id]);
  }

  clearRoom(roomName: string) {
    this.rooms[roomName] = new Set();
  }

  registerCommand<T>(
    command: string,
    callback: (context: WSContext<any>) => Promise<T> | T,
    middlewares: SocketMiddleware[] = [],
  ) {
    this.commands[command] = callback;
    this.prependMiddlewareToCommand(command, middlewares);
  }

  prependMiddlewareToCommand(command: string, middlewares: SocketMiddleware[]) {
    if (middlewares.length) {
      this.middlewares[command] = this.middlewares[command] || [];
      this.middlewares[command] = middlewares.concat(this.middlewares[command]);
    }
  }

  appendMiddlewareToCommand(command: string, middlewares: SocketMiddleware[]) {
    if (middlewares.length) {
      this.middlewares[command] = this.middlewares[command] || [];
      this.middlewares[command] = this.middlewares[command].concat(middlewares);
    }
  }

  private async runCommand(
    id: number,
    command: string,
    payload: any,
    connection: Connection,
  ) {
    const c = new WSContext(this, connection, payload);

    try {
      if (!this.commands[command]) {
        // An onslaught of commands that don't exist is a sign of a bad
        // or otherwise misconfigured client.
        throw new Error(`Command [${command}] not found.`);
      }

      if (this.globalMiddlewares.length) {
        for (const mw of this.globalMiddlewares) {
          await mw(c);
        }
      }

      if (this.middlewares[command]) {
        for (const mw of this.middlewares[command]) {
          await mw(c);
        }
      }

      const result = await this.commands[command](c);
      connection.send({ id, command, payload: result });
    } catch (e) {
      const payload = { error: e.message ?? e ?? "Unknown error" };
      connection.send({ id, command, payload });
    }
  }
}

export { Connection };
