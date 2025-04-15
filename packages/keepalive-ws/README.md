# keepalive-ws

[![NPM version](https://img.shields.io/npm/v/@prsm/keepalive-ws?color=a1b858&label=)](https://www.npmjs.com/package/@prsm/keepalive-ws)

A command server and client for simplified WebSocket communication, with built-in ping and latency messaging. Provides reliable, Promise-based communication with automatic reconnection and command queueing.

For a TCP-based, node-only solution with a similar API, see [duplex](https://github.com/node-prism/duplex).

## Features

- **Promise-based API** - All operations return Promises for easy async/await usage
- **Command queueing** - Commands are automatically queued when offline
- **Reliable connections** - Robust error handling and reconnection
- **Bidirectional communication** - Full-duplex WebSocket communication
- **Latency monitoring** - Built-in ping/pong and latency measurement
- **Room-based messaging** - Group connections into rooms for targeted broadcasts
- **Lightweight** - Minimal dependencies

## Server

```typescript
import { KeepAliveServer, WSContext } from "@prsm/keepalive-ws/server";

// Create a server instance
const server = new KeepAliveServer({
  port: 8080,
  pingInterval: 30000,
  latencyInterval: 5000,
  // Multi-instance room support (optional):
  // roomBackend: "redis",
  // redisOptions: { host: "localhost", port: 6379 }
});

// Register command handlers
server.registerCommand("echo", async (context) => {
  return `Echo: ${context.payload}`;
});

// Error handling
server.registerCommand("throws", async () => {
  throw new Error("Something went wrong");
});

// Room-based messaging
server.registerCommand("join-room", async (context) => {
  const { roomName } = context.payload;
  await server.addToRoom(roomName, context.connection);
  await server.broadcastRoom(roomName, "user-joined", {
    id: context.connection.id
  });
  return { success: true };
});

// Broadcasting to all clients
server.registerCommand("broadcast", async (context) => {
  server.broadcast("announcement", context.payload);
  return { sent: true };
});
```

## Client

```typescript
import { KeepAliveClient } from "@prsm/keepalive-ws/client";

// Create a client instance
const client = new KeepAliveClient("ws://localhost:8080", {
  pingTimeout: 30000,
  maxLatency: 2000,
  shouldReconnect: true,
  reconnectInterval: 2000,
  maxReconnectAttempts: Infinity,
});

// Connect to the server (returns a Promise)
await client.connect();

// Using Promise-based API
try {
  const response = await client.command("echo", "Hello world", 5000);
  console.log("Response:", response);
} catch (error) {
  console.error("Error:", error);
}

// Join a room
await client.command("join-room", { roomName: "lobby" });

// Listen for events
client.on("user-joined", (event) => {
  console.log("User joined:", event.detail.id);
});

// Monitor latency
client.on("latency", (event) => {
  console.log("Current latency:", event.detail.latency, "ms");
});

// Graceful shutdown
await client.close();
```

## Extended Server API

### Room Management
```typescript
// Add a connection to a room (async)
await server.addToRoom("roomName", connection);

// Remove a connection from a room (async)
await server.removeFromRoom("roomName", connection);

// Get all connections in a room (async)
const roomConnections = await server.getRoom("roomName");

// Clear all connections from a room (async)
await server.clearRoom("roomName");
```

### Broadcasting
```typescript
// Broadcast to all connections
server.broadcast("eventName", payload);

// Broadcast to specific connections
server.broadcast("eventName", payload, connections);

// Broadcast to all connections except one
server.broadcastExclude(connection, "eventName", payload);

// Broadcast to all connections in a room
server.broadcastRoom("roomName", "eventName", payload);

// Broadcast to all connections in a room except one
server.broadcastRoomExclude("roomName", "eventName", payload, connection);

// Broadcast to all connections with the same IP
server.broadcastRemoteAddress(connection, "eventName", payload);
```

### Middleware
```typescript
// Global middleware for all commands
server.globalMiddlewares.push(async (context) => {
  // Validate authentication, etc.
  if (!isAuthenticated(context)) {
    throw new Error("Unauthorized");
  }
});

// Command-specific middleware
server.registerCommand(
  "protected-command",
  async (context) => {
    return "Protected data";
  },
  [
    async (context) => {
      // Command-specific validation
      if (!hasPermission(context)) {
        throw new Error("Forbidden");
      }
    }
  ]
);
```

## Multi-Instance Room Support

To enable multi-instance room support (so rooms are shared across all server instances), configure the server with `roomBackend: "redis"` and provide `redisOptions`:

```typescript
import { KeepAliveServer } from "@prsm/keepalive-ws/server";

const server = new KeepAliveServer({
  port: 8080,
  roomBackend: "redis",
  redisOptions: { host: "localhost", port: 6379 }
});
```

All room management methods become async and must be awaited.

## Graceful Shutdown

```typescript
// Close client connection
await client.close();

// Close server
server.close();
```
