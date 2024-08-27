import { EventEmitter } from "node:events";
import net, { Socket } from "node:net";
import tls from "node:tls";
import { CodeError } from "../common/codeerror";
import { Command } from "../common/command";
import { Connection } from "../common/connection";
import { ErrorSerializer } from "../common/errorserializer";
import { Status } from "../common/status";

export type TokenServerOptions = tls.TlsOptions & net.ListenOptions & net.SocketConstructorOpts & {
  secure?: boolean;
};

export class TokenServer extends EventEmitter {
  connections: Connection[] = [];

  public options: TokenServerOptions;
  public server: tls.Server | net.Server;
  private hadError: boolean;

  status: Status;

  constructor(options: TokenServerOptions) {
    super();

    this.options = options;

    if (this.options.secure) {
      this.server = tls.createServer(this.options, function (clientSocket) {
        clientSocket.on("error", (err) => {
          this.emit("clientError", err);
        });
      })
    } else {
      this.server = net.createServer(this.options, function (clientSocket) {
        clientSocket.on("error", (err) => {
          this.emit("clientError", err);
        });
      });
    }

    this.applyListeners();
    this.connect();
  }

  connect(callback?: () => void) {
    if (this.status >= Status.CONNECTING) return false;

    this.hadError = false;
    this.status = Status.CONNECTING;
    this.server.listen(this.options, () => {
      if (callback) callback();
    });
    return true;
  }

  close(callback?: () => void) {
    if (!this.server.listening) return false;

    this.status = Status.CLOSED;
    this.server.close(() => {
      for (const connection of this.connections) {
        connection.remoteClose();
      }
      if (callback) callback();
    });

    return true;
  }

  applyListeners() {
    this.server.on("listening", () => {
      this.status = Status.ONLINE;
      this.emit("listening");
    });

    this.server.on("tlsClientError", (error) => {
      this.emit("clientError", error);
    });

    this.server.on("clientError", (error) => {
      this.emit("clientError", error);
    });

    this.server.on("error", (error) => {
      this.hadError = true;
      this.emit("error", error);
      this.server.close();
    });

    this.server.on("close", () => {
      this.status = Status.OFFLINE;
      this.emit("close", this.hadError);
    });

    this.server.on("secureConnection", (socket: Socket) => {
      const connection = new Connection(socket);
      this.connections.push(connection);

      connection.once("close", () => {
        const i = this.connections.indexOf(connection);
        if (i !== -1) this.connections.splice(i, 1);
      });

      connection.on("token", (token) => {
        this.emit("token", token, connection);
      });
    });

    this.server.on("connection", (socket: Socket) => {
      if (this.options.secure) return;

      const connection = new Connection(socket);
      this.connections.push(connection);

      connection.once("close", () => {
        const i = this.connections.indexOf(connection);
        if (i !== -1) this.connections.splice(i, 1);
      });

      connection.on("token", (token) => {
        this.emit("token", token, connection);
      });
    });
  }
}

type CommandFn = (payload: any, connection: Connection) => Promise<any>;

export class CommandServer extends TokenServer {
  private commands: {
    [command: number]: CommandFn
  } = {};

  constructor(options: TokenServerOptions) {
    super(options);
    this.init();
  }

  private init() {
    this.on("token", async (buffer, connection) => {
      try {
        const { id, command, payload } = Command.parse(buffer);
        this.runCommand(id, command, payload, connection);
      } catch (error) {
        this.emit("error", error);
      }
    });
  }

  /**
   * @param command - The command number to register, a UInt8 (0-255).
   *                  255 is reserved. You will get an error if you try to use it.
   * @param fn - The function to run when the command is received.
   */
  command(command: number, fn: CommandFn) {
    this.commands[command] = fn;
  }

  private async runCommand(id: number, command: number, payload: any, connection: Connection) {
    try {
      if (!this.commands[command]) {
        throw new CodeError(`Command (${command}) not found.`, "ENOTFOUND", "CommandError");
      }

      const result = await this.commands[command](payload, connection);

      // A payload should not be undefined, so if a command returns nothing
      // we respond with a simple "OK".
      const payloadResult = result === undefined ? "OK" : result;

      connection.send(Command.toBuffer({ command, id, payload: payloadResult }));
    } catch (error) {
      const payload = ErrorSerializer.serialize(error);

      connection.send(Command.toBuffer({ command: 255, id, payload }));
    }
  }
}
