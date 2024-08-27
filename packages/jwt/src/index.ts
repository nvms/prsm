import { derToJose, joseToDer } from "ecdsa-sig-formatter";
import crypto from "node:crypto";

export interface JWTPayload {
  /** expiration */
  exp?: number;
  /** subject */
  sub?: string | number;
  /** issued at */
  iat?: number;
  /** not before */
  nbf?: number;
  /** jwt id */
  jti?: number;
  /** issuer */
  iss?: string;
  /** audience */
  aud?: string | number;
  /** whatever */
  [k: string]: any;
}

export interface JWTHeader {
  /** encoding alg used */
  alg: string;
  /** token type */
  type: "JWT";
  /** key id */
  kid?: string;
}

export interface JWTParts {
  header: JWTHeader;
  payload: JWTPayload;
  signature: Buffer;
}

export interface VerifyOptions {
  alg?: string;
  exp?: boolean;
  sub?: string | number;
  iat?: number;
  nbf?: boolean;
  jti?: number;
  iss?: string;
  aud?: string | number;
}

export interface VerifyResult {
  /** true: signature is valid */
  sig?: boolean;
  /** true: payload.iat matches opts.iat */
  iat?: boolean;
  /** true: the current time is later or equal to payload.nbf, false: this jwt should NOT be accepted */
  nbf?: boolean;
  /** true: token is expired (payload.exp < now) */
  exp?: boolean;
  /** true: payload.jti matches opts.jti */
  jti?: boolean;
  /** true: payload.iss matches opts.iss */
  iss?: boolean;
  /** true: payload.sub matches opts.sub */
  sub?: boolean;
  /** true: payload.aud matches opts.aud */
  aud?: boolean;

  decoded: JWTParts;
}

const algorithms = [
  "HS256",
  "HS384",
  "HS512",
  "RS256",
  "RS384",
  "RS512",
] as const;
type Algorithm = (typeof algorithms)[number];

function isValidAlgorithm(alg: Algorithm): boolean {
  return algorithms.includes(alg);
}

interface IAlgorithm {
  sign(encoded: string, secret: string | Buffer): string;
  verify(encoded: string, signature: string, secret: string | Buffer): boolean;
}

const Algorithms: { [k: string]: IAlgorithm } = {
  HS256: createHmac(256),
  HS384: createHmac(384),
  HS512: createHmac(512),
  RS256: createSign(256),
  RS384: createSign(384),
  RS512: createSign(512),
  ES256: createEcdsa(256),
} as const;

function createHmac(bits: number): IAlgorithm {
  function sign(encoded: string, secret: string | Buffer): string {
    return crypto
      .createHmac(`sha${bits}`, secret)
      .update(encoded)
      .digest("base64");
  }

  function verify(
    encoded: string,
    signature: string,
    secret: string | Buffer,
  ): boolean {
    return sign(encoded, secret) === signature;
  }

  return { sign, verify };
}

function createSign(bits: number): IAlgorithm {
  const algorithm = `RSA-SHA${bits}`;

  function sign(encoded: string, secret: string | Buffer): string {
    return crypto
      .createSign(algorithm)
      .update(encoded)
      .sign(secret.toString(), "base64");
  }

  function verify(
    encoded: string,
    signature: string,
    secret: string | Buffer,
  ): boolean {
    const v = crypto.createVerify(algorithm);
    v.update(encoded);
    return v.verify(secret, signature, "base64");
  }

  return { sign, verify };
}

function createEcdsa(bits: number): IAlgorithm {
  const algorithm = `RSA-SHA${bits}`;

  function sign(encoded: string, secret: string | Buffer): string {
    const sig = crypto
      .createSign(algorithm)
      .update(encoded)
      .sign({ key: secret.toString() }, "base64");

    return derToJose(sig, `ES${bits}`);
  }

  function verify(
    encoded: string,
    signature: string,
    secret: string | Buffer,
  ): boolean {
    signature = joseToDer(signature, `ES${bits}`).toString("base64");
    const v = crypto.createVerify(algorithm);
    v.update(encoded);
    return v.verify(secret, signature, "base64");
  }

  return { sign, verify };
}

function encodeJSONBase64(obj: any): string {
  const j = JSON.stringify(obj);
  return Base64ToURLEncoded(Buffer.from(j).toString("base64"));
}

function decodeJSONBase64(str: string) {
  const dec = Buffer.from(URLEncodedToBase64(str), "base64").toString("utf-8");
  try {
    return JSON.parse(dec);
  } catch (e) {
    throw e;
  }
}

function Base64ToURLEncoded(b64: string): string {
  return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function URLEncodedToBase64(enc: string): string {
  enc = enc.toString();
  const pad = 4 - (enc.length % 4);

  if (pad !== 4) {
    for (let i = 0; i < pad; i++) {
      enc += "=";
    }
  }

  return enc.replace(/\-/g, "+").replace(/_/g, "/");
}

/**
 * Encodes a payload into a JWT string with a specified algorithm.
 *
 * @param {JWTPayload} payload - The payload to encode into the JWT.
 * @param {string | Buffer} key - The secret key used to sign the JWT.
 * @param {Algorithm} alg - The algorithm used to sign the JWT. Defaults to "HS256".
 * @throws {Error} If an invalid algorithm type is provided.
 * @returns {string} The encoded JWT string.
 */
function encode(
  payload: JWTPayload,
  key: string | Buffer,
  alg: Algorithm = "HS256",
): string {
  if (!isValidAlgorithm(alg)) {
    throw new Error(
      `${alg} is an invalid algorithm type. Must be one of ${algorithms}`,
    );
  }

  const b64header = encodeJSONBase64({ alg, type: "JWT" });
  const b64payload = encodeJSONBase64(payload);
  const unsigned = `${b64header}.${b64payload}`;
  const signer = Algorithms[alg];
  const sig = Base64ToURLEncoded(signer.sign(unsigned, key));

  return `${unsigned}.${sig}`;
}

/**
 * Decodes a JWT-encoded string and returns an object containing the decoded header, payload, and signature.
 *
 * @param {string} encoded - The JWT-encoded string to decode.
 * @throws {Error} If the encoded string does not have exactly three parts separated by periods.
 * @returns {JWTParts} An object containing the decoded header, payload, and signature of the token.
 */
function decode(encoded: string): JWTParts {
  const parts = encoded.split(".");
  if (parts.length !== 3) {
    throw new Error(
      `Decode expected 3 parts to encoded token, got ${parts.length}`,
    );
  }

  const header: JWTHeader = decodeJSONBase64(parts[0]);
  const payload: JWTPayload = decodeJSONBase64(parts[1]);
  const signature = Buffer.from(URLEncodedToBase64(parts[2]), "base64");

  return { header, payload, signature };
}

/**
 * Verifies an encoded token with the given secret key and options.
 * @param encoded
 * @param key Secret key used to verify the signature of the encoded token.
 * @param opts The opts parameter of the verify function is an optional object that can contain the following properties:
 * - alg: A string specifying the algorithm used to sign the token. If this property is not present in opts, the alg property from the decoded token header will be used.
 * - iat: A number representing the timestamp when the token was issued. If present, this property will be compared to the iat claim in the token's payload.
 * - iss: A string representing the issuer of the token. If present, this property will be compared to the iss claim in the token's payload.
 * - jti: A string representing the ID of the token. If present, this property will be compared to the jti claim in the token's payload.
 * - sub: A string representing the subject of the token. If present, this property will be compared to the sub claim in the token's payload.
 * - aud: A string or number representing the intended audience(s) for the token. If present, this property will be compared to the aud claim in the token's payload.
 * @returns
 */
function verify(
  encoded: string,
  key: string | Buffer,
  opts: VerifyOptions = {},
): VerifyResult {
  const decoded = decode(encoded);
  const { payload } = decoded;
  const parts = encoded.split(".");
  const alg = opts.alg ?? decoded.header.alg ?? "HS256";
  const now = Date.now();
  const verifier = Algorithms[alg];
  const result: VerifyResult = { decoded };

  result.sig = verifier.verify(
    `${parts[0]}.${parts[1]}`,
    URLEncodedToBase64(parts[2]),
    key,
  );

  if (payload.exp !== undefined) {
    result.exp = payload.exp < now;
  }

  if (payload.nbf !== undefined) {
    result.nbf = now >= payload.nbf;
  }

  if (opts.iat !== undefined) {
    result.iat = payload.iat === opts.iat;
  }

  if (opts.iss !== undefined) {
    result.iss = payload.iss === opts.iss;
  }

  if (opts.jti !== undefined) {
    result.jti = payload.jti !== opts.jti;
  }

  if (opts.sub !== undefined) {
    result.sub = payload.sub === opts.sub;
  }

  if (opts.aud !== undefined) {
    result.aud = payload.aud === opts.aud;
  }

  return result;
}

const jwt = { encode, decode, verify };
export { decode, encode, verify };
export default jwt;
