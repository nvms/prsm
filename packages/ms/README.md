# @prsm/ms

[![NPM version](https://img.shields.io/npm/v/@prsm/ms?color=a1b858&label=)](https://www.npmjs.com/package/@prsm/ms)

A lightweight utility for parsing and converting time strings to milliseconds and other time units.

## Installation

```bash
npm install @prsm/ms
```

## Usage

### Basic Usage

```typescript
import ms from "@prsm/ms";

// Convert complex time expressions to milliseconds
ms("1day 2hrs 30min"); // 95400000
ms("15mins 12s"); // 912000
ms("1w 3d 12h"); // 907200000

// Negative values
ms("-30min"); // -1800000

// Numbers are passed through
ms(100); // 100

// Format flexibility
ms("1,000 seconds"); // 1000000
ms("2_000ms"); // 2000
```

### Options

```typescript
// Disable rounding (default: true)
ms("10.9ms"); // 11
ms("10.9ms", { round: false }); // 10.9

// Convert to different units (default: "ms")
ms("1000.9ms", { unit: "s" }); // 1
ms("1000.9ms", { round: false, unit: "s" }); // 1.0009
ms("60s", { unit: "m" }); // 1
ms("60m", { unit: "h" }); // 1
```

### Unit Conversion

```typescript
// Convert between different time units
ms("1h", { unit: "ms" }); // 3600000
ms("90min", { unit: "h" }); // 1.5
ms("1d", { unit: "h" }); // 24
ms("1w", { unit: "d" }); // 7

// Precision control
ms("90.5min", { unit: "h" }); // 2 (rounded by default)
ms("90.5min", { unit: "h", round: false }); // 1.5083333333333333
```

### Default Values

```typescript
// Provide default values for invalid inputs
ms("", 500); // 500
ms(null, "1s"); // 1000
ms("invalid", "5m"); // 300000
```

## Supported Time Units

| Unit         | Aliases                                                          |
|--------------|------------------------------------------------------------------|
| Milliseconds | `ms`, `msec`, `msecs`, `millisec`, `millisecond`, `milliseconds` |
| Seconds      | `s`, `sec`, `secs`, `second`, `seconds`                          |
| Minutes      | `m`, `min`, `mins`, `minute`, `minutes`                          |
| Hours        | `h`, `hr`, `hrs`, `hour`, `hours`                                |
| Days         | `d`, `dy`, `day`, `days`                                         |
| Weeks        | `w`, `wk`, `wks`, `week`, `weeks`                                |
