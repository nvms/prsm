import { CommandClient } from "../client/commandclient";
import { CodeError } from "../common/codeerror";

const client = new CommandClient({
  host: "localhost",
  port: 3351,
  secure: false,
});

const payload = { things: "stuff", numbers: [1, 2, 3] };

async function main() {
  const callback = (result: any, error: CodeError) => {
    if (error) {
      console.log("ERR [0]", error.code);
      return;
    }

   console.log("RECV [0]", result);
   client.close();
  };

  client.command(0, payload, 10, callback);

}

main();
