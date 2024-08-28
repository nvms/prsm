/**
 * Generates a sinusoidal pulse between a minimum and maximum value at a specified frequency.
 *
 * @param time - The time variable, typically representing elapsed time.
 * @param freq - The frequency of the pulse in cycles per unit time (default is 1).
 * @param min - The minimum value of the pulse (default is 0).
 * @param max - The maximum value of the pulse (default is 1).
 * @returns The calculated pulse value at the given time.
 */
export function pulse(time: number, freq: number = 1, min: number = 0, max: number = 1): number {
  const halfRange = (max - min) / 2;
  return min + halfRange * (1 + Math.sin(2 * Math.PI * freq * time));
}

/**
 * Performs a linear interpolation between two numbers.
 * @param a The start value.
 * @param b The end value.
 * @param t The interpolation factor (0-1).
 * @returns The interpolated value.
 */
export function lerp(a: number, b: number, t: number): number {
  return (1 - t) * a + t * b;
}

/**
 * Performs spherical linear interpolation between two numbers.
 * @param a The start value.
 * @param b The end value.
 * @param t The interpolation factor, between 0 and 1.
 * @returns The interpolated value.
 */
export function slerp(a: number, b: number, t: number): number {
  const theta = Math.acos(Math.min(Math.max(a / b, -1), 1)) * t;
  return a * Math.cos(theta) + b * Math.sin(theta);
}

export function extend<T>(component: () => T) {
  return (overrides: Partial<T>): (() => T) => {
    const extendedCompponent = () => ({ ...component(), ...overrides });
    Object.defineProperty(extendedCompponent, "name", {
      value: component.name,
    });
    return extendedCompponent;
  };
}
