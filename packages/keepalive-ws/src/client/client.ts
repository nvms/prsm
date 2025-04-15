import { EventEmitter } from "node:events";
import { WebSocket } from "ws";
import { CodeError } from "../common/codeerror";
import { Status } from "../common/status";
import { Connection } from "./connection";

export { Status } from "../common/status";

export type KeepAliveClientOptions = Partial<{
  /**
   * The number of milliseconds to wait before considering the connection closed due to inactivity.
   * When this happens, the connection will be closed and a reconnect will be attempted if @see KeepAliveClientOptions.shouldReconnect is true.
   * This number should match the server's `pingTimeout` option.
   * @default 30000
   * @see maxLatency.
   */
  pingTimeout: number;

  /**
   * This number plus @see pingTimeout is the maximum amount of time that can pass before the connection is considered closed.
   * @default 2000
   */
  maxLatency: number;

  /**
   * Whether or not to reconnect automatically.
   * @default true
   */
  shouldReconnect: boolean;

  /**
   * The number of milliseconds to wait between reconnect attempts.
   * @default 2000
   */
  reconnectInterval: number;

  /**
   * The number of times to attempt to reconnect before giving up and
   * emitting a `reconnectfailed` event.
   * @default Infinity
   */
  maxReconnectAttempts: number;
}>;

export class KeepAliveClient extends EventEmitter {
  connection: Connection;
  url: string;
  socket: WebSocket | null = null;
  pingTimeout: ReturnType<typeof setTimeout>;
  options: Required<KeepAliveClientOptions>;
  isReconnecting = false;
  private _status: Status = Status.OFFLINE;

  constructor(url: string, opts: KeepAliveClientOptions = {}) {
    super();
    this.url = url;
    this.connection = new Connection(null);
    this.options = {
      pingTimeout: opts.pingTimeout ?? 30_000,
      maxLatency: opts.maxLatency ?? 2_000,
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
    // Forward relevant events from connection to client
    this.connection.on("message", (data) => {
      // Forward the raw message event
      this.emit("message", data);

      // Also forward the specific command event if it's not a system event
      // (System events like ping/latency are handled separately below)
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
   * @returns A promise that resolves when the connection is established.
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

  heartbeat(): void {
    clearTimeout(this.pingTimeout);

    this.pingTimeout = setTimeout(() => {
      if (this.options.shouldReconnect) {
        this.reconnect();
      }
    }, this.options.pingTimeout + this.options.maxLatency);
  }

  /**
   * Disconnect the client from the server.
   * The client will not attempt to reconnect.
   * @returns A promise that resolves when the connection is closed.
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
        resolve();
      };

      this.once("close", onClose);

      clearTimeout(this.pingTimeout);

      if (this.socket) {
        this.socket.close();
      }
    });
  }

  /**
   * @deprecated Use close() instead
   */
  disconnect(): Promise<void> {
    return this.close();
  }

  private reconnect(): void {
    if (!this.options.shouldReconnect || this.isReconnecting) {
      return;
    }

    this._status = Status.RECONNECTING;
    this.isReconnecting = true;

    let attempt = 1;

    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {
        // Ignore errors during close
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
   * @param command The command name to send
   * @param payload The payload to send with the command
   * @param expiresIn Timeout in milliseconds
   * @param callback Optional callback function
   * @returns A promise that resolves with the command result
   */
  command(
    command: string,
    payload?: any,
    expiresIn: number = 30000,
    callback?: (result: any, error?: Error) => void
  ): Promise<any> {
    // Ensure we're connected before sending commands
    if (this._status !== Status.ONLINE) {
      return this.connect()
        .then(() =>
          this.connection.command(command, payload, expiresIn, callback)
        )
        .catch((error) => {
          if (callback) {
            callback(null, error);
            return Promise.reject(error);
          }
          return Promise.reject(error);
        });
    }

    return this.connection.command(command, payload, expiresIn, callback);
  }
}
