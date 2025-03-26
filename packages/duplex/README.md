# duplex

[![NPM version](https://img.shields.io/npm/v/@prsm/duplex?color=a1b858&label=)](https://www.npmjs.com/package/@prsm/duplex)

An optionally-secure, full-duplex TCP command server and client built on top of `node:tls` and `node:net`. Provides reliable, Promise-based communication with automatic reconnection and command queueing.

## Features

- **Promise-based API** - All operations return Promises for easy async/await usage
- **Command queueing** - Commands are automatically queued when offline
- **Reliable connections** - Robust error handling and reconnection
- **Secure communication** - Optional TLS encryption
- **Bidirectional communication** - Full-duplex TCP communication
- **Lightweight** - No external dependencies

## Server

```typescript
import { CommandServer } from "@prsm/duplex";
import fs from "node:fs";

// Create a server instance
const server = new CommandServer({
  host: "localhost",
  port: 3351,
  secure: false, // For TLS, set to true and provide certificates
});

// Connect the server (returns a Promise)
await server.connect();

// Register command handlers
server.command(0, async (payload, connection) => {
  console.log("Received:", payload);
  return { status: "success", data: "Command processed" };
});

// For secure connections (TLS)
const secureServer = new CommandServer({
  host: "localhost",
  port: 3352,
  secure: true,
  key: fs.readFileSync("certs/server/server.key"),
  cert: fs.readFileSync("certs/server/server.crt"),
  ca: fs.readFileSync("certs/server/ca.crt"),
  requestCert: true,
});

await secureServer.connect();
```

## Client

```typescript
import { CommandClient } from "@prsm/duplex";
import fs from "node:fs";

// Create a client instance
const client = new CommandClient({
  host: "localhost",
  port: 3351,
  secure: false, // For TLS, set to true and provide certificates
});

// Connect to the server (returns a Promise)
await client.connect();

// Using Promise-based API
try {
  const response = await client.command(0, { action: "getData" }, 5000);
  console.log("Response:", response.result);
} catch (error) {
  console.error("Error:", error);
}

// Using callback API
client.command(0, { action: "getData" }, 5000, (result, error) => {
  if (error) {
    console.error("Error:", error);
    return;
  }
  console.log("Response:", result);
});

// For secure connections (TLS)
const secureClient = new CommandClient({
  host: "localhost",
  port: 3352,
  secure: true,
  key: fs.readFileSync("certs/client/client.key"),
  cert: fs.readFileSync("certs/client/client.crt"),
  ca: fs.readFileSync("certs/ca/ca.crt"),
});

await secureClient.connect();
```

## Error Handling

The library provides detailed error information with error codes:

```typescript
try {
  await client.command(0, payload, 1000);
} catch (error) {
  if (error.code === 'ETIMEOUT') {
    console.log('Command timed out');
  } else if (error.code === 'ENOTFOUND') {
    console.log('Command not found on server');
  } else {
    console.error('Other error:', error.message);
  }
}
```

## Graceful Shutdown

```typescript
// Close client connection
await client.close();

// Close server
await server.close();
```
