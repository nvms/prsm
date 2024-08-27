# hash

A very simple string hashing library on top of `node:crypto`.

# Installation

`npm install @prsm/hash`

## create

```typescript
import hash from "@prsm/hash";

hash.create("an unencrypted string");
hash.create("an unencrypted string");
hash.create("an unencrypted string");

// sha256:UfH7lmEc5dr65iFPmvsKthzAgMHtdV6Qb4FXYSqlnOaQoZmqQWLBrPnJGLZmQontirQZKO9nTIz+zs544n0x7Q==:6qG75Cp5hysNWs+8TO65fzc1FaSZxykaWa3iatPrw4s=
// sha256:Wq6vrcGG4mKlM7r8DAuDHcYxJlG8fOEoO2sNWofl/snmsZPTaBuy8Dg6i2J28TdcncSgK8EhrCqgv69h5Kk2xA==:QvAc6op8ScJex38AYrZUtFDd69c4OJv5SsVIRgR+FPw=
// sha256:e16qmZpJiy1qvGycPkJz0qQnCdyAguGAFV8rqCokiFml10nl9lVU1v0hZ6QBy+laI0AYkHsYtt6wMkEOuNhpMw==:L3bHZeriSAjy8wEIz/fURxhOqxa8KltuvpHPE/nE/eQ=
```

## verify

```typescript
import hash from "@prsm/hash";

const valid = hash.verify(
  "sha256:0SA+O819D52jZOqWuzIWa+KLyT+Ck+b5ze4HI7fAJOhRW3FYk527GnuVOS/pricLy1KqwUfk5wWyQx4z5x3fsA==:wPs8DRMOrZEJYeaPxZzccGPJSozGvNqRhhS6f8ITOyM=",
  "an unencrypted string",
);
// valid = true
```

## custom hasher

```typescript
import { Hasher } from "@prsm/hash";

const hash = new Hasher("sha512", 128);
// hash.create("..");
// hash.verify("..", "sha512:...")
```
