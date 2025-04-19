import deasync from "deasync";
import { EventEmitter } from "node:events";
import { WebSocket } from "ws";
import { CodeError } from "../common/codeerror";
import { Status } from "../common/status";
import { Connection } from "./connection";
import type { Operation } from "fast-json-patch";

export { Status } from "../common/status";
export { applyPatch } from "fast-json-patch";

export type MeshClientOptions = Partial<{
  /**
   * The number of milliseconds to wait before considering the connection closed due to inactivity.
   * When this happens, the connection will be closed and a reconnect will be attempted if
   * {@link MeshClientOptions.shouldReconnect} is true. This number should match the server's
   * `pingInterval` option.
   *
   * @default 30000
   */
  pingTimeout: number;

  /**
   * The maximum number of consecutive ping intervals the client will wait
   * for a ping message before considering the connection closed.
   * A value of 1 means the client must receive a ping within roughly 2 * pingTimeout
   * before attempting to reconnect.
   *
   * @default 1
   */
  maxMissedPings: number;

  /**
   * Whether or not to reconnect automatically.
   *
   * @default true
   */
  shouldReconnect: boolean;

  /**
   * The number of milliseconds to wait between reconnect attempts.
   *
   * @default 2000
   */
  reconnectInterval: number;

  /**
   * The number of times to attempt to reconnect before giving up and
   * emitting a `reconnectfailed` event.
   *
   * @default Infinity
   */
  maxReconnectAttempts: number;
}>;

export class MeshClient extends EventEmitter {
  connection: Connection;
  url: string;
  socket: WebSocket | null = null;
  pingTimeout: ReturnType<typeof setTimeout> | undefined;
  missedPings = 0;
  options: Required<MeshClientOptions>;
  isReconnecting = false;
  private _status: Status = Status.OFFLINE;
  private recordSubscriptions: Map<
    string, // recordId
    {
      callback: (update: {
        recordId: string;
        full?: any;
        patch?: Operation[];
        version: number;
      }) => void | Promise<void>;
      localVersion: number;
      mode: "patch" | "full";
    }
  > = new Map();

  private presenceSubscriptions: Map<
    string, // roomName
    (update: {
      type: "join" | "leave";
      connectionId: string;
      roomName: string;
      timestamp: number;
      metadata?: any;
    }) => void | Promise<void>
  > = new Map();

  constructor(url: string, opts: MeshClientOptions = {}) {
    super();
    this.url = url;
    this.connection = new Connection(null);
    this.options = {
      pingTimeout: opts.pingTimeout ?? 30_000,
      maxMissedPings: opts.maxMissedPings ?? 1,
      shouldReconnect: opts.shouldReconnect ?? true,
      reconnectInterval: opts.reconnectInterval ?? 2_000,
      maxReconnectAttempts: opts.maxReconnectAttempts ?? Infinity,
    };

    this.setupConnectionEvents();
  }

  get status(): Status {
    return this._status;
  }

  private setupConnectionEvents(): void {
    this.connection.on("message", (data) => {
      this.emit("message", data);

      if (data.command === "record-update") {
        this.handleRecordUpdate(data.payload);
      } else if (data.command === "presence-update") {
        this.handlePresenceUpdate(data.payload);
      } else if (data.command === "subscription-message") {
        this.emit(data.command, data.payload);
      } else {
        const systemCommands = [
          "ping",
          "pong",
          "latency",
          "latency:request",
          "latency:response",
        ];
        if (data.command && !systemCommands.includes(data.command)) {
          this.emit(data.command, data.payload);
        }
      }
    });

    this.connection.on("close", () => {
      this._status = Status.OFFLINE;
      this.emit("close");
      this.reconnect();
    });

    this.connection.on("error", (error) => {
      this.emit("error", error);
    });

    this.connection.on("ping", () => {
      this.heartbeat();
      this.emit("ping");
    });

    this.connection.on("latency", (data) => {
      this.emit("latency", data);
    });
  }

  /**
   * Connect to the WebSocket server.
   *
   * @returns {Promise<void>} A promise that resolves when the connection is established.
   */
  connect(): Promise<void> {
    if (this._status === Status.ONLINE) {
      return Promise.resolve();
    }

    if (
      this._status === Status.CONNECTING ||
      this._status === Status.RECONNECTING
    ) {
      return new Promise((resolve, reject) => {
        const onConnect = () => {
          this.removeListener("connect", onConnect);
          this.removeListener("error", onError);
          resolve();
        };

        const onError = (error: Error) => {
          this.removeListener("connect", onConnect);
          this.removeListener("error", onError);
          reject(error);
        };

        this.once("connect", onConnect);
        this.once("error", onError);
      });
    }

    this._status = Status.CONNECTING;

    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
          this._status = Status.ONLINE;
          this.connection.socket = this.socket;
          this.connection.status = Status.ONLINE;
          this.connection.applyListeners();
          this.heartbeat();

          this.emit("connect");
          resolve();
        };

        this.socket.onerror = (error) => {
          this._status = Status.OFFLINE;
          reject(
            new CodeError(
              "WebSocket connection error",
              "ECONNECTION",
              "ConnectionError"
            )
          );
        };
      } catch (error) {
        this._status = Status.OFFLINE;
        reject(error);
      }
    });
  }

  private heartbeat(): void {
    this.missedPings = 0;

    if (!this.pingTimeout) {
      this.pingTimeout = setTimeout(() => {
        this.checkPingStatus();
      }, this.options.pingTimeout);
    }
  }

  private checkPingStatus(): void {
    this.missedPings++;

    if (this.missedPings > this.options.maxMissedPings) {
      if (this.options.shouldReconnect) {
        this.reconnect();
      }
    } else {
      this.pingTimeout = setTimeout(() => {
        this.checkPingStatus();
      }, this.options.pingTimeout);
    }
  }

  /**
   * Disconnect the client from the server.
   * The client will not attempt to reconnect.
   *
   * @returns {Promise<void>} A promise that resolves when the connection is closed.
   */
  close(): Promise<void> {
    this.options.shouldReconnect = false;

    if (this._status === Status.OFFLINE) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const onClose = () => {
        this.removeListener("close", onClose);
        this._status = Status.OFFLINE;
        this.emit("disconnect");
        resolve();
      };

      this.once("close", onClose);

      clearTimeout(this.pingTimeout);
      this.pingTimeout = undefined;

      if (this.socket) {
        this.socket.close();
      }
    });
  }

  private reconnect(): void {
    if (!this.options.shouldReconnect || this.isReconnecting) {
      return;
    }

    this._status = Status.RECONNECTING;
    this.isReconnecting = true;

    // Reset ping tracking
    clearTimeout(this.pingTimeout);
    this.pingTimeout = undefined;
    this.missedPings = 0;

    let attempt = 1;

    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {
        // ignore errors during close
      }
    }

    const connect = () => {
      this.socket = new WebSocket(this.url);

      this.socket.onerror = () => {
        attempt++;

        if (attempt <= this.options.maxReconnectAttempts) {
          setTimeout(connect, this.options.reconnectInterval);
          return;
        }

        this.isReconnecting = false;
        this._status = Status.OFFLINE;
        this.emit("reconnectfailed");
      };

      this.socket.onopen = () => {
        this.isReconnecting = false;
        this._status = Status.ONLINE;
        this.connection.socket = this.socket;
        this.connection.status = Status.ONLINE;
        this.connection.applyListeners(true);
        this.heartbeat();

        this.emit("connect");
        this.emit("reconnect");
      };
    };

    connect();
  }

  /**
   * Send a command to the server and wait for a response.
   *
   * @param {string} command - The command name to send.
   * @param {unknown} payload - The payload to send with the command.
   * @param {number} expiresIn - Timeout in milliseconds.
   * @returns {Promise<unknown>} A promise that resolves with the command result.
   */
  command(
    command: string,
    payload?: any,
    expiresIn: number = 30000
  ): Promise<any> {
    if (this._status !== Status.ONLINE) {
      return this.connect()
        .then(() => this.connection.command(command, payload, expiresIn))
        .catch((error) => Promise.reject(error));
    }

    return this.connection.command(command, payload, expiresIn);
  }

  /**
   * Synchronously executes a command by internally invoking the asynchronous `command` method,
   * blocking the event loop until the asynchronous operation completes. The function returns
   * the result of the command, or throws an error if the command fails.
   *
   * @param {string} command - The command to execute.
   * @param {*} [payload] - Optional payload to send with the command.
   * @param {number} [expiresIn=30000] - Optional time in milliseconds before the command expires. Defaults to 30,000 ms.
   * @returns {*} The result of the executed command.
   * @throws {Error} Throws an error if the command fails.
   */
  commandSync(command: string, payload?: any, expiresIn: number = 30000): any {
    let result: any;
    let error: Error | undefined;
    let done = false;

    this.command(command, payload, expiresIn)
      .then((res) => {
        result = res;
        done = true;
      })
      .catch((err) => {
        error = err;
        done = true;
      });

    // block the event loop until the async operation is done
    deasync.loopWhile(() => !done);

    if (error) {
      throw error;
    }

    return result;
  }

  private async handlePresenceUpdate(payload: {
    type: "join" | "leave";
    connectionId: string;
    roomName: string;
    timestamp: number;
    metadata?: any;
  }) {
    const { roomName } = payload;
    const callback = this.presenceSubscriptions.get(roomName);

    if (callback) {
      await callback(payload);
    }
  }

  private async handleRecordUpdate(payload: {
    recordId: string;
    full?: any;
    patch?: Operation[];
    version: number;
  }) {
    const { recordId, full, patch, version } = payload;
    const subscription = this.recordSubscriptions.get(recordId);

    if (!subscription) {
      return;
    }

    if (patch) {
      if (version !== subscription.localVersion + 1) {
        // desync
        console.warn(
          `[MeshClient] Desync detected for record ${recordId}. Expected version ${
            subscription.localVersion + 1
          }, got ${version}. Resubscribing to request full record.`
        );
        // unsubscribe and resubscribe to force a full update
        await this.unsubscribeRecord(recordId);
        await this.subscribeRecord(recordId, subscription.callback, {
          mode: subscription.mode,
        });
        return;
      }

      subscription.localVersion = version;
      await subscription.callback({ recordId, patch, version });

      return;
    }

    if (full !== undefined) {
      subscription.localVersion = version;
      await subscription.callback({ recordId, full, version });
    }
  }

  /**
   * Subscribes to a specific channel and registers a callback to be invoked
   * whenever a message is received on that channel. Optionally retrieves a
   * limited number of historical messages and passes them to the callback upon subscription.
   *
   * @param {string} channel - The name of the channel to subscribe to.
   * @param {(message: string) => void | Promise<void>} callback - The function to be called for each message received on the channel.
   * @param {{ historyLimit?: number }} [options] - Optional subscription options, such as the maximum number of historical messages to retrieve.
   * @returns {Promise<{ success: boolean; history: string[] }>} A promise that resolves with the subscription result,
   *          including a success flag and an array of historical messages.
   */
  subscribeChannel(
    channel: string,
    callback: (message: string) => void | Promise<void>,
    options?: { historyLimit?: number }
  ): Promise<{ success: boolean; history: string[] }> {
    this.on(
      "subscription-message",
      async (data: { channel: string; message: string }) => {
        if (data.channel === channel) {
          await callback(data.message);
        }
      }
    );

    const historyLimit = options?.historyLimit;

    return this.command("subscribe-channel", { channel, historyLimit }).then(
      (result) => {
        if (result.success && result.history && result.history.length > 0) {
          result.history.forEach((message: string) => {
            callback(message);
          });
        }

        return {
          success: result.success,
          history: result.history || [],
        };
      }
    );
  }

  /**
   * Unsubscribes from a specified channel.
   *
   * @param {string} channel - The name of the channel to unsubscribe from.
   * @returns {Promise<boolean>} A promise that resolves to true if the unsubscription is successful, or false otherwise.
   */
  unsubscribeChannel(channel: string): Promise<boolean> {
    return this.command("unsubscribe-channel", { channel });
  }

  /**
   * Subscribes to a specific record and registers a callback for updates.
   *
   * @param {string} recordId - The ID of the record to subscribe to.
   * @param {(update: { full?: any; patch?: Operation[]; version: number }) => void | Promise<void>} callback - Function called on updates.
   * @param {{ mode?: "patch" | "full" }} [options] - Subscription mode ('patch' or 'full', default 'full').
   * @returns {Promise<{ success: boolean; record: any | null; version: number }>} Initial state of the record.
   */
  async subscribeRecord(
    recordId: string,
    callback: (update: {
      recordId: string;
      full?: any;
      patch?: Operation[];
      version: number;
    }) => void | Promise<void>,
    options?: { mode?: "patch" | "full" }
  ): Promise<{ success: boolean; record: any | null; version: number }> {
    const mode = options?.mode ?? "full";

    try {
      const result = await this.command("subscribe-record", { recordId, mode });

      if (result.success) {
        this.recordSubscriptions.set(recordId, {
          callback,
          localVersion: result.version,
          mode,
        });

        await callback({
          recordId,
          full: result.record,
          version: result.version,
        });
      }

      return {
        success: result.success,
        record: result.record ?? null,
        version: result.version ?? 0,
      };
    } catch (error) {
      console.error(
        `[MeshClient] Failed to subscribe to record ${recordId}:`,
        error
      );
      return { success: false, record: null, version: 0 };
    }
  }

  /**
   * Unsubscribes from a specific record.
   *
   * @param {string} recordId - The ID of the record to unsubscribe from.
   * @returns {Promise<boolean>} True if successful, false otherwise.
   */
  async unsubscribeRecord(recordId: string): Promise<boolean> {
    try {
      const success = await this.command("unsubscribe-record", { recordId });
      if (success) {
        this.recordSubscriptions.delete(recordId);
      }
      return success;
    } catch (error) {
      console.error(
        `[MeshClient] Failed to unsubscribe from record ${recordId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Publishes an update to a specific record if the client has write permissions.
   *
   * @param {string} recordId - The ID of the record to update.
   * @param {any} newValue - The new value for the record.
   * @returns {Promise<boolean>} True if the update was successfully published, false otherwise.
   */
  async publishRecordUpdate(recordId: string, newValue: any): Promise<boolean> {
    try {
      const result = await this.command("publish-record-update", {
        recordId,
        newValue,
      });
      return result.success === true;
    } catch (error) {
      console.error(
        `[MeshClient] Failed to publish update for record ${recordId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Subscribes to presence updates for a specific room.
   *
   * @param {string} roomName - The name of the room to subscribe to presence updates for.
   * @param {(update: { type: "join" | "leave"; connectionId: string; roomName: string; timestamp: number; metadata?: any }) => void | Promise<void>} callback - Function called on presence updates.
   * @returns {Promise<{ success: boolean; present: string[] }>} Initial state of presence in the room.
   */
  async subscribePresence(
    roomName: string,
    callback: (update: {
      type: "join" | "leave";
      connectionId: string;
      roomName: string;
      timestamp: number;
      metadata?: any;
    }) => void | Promise<void>
  ): Promise<{ success: boolean; present: string[] }> {
    try {
      const result = await this.command("subscribe-presence", { roomName });

      if (result.success) {
        this.presenceSubscriptions.set(roomName, callback);
      }

      return {
        success: result.success,
        present: result.present || [],
      };
    } catch (error) {
      console.error(
        `[MeshClient] Failed to subscribe to presence for room ${roomName}:`,
        error
      );
      return { success: false, present: [] };
    }
  }

  /**
   * Unsubscribes from presence updates for a specific room.
   *
   * @param {string} roomName - The name of the room to unsubscribe from.
   * @returns {Promise<boolean>} True if successful, false otherwise.
   */
  async unsubscribePresence(roomName: string): Promise<boolean> {
    try {
      const success = await this.command("unsubscribe-presence", { roomName });
      if (success) {
        this.presenceSubscriptions.delete(roomName);
      }
      return success;
    } catch (error) {
      console.error(
        `[MeshClient] Failed to unsubscribe from presence for room ${roomName}:`,
        error
      );
      return false;
    }
  }
}
