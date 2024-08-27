# ids

[![NPM version](https://img.shields.io/npm/v/@prsm/ids?color=a1b858&label=)](https://www.npmjs.com/package/@prsm/ids)

Short, obfuscated, collision-proof, and reversible identifiers.

Because sometimes internal identifiers are sensitive, or you just don't want to let a user know that their ID is 1.

```typescript
import ID from "@prsm/ids";

ID.encode(12389125); // phsV8T
ID.decode("phsV8T"); // 12389125
```

You can (and should) set your own alphabet string:

```typescript
ID.alphabet = "GZwBHpfWybgQ5d_2mM-jh84K69tqYknx7LN3zvDrcSJVRPXsCFT";
ID.alphabet = "TgzMhJXtRSVBnHFksZQc5j-yGx84W3rNDfK6p_Cbqd29YLm7Pwv";
ID.alphabet = "kbHn53dZphT2FvGMBxYJKqS7-cPV_Ct6LwjWRDfXmygzrQ48N9s";
```

If your use case makes sense, you can also generate a random alphabet string with `randomizeAlphabet`.

When the alphabet changes, though, the encoded IDs will change as well. Decoding will still work, but the decoded value will be different.

```typescript
ID.randomizeAlphabet();
```
