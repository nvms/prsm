import { EventEmitter } from "node:events";
import { Duplex } from "node:stream";
import { Message, NEWLINE } from "./message";

const CLOSE_TOKEN = Buffer.from("\\\n");

export class Connection extends EventEmitter {
  private readonly duplex: Duplex;
  private buffer = Buffer.allocUnsafe(0);

  constructor(duplex: Duplex) {
    super();
    this.duplex = duplex;
    this.applyListeners();
  }

  private applyListeners() {
    this.duplex.on("data", (buffer: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, buffer]);
      this.parse();
    });

    this.duplex.on("close", () => {
      this.emit("close");
    });
  }

  private parse() {
    while (this.buffer.length > 0) {
      const i = this.buffer.indexOf(NEWLINE);

      if (i === -1) break;

      // +1 to include the separating newline.
      const data = this.buffer.subarray(0, i + 1);


      if (data.equals(CLOSE_TOKEN)) {
        this.emit("remoteClose");
      } else {
        this.emit("token", Message.unescape(data));
      }

      this.buffer = this.buffer.subarray(i + 1);
    }
  }

  get isDead() {
    return !this.duplex.writable || !this.duplex.readable;
  }

  send(buffer: Buffer) {
    if (this.isDead) return false;

    this.duplex.write(Message.escape(buffer));
    return true;
  }

  close() {
    if (this.isDead) return false;
    this.duplex.end();
    return true;
  }

  remoteClose() {
    if (this.isDead) return false;
    this.duplex.write(CLOSE_TOKEN);
    return true;
  }
}
