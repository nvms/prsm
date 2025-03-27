import { expect, test, testSuite } from "manten";
import { createWorld, WorldState } from "../../ngn";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default testSuite(async () => {
  test("time.delta should be scaled by time.scale", async () => {
    const { state, start, stop, defineMain } = createWorld();
    let i = 0;
    state.time.scale = 0.5;

    defineMain((state: WorldState) => {
      if (i > 0) {
        // Check that delta is scaled (approximately half of rawDelta)
        expect(state.time.delta).toBeCloseTo(state.time.rawDelta * 0.5, 1);

        // The raw delta should be around 16.67ms (60fps)
        expect(state.time.rawDelta).toBeGreaterThan(15);
        expect(state.time.rawDelta).toBeLessThan(20);

        // The scaled delta should be around 8.33ms (at scale 0.5)
        expect(state.time.delta).toBeGreaterThan(7);
        expect(state.time.delta).toBeLessThan(10);
      }

      if (++i === 3) stop();
    });

    start();
    await sleep(500);

    expect(i).toBe(3);
  });

  test("time.delta should be doubled when time.scale is 2.0", async () => {
    const { state, start, stop, defineMain } = createWorld();
    let i = 0;
    state.time.scale = 2.0;

    defineMain((state: WorldState) => {
      if (i > 0) {
        // Check that delta is scaled (approximately double of rawDelta)
        expect(state.time.delta).toBeCloseTo(state.time.rawDelta * 2.0, 1);

        // The scaled delta should be around 33.34ms (at scale 2.0)
        expect(state.time.delta).toBeGreaterThan(30);
        expect(state.time.delta).toBeLessThan(40);
      }

      if (++i === 3) stop();
    });

    start();
    await sleep(500);

    expect(i).toBe(3);
  });
});
