import { IncomingMessage } from "node:http";
import { v4 as uuidv4 } from "uuid";
import { Redis, type RedisOptions } from "ioredis";
import { WebSocket, WebSocketServer, type ServerOptions } from "ws";
import { RoomManager } from "./room-manager";
import { RecordManager } from "./record-manager";
import { ConnectionManager } from "./connection-manager";
import { CodeError, Status } from "../client";
import { Connection } from "./connection";
import { parseCommand, type Command } from "../common/message";
import type { Operation } from "fast-json-patch";

const PUB_SUB_CHANNEL_PREFIX = "mesh:pubsub:";
const RECORD_PUB_SUB_CHANNEL = "mesh:record-updates";

export class MeshContext<T = any> {
  server: MeshServer;
  command: string;
  connection: Connection;
  payload: T;

  constructor(
    server: MeshServer,
    command: string,
    connection: Connection,
    payload: T
  ) {
    this.server = server;
    this.command = command;
    this.connection = connection;
    this.payload = payload;
  }
}

export type SocketMiddleware = (
  context: MeshContext<any>
) => any | Promise<any>;

type PubSubMessagePayload = {
  targetConnectionIds: string[];
  command: Command;
};

type RecordUpdatePubSubPayload = {
  recordId: string;
  newValue?: any;
  patch?: Operation[];
  version: number;
};

export type MeshServerOptions = ServerOptions & {
  /**
   * The interval at which to send ping messages to the client.
   *
   * @default 30000
   */
  pingInterval?: number;

  /**
   * The interval at which to send both latency requests and updates to the client.
   *
   * @default 5000
   */
  latencyInterval?: number;
  redisOptions: RedisOptions;

  /**
   * The maximum number of consecutive ping intervals the server will wait
   * for a pong response before considering the client disconnected.
   * A value of 1 means the client must respond within roughly 2 * pingInterval
   * before being disconnected. Setting it to 0 is not recommended as it will
   * immediately disconnect the client if it doesn't respond to the first ping in
   * exactly `pingInterval` milliseconds, which doesn't provide wiggle room for
   * network latency.
   *
   * @see pingInterval
   * @default 1
   */
  maxMissedPongs?: number;
};

type ChannelPattern = string | RegExp;

export class MeshServer extends WebSocketServer {
  readonly instanceId: string;
  redis: Redis;
  pubClient: Redis;
  subClient: Redis;
  roomManager: RoomManager;
  recordManager: RecordManager;
  connectionManager: ConnectionManager;
  serverOptions: MeshServerOptions;
  status: Status = Status.OFFLINE;
  private exposedChannels: ChannelPattern[] = [];
  private exposedRecords: ChannelPattern[] = [];
  private channelSubscriptions: { [channel: string]: Set<Connection> } = {};
  private recordSubscriptions: Map<
    string, // recordId
    Map<string, "patch" | "full"> // connectionId -> mode
  > = new Map();
  private channelGuards: Map<
    ChannelPattern,
    (connection: Connection, channel: string) => Promise<boolean> | boolean
  > = new Map();
  private recordGuards: Map<
    ChannelPattern,
    (connection: Connection, recordId: string) => Promise<boolean> | boolean
  > = new Map();
  private _isShuttingDown = false;

  commands: {
    [command: string]: (context: MeshContext<any>) => Promise<any> | any;
  } = {};
  private globalMiddlewares: SocketMiddleware[] = [];
  middlewares: { [key: string]: SocketMiddleware[] } = {};

  private _listening = false;
  private _subscriptionPromise!: Promise<void>;

  get listening(): boolean {
    return this._listening;
  }

  set listening(value: boolean) {
    this._listening = value;
    this.status = value ? Status.ONLINE : Status.OFFLINE;
  }

  constructor(opts: MeshServerOptions) {
    super(opts);

    this.instanceId = uuidv4();

    this.redis = new Redis({
      retryStrategy: (times: number) => {
        if (this._isShuttingDown) {
          return null;
        }

        if (times > 10) {
          return null;
        }

        return Math.min(1000 * Math.pow(2, times), 30000);
      },
      ...opts.redisOptions,
    });
    this.redis.on("error", (err) => console.error("Redis error:", err));

    this.serverOptions = {
      ...opts,
      pingInterval: opts.pingInterval ?? 30_000,
      latencyInterval: opts.latencyInterval ?? 5_000,
      maxMissedPongs: opts.maxMissedPongs ?? 1,
    };

    this.pubClient = this.redis.duplicate();
    this.subClient = this.redis.duplicate();

    this.roomManager = new RoomManager(this.redis);
    this.recordManager = new RecordManager(this.redis);
    this.connectionManager = new ConnectionManager(
      this.pubClient,
      this.instanceId,
      this.roomManager
    );

    this.subscribeToInstanceChannel();

    this.on("listening", () => {
      this.listening = true;
    });

    this.on("error", (err) => {
      console.error(`[MeshServer] Error: ${err}`);
    });

    this.on("close", () => {
      this.listening = false;
    });

    this.registerBuiltinCommands();
    this.registerRecordCommands(); // Add this line
    this.applyListeners();
  }

  /**
   * Waits until the service is ready by ensuring it is listening and the instance channel subscription is established.
   *
   * @returns {Promise<void>} A promise that resolves when the service is fully ready.
   * @throws {Error} If the readiness process fails or if any awaited promise rejects.
   */
  async ready(): Promise<void> {
    const listeningPromise = this.listening
      ? Promise.resolve()
      : new Promise<void>((resolve) => this.once("listening", resolve));

    await Promise.all([listeningPromise, this._subscriptionPromise]);
  }

  private subscribeToInstanceChannel(): Promise<void> {
    const channel = `${PUB_SUB_CHANNEL_PREFIX}${this.instanceId}`;

    this._subscriptionPromise = new Promise((resolve, reject) => {
      this.subClient.subscribe(channel, RECORD_PUB_SUB_CHANNEL, (err) => {
        if (err) {
          if (!this._isShuttingDown) {
            console.error(
              `Failed to subscribe to channels ${channel}, ${RECORD_PUB_SUB_CHANNEL}:`,
              err
            );
          }
          reject(err);
          return;
        }
        resolve();
      });
    });

    this.subClient.on("message", async (channel, message) => {
      if (channel.startsWith(PUB_SUB_CHANNEL_PREFIX)) {
        this.handleInstancePubSubMessage(channel, message);
      } else if (channel === RECORD_PUB_SUB_CHANNEL) {
        this.handleRecordUpdatePubSubMessage(message);
      } else if (this.channelSubscriptions[channel]) {
        // Handle regular channel subscriptions
        for (const connection of this.channelSubscriptions[channel]) {
          if (!connection.isDead) {
            connection.send({
              command: "subscription-message",
              payload: { channel, message },
            });
          }
        }
      }
    });

    return this._subscriptionPromise;
  }

  private handleInstancePubSubMessage(channel: string, message: string) {
    try {
      const parsedMessage = JSON.parse(message) as PubSubMessagePayload;

      if (
        !parsedMessage ||
        !Array.isArray(parsedMessage.targetConnectionIds) ||
        !parsedMessage.command ||
        typeof parsedMessage.command.command !== "string"
      ) {
        throw new Error("Invalid message format");
      }

      const { targetConnectionIds, command } = parsedMessage;

      targetConnectionIds.forEach((connectionId) => {
        const connection =
          this.connectionManager.getLocalConnection(connectionId);

        if (connection && !connection.isDead) {
          connection.send(command);
        }
      });
    } catch (err) {
      this.emit("error", new Error(`Failed to parse message: ${message}`));
    }
  }

  private handleRecordUpdatePubSubMessage(message: string) {
    try {
      const parsedMessage = JSON.parse(message) as RecordUpdatePubSubPayload;
      const { recordId, newValue, patch, version } = parsedMessage;

      if (!recordId || typeof version !== "number") {
        throw new Error("Invalid record update message format");
      }

      const subscribers = this.recordSubscriptions.get(recordId);
      if (!subscribers) {
        return; // No local subscribers for this record
      }

      subscribers.forEach((mode, connectionId) => {
        const connection =
          this.connectionManager.getLocalConnection(connectionId);
        if (connection && !connection.isDead) {
          if (mode === "patch" && patch) {
            connection.send({
              command: "record-update",
              payload: { recordId, patch, version },
            });
          } else if (mode === "full" && newValue !== undefined) {
            connection.send({
              command: "record-update",
              payload: { recordId, full: newValue, version },
            });
          }
        } else if (!connection) {
          // Clean up stale subscription if connection no longer exists locally
          subscribers.delete(connectionId);
          if (subscribers.size === 0) {
            this.recordSubscriptions.delete(recordId);
          }
        }
      });
    } catch (err) {
      this.emit(
        "error",
        new Error(`Failed to parse record update message: ${message}`)
      );
    }
  }

  private applyListeners() {
    this.on("connection", async (socket: WebSocket, req: IncomingMessage) => {
      const connection = new Connection(socket, req, this.serverOptions);

      connection.on("message", (buffer: Buffer) => {
        try {
          const data = buffer.toString();
          const command = parseCommand(data);

          if (
            command.id !== undefined &&
            !["latency:response", "pong"].includes(command.command)
          ) {
            this.runCommand(
              command.id,
              command.command,
              command.payload,
              connection
            );
          }
        } catch (err) {
          this.emit("error", err);
        }
      });

      try {
        await this.connectionManager.registerConnection(connection);
      } catch (error) {
        connection.close();
        return;
      }

      this.emit("connected", connection);

      connection.on("close", async () => {
        await this.cleanupConnection(connection);
        this.emit("disconnected", connection);
      });

      connection.on("error", (err) => {
        this.emit("clientError", err, connection);
      });
    });
  }

  /**
   * Exposes a channel for external access and optionally associates a guard function
   * to control access to that channel. The guard function determines whether a given
   * connection is permitted to access the channel.
   *
   * @param {ChannelPattern} channel - The channel or pattern to expose.
   * @param {(connection: Connection, channel: string) => Promise<boolean> | boolean} [guard] -
   *   Optional guard function that receives the connection and channel name, returning
   *   a boolean or a promise that resolves to a boolean indicating whether access is allowed.
   * @returns {void}
   */
  exposeChannel(
    channel: ChannelPattern,
    guard?: (
      connection: Connection,
      channel: string
    ) => Promise<boolean> | boolean
  ): void {
    this.exposedChannels.push(channel);
    if (guard) {
      this.channelGuards.set(channel, guard);
    }
  }

  private async isChannelExposed(
    channel: string,
    connection: Connection
  ): Promise<boolean> {
    // First check if the channel matches any exposed pattern
    const matchedPattern = this.exposedChannels.find((pattern) =>
      typeof pattern === "string" ? pattern === channel : pattern.test(channel)
    );

    if (!matchedPattern) {
      return false;
    }

    const guard = this.channelGuards.get(matchedPattern);
    if (guard) {
      try {
        return await Promise.resolve(guard(connection, channel));
      } catch (e) {
        return false;
      }
    }

    return true;
  }

  /**
   * Exposes a record or pattern for client subscriptions, optionally adding a guard function.
   *
   * @param {ChannelPattern} recordPattern - The record ID or pattern to expose.
   * @param {(connection: Connection, recordId: string) => Promise<boolean> | boolean} [guard] - Optional guard function.
   */
  exposeRecord(
    recordPattern: ChannelPattern,
    guard?: (
      connection: Connection,
      recordId: string
    ) => Promise<boolean> | boolean
  ): void {
    this.exposedRecords.push(recordPattern);
    if (guard) {
      this.recordGuards.set(recordPattern, guard);
    }
  }

  private async isRecordExposed(
    recordId: string,
    connection: Connection
  ): Promise<boolean> {
    const matchedPattern = this.exposedRecords.find((pattern) =>
      typeof pattern === "string"
        ? pattern === recordId
        : pattern.test(recordId)
    );

    if (!matchedPattern) {
      return false;
    }

    const guard = this.recordGuards.get(matchedPattern);
    if (guard) {
      try {
        return await Promise.resolve(guard(connection, recordId));
      } catch (e) {
        return false;
      }
    }

    return true;
  }

  /**
   * Publishes a message to a specified channel and optionally maintains a history of messages.
   *
   * @param {string} channel - The name of the channel to which the message will be published.
   * @param {any} message - The message to be published. Will not be stringified automatically for you. You need to do that yourself.
   * @param {number} [history=0] - The number of historical messages to retain for the channel. Defaults to 0, meaning no history is retained.
   *                               If greater than 0, the message will be added to the channel's history and the history will be trimmed to the specified size.
   * @returns {Promise<void>} A Promise that resolves once the message has been published and, if applicable, the history has been updated.
   * @throws {Error} This function may throw an error if the underlying `pubClient` operations (e.g., `lpush`, `ltrim`, `publish`) fail.
   */
  async publishToChannel(
    channel: string,
    message: any,
    history: number = 0
  ): Promise<void> {
    const parsedHistory = parseInt(history as any, 10);
    if (!isNaN(parsedHistory) && parsedHistory > 0) {
      await this.pubClient.lpush(`history:${channel}`, message);
      await this.pubClient.ltrim(`history:${channel}`, 0, parsedHistory);
    }
    await this.pubClient.publish(channel, message);
  }

  /**
   * Updates a record, persists it to Redis, increments its version, computes a patch,
   * and publishes the update via Redis pub/sub.
   *
   * @param {string} recordId - The ID of the record to update.
   * @param {any} newValue - The new value for the record.
   * @returns {Promise<void>}
   * @throws {Error} If the update fails.
   */
  async publishRecordUpdate(recordId: string, newValue: any): Promise<void> {
    const updateResult = await this.recordManager.publishUpdate(
      recordId,
      newValue
    );

    if (!updateResult) {
      return; // No change detected
    }

    const { patch, version } = updateResult;

    const messagePayload: RecordUpdatePubSubPayload = {
      recordId,
      newValue, // Always include newValue for 'full' subscribers
      patch,
      version,
    };

    try {
      await this.pubClient.publish(
        RECORD_PUB_SUB_CHANNEL,
        JSON.stringify(messagePayload)
      );
    } catch (err) {
      this.emit(
        "error",
        new Error(`Failed to publish record update for "${recordId}": ${err}`)
      );
    }
  }

  /**
   * Adds one or more middleware functions to the global middleware stack.
   *
   * @param {SocketMiddleware[]} middlewares - An array of middleware functions to be added. Each middleware
   *                                           is expected to conform to the `SocketMiddleware` type.
   * @returns {void}
   * @throws {Error} If the provided middlewares are not valid or fail validation (if applicable).
   */
  addMiddleware(...middlewares: SocketMiddleware[]): void {
    this.globalMiddlewares.push(...middlewares);
  }

  /**
   * Registers a command with an associated callback and optional middleware.
   *
   * @template T The type for `MeshContext.payload`. Defaults to `any`.
   * @template U The command's return value type. Defaults to `any`.
   * @param {string} command - The unique identifier for the command to register.
   * @param {(context: MeshContext<T>) => Promise<U> | U} callback - The function to execute when the command is invoked. It receives a `MeshContext` of type `T` and may return a value of type `U` or a `Promise` resolving to `U`.
   * @param {SocketMiddleware[]} [middlewares=[]] - An optional array of middleware functions to apply to the command. Defaults to an empty array.
   * @throws {Error} May throw an error if the command registration or middleware addition fails.
   */
  registerCommand<T = any, U = any>(
    command: string,
    callback: (context: MeshContext<T>) => Promise<U> | U,
    middlewares: SocketMiddleware[] = []
  ) {
    this.commands[command] = callback;

    if (middlewares.length > 0) {
      this.addMiddlewareToCommand(command, middlewares);
    }
  }

  private registerBuiltinCommands() {
    this.registerCommand<
      { channel: string; historyLimit?: number },
      { success: boolean; history?: string[] }
    >("subscribe-channel", async (ctx) => {
      const { channel, historyLimit } = ctx.payload;

      if (!(await this.isChannelExposed(channel, ctx.connection))) {
        return { success: false, history: [] };
      }

      try {
        if (!this.channelSubscriptions[channel]) {
          this.channelSubscriptions[channel] = new Set();
          await new Promise<void>((resolve, reject) => {
            this.subClient.subscribe(channel, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }
        this.channelSubscriptions[channel].add(ctx.connection);

        let history: string[] = [];
        if (historyLimit && historyLimit > 0) {
          const historyKey = `history:${channel}`;
          history = await this.redis.lrange(historyKey, 0, historyLimit - 1);
        }

        return {
          success: true,
          history,
        };
      } catch (e) {
        return { success: false, history: [] };
      }
    });

    this.registerCommand<{ channel: string }, boolean>(
      "unsubscribe-channel",
      async (ctx) => {
        const { channel } = ctx.payload;
        if (this.channelSubscriptions[channel]) {
          this.channelSubscriptions[channel].delete(ctx.connection);
          if (this.channelSubscriptions[channel].size === 0) {
            await new Promise<void>((resolve, reject) => {
              this.subClient.unsubscribe(channel, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
            delete this.channelSubscriptions[channel];
          }
          return true;
        }
        return false;
      }
    );
  }

  private registerRecordCommands() {
    this.registerCommand<
      { recordId: string; mode?: "patch" | "full" },
      { success: boolean; record?: any; version?: number }
    >("subscribe-record", async (ctx) => {
      const { recordId, mode = "full" } = ctx.payload;
      const connectionId = ctx.connection.id;

      if (!(await this.isRecordExposed(recordId, ctx.connection))) {
        return { success: false };
      }

      try {
        const { record, version } =
          await this.recordManager.getRecordAndVersion(recordId);

        if (!this.recordSubscriptions.has(recordId)) {
          this.recordSubscriptions.set(recordId, new Map());
        }
        this.recordSubscriptions.get(recordId)!.set(connectionId, mode);

        return { success: true, record, version };
      } catch (e) {
        console.error(`Failed to subscribe to record ${recordId}:`, e);
        return { success: false };
      }
    });

    this.registerCommand<{ recordId: string }, boolean>(
      "unsubscribe-record",
      async (ctx) => {
        const { recordId } = ctx.payload;
        const connectionId = ctx.connection.id;
        const recordSubs = this.recordSubscriptions.get(recordId);

        if (recordSubs?.has(connectionId)) {
          recordSubs.delete(connectionId);
          if (recordSubs.size === 0) {
            this.recordSubscriptions.delete(recordId);
          }
          return true;
        }
        return false;
      }
    );
  }

  /**
   * Adds an array of middleware functions to a specific command.
   *
   * @param {string} command - The name of the command to associate the middleware with.
   * @param {SocketMiddleware[]} middlewares - An array of middleware functions to be added to the command.
   * @returns {void}
   */
  addMiddlewareToCommand(
    command: string,
    middlewares: SocketMiddleware[]
  ): void {
    if (middlewares.length) {
      this.middlewares[command] = this.middlewares[command] || [];
      this.middlewares[command] = middlewares.concat(this.middlewares[command]);
    }
  }

  private async cleanupRecordSubscriptions(connection: Connection) {
    const connectionId = connection.id;
    this.recordSubscriptions.forEach((subscribers, recordId) => {
      if (subscribers.has(connectionId)) {
        subscribers.delete(connectionId);
        if (subscribers.size === 0) {
          this.recordSubscriptions.delete(recordId);
        }
      }
    });
  }

  private async runCommand(
    id: number,
    commandName: string,
    payload: any,
    connection: Connection
  ) {
    const context = new MeshContext(this, commandName, connection, payload);

    try {
      if (!this.commands[commandName]) {
        throw new CodeError(
          `Command "${commandName}" not found`,
          "ENOTFOUND",
          "CommandError"
        );
      }

      if (this.globalMiddlewares.length) {
        for (const middleware of this.globalMiddlewares) {
          await middleware(context);
        }
      }

      if (this.middlewares[commandName]) {
        for (const middleware of this.middlewares[commandName]) {
          await middleware(context);
        }
      }

      const result = await this.commands[commandName](context);
      connection.send({ id, command: commandName, payload: result });
    } catch (err) {
      const errorPayload =
        err instanceof Error
          ? {
              error: err.message,
              code: (err as CodeError).code || "ESERVER",
              name: err.name || "Error",
            }
          : { error: String(err), code: "EUNKNOWN", name: "UnknownError" };

      connection.send({ id, command: commandName, payload: errorPayload });
    }
  }

  /**
   * Broadcasts a command and payload to a set of connections or all available connections.
   *
   * @param {string} command - The command to be broadcasted.
   * @param {any} payload - The data associated with the command.
   * @param {Connection[]=} connections - (Optional) A specific list of connections to broadcast to. If not provided, the command will be sent to all connections.
   *
   * @throws {Error} Emits an "error" event if broadcasting fails.
   */
  async broadcast(command: string, payload: any, connections?: Connection[]) {
    const cmd: Command = { command, payload };

    try {
      if (connections) {
        const allConnectionIds = connections.map(({ id }) => id);
        const connectionIds =
          await this.connectionManager.getAllConnectionIds();
        const filteredIds = allConnectionIds.filter((id) =>
          connectionIds.includes(id)
        );
        await this.publishOrSend(filteredIds, cmd);
      } else {
        const allConnectionIds =
          await this.connectionManager.getAllConnectionIds();
        await this.publishOrSend(allConnectionIds, cmd);
      }
    } catch (err) {
      this.emit(
        "error",
        new Error(`Failed to broadcast command "${command}": ${err}`)
      );
    }
  }

  /**
   * Broadcasts a command and associated payload to all active connections within the specified room.
   *
   * @param {string} roomName - The name of the room whose connections will receive the broadcast.
   * @param {string} command - The command to be broadcasted to the connections.
   * @param {unknown} payload - The data payload associated with the command.
   * @returns {Promise<void>} A promise that resolves when the broadcast operation is complete.
   * @throws {Error} If the broadcast operation fails, an error is thrown and the promise is rejected.
   */
  async broadcastRoom(
    roomName: string,
    command: string,
    payload: any
  ): Promise<void> {
    const connectionIds = await this.roomManager.getRoomConnectionIds(roomName);

    try {
      await this.publishOrSend(connectionIds, { command, payload });
    } catch (err) {
      this.emit(
        "error",
        new Error(`Failed to broadcast command "${command}": ${err}`)
      );
    }
  }

  /**
   * Broadcasts a command and payload to all active connections except for the specified one(s).
   * Excludes the provided connection(s) from receiving the broadcast.
   *
   * @param {string} command - The command to broadcast to connections.
   * @param {any} payload - The payload to send along with the command.
   * @param {Connection | Connection[]} exclude - A single connection or an array of connections to exclude from the broadcast.
   * @returns {Promise<void>} A promise that resolves when the broadcast is complete.
   * @emits {Error} Emits an "error" event if broadcasting the command fails.
   */
  async broadcastExclude(
    command: string,
    payload: any,
    exclude: Connection | Connection[]
  ): Promise<void> {
    const excludedIds = new Set(
      (Array.isArray(exclude) ? exclude : [exclude]).map(({ id }) => id)
    );

    try {
      const connectionIds = (
        await this.connectionManager.getAllConnectionIds()
      ).filter((id) => !excludedIds.has(id));
      await this.publishOrSend(connectionIds, { command, payload });
    } catch (err) {
      this.emit(
        "error",
        new Error(`Failed to broadcast command "${command}": ${err}`)
      );
    }
  }

  /**
   * Broadcasts a command with a payload to all connections in a specified room,
   * excluding one or more given connections. If the broadcast fails, emits an error event.
   *
   * @param {string} roomName - The name of the room to broadcast to.
   * @param {string} command - The command to broadcast.
   * @param {any} payload - The payload to send with the command.
   * @param {Connection | Connection[]} exclude - A connection or array of connections to exclude from the broadcast.
   * @returns {Promise<void>} A promise that resolves when the broadcast is complete.
   * @emits {Error} Emits an error event if broadcasting fails.
   */
  async broadcastRoomExclude(
    roomName: string,
    command: string,
    payload: any,
    exclude: Connection | Connection[]
  ): Promise<void> {
    const excludedIds = new Set(
      (Array.isArray(exclude) ? exclude : [exclude]).map(({ id }) => id)
    );

    try {
      const connectionIds = (
        await this.roomManager.getRoomConnectionIds(roomName)
      ).filter((id) => !excludedIds.has(id));
      await this.publishOrSend(connectionIds, { command, payload });
    } catch (err) {
      this.emit(
        "error",
        new Error(`Failed to broadcast command "${command}": ${err}`)
      );
    }
  }

  private async publishOrSend(connectionIds: string[], command: Command) {
    if (connectionIds.length === 0) {
      return;
    }

    // get instance mapping for the target connection IDs
    const connectionInstanceMapping =
      await this.connectionManager.getInstanceIdsForConnections(connectionIds);
    const instanceMap: { [instanceId: string]: string[] } = {};

    // group connection IDs by instance ID
    for (const connectionId of connectionIds) {
      const instanceId = connectionInstanceMapping[connectionId];

      if (instanceId) {
        if (!instanceMap[instanceId]) {
          instanceMap[instanceId] = [];
        }

        instanceMap[instanceId].push(connectionId);
      }
    }

    // publish command to each instance
    for (const [instanceId, targetConnectionIds] of Object.entries(
      instanceMap
    )) {
      if (targetConnectionIds.length === 0) continue;

      if (instanceId === this.instanceId) {
        // send locally
        targetConnectionIds.forEach((connectionId) => {
          const connection =
            this.connectionManager.getLocalConnection(connectionId);
          if (connection && !connection.isDead) {
            connection.send(command);
          }
        });
      } else {
        // publish to remote instance via pubsub
        const messagePayload: PubSubMessagePayload = {
          targetConnectionIds,
          command,
        };
        const message = JSON.stringify(messagePayload);

        try {
          await this.pubClient.publish(
            this.getPubSubChannel(instanceId),
            message
          );
        } catch (err) {
          this.emit(
            "error",
            new Error(`Failed to publish command "${command.command}": ${err}`)
          );
        }
      }
    }
  }

  async isInRoom(roomName: string, connection: Connection | string) {
    const connectionId =
      typeof connection === "string" ? connection : connection.id;
    return this.roomManager.connectionIsInRoom(roomName, connectionId);
  }

  async addToRoom(roomName: string, connection: Connection | string) {
    return this.roomManager.addToRoom(roomName, connection);
  }

  async removeFromRoom(roomName: string, connection: Connection | string) {
    return this.roomManager.removeFromRoom(roomName, connection);
  }

  async removeFromAllRooms(connection: Connection | string) {
    return this.roomManager.removeFromAllRooms(connection);
  }

  async clearRoom(roomName: string) {
    return this.roomManager.clearRoom(roomName);
  }

  async getRoomMembers(roomName: string): Promise<string[]> {
    return this.roomManager.getRoomConnectionIds(roomName);
  }

  private getPubSubChannel(instanceId: string): string {
    return `${PUB_SUB_CHANNEL_PREFIX}${instanceId}`;
  }

  private async cleanupConnection(connection: Connection) {
    connection.stopIntervals();

    await this.connectionManager.cleanupConnection(connection);
    await this.roomManager.cleanupConnection(connection);
    await this.cleanupRecordSubscriptions(connection); // Ensure this line exists
  }

  /**
   * Gracefully closes all active connections, cleans up resources,
   * and shuts down the service. Optionally accepts a callback function
   * that will be invoked once shutdown is complete or if an error occurs.
   *
   * @param {((err?: Error) => void)=} callback - Optional callback to be invoked when closing is complete or if an error occurs.
   * @returns {Promise<void>} A promise that resolves when shutdown is complete.
   * @throws {Error} If an error occurs during shutdown, the promise will be rejected with the error.
   */
  async close(callback?: (err?: Error) => void): Promise<void> {
    this._isShuttingDown = true;

    const connections = Object.values(
      this.connectionManager.getLocalConnections()
    );
    await Promise.all(
      connections.map(async (connection) => {
        if (!connection.isDead) {
          await connection.close();
        }
        await this.cleanupConnection(connection);
      })
    );

    await new Promise<void>((resolve, reject) => {
      super.close((err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.pubClient.disconnect();
    this.subClient.disconnect();
    this.redis.disconnect();

    this.listening = false;
    this.removeAllListeners();

    if (callback) {
      callback();
    }
  }
}
