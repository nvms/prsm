import { CodeError } from "../common/codeerror";
import { Connection } from "../common/connection";
import { CommandServer } from "../server/commandserver";

const server = new CommandServer({
  host: "localhost",
  port: 3351,
  secure: false,
});

server.command(0, async (payload: any, connection: Connection) => {
  console.log("RECV [0]:", payload);
  return { ok: "OK" };
});

server.on("clientError", (error: CodeError) => {
  console.log("clientError", error.code);
});
