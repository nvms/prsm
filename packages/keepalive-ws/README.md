For a TCP-based, node-only solution with a similar API, see [duplex](https://github.com/node-prism/duplex).

# keepalive-ws

A command server and client for simplified WebSocket communication, with builtin ping and latency messaging.

Built for [grove](https://github.com/node-prism/grove), but works anywhere.

### Server

For node.

```typescript
import { KeepAliveServer, WSContext } from "@prsm/keepalive-ws/server";

const ws = new KeepAliveServer({
  // Where to mount this server and listen to messages.
  path: "/",
  // How often to send ping messages to connected clients.
  pingInterval: 30_000,
  // Calculate round-trip time and send latency updates
  // to clients every 5s.
  latencyInterval: 5_000,
});

ws.registerCommand(
  "authenticate",
  async (c: WSContext) => {
    // use c.payload to authenticate c.connection
    return { ok: true, token: "..." };
  },
);

ws.registerCommand(
  "throws",
  async (c: WSContext) => {
    throw new Error("oops");
  },
);
```

Extended API:

- Rooms

  It can be useful to collect connections into rooms.

  - `addToRoom(roomName: string, connection: Connection): void`
  - `removeFromRoom(roomName: string, connection: Connection): void`
  - `getRoom(roomName: string): Connection[]`
  - `clearRoom(roomName: string): void`
- Command middleware
- Broadcasting to:
  - all
    - `broadcast(command: string, payload: any, connections?: Connection[]): void`
  - all connections that share the same IP
    - `broadcastRemoteAddress(c: Connection, command: string, payload: any): void`
  - rooms
    - `broadcastRoom(roomName: string, command: string, payload: any): void`

### Client

For the browser.

```typescript
import { KeepAliveClient } from "@prsm/keepalive-ws/client";

const opts = {
  // After 30s (+ maxLatency) of no ping, assume we've disconnected and attempt a
  // reconnection if shouldReconnect is true.
  // This number should be coordinated with the pingInterval from KeepAliveServer.
  pingTimeout: 30_000,
  // Try to reconnect whenever we are disconnected.
  shouldReconnect: true,
  // This number, added to pingTimeout, is the maximum amount of time
  // that can pass before the connection is considered closed.
  // In this case, 32s.
  maxLatency: 2_000,
  // How often to try and connect during reconnection phase.
  reconnectInterval: 2_000,
  // How many times to try and reconnect before giving up.
  maxReconnectAttempts: Infinity,
};

const ws = new KeepAliveClient("ws://localhost:8080", opts);

const { ok, token } = await ws.command("authenticate", {
  username: "user",
  password: "pass",
});

const result = await ws.command("throws", {});
// result is: { error: "oops" }

ws.on("latency", (e: CustomEvent<{ latency: number }>) => {
  // e.detail.latency is round-trip time in ms
});
```
