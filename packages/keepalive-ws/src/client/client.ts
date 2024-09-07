import { Connection } from "./connection";

type KeepAliveClientOptions = Partial<{
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

const defaultOptions = (opts: KeepAliveClientOptions = {}) => {
  opts.pingTimeout = opts.pingTimeout ?? 30_000;
  opts.maxLatency = opts.maxLatency ?? 2_000;
  opts.shouldReconnect = opts.shouldReconnect ?? true;
  opts.reconnectInterval = opts.reconnectInterval ?? 2_000;
  opts.maxReconnectAttempts = opts.maxReconnectAttempts ?? Infinity;
  return opts;
};

export class KeepAliveClient extends EventTarget {
  connection: Connection;
  url: string;
  socket: WebSocket;
  pingTimeout: ReturnType<typeof setTimeout>;
  options: KeepAliveClientOptions;
  isReconnecting = false;

  constructor(url: string, opts: KeepAliveClientOptions = {}) {
    super();
    this.url = url;
    this.socket = new WebSocket(url);
    this.connection = new Connection(this.socket);
    this.options = defaultOptions(opts);
    this.applyListeners();
  }

  get on() {
    return this.connection.addEventListener.bind(this.connection);
  }

  applyListeners() {
    this.connection.addEventListener("connection", () => {
      this.heartbeat();
    });

    this.connection.addEventListener("close", () => {
      this.reconnect();
    });

    this.connection.addEventListener("ping", () => {
      this.heartbeat();
    });

    this.connection.addEventListener(
      "message",
      (ev: CustomEventInit<unknown>) => {
        this.dispatchEvent(new CustomEvent("message", ev));
      },
    );
  }

  heartbeat() {
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
   * To reconnect, create a new KeepAliveClient.
   */
  disconnect() {
    this.options.shouldReconnect = false;

    if (this.socket) {
      this.socket.close();
    }

    clearTimeout(this.pingTimeout);
  }

  private async reconnect() {
    if (!this.options.shouldReconnect || this.isReconnecting) {
      return;
    }

    this.isReconnecting = true;

    let attempt = 1;

    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {}
    }

    const connect = () => {
      this.socket = new WebSocket(this.url);
      this.socket.onerror = () => {
        attempt++;

        if (attempt <= this.options.maxReconnectAttempts) {
          setTimeout(connect, this.options.reconnectInterval);
        } else {
          this.isReconnecting = false;

          this.connection.dispatchEvent(new Event("reconnectfailed"));
          this.connection.dispatchEvent(new Event("reconnectionfailed"));
        }
      };

      this.socket.onopen = () => {
        this.isReconnecting = false;
        this.connection.socket = this.socket;

        this.connection.applyListeners(true);

        this.connection.dispatchEvent(new Event("connection"));
        this.connection.dispatchEvent(new Event("connected"));
        this.connection.dispatchEvent(new Event("connect"));

        this.connection.dispatchEvent(new Event("reconnection"));
        this.connection.dispatchEvent(new Event("reconnected"));
        this.connection.dispatchEvent(new Event("reconnect"));
      };
    };

    connect();
  }

  async command(
    command: string,
    payload?: any,
    expiresIn?: number,
    callback?: Function,
  ) {
    return this.connection.command(command, payload, expiresIn, callback);
  }
}
