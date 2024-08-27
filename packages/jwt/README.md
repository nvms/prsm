# jwt

A package for encoding, decoding, and verifying JWTs.

# Installation

`npm install @prsm/jwt`

## Encoding

```typescript
import { encode } from "@prsm/jwt";

const payload = {
  iat: Date.now(),
  exp: Date.now() + 3600,
};

const token = encode(payload, process.env.SIGNING_KEY);
```

## Verifying

```typescript
import { verify } from "@prsm/jwt";

const result = verify(token, process.env.SIGNING_KEY);

if (!result.sig) throw new Error("signature verification failed");
if (result.exp) throw new Error("token has expired");
if (!result.nbf) throw new Error("token is not yet valid")

// token payload is available at result.decoded.payload
```

## Decoding

```typescript
import { decode } from "@prsm/jwt";

const result = decode(token);
// { header: { alg: "HS256", typ: "JWT" }, payload: { iat: 123456789, exp: 123456789 }, signature: "..."
```
