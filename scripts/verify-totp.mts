/*
 * Unit checks for src/lib/totp.ts against the RFC test vectors. No database or network.
 *
 *   node --conditions=react-server --import tsx --test scripts/verify-totp.mts
 *
 * (--conditions=react-server lets Node load modules that import "server-only".)
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { base32Decode, base32Encode, generateTotp, generateTotpSecret, hotp, totpStep, totpUri, verifyTotp } from "../src/lib/totp";

const rfcKey = Buffer.from("12345678901234567890", "ascii");
const rfcKeyB32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

// RFC 6238 Appendix B, SHA1 column (8 digits)
const totpVectors: [seconds: number, code: string][] = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

test("RFC 6238 SHA1 vectors (8 digits)", () => {
  for (const [t, code] of totpVectors) assert.equal(generateTotp(rfcKey, t * 1000, 8), code, `T=${t}`);
});

test("RFC 6238 vectors, 6 digits from the base32 secret", () => {
  assert.equal(base32Encode(rfcKey, { padding: false }), rfcKeyB32);
  for (const [t, code] of totpVectors) assert.equal(generateTotp(rfcKeyB32, t * 1000), code.slice(-6), `T=${t}`);
});

test("RFC 4226 Appendix D HOTP vectors", () => {
  const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  expected.forEach((code, counter) => assert.equal(hotp(rfcKey, counter), code));
});

test("RFC 4648 §10 base32 vectors", () => {
  const cases: [string, string][] = [
    ["", ""],
    ["f", "MY======"],
    ["fo", "MZXQ===="],
    ["foo", "MZXW6==="],
    ["foob", "MZXW6YQ="],
    ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI======"],
  ];
  for (const [plain, encoded] of cases) {
    assert.equal(base32Encode(Buffer.from(plain)), encoded);
    assert.equal(base32Decode(encoded).toString(), plain);
    assert.equal(base32Decode(encoded.toLowerCase().replace(/=/g, "")).toString(), plain);
  }
  assert.throws(() => base32Decode("MZXW6!"));
  assert.throws(() => base32Decode("M"));
});

test("generateTotpSecret: 20 random bytes as 32 base32 chars", () => {
  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
  assert.equal(base32Decode(secret).length, 20);
  assert.notEqual(secret, generateTotpSecret());
});

test("verifyTotp: ±1 step window, format checks, matched step", () => {
  const now = 1111111111 * 1000;
  const step = totpStep(now);
  assert.deepEqual(verifyTotp(rfcKeyB32, "050471", 1, now), { step });
  assert.deepEqual(verifyTotp(rfcKeyB32, "050 471", 1, now), { step });
  assert.deepEqual(verifyTotp(rfcKeyB32, generateTotp(rfcKeyB32, now - 30_000), 1, now), { step: step - 1 });
  assert.deepEqual(verifyTotp(rfcKeyB32, generateTotp(rfcKeyB32, now + 30_000), 1, now), { step: step + 1 });
  assert.equal(verifyTotp(rfcKeyB32, generateTotp(rfcKeyB32, now - 90_000), 1, now), null);
  assert.equal(verifyTotp(rfcKeyB32, generateTotp(rfcKeyB32, now - 30_000), 0, now), null);
  for (const bad of ["12345", "abcdef", "0504711", ""]) assert.equal(verifyTotp(rfcKeyB32, bad, 1, now), null, bad);
  assert.equal(verifyTotp("not base32!", "050471", 1, now), null);
});

test("totpUri: issuer and label encoding", () => {
  assert.equal(
    totpUri(rfcKeyB32, "a+b@nitro.store"),
    `otpauth://totp/Nitro%20Store:a%2Bb%40nitro.store?secret=${rfcKeyB32}&issuer=Nitro%20Store&algorithm=SHA1&digits=6&period=30`,
  );
});
