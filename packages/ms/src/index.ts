const MS_IN = {
  w: 604_800_000,
  wk: 604_800_000,
  wks: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
  d: 86_400_000,
  dy: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  h: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  m: 60_000,
  mn: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  s: 1_000,
  sec: 1_000,
  secs: 1_000,
  second: 1_000,
  seconds: 1_000,
  ms: 1,
  msec: 1,
  msecs: 1,
  millisec: 1,
  millisecond: 1,
  milliseconds: 1,
};

const UNIT_ALIAS = {
  w: "week",
  wk: "week",
  wks: "week",
  week: "week",
  weeks: "week",
  d: "day",
  dy: "day",
  day: "day",
  days: "day",
  h: "hour",
  hr: "hour",
  hrs: "hour",
  hour: "hour",
  hours: "hour",
  m: "minute",
  mn: "minute",
  min: "minute",
  mins: "minute",
  minute: "minute",
  minutes: "minute",
  s: "second",
  sec: "second",
  secs: "second",
  second: "second",
  seconds: "second",
  ms: "ms",
  msec: "ms",
  msecs: "ms",
  millisec: "ms",
  millisecond: "ms",
  milliseconds: "ms",
};

const msRegex = /(-?)([\d\s\-_,.]+)\s*([a-zA-Z]*)/g;
const sanitizeRegex = /[\s\-_,]/g;
const resultCache = {};

function isValid(input: any) {
  return (
    (typeof input === "string" && input.length > 0) ||
    (typeof input === "number" &&
      input > -Infinity &&
      input < Infinity &&
      !isNaN(input))
  );
}

function ms(msString: any, defaultOrOptions: any = {}, options: any = {}) {
  if (defaultOrOptions && typeof defaultOrOptions === "object") {
    options = defaultOrOptions;
    defaultOrOptions = 0;
  }

  let defaultMsString = isValid(defaultOrOptions) ? defaultOrOptions : 0;
  const { unit = "ms", round = true } = options;

  const cacheKey = `${msString}${defaultMsString}${unit}${round}`;
  const cacheExists = cacheKey in resultCache;

  if (cacheExists) {
    return resultCache[cacheKey];
  }

  // if defaultDuration is a string, it's something like "1day". we need to
  // call ms() on it to get the number of milliseconds it represents.
  if (typeof defaultMsString === "string") {
    defaultMsString = ms(defaultMsString, 0);
  }

  let parsed = parseMs(msString, defaultMsString);

  parsed = convertToUnit(parsed, unit);
  parsed = applyRounding(parsed, round);

  if (!cacheExists) {
    resultCache[cacheKey] = parsed;
  }

  return parsed;
}

function parseMs(msString: any, defaultMsString: number): number {
  const ms = isValid(msString) ? msString : defaultMsString;
  const re = new RegExp(msRegex);

  if (typeof ms === "string") {
    let totalMs = 0;

    if (ms.length > 0) {
      let matches: string[];
      let anyMatches = false;

      while ((matches = re.exec(ms)!)) {
        anyMatches = true;
        let value = parseFloat(matches[2].replace(sanitizeRegex, ""));

        if (matches[1]) {
          value = -value;
        }

        if (!isNaN(value)) {
          const unitKey = UNIT_ALIAS[matches[3].toLowerCase()] || "ms";
          totalMs += value * MS_IN[unitKey];
        }
      }

      if (!anyMatches) {
        return defaultMsString ?? 0;
      }
    }

    return totalMs;
  }

  return ms;
}

function convertToUnit(ms: number, unit: string): number {
  if (unit in MS_IN) {
    ms /= MS_IN[unit];
  } else {
    return 0;
  }

  return ms;
}

function applyRounding(ms: number, round: boolean): number {
  if (ms !== 0 && round) {
    ms = Math.round(ms);
    if (ms === 0) {
      return Math.abs(ms);
    }
  }

  return ms;
}

export default ms;
