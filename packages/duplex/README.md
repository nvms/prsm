# duplex

[![NPM version](https://img.shields.io/npm/v/@prsm/duplex?color=a1b858&label=)](https://www.npmjs.com/package/@prsm/duplex)

An optionally-secure, full-duplex TCP command server and client on top of `node:tls` and `node:net`.

## Server

```typescript
import { CommandServer } from "@prsm/duplex";

// An insecure CommandServer (`Server` from `node:net`)
const server = new CommandServer({
  host: "localhost",
  port: 3351,
  secure: false,
});

// A secure CommandServer (`Server` from `node:tls`)
// https://nodejs.org/api/tls.html#new-tlstlssocketsocket-options
const server = new CommandServer({
  host: "localhost",
  port: 3351,
  secure: true,
  key: fs.readFileSync("certs/server/server.key"),
  cert: fs.readFileSync("certs/server/server.crt"),
  ca: fs.readFileSync("certs/server/ca.crt"),
  requestCert: true,
});

// -------------------
// Defining a command handler
server.command(0, async (payload: any, connection: Connection) => {
  return { ok: "OK" };
});
```

## Client

```typescript
import { CommandClient } from "@prsm/duplex";

// An insecure client (`Socket` from `node:net`)
const client = new CommandClient({
  host: "localhost",
  port: 3351,
  secure: false,
});

// A secure client (`TLSSocket` from `node:tls`)
const client = new CommandClient({
  host: "localhost",
  port: 3351,
  secure: true,
  key: fs.readFileSync("certs/client/client.key"),
  cert: fs.readFileSync("certs/client/client.crt"),
  ca: fs.readFileSync("certs/ca/ca.crt"),
});

// -------------------
// Awaiting the response
try {
  const response = await client.command(0, { some: "payload" }, 1000);
  //                             command^  ^payload             ^expiration
  // response: { ok: "OK" };
} catch (error) {
  console.error(error);
}

// ...or receiving the response in a callback
const callback = (response: any, error: CodeError) => {
  if (error) {
    console.error(error.code);
    return;
  }

  // response is { ok: "OK" }
};

// Sending a command to the server
client.command(0, { some: "payload" }, 1000, callback);
```
