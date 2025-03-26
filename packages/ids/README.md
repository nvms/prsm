# ids

[![NPM version](https://img.shields.io/npm/v/@prsm/ids?color=a1b858&label=)](https://www.npmjs.com/package/@prsm/ids)

Short, obfuscated, collision-proof, reversible identifiers.

## Usage

```typescript
import id from "@prsm/ids";

id.encode(12389125); // "7rYTs_"
id.decode("7rYTs_"); // 12389125
```

## Configuration

Set custom alphabet:
```typescript
id.setAlphabet("GZwBHpfWybgQ5d_2mM-jh84K69tqYknx7LN3zvDrcSJVRPXsCFT");
```

Randomize alphabet:
```typescript
id.randomizeAlphabet();
```

## API

| Function              | Description                               |
|-----------------------|-------------------------------------------|
| `encode(num)`         | Converts number to obfuscated string      |
| `decode(str)`         | Converts obfuscated string back to number |
| `setAlphabet(str)`    | Sets custom alphabet for encoding         |
| `getAlphabet()`       | Returns current alphabet                  |
| `randomizeAlphabet()` | Shuffles alphabet characters randomly     |

## Notes

- Maximum encodable value: 2,147,483,647 (MAX_INT32)
- Changing alphabet changes encoded values
- Encoded values must be decoded with same alphabet
