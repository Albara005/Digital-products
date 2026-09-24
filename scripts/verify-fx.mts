/*
 * Unit checks for the currency conversion in src/lib/display-currency.ts. No database or network.
 *
 *   node --import tsx --test scripts/verify-fx.mts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_RATES,
  chargeStep,
  convertUsdCents,
  formatMoney as format,
  inputToMinor,
  minGatewayCharge,
  minorToInput,
  toMinor,
  toUsdCents,
  topupLimits,
  usdToInput,
  inputToUsdCents,
} from "../src/lib/display-currency";

const rates = DEFAULT_RATES;

test("USD is unchanged", () => {
  assert.equal(toMinor(1875, "USD", rates), 1875);
  assert.equal(toMinor(0, "USD", {}), 0);
  assert.equal(toUsdCents(1875, "USD", 1, "floor"), 1875);
});

test("USD -> SAR (2 decimals) rounds to the nearest halala", () => {
  assert.equal(toMinor(1875, "SAR", rates), 7031); // 70.3125 -> 70.31
  assert.equal(toMinor(1000, "SAR", rates), 3750);
  assert.equal(toMinor(1, "SAR", rates), 4); // 0.0375 -> 0.04
  assert.equal(toMinor(2, "SAR", rates), 8); // 0.075 -> 0.08 (half up, despite float noise)
  assert.equal(toMinor(1875, "EGP", rates), 90938); // 909.375 -> 909.38
});

test("3-decimal currencies: KWD / OMR / BHD round to the 0.010 charge step", () => {
  assert.equal(chargeStep("KWD"), 10);
  assert.equal(chargeStep("OMR"), 10);
  assert.equal(chargeStep("SAR"), 1);
  assert.equal(toMinor(1000, "KWD", rates), 3070); // 3.070
  assert.equal(toMinor(1875, "KWD", rates), 5760); // 5.75625 -> 5.760
  assert.equal(toMinor(1875, "OMR", rates), 7210); // 7.209375 -> 7.210
  assert.equal(toMinor(549, "OMR", rates), 2110); // 2.110905 -> 2.110
  assert.equal(toMinor(1000, "BHD", rates), 3760);
  // An exact half step rounds up
  assert.equal(convertUsdCents(500, "KWD", 0.301), 1510); // 1.505 -> 1.510
  // Precise conversion keeps every fils (admin inputs)
  assert.equal(toMinor(1875, "KWD", rates, { precise: true }), 5756);
  assert.equal(toMinor(1875, "OMR", rates, { precise: true }), 7209);
});

test("every stepped 3-decimal amount is a multiple of 10", () => {
  for (let cents = 0; cents < 5000; cents += 7) {
    for (const code of ["KWD", "OMR", "BHD"] as const) assert.equal(toMinor(cents, code, rates) % 10, 0);
  }
});

test("precise conversion round-trips to the same USD cents", () => {
  for (let cents = 0; cents < 20000; cents += 13) {
    for (const code of ["SAR", "AED", "KWD", "QAR", "BHD", "OMR", "EGP"] as const) {
      const minor = toMinor(cents, code, rates, { precise: true });
      assert.equal(toUsdCents(minor, code, rates[code]), cents, `${cents} ${code}`);
    }
  }
});

test("USD equivalent: floor never exceeds the value", () => {
  assert.equal(toUsdCents(7210, "OMR", 0.3845, "floor"), 1875); // 18.7516... -> 18.75
  assert.equal(toUsdCents(7210, "OMR", 0.3845, "round"), 1875);
  assert.equal(toUsdCents(3070, "KWD", 0.307, "floor"), 1000);
  assert.equal(toUsdCents(7031, "SAR", 3.75, "floor"), 1874); // 18.7493 -> 18.74
  assert.equal(toUsdCents(7031, "SAR", 3.75, "round"), 1875);
});

test("unknown currency / missing rate throws", () => {
  assert.throws(() => toMinor(100, "XYZ", rates));
  assert.throws(() => toMinor(100, "SAR", {}));
  assert.throws(() => toMinor(1.5, "SAR", rates));
});

test("gateway minimum ~ USD 0.50 per currency", () => {
  assert.equal(minGatewayCharge("USD", 1), 50);
  assert.equal(minGatewayCharge("SAR", 3.75), 188);
  assert.equal(minGatewayCharge("KWD", 0.307), 160); // 0.1535 -> 0.160
  assert.equal(minGatewayCharge("OMR", 0.3845), 200); // 0.19225 -> 0.200
  assert.equal(minGatewayCharge("AED", 3.6725), 200); // Stripe's AED 2.00 floor
});

test("input helpers use the currency decimals", () => {
  assert.equal(minorToInput(7210, "OMR"), "7.210");
  assert.equal(minorToInput(1875, "USD"), "18.75");
  assert.equal(inputToMinor("7.21", "OMR"), 7210);
  assert.equal(inputToMinor("7.2105", "OMR"), null);
  assert.equal(inputToMinor("18.75", "USD"), 1875);
  assert.equal(inputToMinor("18.755", "USD"), null);
  assert.equal(inputToMinor("5", "KWD"), 5000);
  assert.equal(inputToMinor("-1", "USD"), null);
  assert.equal(inputToMinor("abc", "USD"), null);
});

test("formatting uses the currency decimals", () => {
  const formatMoney = (...args: Parameters<typeof format>) => format(...args).replace(/\s/g, " ");
  assert.equal(formatMoney(1875, "USD"), "$18.75");
  assert.equal(formatMoney(1875, "USD", "ar"), "$18.75");
  assert.equal(formatMoney(7210, "OMR", "en"), "OMR 7.210");
  assert.equal(formatMoney(5760, "KWD", "en"), "KWD 5.760");
  assert.equal(formatMoney(7031, "SAR", "en"), "SAR 70.31");
  assert.match(formatMoney(7210, "OMR", "ar"), /7\.210/);
  assert.match(formatMoney(7210, "OMR", "ar"), /ر\.ع\./);
});

test("top-up limits and presets per currency", () => {
  assert.deepEqual(topupLimits("USD", 1), { min: 500, max: 50000, step: 100, presets: [1000, 2500, 5000, 10000] });
  const sar = topupLimits("SAR", 3.75);
  assert.equal(sar.min, 1900); // 18.75 -> 19 SAR
  assert.equal(sar.max, 187500);
  assert.deepEqual(sar.presets, [3000, 10000, 20000, 30000]);
  const kwd = topupLimits("KWD", 0.307);
  assert.equal(kwd.step, 1000);
  assert.equal(kwd.min, 2000); // 1.535 -> 2 KWD
  assert.equal(kwd.max, 153000);
  for (const p of kwd.presets) assert.equal(p % 1000, 0);
  const omr = topupLimits("OMR", 0.3845);
  assert.ok(omr.presets.every((p) => p >= omr.min && p <= omr.max));
});

test("admin inputs: typed in the admin currency, stored as USD cents, and round-trip", () => {
  assert.equal(usdToInput(1875, "USD", 1), "18.75");
  assert.equal(usdToInput(500, "USD", 1), "5");
  assert.equal(usdToInput(1875, "OMR", 0.3845), "7.209");
  assert.equal(inputToUsdCents("7.209", "OMR", 0.3845), 1875);
  assert.equal(inputToUsdCents("10", "KWD", 0.307), 3257); // round(10 / 0.307 * 100)
  assert.equal(inputToUsdCents("-5.5", "USD", 1, { signed: true }), -550);
  assert.equal(inputToUsdCents("-5.5", "USD", 1), null);
  assert.equal(inputToUsdCents("1.2345", "KWD", 0.307), null);
  for (let cents = 0; cents < 30000; cents += 37) {
    for (const [code, rate] of Object.entries(DEFAULT_RATES)) {
      assert.equal(inputToUsdCents(usdToInput(cents, code, rate), code, rate), cents, `${cents} ${code}`);
    }
  }
});
