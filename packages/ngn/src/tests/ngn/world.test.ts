import { expect, test, testSuite } from "manten";
import { extend } from "../../misc";
import { $ceMap, $eciMap, $eMap, $queryResults, $systems, createWorld, Entity, System, WorldState } from "../../ngn";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default testSuite(async () => {
  test("can createWorld", () => {
    const { state, query, createEntity } = createWorld();
    expect(state).toBeDefined();
    expect(query).toBeDefined();
    expect(createEntity).toBeDefined();
  });

  test("can createEntity", () => {
    const { createEntity } = createWorld();
    const entity = createEntity();
    expect(entity).toBeDefined();
    expect(entity.id).toBeDefined();
    expect(entity.components).toBeDefined();
    expect(entity.addComponent).toBeDefined();
    expect(entity.hasComponent).toBeDefined();
    expect(entity.getComponent).toBeDefined();
    expect(entity.removeComponent).toBeDefined();
    expect(entity.destroy).toBeDefined();
  });

  test("can createEntity and override id", () => {
    const { createEntity } = createWorld();
    const entity = createEntity({ name: "foo", id: "abc" });
    expect(entity.name).toEqual("foo");
    expect(entity.id).toEqual("abc");
  });

  test("overriding existing id should move the old entity and update world maps", () => {
    const { createEntity, state } = createWorld();

    const Foo = () => ({ name: "foo" });
    const Bar = () => ({ name: "bar" });

    const firstEntity = createEntity({ name: "foo", id: "abc" }).addComponent(Foo);
    expect(firstEntity.id).toEqual("abc");

    const secondEntity = createEntity({ name: "bar", id: "abc" }).addComponent(Bar);

    // the old entity now has a new id, which is the next valid id
    expect(firstEntity.id).not.toEqual("abc");

    // the new entity forcefully took the old id
    expect(secondEntity.id).toEqual("abc");

    // the world maps should be correctly updated
    expect(state[$eMap]["abc"]).toEqual(secondEntity);
    expect(state[$eMap][firstEntity.id]).toEqual(firstEntity);

    expect(state[$eciMap]["abc"]).toEqual({ [Bar.name]: 0 });
    expect(state[$eciMap][firstEntity.id]).toEqual({ [Foo.name]: 0 });

    const thirdEntity = createEntity({ name: "baz", id: "abc" });
    expect(thirdEntity.id).toEqual("abc");
  });

  test("can getEntity", () => {
    const { createEntity, getEntity } = createWorld();
    const entity = createEntity();
    expect(getEntity(entity.id)).toEqual(entity);
  });

  test("createEntity with defaults", () => {
    const { createEntity } = createWorld();
    const entity = createEntity({ a: 1 });
    expect(entity.a).toEqual(1);
  });

  test("onEntityCreated", async () => {
    const { createEntity, onEntityCreated } = createWorld();
    let called = false;

    onEntityCreated((ent: Entity) => {
      called = true;
      expect(ent.id).toBeDefined();
    });

    createEntity();

    expect(called).toEqual(true);
  });

  test("can addComponent", () => {
    const { createEntity } = createWorld();
    const entity = createEntity();
    const thing = () => ({ hello: "world" });
    entity.addComponent(thing);
    expect(entity.components.length).toEqual(1);
    expect(entity.components[0].hello).toEqual("world");
    expect(entity.components[0].__ngn__).toEqual({ parent: entity.id, name: thing.name });
  });

  test("can addComponent with defaults to override", () => {
    const { createEntity } = createWorld();
    const entity = createEntity();
    const thing = () => ({ hello: "world" });
    entity.addComponent(thing, { hello: "universe" });
    expect(entity.components.length).toEqual(1);
    expect(entity.components[0].hello).toEqual("universe");
  });

  test("can hasComponent", () => {
    const { createEntity } = createWorld();
    const entity = createEntity();
    const thing = () => ({ hello: "world" });
    const otherThing = () => ({ hello: "world" });
    entity.addComponent(thing);
    expect(entity.hasComponent(thing)).toEqual(true);
    expect(entity.hasComponent(otherThing)).toEqual(false);

    entity.removeComponent(thing);
    expect(entity.hasComponent(thing)).toEqual(false);
  });

  test("can getComponent", () => {
    const { createEntity } = createWorld();
    const entity = createEntity();
    const thing = () => ({ hello: "world" });
    entity.addComponent(thing);
    expect(entity.getComponent<typeof thing>(thing).hello).toEqual("world");
  });

  test("can modify a component", () => {
    const { createEntity } = createWorld();
    const entity = createEntity();
    const thing = () => ({ hello: "world" });
    entity.addComponent(thing);
    const component = entity.getComponent<typeof thing>(thing);
    component.hello = "universe";
    expect(entity.getComponent<typeof thing>(thing).hello).toEqual("universe");
  });

  test("getComponent works even after adding/removing/add, etc", () => {
    const { createEntity } = createWorld();
    const entity = createEntity();
    const thing1 = () => ({ hello: "world1" });
    const thing2 = () => ({ hello: "world2" });
    entity.addComponent(thing1);
    expect(entity.getComponent<typeof thing1>(thing1).hello).toEqual("world1");
    entity.addComponent(thing2);
    expect(entity.getComponent<typeof thing2>(thing2).hello).toEqual("world2");
    entity.removeComponent(thing1);
    expect(entity.getComponent<typeof thing2>(thing2).hello).toEqual("world2");
  });

  test("can removeComponent", () => {
    const { createEntity } = createWorld();
    const entity = createEntity();
    const thing = () => ({ hello: "world" });
    entity.addComponent(thing);
    expect(entity.components.length).toEqual(1);
    entity.removeComponent(thing);
    expect(entity.components.length).toEqual(0);
  });

  test("world maps behave predictably", () => {
    const { state, createEntity } = createWorld();
    const entity = createEntity();
    expect(state[$eciMap][entity.id]).toEqual({});

    const Position = () => ({ x: 0, y: 0 });
    const Velocity = () => ({ x: 1, y: 1 });

    entity.addComponent(Position).addComponent(Velocity);

    expect(state[$eciMap][entity.id]).toEqual({ [Position.name]: 0, [Velocity.name]: 1 });
    expect(state[$ceMap][Position.name]).toEqual([entity.id]);
    expect(state[$ceMap][Velocity.name]).toEqual([entity.id]);
    expect(entity.components).toEqual([
      {
        ...Position(),
        __ngn__: {
          parent: entity.id,
          name: Position.name,
        },
      },
      {
        ...Velocity(),
        __ngn__: {
          parent: entity.id,
          name: Velocity.name,
        },
      },
    ]);

    entity.removeComponent(Position);

    expect(state[$eciMap][entity.id]).toEqual({ [Velocity.name]: 0 });
    expect(state[$ceMap][Position.name]).toEqual([]);
    expect(state[$ceMap][Velocity.name]).toEqual([entity.id]);
    expect(entity.components).toEqual([
      {
        ...Velocity(),
        __ngn__: {
          parent: entity.id,
          name: Velocity.name,
        },
      },
    ]);

    const velocity = entity.getComponent<typeof Velocity>(Velocity);

    expect(velocity.x).toEqual(1);
    expect(velocity.y).toEqual(1);

    velocity.x = 2;
    velocity.y = 2;

    expect(entity.components).toEqual([{ x: 2, y: 2, __ngn__: { parent: entity.id, name: Velocity.name } }]);
    expect(state[$eMap][entity.id]).toEqual(entity);
  });

  test("can destroy entity", () => {
    const { state, createEntity } = createWorld();
    const entity = createEntity();
    const Position = () => ({ x: 0, y: 0 });
    const Velocity = () => ({ x: 1, y: 1 });
    entity.addComponent(Position).addComponent(Velocity);
    entity.destroy();
    expect(state[$eMap][entity.id]).toBeUndefined();
    expect(state[$ceMap][Position.name]).toEqual([]);
    expect(state[$ceMap][Velocity.name]).toEqual([]);
  });

  test("can 'and' query", () => {
    const { state, createEntity, query } = createWorld();
    const entity1 = createEntity();
    const entity2 = createEntity();
    const Position = () => ({ x: 0, y: 0 });
    const Velocity = () => ({ x: 1, y: 1 });
    const NotMe = () => ({ x: 2, y: 2 });
    entity1.addComponent(Position).addComponent(Velocity).addComponent(NotMe);
    const movables = query({ and: [Position, Velocity] });

    movables((results) => {
      expect(results).toHaveLength(1);
      expect(results[0].entity.components).toHaveLength(3);
      const queryKey = "andPositionVelocityornottag";
      expect(state[$queryResults][queryKey].results).toHaveLength(1);
      const resultEntity = state[$queryResults][queryKey].results[0] as any;
      expect(resultEntity.Position).toBeDefined();
      expect(resultEntity.Velocity).toBeDefined();
    });

    entity2.addComponent(Position).addComponent(Velocity).addComponent(NotMe);

    movables((results) => {
      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result.entity.components).toHaveLength(3);
      });
    });
  });

  test("can 'or' query", () => {
    const { state, createEntity, query } = createWorld();
    const Position = () => ({ x: 0, y: 0 });
    const Velocity = () => ({ x: 1, y: 1 });
    const entity1 = createEntity().addComponent(Position);
    const entity2 = createEntity().addComponent(Position).addComponent(Velocity);
    const movables = query({ or: [Position, Velocity] });

    movables((results) => {
      expect(results).toHaveLength(2);
      expect(results[0].entity.components).toHaveLength(1);
      expect(results[0].entity.id).toEqual(entity1.id);
      expect(results[1].entity.components).toHaveLength(2);
      expect(results[1].entity.id).toEqual(entity2.id);
      const queryResults = state[$queryResults]["andorPositionVelocitynottag"].results;
      expect(queryResults).toHaveLength(2);
      expect(queryResults[0].Position).toBeDefined();
      expect(queryResults[1].Position).toBeDefined();
      expect(queryResults[1].Velocity).toBeDefined();
    });
  });

  test("can 'not' query", () => {
    const { createEntity, query } = createWorld();
    const entity0 = createEntity();
    const entity1 = createEntity();
    const entity2 = createEntity();
    const Position = () => ({ x: 0, y: 0 });
    const Velocity = () => ({ x: 1, y: 1 });
    const NotMe = () => ({ x: 2, y: 2 });
    entity0.addComponent(Position).addComponent(Velocity).addComponent(NotMe);
    entity1.addComponent(Position).addComponent(Velocity);
    const movables = query({ and: [Position, Velocity], not: [NotMe] });
    const other = query({ not: [NotMe] });

    other((results) => {
      expect(results.length).toEqual(2);
      expect(results[0].entity.id).toEqual(entity1.id);
      expect(results[1].entity.id).toEqual(entity2.id);
    });

    entity2.addComponent(NotMe);

    other((results) => {
      expect(results.length).toEqual(1);
      expect(results[0].entity.id).toEqual(entity1.id);
    });

    movables((results) => {
      expect(results.length).toEqual(1);
      expect(results[0].entity.id).toEqual(entity1.id);
    });

    entity0.removeComponent(NotMe);

    movables((results) => {
      expect(results.length).toEqual(2);
      expect(results[0].entity.id).toEqual(entity0.id);
      expect(results[1].entity.id).toEqual(entity1.id);
    });
  });

  test("can 'tag' query", () => {
    const { createEntity, query } = createWorld();
    const entity0 = createEntity();
    const entity1 = createEntity();
    const Position = () => ({ x: 0, y: 0 });
    const Velocity = () => ({ x: 1, y: 1 });
    const NotMe = () => ({ x: 2, y: 2 });
    entity0.addComponent(Position).addComponent(Velocity).addComponent(NotMe).addTag("cube");
    entity1.addComponent(Position).addComponent(Velocity).addTag("cube");
    const movables = query({ tag: ["cube"], not: [NotMe] });

    movables((results) => {
      expect(results.length).toEqual(1);
      expect(results[0].entity.id).toEqual(entity1.id);
      expect(results[0].entity.getTag()).toEqual("cube");
    });

    entity0.removeComponent(NotMe);

    movables((results) => {
      expect(results.length).toEqual(2);
      expect(results[0].entity.id).toEqual(entity0.id);
      expect(results[1].entity.id).toEqual(entity1.id);
    });

    entity1.addTag("not-cube");

    movables((results) => {
      expect(results.length).toEqual(1);
      expect(results[0].entity.id).toEqual(entity0.id);
    });

    entity0.removeTag();

    movables((results) => {
      expect(results.length).toEqual(0);
    });

    entity1.addTag("cube");

    movables((results) => {
      expect(results.length).toEqual(1);
      expect(results[0].entity.id).toEqual(entity1.id);
    });
  });

  test("queries update when a new entity is created", () => {
    const { createEntity, query } = createWorld();
    const entity = createEntity();
    const Position = () => ({ x: 0, y: 0 });
    const Velocity = () => ({ x: 1, y: 1 });
    const movables = query({ and: [Position, Velocity] });

    movables((results) => {
      expect(results.length).toEqual(0);
    });

    entity.addComponent(Position).addComponent(Velocity);

    movables((results) => {
      expect(results.length).toEqual(1);
    });

    createEntity().addComponent(Position).addComponent(Velocity);

    movables((results) => {
      expect(results.length).toEqual(2);
    });
  });

  test("components can be destructured from query results and directly modified", () => {
    const { createEntity, query } = createWorld();
    const entity = createEntity();
    const Position = () => ({ x: 0, y: 0 });
    const Velocity = () => ({ x: 1, y: 1 });
    entity.addComponent(Position).addComponent(Velocity);
    const movables = query({ and: [Position, Velocity] });

    movables((results) => {
      // @ts-ignore
      results.forEach(({ Position }) => {
        Position.x = 5;
      });
    });

    expect(entity.getComponent<typeof Position>(Position).x).toEqual(5);
  });

  test("destroying an entity removes it from query results", () => {
    const { createEntity, query } = createWorld();
    const entity = createEntity();
    const Thing = () => ({ x: 0, y: 0 });
    const things = query({ and: [Thing] });

    entity.addComponent(Thing);

    things((results) => {
      expect(results.length).toEqual(1);
    });

    entity.destroy();

    things((results) => {
      expect(results.length).toEqual(0);
    });
  });

  test("can add and remove systems", () => {
    const { state, addSystem, removeSystem } = createWorld();

    const system1: System = { update() {} };
    const system2: System = { update() {} };
    const system3: System = () => {};

    addSystem(system1, system2, system3);

    expect(state[$systems].length).toEqual(3);
    expect(state[$systems][0]).toEqual(system1.update);
    expect(state[$systems][1]).toEqual(system2.update);
    expect(state[$systems][2]).toEqual(system3);

    removeSystem(system2);
    expect(state[$systems].includes(system2.update)).toEqual(false);

    expect(state[$systems].length).toEqual(2);
    expect(state[$systems][0]).toEqual(system1.update);
    expect(state[$systems][1]).toEqual(system3);

    // @ts-ignore
    expect(() => addSystem({})).toThrow();
  });

  test("start", async () => {
    const { state, start, stop, defineMain } = createWorld();
    let i = 0;

    defineMain((state: WorldState) => {
      // The main loop is called at the same frequency
      // of the browser's requestAnimationFrame because the
      // scale is 1.0.
      if (i === 3) {
        expect(state.time.loopDelta).toBe(16.67);
      }
      expect(state.time.delta).toBeGreaterThan(16.6);
      expect(state.time.delta).toBeLessThan(16.7);
      if (++i === 3) stop();
    });

    start();
    await sleep(500);

    expect(i).toBe(3);
    expect(state.time.delta).toEqual(16.670000000000016);
  });

  test("start, scale at 0.5", async () => {
    const { state, start, stop, defineMain } = createWorld();
    let i = 0;
    state.time.scale = 0.5;

    defineMain((state: WorldState) => {
      // The main loop is called at half the frequency
      // of the browser's requestAnimationFrame because the
      // scale is 0.5.
      if (i === 3) {
        expect(state.time.loopDelta).toBe(33.34);
      }
      if (++i === 3) stop();
    });

    start();
    await sleep(500);

    expect(i).toBe(3);
    expect(state.time.delta).toBe(16.670000000000016);
  });

  test("step calls systems, passing world", async () => {
    const { state, step, addSystem } = createWorld();

    const sys1: System = (state: WorldState) => {
      state["foo"] = "bar";
    };

    const sys2: System = (state: WorldState) => {
      state["bar"] = "baz";
    };

    addSystem(sys1, sys2);

    step();

    expect(state["foo"]).toEqual("bar");
    expect(state["bar"]).toEqual("baz");
  });

  test("extend", async () => {
    const { query, createEntity } = createWorld();

    const Position = () => ({ x: 0, y: 0 });

    const ent = createEntity({ name: "foo" });

    const extended = extend(Position)({ x: 5, y: 15 });
    expect(extended.name).toEqual(Position.name);

    ent.addComponent(extended);

    expect(ent.components.length).toEqual(1);
    expect(ent.components[0].x).toEqual(5);

    // ensure query for "Position" still works:
    const movables = query({ and: [Position] });

    movables((results) => {
      expect(results.length).toEqual(1);
      expect(results[0].entity.components[0].x).toEqual(5);
    });
  });

  // test("query .onEntityAdded works", async () => {
  //   const { query, createEntity } = createWorld();

  //   const Position = () => ({ x: 0, y: 0 });

  //   const movables = query({ and: [Position] });

  //   let called = false;

  //   movables.onEntityAdded((entity) => {
  //     console.log("onentityadded", entity.id);
  //     called = true;
  //     expect(entity.components[0].x).toEqual(5);
  //   });

  //   const ent = createEntity({ name: "foo" });

  //   ent.addComponent(Position, { x: 5 });

  //   expect(called).toEqual(true);
  // });
});
