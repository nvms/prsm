# @prsm/mesh-express

A simple adapter for running [Mesh](https://github.com/node-prism/mesh) inside an existing Express + HTTP server.

This package wires up a `MeshServer` instance to handle WebSocket upgrades using the native `upgrade` event and exposes an optional Express middleware.

---

## Installation

```bash
npm install @prsm/mesh-express
```

---

## Usage

```ts
import express from "express";
import http from "http";
import createMeshMiddleware from "@prsm/mesh-express";

const app = express();
const server = http.createServer(app);

const { middleware, mesh } = createMeshMiddleware(server, {
  path: "/ws",
  redisOptions: { host: "localhost", port: 6379 },
});

app.use(middleware); // optional

mesh.registerCommand("echo", async (ctx) => {
  return `echo: ${ctx.payload}`;
});

server.listen(3000, () => {
  console.log("Server listening on port 3000");
});
```

---

## What does the middleware do?

The middleware enables Express to recognize WebSocket upgrade requests and adds a `.ws()` method to the request object. While most upgrades are handled automatically by Mesh via the `upgrade` event, `.ws()` gives you manual control for custom upgrade logic (e.g. auth).

## When to use `.ws()`

Use `.ws()` when you need to *conditionally accept or reject* WebSocket connections inside an Express route.

```ts
app.use("/ws", (req, res, next) => {
  if (!req.ws) return next();

  const token = req.query.token;

  if (!isValidToken(token)) {
    return res.status(401).send("Unauthorized");
  }

  const ws = await req.ws(); // manually upgrade

  ws.send("Upgraded!");
});
```

This is useful for:

- Auth checks during upgrade
- Inspecting query params or headers
- Rejecting based on app state (e.g. maintenance)

In most cases, you won't need `.ws()`—Mesh handles upgrades automatically if the request path matches, but the option is there when you need it.

---

## API

### `createMeshMiddleware(server, options)`

| Param     | Type                   | Description                              |
|-----------|------------------------|------------------------------------------|
| `server`  | `http.Server`          | The existing HTTP server to attach to    |
| `options` | `MeshServerOptions`    | Standard Mesh config (plus optional `path`) |

Returns an object with:

- `middleware`: an Express-compatible async middleware
- `mesh`: the `MeshServer` instance for command registration, etc.

---

## Client usage

On the client, use the standard Mesh client:

```ts
import { MeshClient } from "@prsm/mesh/client";

const client = new MeshClient("ws://localhost:3000/ws");
await client.connect();

const res = await client.command("echo", "hello");
console.log(res); // "echo: hello"
```

---

## Notes

- Defaults to using `/` as the WebSocket upgrade path if `options.path` is not specified.
- If the request does not match the configured path, the socket is rejected with HTTP 400.
- This package does **not** create a server—it binds Mesh to your existing one.

---

## License

MIT
