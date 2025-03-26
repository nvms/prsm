import { describe, it, expect, beforeEach } from 'vitest';
import id from "../src";

describe("ids", () => {
  // Reset alphabet before each test
  beforeEach(() => {
    id.setAlphabet(id.DEFAULT_ALPHABET);
  });

  it("encodes as expected", () => {
    const encoded = id.encode(12389125);
    expect(encoded).toBe("7rYTs_");
  });

  it("decodes as expected", () => {
    const decoded = id.decode("7rYTs_");
    expect(decoded).toBe(12389125);
  });

  it("changing the alphabet is effective", () => {
    id.setAlphabet("GZwBHpfWybgQ5d_2mM-jh84K69tqYknx7LN3zvDrcSJVRPXsCFT");
    expect(id.encode(12389125)).toBe("phsV8T");
    expect(id.decode("phsV8T")).toBe(12389125);
  });

  it("shuffling the alphabet changes encoding but preserves round-trip integrity", () => {
    // First randomization
    id.randomizeAlphabet();
    const encoded1 = id.encode(12389125);
    const decoded1 = id.decode(encoded1);
    expect(decoded1).toBe(12389125);

    // Store the current alphabet
    const alphabet1 = id.getAlphabet();
    
    // Second randomization
    id.randomizeAlphabet();
    const alphabet2 = id.getAlphabet();
    
    // Encode with the new alphabet
    const encoded2 = id.encode(12389125);
    const decoded2 = id.decode(encoded2);
    
    // Each alphabet should produce different encodings for the same number
    expect(alphabet1).not.toBe(alphabet2);
    expect(encoded1).not.toBe(encoded2);
    
    // But round-trip encoding/decoding should work with each alphabet
    expect(decoded2).toBe(12389125);
  });
});
