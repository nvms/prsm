import { IncomingMessage } from "node:http";
import { ServerOptions, WebSocket, WebSocketServer } from "ws";
import { CodeError } from "../common/codeerror";
import { Command, parseCommand } from "../common/message";
import { Status } from "../common/status";
import { Connection } from "./connection";

export { Status } from "../common/status";
export { Connection } from "./connection";

export class WSContext<T = any> {
  server: KeepAliveServer;
  connection: Connection;
  payload: T;

  constructor(server: KeepAliveServer, connection: Connection, payload: T) {
    this.server = server;
    this.connection = connection;
    this.payload = payload;
  }
}

export type SocketMiddleware = (context: WSContext<any>) => any | Promise<any>;

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
  serverOptions: ServerOptions & {
    pingInterval: number;
    latencyInterval: number;
  };
  status: Status = Status.OFFLINE;
  private _listening: boolean = false;

  /**
   * Whether the server is currently listening for connections
   */
  get listening(): boolean {
    return this._listening;
  }

  constructor(opts: KeepAliveServerOptions) {
    super(opts);
    this.serverOptions = {
      ...opts,
      pingInterval: opts.pingInterval ?? 30_000,
      latencyInterval: opts.latencyInterval ?? 5_000,
    };

    this.on("listening", () => {
      this._listening = true;
      this.status = Status.ONLINE;
    });

    this.on("close", () => {
      this._listening = false;
      this.status = Status.OFFLINE;
    });

    this.applyListeners();
  }

  private cleanupConnection(connection: Connection): void {
    connection.stopIntervals();
    delete this.connections[connection.id];

    if (this.remoteAddressToConnections[connection.remoteAddress]) {
      this.remoteAddressToConnections[connection.remoteAddress] =
        this.remoteAddressToConnections[connection.remoteAddress].filter(
          (conn) => conn.id !== connection.id,
        );

      if (
        this.remoteAddressToConnections[connection.remoteAddress].length === 0
      ) {
        delete this.remoteAddressToConnections[connection.remoteAddress];
      }
    }

    // Remove from all rooms
    Object.keys(this.rooms).forEach((roomName) => {
      this.rooms[roomName].delete(connection.id);
    });
  }

  private applyListeners(): void {
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

      connection.on("close", () => {
        this.cleanupConnection(connection);
        this.emit("close", connection);
      });

      connection.on("error", (error) => {
        this.emit("clientError", error);
      });

      connection.on("message", (buffer: Buffer) => {
        try {
          const data = buffer.toString();
          const command = parseCommand(data);

          if (command.id !== undefined) {
            this.runCommand(
              command.id,
              command.command,
              command.payload,
              connection,
            );
          }
        } catch (error) {
          this.emit("error", error);
        }
      });
    });
  }

  broadcast(command: string, payload: any, connections?: Connection[]): void {
    const cmd: Command = { command, payload };

    if (connections) {
      connections.forEach((connection) => {
        connection.send(cmd);
      });
    } else {
      Object.values(this.connections).forEach((connection) => {
        connection.send(cmd);
      });
    }
  }

  /**
   * Given a Connection, broadcasts only to all other Connections that share
   * the same connection.remoteAddress.
   *
   * Use cases:
   *  - Push notifications.
   *  - Auth changes, e.g., logging out in one tab should log you out in all tabs.
   */
  broadcastRemoteAddress(
    connection: Connection,
    command: string,
    payload: any,
  ): void {
    const cmd: Command = { command, payload };
    const connections =
      this.remoteAddressToConnections[connection.remoteAddress] || [];

    connections.forEach((conn) => {
      conn.send(cmd);
    });
  }

  broadcastRemoteAddressById(id: string, command: string, payload: any): void {
    const connection = this.connections[id];
    if (connection) {
      this.broadcastRemoteAddress(connection, command, payload);
    }
  }

  /**
   * Given a roomName, a command and a payload, broadcasts to all Connections
   * that are in the room.
   */
  broadcastRoom(roomName: string, command: string, payload: any): void {
    const cmd: Command = { command, payload };
    const room = this.rooms[roomName];

    if (!room) return;

    room.forEach((connectionId) => {
      const connection = this.connections[connectionId];
      if (connection) {
        connection.send(cmd);
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
  ): void {
    const cmd: Command = { command, payload };
    const room = this.rooms[roomName];

    if (!room) return;

    const excludeIds = Array.isArray(connection)
      ? connection.map((c) => c.id)
      : [connection.id];

    room.forEach((connectionId) => {
      if (!excludeIds.includes(connectionId)) {
        const conn = this.connections[connectionId];
        if (conn) {
          conn.send(cmd);
        }
      }
    });
  }

  /**
   * Given a connection, broadcasts a message to all connections except
   * the provided connection.
   */
  broadcastExclude(
    connection: Connection,
    command: string,
    payload: any,
  ): void {
    const cmd: Command = { command, payload };

    Object.values(this.connections).forEach((conn) => {
      if (conn.id !== connection.id) {
        conn.send(cmd);
      }
    });
  }

  /**
   * Add a connection to a room
   */
  addToRoom(roomName: string, connection: Connection): void {
    this.rooms[roomName] = this.rooms[roomName] ?? new Set();
    this.rooms[roomName].add(connection.id);
  }

  /**
   * Remove a connection from a room
   */
  removeFromRoom(roomName: string, connection: Connection): void {
    if (!this.rooms[roomName]) return;
    this.rooms[roomName].delete(connection.id);
  }

  /**
   * Remove a connection from all rooms
   */
  removeFromAllRooms(connection: Connection | string): void {
    const connectionId =
      typeof connection === "string" ? connection : connection.id;

    Object.keys(this.rooms).forEach((roomName) => {
      this.rooms[roomName].delete(connectionId);
    });
  }

  /**
   * Returns all connections in a room
   */
  getRoom(roomName: string): Connection[] {
    const ids = this.rooms[roomName] || new Set();
    return Array.from(ids)
      .map((id) => this.connections[id])
      .filter(Boolean);
  }

  /**
   * Clear all connections from a room
   */
  clearRoom(roomName: string): void {
    this.rooms[roomName] = new Set();
  }

  /**
   * Register a command handler
   */
  async registerCommand<T = any>(
    command: string,
    callback: (context: WSContext<any>) => Promise<T> | T,
    middlewares: SocketMiddleware[] = [],
  ): Promise<void> {
    this.commands[command] = callback;

    if (middlewares.length > 0) {
      this.prependMiddlewareToCommand(command, middlewares);
    }

    return Promise.resolve();
  }

  /**
   * Add middleware to be executed before a command
   */
  prependMiddlewareToCommand(
    command: string,
    middlewares: SocketMiddleware[],
  ): void {
    if (middlewares.length) {
      this.middlewares[command] = this.middlewares[command] || [];
      this.middlewares[command] = middlewares.concat(this.middlewares[command]);
    }
  }

  /**
   * Add middleware to be executed after other middleware but before the command
   */
  appendMiddlewareToCommand(
    command: string,
    middlewares: SocketMiddleware[],
  ): void {
    if (middlewares.length) {
      this.middlewares[command] = this.middlewares[command] || [];
      this.middlewares[command] = this.middlewares[command].concat(middlewares);
    }
  }

  /**
   * Execute a command with the given id, name, payload and connection
   */
  private async runCommand(
    id: number,
    command: string,
    payload: any,
    connection: Connection,
  ): Promise<void> {
    const context = new WSContext(this, connection, payload);

    try {
      if (!this.commands[command]) {
        throw new CodeError(
          `Command [${command}] not found.`,
          "ENOTFOUND",
          "CommandError",
        );
      }

      // Run global middlewares
      if (this.globalMiddlewares.length) {
        for (const middleware of this.globalMiddlewares) {
          await middleware(context);
        }
      }

      // Run command-specific middlewares
      if (this.middlewares[command]) {
        for (const middleware of this.middlewares[command]) {
          await middleware(context);
        }
      }

      // Execute the command
      const result = await this.commands[command](context);
      connection.send({ id, command, payload: result });
    } catch (error) {
      // Handle and serialize errors
      const errorPayload =
        error instanceof Error
          ? {
              error: error.message,
              code: (error as CodeError).code || "ESERVER",
              name: error.name || "Error",
            }
          : { error: String(error) };

      connection.send({ id, command, payload: errorPayload });
    }
  }
}
