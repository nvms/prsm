import { describe, it, expect } from "vitest";
import ms from "./index";

describe("ms", () => {
  describe("basic functionality", () => {
    it("should convert string time to milliseconds", () => {
      expect(ms("10s")).toBe(10000);
      expect(ms("10sec")).toBe(10000);
      expect(ms("10secs")).toBe(10000);
      expect(ms("10second")).toBe(10000);
      expect(ms("10seconds")).toBe(10000);
    });

    it("should handle numeric inputs", () => {
      expect(ms(100)).toBe(100);
      expect(ms("100")).toBe(100);
    });

    it("should handle decimal values with rounding options", () => {
      expect(ms("10.9ms")).toBe(11);
      expect(ms("10.9ms", { round: false })).toBe(10.9);
    });

    it("should convert to different units", () => {
      expect(ms("1000ms", { unit: "s" })).toBe(1);
      expect(ms("1000.9ms", { round: false, unit: "s" })).toBe(1.0009);
    });

    it("should handle multiple time units and negative values", () => {
      expect(ms("1m 30s")).toBe(90000);
      expect(ms("-1h")).toBe(-3600000);
      expect(ms("2h 30m")).toBe(9000000);
    });
  });

  describe("unit conversions", () => {
    it("should handle all time unit aliases", () => {
      // Milliseconds
      expect(ms("100ms")).toBe(100);
      expect(ms("100msec")).toBe(100);
      expect(ms("100msecs")).toBe(100);
      expect(ms("100millisec")).toBe(100);
      expect(ms("100millisecond")).toBe(100);
      expect(ms("100milliseconds")).toBe(100);

      // Seconds
      expect(ms("10s")).toBe(10000);
      expect(ms("10sec")).toBe(10000);
      expect(ms("10secs")).toBe(10000);
      expect(ms("10second")).toBe(10000);
      expect(ms("10seconds")).toBe(10000);

      // Minutes
      expect(ms("5m")).toBe(300000);
      expect(ms("5min")).toBe(300000);
      expect(ms("5mins")).toBe(300000);
      expect(ms("5minute")).toBe(300000);
      expect(ms("5minutes")).toBe(300000);

      // Hours
      expect(ms("2h")).toBe(7200000);
      expect(ms("2hr")).toBe(7200000);
      expect(ms("2hrs")).toBe(7200000);
      expect(ms("2hour")).toBe(7200000);
      expect(ms("2hours")).toBe(7200000);

      // Days
      expect(ms("1d")).toBe(86400000);
      expect(ms("1dy")).toBe(86400000);
      expect(ms("1day")).toBe(86400000);
      expect(ms("1days")).toBe(86400000);

      // Weeks
      expect(ms("1w")).toBe(604800000);
      expect(ms("1wk")).toBe(604800000);
      expect(ms("1wks")).toBe(604800000);
      expect(ms("1week")).toBe(604800000);
      expect(ms("1weeks")).toBe(604800000);
    });

    it("should convert between different units", () => {
      expect(ms("60s", { unit: "m" })).toBe(1);
      expect(ms("60m", { unit: "h" })).toBe(1);
      expect(ms("24h", { unit: "d" })).toBe(1);
      expect(ms("7d", { unit: "w" })).toBe(1);
    });
  });

  describe("formatting and parsing", () => {
    it("should handle various number formats", () => {
      expect(ms("1,000ms")).toBe(1000);
      expect(ms("1_000ms")).toBe(1000);
      expect(ms("1-000ms")).toBe(1000);
      expect(ms("1 000ms")).toBe(1000);
    });

    it("should handle spaces between values and units", () => {
      expect(ms("10 s")).toBe(10000);
      expect(ms("5 minutes")).toBe(300000);
    });

    it("should handle multiple space-separated time units", () => {
      expect(ms("1h 30m")).toBe(5400000);
      expect(ms("1d 12h")).toBe(129600000);
      expect(ms("1w 2d 3h 4m 5s")).toBe(788645000);
    });
  });

  describe("edge cases", () => {
    it("should handle invalid inputs", () => {
      expect(ms("")).toBe(0);
      expect(ms(null)).toBe(0);
      expect(ms(undefined)).toBe(0);
      expect(ms("invalid")).toBe(0);
      expect(ms("123invalid")).toBe(123);
    });

    it("should handle default values", () => {
      expect(ms("", 500)).toBe(500);
      expect(ms(null, "1s")).toBe(1000);
      expect(ms("invalid", "5m")).toBe(300000);
    });

    it("should handle zero values", () => {
      expect(ms("0ms")).toBe(0);
      expect(ms("0s")).toBe(0);
      expect(ms("0m")).toBe(0);
      expect(ms("0h")).toBe(0);
      expect(ms("0d")).toBe(0);
      expect(ms("0w")).toBe(0);
    });

    it("should handle very large values", () => {
      expect(ms("1000000s")).toBe(1000000000);
      expect(ms("1000h")).toBe(3600000000);
    });

    it("should handle very small decimal values", () => {
      expect(ms("0.001s")).toBe(1);
      expect(ms("0.0001s", { round: false })).toBe(0.1);
    });

    it("should handle mixed case units", () => {
      expect(ms("10S")).toBe(10000);
      expect(ms("5Min")).toBe(300000);
      expect(ms("2HR")).toBe(7200000);
    });
  });

  describe("caching behavior", () => {
    it("should return the same result for identical inputs", () => {
      const result1 = ms("10s");
      const result2 = ms("10s");
      expect(result1).toBe(result2);
    });
  });
});
