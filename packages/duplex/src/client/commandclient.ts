import { EventEmitter } from "node:events";
import net from "node:net";
import tls from "node:tls";
import { CodeError } from "../common/codeerror";
import { Command } from "../common/command";
import { Connection } from "../common/connection";
import { ErrorSerializer } from "../common/errorserializer";
import { Status } from "../common/status";
import { IdManager } from "../server/ids";
import { Queue } from "./queue";

export type TokenClientOptions = tls.ConnectionOptions & net.NetConnectOpts & {
  secure: boolean;
};

class TokenClient extends EventEmitter {
  public options: TokenClientOptions;
  private socket: tls.TLSSocket | net.Socket;
  private connection: Connection | null = null;
  private hadError: boolean;
  status: Status;

  constructor(options: TokenClientOptions) {
    super();
    this.options = options;
    this.connect();
  }

  connect(callback?: () => void) {
    if (this.status >= Status.CLOSED) {
      return false;
    }

    this.hadError = false;
    this.status = Status.CONNECTING;

    if (this.options.secure) {
      this.socket = tls.connect(this.options, callback);
    } else {
      this.socket = net.connect(this.options, callback);
    }

    this.connection = null;
    this.applyListeners();

    return true;
  }

  close(callback?: () => void) {
    if (this.status <= Status.CLOSED) return false;

    this.status = Status.CLOSED;
    this.socket.end(() => {
      this.connection = null;
      if (callback) callback();
    });

    return true;
  }

  send(buffer: Buffer) {
    if (this.connection) {
      return this.connection.send(buffer);
    }

    return false;
  }

  private applyListeners() {
    this.socket.on("error", (error) => {
      this.hadError = true;
      this.emit("error", error);
    });

    this.socket.on("close", () => {
      this.status = Status.OFFLINE;
      this.emit("close", this.hadError);
    });

    this.socket.on("secureConnect", () => {
      this.updateConnection();
      this.status = Status.ONLINE;
      this.emit("connect");
    });

    this.socket.on("connect", () => {
      this.updateConnection();
      this.status = Status.ONLINE;
      this.emit("connect");
    });
  }

  private updateConnection() {
    const connection = new Connection(this.socket);

    connection.on("token", (token) => {
      this.emit("token", token, connection);
    });

    connection.on("remoteClose", () => {
      this.emit("remoteClose", connection);
    });

    this.connection = connection;
  }
}

class QueueClient extends TokenClient {
  private queue = new Queue<Buffer>();

  constructor(options: TokenClientOptions) {
    super(options);
    this.applyEvents();
  }

  sendBuffer(buffer: Buffer, expiresIn: number) {
    const success = this.send(buffer);

    if (!success) {
      this.queue.add(buffer, expiresIn);
    }
  }

  private applyEvents() {
    this.on("connect", () => {
      while (!this.queue.isEmpty) {
        const item = this.queue.pop();
        this.sendBuffer(item.value, item.expiresIn);
      }
    });
  }

  close() {
    return super.close();
  }
}

export class CommandClient extends QueueClient {
  private ids = new IdManager(0xFFFF);
  private callbacks: {
    [id: number]: (error: Error | null, result?: any) => void
  } = {};

  constructor(options: TokenClientOptions) {
    super(options);
    this.init();
  }

  private init() {
    this.on("token", (buffer: Buffer) => {
      try {
        const data = Command.parse(buffer);

        if (this.callbacks[data.id]) {
          if (data.command === 255) {
            const error = ErrorSerializer.deserialize(data.payload);
            this.callbacks[data.id](error, undefined);
          } else {
            this.callbacks[data.id](null, data.payload);
          }
        }
      } catch (error) {
        this.emit("error", error);
      }
    });
  }

  async command(command: number, payload: any, expiresIn: number = 30_000, callback: (result: any, error: CodeError | Error | null) => void | undefined = undefined) {
    if (command === 255) {
      throw new CodeError("Command 255 is reserved.", "ERESERVED", "CommandError");
    }

    const id = this.ids.reserve();
    const buffer = Command.toBuffer({ id, command, payload })

    this.sendBuffer(buffer, expiresIn);

    // No 0, null or Infinity.
    // Fallback to a reasonable default.
    if (expiresIn === 0 || expiresIn === null || expiresIn === Infinity) {
      expiresIn = 60_000;
    }

    const response = this.createResponsePromise(id);
    const timeout = this.createTimeoutPromise(id, expiresIn);

    if (typeof callback === "function") {
      try {
        const ret = await Promise.race([response, timeout]);

        try {
          callback(ret, undefined);
        } catch (callbackError) { /* */ }
      } catch (error) {
        callback(undefined, error);
      }
    } else {
      return Promise.race([response, timeout]);
    }
  }

  private createTimeoutPromise(id: number, expiresIn: number) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        this.ids.release(id);
        delete this.callbacks[id];
        reject(new CodeError("Command timed out.", "ETIMEOUT", "CommandError"));
      }, expiresIn);
    });
  }

  private createResponsePromise(id: number) {
    return new Promise((resolve, reject) => {
      this.callbacks[id] = (error: Error | null, result?: any) => {
        this.ids.release(id);
        delete this.callbacks[id];

        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    });
  }

  close() {
    return super.close();
  }
}
