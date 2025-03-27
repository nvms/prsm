# @prsm/jwt

[![NPM version](https://img.shields.io/npm/v/@prsm/jwt?color=a1b858&label=)](https://www.npmjs.com/package/@prsm/jwt)

A lightweight JWT implementation for encoding, decoding, and verifying JSON Web Tokens.

## Installation

```bash
npm install @prsm/jwt
```

## Usage

### Encoding Tokens

```typescript
import { encode } from "@prsm/jwt";

// Create a token with standard claims
const token = encode(
  {
    sub: "user123",
    iat: Date.now(),
    exp: Date.now() + 3600000, // 1 hour from now
  },
  "your-secret-key"
);

// Specify algorithm (default is HS256)
const rsaToken = encode(payload, privateKey, "RS256");
```

### Verifying Tokens

```typescript
import { verify } from "@prsm/jwt";

const result = verify(token, "your-secret-key");

// Check verification results
if (!result.sig) {
  console.error("Invalid signature");
}

if (result.exp) {
  console.error("Token expired");
}

// Access the decoded payload
const { sub, iat } = result.decoded.payload;
```

### Decoding Without Verification

```typescript
import { decode } from "@prsm/jwt";

const { header, payload, signature } = decode(token);
```

## Supported Algorithms

| Algorithm | Description                    |
|-----------|--------------------------------|
| HS256     | HMAC with SHA-256 (default)    |
| HS384     | HMAC with SHA-384              |
| HS512     | HMAC with SHA-512              |
| RS256     | RSA Signature with SHA-256     |
| RS384     | RSA Signature with SHA-384     |
| RS512     | RSA Signature with SHA-512     |
| ES256     | ECDSA Signature with SHA-256   |
