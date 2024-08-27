import { IdManager } from "./ids";
import { Queue, QueueItem } from "./queue";

type Command = {
  id?: number;
  command: string;
  payload?: any;
};

type LatencyPayload = {
  /** Round trip time in milliseconds. */
  latency: number;
};

export declare interface Connection extends EventTarget {
  addEventListener(type: "message", listener: (ev: CustomEvent) => any, options?: boolean | AddEventListenerOptions): void;

  /** Emits when a connection is made. */
  addEventListener(type: "connection", listener: () => any, options?: boolean | AddEventListenerOptions): void;
  /** Emits when a connection is made. */
  addEventListener(type: "connected", listener: () => any, options?: boolean | AddEventListenerOptions): void;
  /** Emits when a connection is made. */
  addEventListener(type: "connect", listener: () => any, options?: boolean | AddEventListenerOptions): void;

  /** Emits when a connection is closed. */
  addEventListener(type: "close", listener: () => any, options?: boolean | AddEventListenerOptions): void;
  /** Emits when a connection is closed. */
  addEventListener(type: "closed", listener: () => any, options?: boolean | AddEventListenerOptions): void;
  /** Emits when a connection is closed. */
  addEventListener(type: "disconnect", listener: () => any, options?: boolean | AddEventListenerOptions): void;
  /** Emits when a connection is closed. */
  addEventListener(type: "disconnected", listener: () => any, options?: boolean | AddEventListenerOptions): void;

  /** Emits when a reconnect event is successful. */
  addEventListener(type: "reconnect", listener: () => any, options?: boolean | AddEventListenerOptions): void;

  /** Emits when a reconnect fails after @see KeepAliveClientOptions.maxReconnectAttempts attempts. */
  addEventListener(type: "reconnectfailed", listener: () => any, options?: boolean | AddEventListenerOptions): void;

  /** Emits when a ping message is received from @see KeepAliveServer from `@prsm/keepalive-ws/server`. */
  addEventListener(type: "ping", listener: (ev: CustomEventInit<{}>) => any, options?: boolean | AddEventListenerOptions): void;

  /** Emits when a latency event is received from @see KeepAliveServer from `@prsm/keepalive-ws/server`. */
  addEventListener(type: "latency", listener: (ev: CustomEventInit<LatencyPayload>) => any, options?: boolean | AddEventListenerOptions): void;

  addEventListener(type: string, listener: (ev: CustomEvent) => any, options?: boolean | AddEventListenerOptions): void;
}

export class Connection extends EventTarget {
  socket: WebSocket;
  ids = new IdManager();
  queue = new Queue();
  callbacks: { [id: number]: (error: Error | null, result?: any) => void } = {};

  constructor(socket: WebSocket) {
    super();
    this.socket = socket;
    this.applyListeners();
  }

  /**
   * Adds an event listener to the target.
   * @param event The name of the event to listen for.
   * @param listener The function to call when the event is fired.
   * @param options An options object that specifies characteristics about the event listener.
   */
  on(event: string, listener: (ev: CustomEvent) => any, options?: boolean | AddEventListenerOptions) {
    this.addEventListener(event, listener, options);
  }

  /**
   * Removes the event listener previously registered with addEventListener.
   * @param event A string that specifies the name of the event for which to remove an event listener.
   * @param listener The event listener to be removed.
   * @param options An options object that specifies characteristics about the event listener.
   */
  off(event: string, listener: (ev: CustomEvent) => any, options?: boolean | AddEventListenerOptions) {
    this.removeEventListener(event, listener, options);
  }

  sendToken(cmd: Command, expiresIn: number) {
    try {
      this.socket.send(JSON.stringify(cmd));
    } catch (e) {
      this.queue.add(cmd, expiresIn);
    }
  }

  applyListeners(reconnection = false) {
    const drainQueue = () => {
      while (!this.queue.isEmpty) {
        const item = this.queue.pop() as QueueItem;
        this.sendToken(item.value, item.expiresIn);
      }
    };

    if (reconnection) drainQueue();

    // @ts-ignore
    this.socket.onopen = (socket: WebSocket, ev: Event): any => {
      drainQueue();
      this.dispatchEvent(new Event("connection"));
      this.dispatchEvent(new Event("connected"));
      this.dispatchEvent(new Event("connect"));
    };

    this.socket.onclose = (event: CloseEvent) => {
      this.dispatchEvent(new Event("close"));
      this.dispatchEvent(new Event("closed"));
      this.dispatchEvent(new Event("disconnected"));
      this.dispatchEvent(new Event("disconnect"));
    };

    this.socket.onmessage = async (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        this.dispatchEvent(new CustomEvent("message", { detail: data }));

        if (data.command === "latency:request") {
          this.dispatchEvent(
            new CustomEvent<LatencyPayload>(
              "latency:request",
              { detail: { latency: data.payload.latency ?? undefined }}
            )
          );
          this.command("latency:response", { latency: data.payload.latency ?? undefined }, null);
        } else if (data.command === "latency") {
          this.dispatchEvent(
            new CustomEvent<LatencyPayload>(
              "latency",
              { detail: { latency: data.payload ?? undefined }}
            )
          );
        } else if (data.command === "ping") {
          this.dispatchEvent(new CustomEvent("ping", {}));
          this.command("pong", {}, null);
        } else {
          this.dispatchEvent(new CustomEvent(data.command, { detail: data.payload }));
        }

        if (this.callbacks[data.id]) {
          this.callbacks[data.id](null, data.payload);
        }
      } catch (e) {
        this.dispatchEvent(new Event("error"));
      }
    };
  }

  async command(command: string, payload: any, expiresIn: number = 30_000, callback: Function | null = null) {
    const id = this.ids.reserve();
    const cmd = { id, command, payload: payload ?? {} };

    this.sendToken(cmd, expiresIn);

    if (expiresIn === null) {
      this.ids.release(id);
      delete this.callbacks[id];
      return null;
    }

    const response = this.createResponsePromise(id);
    const timeout = this.createTimeoutPromise(id, expiresIn);

    if (typeof callback === "function") {
      const ret = await Promise.race([response, timeout]);
      callback(ret);
      return ret;
    } else {
      return Promise.race([response, timeout]);
    }
  }

  createTimeoutPromise(id: number, expiresIn: number) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        this.ids.release(id);
        delete this.callbacks[id];
        reject(new Error(`Command ${id} timed out after ${expiresIn}ms.`));
      }, expiresIn);
    });
  }

  createResponsePromise(id: number) {
    return new Promise((resolve, reject) => {
      this.callbacks[id] = (error: Error | null, result?: any) => {
        this.ids.release(id);
        delete this.callbacks[id];
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      };
    });
  }
}
