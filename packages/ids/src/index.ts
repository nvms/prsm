import long from "long";

const MAX_INT32 = 2_147_483_647;
const PRIME = 1_125_812_041;
const INVERSE = 348_986_105;
const RANDOM = 998_048_641;
const DEFAULT_ALPHABET = "23456789bcdfghjkmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ-_";

let alphabet = DEFAULT_ALPHABET;

const getBase = () => alphabet.length;

const shorten = (id: number): string => {
  let result = "";
  const base = getBase();

  while (id > 0) {
    result = alphabet[id % base] + result;
    id = Math.floor(id / base);
  }

  return result;
};

const unshorten = (str: string): number => {
  let result = 0;
  const base = getBase();

  for (let i = 0; i < str.length; i++) {
    result = result * base + alphabet.indexOf(str[i]);
  }

  return result;
};

const id = {
  MAX_INT32,
  DEFAULT_ALPHABET,

  encode: (num: number): string => {
    if (num > MAX_INT32) {
      throw new Error(
        `Number (${num}) is too large to encode. MAX_INT32 is ${MAX_INT32}`,
      );
    }

    const n = long.fromInt(num);

    return shorten(
      n.multiply(PRIME).and(long.fromInt(MAX_INT32)).xor(RANDOM).toInt(),
    );
  },

  decode: (str: string): number => {
    const n = long.fromInt(unshorten(str));

    return n.xor(RANDOM).multiply(INVERSE).and(long.fromInt(MAX_INT32)).toInt();
  },

  getAlphabet: (): string => alphabet,

  setAlphabet: (newAlphabet: string): void => {
    alphabet = newAlphabet;
  },

  randomizeAlphabet: (): void => {
    const array = alphabet.split("");
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    alphabet = array.join("");
  },
};

export default id;
