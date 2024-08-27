import EventEmitter from "node:events";
import { IncomingMessage } from "node:http";
import { WebSocket } from "ws";
import { KeepAliveServerOptions } from ".";
import { bufferToCommand, Command } from "./command";
import { Latency } from "./latency";
import { Ping } from "./ping";

export class Connection extends EventEmitter {
  id: string;
  socket: WebSocket;
  alive = true;
  latency: Latency;
  ping: Ping;
  remoteAddress: string;
  connectionOptions: KeepAliveServerOptions;

  constructor(
    socket: WebSocket,
    req: IncomingMessage,
    options: KeepAliveServerOptions,
  ) {
    super();
    this.socket = socket;
    this.id = req.headers["sec-websocket-key"]!;
    this.remoteAddress = req.socket.remoteAddress!;
    this.connectionOptions = options;

    this.applyListeners();
    this.startIntervals();
  }

  startIntervals() {
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
      }

      this.alive = false;
      this.send({ command: "ping", payload: {} });
    }, this.connectionOptions.pingInterval);
  }

  stopIntervals() {
    clearInterval(this.latency.interval);
    clearInterval(this.ping.interval);
  }

  applyListeners() {
    this.socket.on("close", () => {
      this.emit("close");
    });

    this.socket.on("message", (buffer: Buffer) => {
      const command = bufferToCommand(buffer);

      if (command.command === "latency:response") {
        this.latency.onResponse();
        return;
      } else if (command.command === "pong") {
        this.alive = true;
        return;
      }

      this.emit("message", buffer);
    });
  }

  send(cmd: Command) {
    this.socket.send(JSON.stringify(cmd));
  }
}
