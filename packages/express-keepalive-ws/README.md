# @prsm/express-keepalive-ws

This is a middleware that creates and exposes a `KeepAliveServer` instance (see [prsm/keepalive-ws](https://github.com/...).

```typescript
import express from "express";
import createWss, { type WSContext } from "@prsm/express-keepalive-ws";

const app = express();
const server = createServer(app);

const { middleware: ws, wss } = createWss({ /** ... */ });

app.use(ws);

// as a middleware:
app.use("/ws", async (req, res) => {
  if (req.ws) { // <-- req.ws will be defined if the request is a WebSocket request
    const ws = await req.ws(); // handle the upgrade and receive the client WebSocket
    ws.send("Hello WS!"); // send a message to the client
  } else {
    res.send("Hello HTTP!");
  }
});

// as a command server:
wss.registerCommand("echo", (c: WSContext) => {
  const { payload } = c;
  return `echo: ${payload}`;
});
```

Client-side usage (more at https://github.com/node-prism/keepalive-ws):

```typescript
import { KeepAliveClient } from "@prsm/keepalive-ws/client";

const opts = { shouldReconnect: true };
const ws = new KeepAliveClient("ws://localhost:PORT", opts);

const echo = await ws.command("echo", "hello!");
console.log(echo); // "echo: hello!"
```
