interface CommandData {
  id: number;
  command: number;
  payload: any;
}

export class Command {
  static toBuffer({ payload, id, command }: CommandData): Buffer {
    if (payload === undefined) throw new TypeError("The payload must not be undefined!");
    const payloadString = JSON.stringify(payload);
    const buffer = Buffer.allocUnsafe(payloadString.length + 3);
    buffer.writeUInt16LE(id, 0);
    buffer.writeUInt8(command, 2);
    buffer.write(payloadString, 3);
    return buffer;
  }

  static parse(buffer: Buffer): CommandData {
    if (buffer.length < 3) throw new TypeError(`Token too short! Expected at least 3 bytes, got ${buffer.length}!`);
    const id = buffer.readUInt16LE(0);
    const command = buffer.readUInt8(2);
    const payload = JSON.parse(buffer.toString("utf8", 3));
    return { id, command, payload };
  }
}
