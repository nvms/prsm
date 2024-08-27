# express-session-auth

## Requirements

- `express-session`: https://github.com/expressjs/session
- `cookie-parser`: https://github.com/expressjs/cookie-parser
- TypeORM
  - `express-session-auth` exports entities (`User`, `UserReset`, `UserRemember`, `UserConfirmation`) that you need to include in your datasource for migration/sync purposes.


## Quickstart

Wherever you create your express application, include the auth middleware and pass in your TypeORM datasource.

```typescript
import express from "express";
import { createServer } from "node:http";
import auth from "@prsm/express-session-auth";
import datasource from "./my-datasource";

const app = express();
const server = createServer(app);

// the auth middleware needs your datasource instance
app.use(auth({ datasource }));
```

Here's an example TypeORM datasource:

```typescript
// my-datasource.ts
import {
  User,
  UserConfirmation,
  UserRemember,
  UserReset,
} from "@prsm/express-session-auth";
import { DataSource } from "typeorm";

const datasource = new DataSource({
  type: "mysql", // express-session-auth supports mysql, postgres and sqlite (others not tested)
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? +process.env.DB_PORT : 3306,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [
    User,
    UserConfirmation,
    UserRemember,
    UserReset,
    /* the reset of your entities here */
  ],
});

export default datasource;
```

Environment variables and their defaults:

```bash
HTTP_PORT=3002

AUTH_SESSION_REMEMBER_DURATION=30d
AUTH_SESSION_REMEMBER_COOKIE_NAME=prsm.auth.remember
AUTH_SESSION_RESYNC_INTERVAL=30m
AUTH_MINIMUM_PASSWORD_LENGTH=8
AUTH_MAXIMUM_PASSWORD_LENGTH=64

DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=toor
DB_NAME=prsm
```

Because this middleware augments the `Request` object by adding an `auth` property, you will want to add the following to your `tsconfig.json` so that your language server doesn't flag references to `req.auth` as an error:

```json
{
  "include": [
    "src",
    "node_modules/@prsm/express-session-auth/express-session-auth.d.ts"
  ]
}
```
