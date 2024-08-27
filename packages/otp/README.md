# @prsm/otp

[![NPM version](https://img.shields.io/npm/v/@prsm/otp?color=a1b858&label=)](https://www.npmjs.com/package/@prsm/otp)

A simple and secure library for generating and verifying One-Time Passwords (OTPs) based on the TOTP algorithm.

## Installation

```bash
npm install @prsm/otp
```

## Usage

### Create a Secret

Generate a secret with different strengths:

```typescript
import Otp from "@prsm/otp";

// Default (high) strength
const secret = Otp.createSecret();

// Low strength
const lowStrengthSecret = Otp.createSecret(Otp.SHARED_SECRET_STRENGTH_LOW);

// Moderate strength
const moderateStrengthSecret = Otp.createSecret(Otp.SHARED_SECRET_STRENGTH_MODERATE);
```

For each user, store the secret securely and associate it with the user. When authenticating a user, you need to reference the secret that was generated for that user. The secret should be kept confidential and never shared.

### Generate a TOTP

```typescript
const secret = Otp.createSecret();
const totp = Otp.generateTotp(secret);
console.log(totp); // A 6-digit TOTP

const totp8 = Otp.generateTotp(secret, undefined, 8);
console.log(totp8); // An 8-digit TOTP
```

### Verify a TOTP

```typescript
const isValid = Otp.verifyTotp(secret, totp);
console.log(isValid); // true, even if the TOTP is expired
```

For strict verification, you can specify the number of steps and the time window:

```typescript
const isValidStrict = Otp.verifyTotp(secret, totp, 0, 0);
console.log(isValidStrict); // true only if the TOTP is valid at the current time
```

### Generate a TOTP URI for QR Code

```typescript
const uri = Otp.createTotpKeyUriForQrCode("app.example.com", "john.doe@example.org", secret);
console.log(uri); // URI for QR code
```

### Custom Configuration

Customize OTP length, interval, and hash function:

```typescript
const customTotp = Otp.generateTotp(secret, undefined, 8, 60, undefined, Otp.HASH_FUNCTION_SHA_256);
const isValidCustom = Otp.verifyTotp(secret, customTotp, undefined, undefined, undefined, 8, 60, undefined, Otp.HASH_FUNCTION_SHA_256);
console.log(isValidCustom); // true
```

## Error Handling

Handle specific errors:

```typescript
try {
  Otp.generateTotp("shortsecret");
} catch (error) {
  if (error instanceof Otp.InvalidSecretError) {
    console.error("The provided secret is too short.");
  }
}
```
