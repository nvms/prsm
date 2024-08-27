export interface Command {
  id?: number;
  command: string;
  payload: any;
}

export const bufferToCommand = (buffer: Buffer): Command => {
  const decoded = new TextDecoder("utf-8").decode(buffer);
  if (!decoded) {
    return { id: 0, command: "", payload: {} };
  }

  try {
    const parsed = JSON.parse(decoded) as Command;
    return { id: parsed.id, command: parsed.command, payload: parsed.payload };
  } catch (e) {
    return { id: 0, command: "", payload: {} };
  }
};
