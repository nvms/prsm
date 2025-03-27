import { expect, test, testSuite } from "manten";
import { createWorld, WorldState } from "../../ngn";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default testSuite(async () => {
  test("can switch between worlds (scenes)", async () => {
    // Create two separate worlds (scenes)
    const sceneA = createWorld();
    const sceneB = createWorld();

    // Track execution counts for each scene
    let sceneAExecutions = 0;
    let sceneBExecutions = 0;

    // Set up main loops for each scene
    sceneA.defineMain((state: WorldState) => {
      sceneAExecutions++;
      if (sceneAExecutions >= 3) sceneA.stop();
    });

    sceneB.defineMain((state: WorldState) => {
      sceneBExecutions++;
      if (sceneBExecutions >= 3) sceneB.stop();
    });

    // Start sceneA and let it run for a bit
    sceneA.start();
    await sleep(500);

    // Verify sceneA ran and sceneB didn't
    expect(sceneAExecutions).toBe(3);
    expect(sceneBExecutions).toBe(0);

    // Start sceneB and let it run
    sceneB.start();
    await sleep(500);

    // Verify sceneB ran
    expect(sceneBExecutions).toBe(3);
  });

  test("worlds maintain separate entity collections", () => {
    const sceneA = createWorld();
    const sceneB = createWorld();

    // Create entities in each scene
    const entityA = sceneA.createEntity({ name: "EntityA" });
    const entityB = sceneB.createEntity({ name: "EntityB" });

    // Verify entities exist in their respective scenes
    expect(sceneA.getEntity(entityA.id)).toBeDefined();
    expect(sceneA.getEntity(entityB.id)).toBeUndefined();

    expect(sceneB.getEntity(entityB.id)).toBeDefined();
    expect(sceneB.getEntity(entityA.id)).toBeUndefined();
  });

  test("worlds maintain separate system collections", () => {
    const sceneA = createWorld();
    const sceneB = createWorld();

    // Track system executions
    let systemAExecutions = 0;
    let systemBExecutions = 0;

    // Create systems for each scene
    const systemA = () => {
      systemAExecutions++;
    };
    const systemB = () => {
      systemBExecutions++;
    };

    // Add systems to their respective scenes
    sceneA.addSystem(systemA);
    sceneB.addSystem(systemB);

    // Step each scene
    sceneA.step();
    sceneB.step();

    // Verify systems ran in their respective scenes
    expect(systemAExecutions).toBe(1);
    expect(systemBExecutions).toBe(1);

    // Remove system from sceneA
    sceneA.removeSystem(systemA);

    // Step each scene again
    sceneA.step();
    sceneB.step();

    // Verify systemA didn't run but systemB did
    expect(systemAExecutions).toBe(1);
    expect(systemBExecutions).toBe(2);
  });

  test("worlds maintain separate time tracking", async () => {
    const sceneA = createWorld();
    const sceneB = createWorld();

    // Set different time scales
    sceneA.state.time.scale = 0.5;
    sceneB.state.time.scale = 2.0;

    let sceneATime = 0;
    let sceneBTime = 0;

    // Set up main loops to capture time values
    sceneA.defineMain((state: WorldState) => {
      sceneATime = state.time.delta;
      sceneA.stop();
    });

    sceneB.defineMain((state: WorldState) => {
      sceneBTime = state.time.delta;
      sceneB.stop();
    });

    // Run both scenes
    sceneA.start();
    await sleep(200);

    sceneB.start();
    await sleep(200);

    // Verify time scales were applied correctly
    expect(sceneATime).toBeGreaterThan(0);
    expect(sceneBTime).toBeGreaterThan(0);
    expect(sceneBTime).toBeGreaterThan(sceneATime);

    // Verify the ratio is approximately 4:1 (2.0 vs 0.5)
    const ratio = sceneBTime / sceneATime;
    expect(ratio).toBeGreaterThan(3); // Allow some flexibility in timing
  });
});
