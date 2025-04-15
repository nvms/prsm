import { EventEmitter } from "node:events";
import { IncomingMessage } from "node:http";
import { WebSocket } from "ws";
import { Command, parseCommand, stringifyCommand } from "../common/message";
import { Status } from "../common/status";
import { Latency } from "./latency";
import { Ping } from "./ping";
import { KeepAliveServerOptions } from "./";

export class Connection extends EventEmitter {
  id: string;
  socket: WebSocket;
  alive = true;
  latency: Latency;
  ping: Ping;
  remoteAddress: string;
  connectionOptions: KeepAliveServerOptions;
  status: Status = Status.ONLINE;

  constructor(
    socket: WebSocket,
    req: IncomingMessage,
    options: KeepAliveServerOptions
  ) {
    super();
    this.socket = socket;
    this.id = req.headers["sec-websocket-key"]!;
    this.remoteAddress = req.socket.remoteAddress!;
    this.connectionOptions = options;

    this.applyListeners();
    this.startIntervals();
  }

  get isDead(): boolean {
    return !this.socket || this.socket.readyState !== WebSocket.OPEN;
  }

  startIntervals(): void {
    this.latency = new Latency();
    this.ping = new Ping();

    this.latency.interval = setInterval(() => {
      if (!this.alive) {
        return;
      }

      if (typeof this.latency.ms === "number") {
        this.send({ command: "latency", payload: this.latency.ms });
      }

      this.latency.onRequest();
      this.send({ command: "latency:request", payload: {} });
    }, this.connectionOptions.latencyInterval);

    this.ping.interval = setInterval(() => {
      if (!this.alive) {
        this.emit("close");
        return;
      }

      this.alive = false;
      this.send({ command: "ping", payload: {} });
    }, this.connectionOptions.pingInterval);
  }

  stopIntervals(): void {
    clearInterval(this.latency.interval);
    clearInterval(this.ping.interval);
  }

  applyListeners(): void {
    this.socket.on("close", () => {
      this.status = Status.OFFLINE;
      this.emit("close");
    });

    this.socket.on("error", (error) => {
      this.emit("error", error);
    });

    this.socket.on("message", (data: Buffer) => {
      try {
        const command = parseCommand(data.toString());

        if (command.command === "latency:response") {
          this.latency.onResponse();
          return;
        } else if (command.command === "pong") {
          this.alive = true;
          return;
        }

        this.emit("message", data);
      } catch (error) {
        this.emit("error", error);
      }
    });
  }

  send(cmd: Command): boolean {
    if (this.isDead) return false;

    try {
      this.socket.send(stringifyCommand(cmd));
      return true;
    } catch (error) {
      this.emit("error", error);
      return false;
    }
  }

  close(): boolean {
    if (this.isDead) return false;

    try {
      this.socket.close();
      return true;
    } catch (error) {
      this.emit("error", error);
      return false;
    }
  }
}
