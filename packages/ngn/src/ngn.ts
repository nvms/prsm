import { getCreateId } from "./ids";

const createId = getCreateId({ init: 0, len: 4 });

/**
 * entity.id -> component.name -> index of component in entity.components
 *
 * This map stores indices of components in the entity component array.
 * The purpose of this map is to allow for fast lookups of components in the
 * entity.components array (e.g. entity.getComponent()).
 */
export const $eciMap = Symbol();

/**
 * component.name -> array of entity.ids that have this component
 */
export const $ceMap = Symbol();
export const $eMap = Symbol();
export const $queryResults = Symbol();
export const $dirtyQueries = Symbol();
export const $queryDependencies = Symbol();
export const $systems = Symbol();
export const $running = Symbol();
export const $onEntityCreated = Symbol();
export const $mainLoop = Symbol();

export type Component = () => {};
export type ComponentInstance = () => {
  __ngn__?: {
    parent: string;
    name: string;
  };
} & {
  [key: string]: any;
};

export type QueryConfig = Readonly<
  Partial<{
    /** Matches entities as long as the entity has all of the components in the provided array. */
    and: Component[];
    /** Matches entities as long as the entity has at least one of the components in the provided array. */
    or: Component[];
    /** Matches entities as long as the entity has none of the components in the provided array. */
    not: Component[];
    /** Matches entities that have any of these tag strings. */
    tag: string[];
  }>
>;

export type Entity = Readonly<{
  id: string;
  components: ReturnType<ComponentInstance>[];
  addTag: (tag: string) => Entity;
  removeTag: () => Entity;
  getTag: () => string;
  addComponent: (component: Component, defaults?: object) => Entity;
  removeComponent: (component: Component) => Entity;
  getComponent: <T extends ComponentInstance>(arg: T) => ReturnType<T>;
  hasComponent: (component: Component) => boolean;
  destroy: () => void;
}>;

export type QueryResults = {
  results: {
    entity: Entity;
    [componentName: string]: any;
  }[];
};

export type SystemFn = (w: WorldState) => void;
export type SystemCls = { update: (w: WorldState) => void };
export type System = SystemCls | SystemFn;

export type WorldState = {
  [$eciMap]: { [key: number]: { [componentName: string]: number } };
  [$ceMap]: { [key: string]: string[] };
  [$eMap]: { [key: number]: any };
  [$dirtyQueries]: Set<string>;
  [$queryDependencies]: Map<string, Set<string>>;
  [$queryResults]: { [key: string]: QueryResults };
  [$systems]: ((w: WorldState) => void)[];
  [$mainLoop]: (w: WorldState) => void;
  time: {
    /** The total elapsed time in seconds since the game loop started. */
    elapsed: number;
    /** The time in milliseconds since the last frame. */
    delta: number;
    /** The time in milliseconds since the last time the main loop was called. */
    loopDelta: number;
    /** The time in milliseconds of the last call to the main loop. */
    lastLoopDelta: number;
    /** The time scale of the game loop. */
    scale: number;
    /** The current frames per second. */
    fps: number;
  };
  [$running]: boolean;
  [$onEntityCreated]: ((e: Entity) => void)[];
};

export const createWorld = () => {
  const state: WorldState = {
    [$eciMap]: {},
    [$ceMap]: {},
    [$eMap]: {},
    [$dirtyQueries]: new Set(),
    [$queryDependencies]: new Map(),
    [$queryResults]: {},
    [$systems]: [],
    [$mainLoop]: null,
    time: {
      elapsed: 0,
      delta: 0,
      loopDelta: 0,
      lastLoopDelta: 0,
      scale: 1,
      fps: 0,
    },
    [$running]: false,
    [$onEntityCreated]: [],
  };

  const defineMain = (callback: (w?: WorldState) => void) => {
    state[$mainLoop] = callback;
  };

  /**
   * start - starts the game loop.
   * @returns - a function to stop the loop.
   */
  const start = () => {
    let then = 0;
    let accumulator = 0;
    const boundLoop = handler.bind(start);
    let loopHandler = -1;
    const { time } = state;
    time.delta = 0;
    time.elapsed = 0;
    time.fps = 0;
    state[$running] = true;

    let raf: ((cb: FrameRequestCallback) => number) | null = null;
    let craf: ((handle: number) => void) | null = null;

    /**
     * Fake requestAnimationFrame and cancelAnimationFrame
     * so that we can run tests for this in node.
     */
    if (typeof window !== "undefined") {
      raf = requestAnimationFrame;
      craf = cancelAnimationFrame;
    } else {
      let now = 0;
      raf = (cb: FrameRequestCallback): number => {
        return setTimeout(() => {
          now += 16.67;
          cb(now);
        }, 16.67) as unknown as number;
      };

      craf = (id: number) => {
        clearTimeout(id);
      };
    }

    let xfps = 1;
    const xtimes = [];

    function handler(now: number) {
      if (!state[$running]) return craf(loopHandler);

      while (xtimes.length > 0 && xtimes[0] <= now - 1000) {
        xtimes.shift();
      }

      xtimes.push(now);
      xfps = xtimes.length;
      time.fps = xfps;

      time.delta = now - then;
      then = now;

      accumulator += time.delta * time.scale;

      // Calculate the threshold for stepping the world based on the current frame rate
      const stepThreshold = 1000 / (time.fps || 60);

      // Step the world only when the accumulated scaled time exceeds the threshold
      while (accumulator >= stepThreshold) {
        time.loopDelta = now - time.lastLoopDelta;
        time.lastLoopDelta = now;

        state[$mainLoop](state);
        accumulator -= stepThreshold;
      }

      time.elapsed += time.delta * 0.001;

      loopHandler = raf(boundLoop);
    }

    loopHandler = raf(boundLoop);

    return () => (state[$running] = false);
  };

  const stop = () => {
    state[$running] = false;
  };

  function step() {
    for (const system of state[$systems]) {
      system(state);
    }
  }

  /**
   * Adds one or more systems to the ECS world.
   * A system can be either a @see SystemFn or a @see SystemCls.
   * @param systems An array of system classes or functions.
   * @throws {Error} If a system is not a valid system class or function.
   */
  function addSystem(...systems: (SystemCls | SystemFn)[]) {
    for (const system of systems) {
      // If the system is a function, add it to the world systems array
      if (typeof system === "function") {
        state[$systems].push(system);
        // If the system has an `update` method, add that method to the world systems array
      } else if (system.update && typeof system.update === "function") {
        state[$systems].push(system.update);
        // If the system is not a valid system class or function, throw an error
      } else {
        throw new Error(`Not a valid system: ${JSON.stringify(system)}`);
      }
    }
  }

  /**
   * Removes one or more systems from the world.
   *
   * @param {...(SystemCls | SystemFn)[]} systems - The system or systems to remove.
   * @throws {TypeError} Throws an error if the system parameter is not a function or an object with an update function.
   * @returns {void}
   */
  function removeSystem(...systems: (SystemCls | SystemFn)[]): void {
    for (const system of systems) {
      if (typeof system === "function") {
        state[$systems] = state[$systems].filter((s) => s !== system);
      } else if (system.update && typeof system.update === "function") {
        state[$systems] = state[$systems].filter((s) => s !== system.update);
      } else {
        throw new TypeError("Parameter must be a function or an object with an update function.");
      }
    }
  }

  /**
   * Retrieves query results based on the given configuration and query name.
   * If non-dirty query results exist for this queryName, returns them. Otherwise, filters entities based on the queryConfig
   * and updates the state with the new query results before returning them.
   *
   * @param {QueryConfig} queryConfig - The configuration object containing 'and', 'or', 'not' and 'tag' arrays of component names.
   * @param {string} queryName - The name of the query to retrieve or update results for.
   * @returns {any[]} An array of result objects, each containing an entity and its components as properties.
   */
  const getQuery = (queryConfig: QueryConfig, queryName: string) => {
    // If we have non-dirty query results for this queryName, return them
    if (!state[$dirtyQueries].has(queryName) && state[$queryResults][queryName]) {
      return state[$queryResults][queryName].results;
    }

    const { and = [], or = [], not = [], tag = [] } = queryConfig;
    const entities: Entity[] = Object.values(state[$eMap]).filter((entity) => {
      return (
        (!not.length || !not.some((component) => entity.hasComponent(component))) &&
        (!and.length || and.every((component) => entity.hasComponent(component))) &&
        (!or.length || or.some((component) => entity.hasComponent(component))) &&
        (!tag.length || tag.some((t) => entity.tag === t))
      );
    });

    state[$queryResults][queryName] = {
      results: entities.map((entity) => {
        const result: any = { entity };

        entity.components.forEach((component) => {
          result[component.__ngn__.name] = component;
        });

        return result;
      }),
    };

    state[$dirtyQueries].delete(queryName);

    return state[$queryResults][queryName].results;
  };

  const markQueryDirty = (queryName: string) => {
    state[$dirtyQueries].add(queryName);
  };

  /**
   * Defines a query for filtering entities based on a combination of criteria.
   * @param queryConfig The configuration for the query. Contains and, or, not and tag criteria.
   * @throws {Error} Invalid query if any criteria in the query config does not have a 'name' property.
   * @returns A function that takes a query implementation and returns the results of the query.
   */
  const query = ({ and = [], or = [], not = [], tag = [] }: QueryConfig) => {
    // Checks if a criteria object has a 'name' property
    const validQuery = (c: Component) => Object.prototype.hasOwnProperty.call(c, "name");

    // Throws an error if any criteria object in the query config does not have a 'name' property
    if (![...and, ...or, ...not].every(validQuery)) throw new Error("Invalid query");

    // Constructs a string representing the query name based on the criteria in the query config
    const queryName = ["and", ...and.map((c) => c.name), "or", ...or.map((c) => c.name), "not", ...not.map((c) => c.name), "tag", ...tag].join("");

    // Component dependencies
    [...and, ...or, ...not].forEach((c) => {
      const dependencies = state[$queryDependencies].get(c.name) || new Set();
      dependencies.add(queryName);
      state[$queryDependencies].set(c.name, dependencies);
    });

    // Tag dependencies
    tag.forEach((t) => {
      const tagKey = `tag:${t}`;
      const dependencies = state[$queryDependencies].get(tagKey) || new Set();
      dependencies.add(queryName);
      state[$queryDependencies].set(tagKey, dependencies);
    });

    return (queryImpl: (results: { entity: Entity }[]) => void) => queryImpl(getQuery({ and, or, not, tag }, queryName));
  };

  function destroyEntity(e: Entity) {
    const exists = state[$eMap][e.id];

    if (!exists) return false;

    const componentsToRemove: string[] = Object.keys(state[$eciMap][e.id]);

    componentsToRemove.forEach((componentName) => {
      state[$ceMap][componentName] = state[$ceMap][componentName].filter((id) => id !== e.id);
    });

    delete state[$eciMap][e.id];
    delete state[$eMap][e.id];

    componentsToRemove.forEach((componentName) => {
      const affectedQueries = state[$queryDependencies].get(componentName);

      if (affectedQueries) {
        affectedQueries.forEach(markQueryDirty);
      }
    });

    return true;
  }

  function onEntityCreated(fn: any) {
    if (typeof fn !== "function") return;

    state[$onEntityCreated].push(fn);

    return () => {
      state[$onEntityCreated] = state[$onEntityCreated].filter((f) => f !== fn);
    };
  }

  /**
   * Creates a new component for the given entity and adds it to the world.
   * @param entity The entity to add the component to.
   * @param component The component function to add.
   * @param defaults (optional) Default values to apply to the component.
   * @returns The modified entity with the new component added.
   */
  function createComponent(entity: Entity, component: Function, defaults: object = {}): Entity {
    // If the entity already has this component, return the unmodified entity.
    if (state[$eciMap]?.[entity.id]?.[component.name] !== undefined) return entity;

    const affectedQueries = state[$queryDependencies].get(component.name);

    if (affectedQueries) {
      affectedQueries.forEach(markQueryDirty);
    }

    const componentInstance = component();

    if (componentInstance.onAttach && typeof componentInstance.onAttach === "function") {
      componentInstance.onAttach(entity);
    }

    // Create the component, assigning defaults and a reference to the parent entity.
    entity.components.push(
      Object.assign(
        {},
        {
          ...componentInstance,
          ...defaults,
          __ngn__: {
            parent: entity.id,
            name: component.name,
          },
        },
      ) as ComponentInstance,
    );

    // Add the component index to the entity's index map.
    state[$eciMap][entity.id] = state[$eciMap][entity.id] || {};
    state[$eciMap][entity.id][component.name] = entity.components.length - 1;

    // Add the entity to the component's entity map.
    state[$ceMap][component.name] = state[$ceMap][component.name] || [];
    state[$ceMap][component.name].push(entity.id);

    return entity;
  }

  /**
   * Creates an entity with the given specification object.
   * @param {object} spec - Optional data to be stored on the entity.
   * @returns {any} - Returns the created entity.
   */
  function createEntity<T>(spec: T & { id?: string } = {} as T): T & Entity {
    const id = spec.id ?? createId();
    const components: any[] = [];

    const tagKey = (t: string) => `tag:${t}`;

    function updateTagQueries(tagKey: string) {
      const affectedQueries = state[$queryDependencies].get(tagKey);

      if (affectedQueries) {
        affectedQueries.forEach(markQueryDirty);
      }
    }

    function addTag(t: string): Entity {
      const previousTagKey = tagKey(this.tag);

      this.tag = t;

      updateTagQueries(tagKey(t));
      updateTagQueries(previousTagKey);

      return this;
    }

    function removeTag(): Entity {
      const previousTagKey = tagKey(this.tag);
      this.tag = "";

      updateTagQueries(previousTagKey);

      return this;
    }

    function getTag() {
      return this.tag;
    }

    function addComponent(c: Component, defaults = {}) {
      return createComponent(this, c, defaults);
    }

    function hasComponent(component: Component) {
      return state[$eciMap]?.[id]?.[component.name] !== undefined;
    }

    function getComponent<T extends ComponentInstance>(arg: T): ReturnType<T> {
      const index = state[$eciMap][id][arg.name];
      return components[index];
    }

    /**
     * Removes the specified component from the entity and updates the world state accordingly.
     *
     * @param component The component to remove from the entity.
     * @returns The modified entity.
     */
    function removeComponent(component: Component | string): Entity {
      const name = typeof component === "string" ? component : component.name;

      const componentInstance = getComponent(typeof component === "string" ? ({ name } as any) : component);

      if (componentInstance && componentInstance.onDetach && typeof componentInstance.onDetach === "function") {
        componentInstance.onDetach(this);
      }

      const affectedQueries = state[$queryDependencies].get(name);

      if (affectedQueries) {
        affectedQueries.forEach(markQueryDirty);
      }

      // Set the entity's component index for the specified component to undefined.
      state[$eciMap][id][name] = undefined;

      // Remove the entity's ID from the component's entity list.
      state[$ceMap][name] = state[$ceMap][name].filter((e) => e !== id);

      // Remove the component from the entity's component list.
      const index = state[$eciMap][id][name];
      components.splice(index, 1);

      // Update the entity's component indices for all components after the removed component.
      Object.keys(state[$eciMap][id]).forEach((componentName) => {
        if (state[$eciMap][id][componentName] > components.findIndex((c) => c.name === componentName)) {
          state[$eciMap][id][componentName]--;
        }
      });

      // Return the modified entity.
      return this;
    }

    function destroy() {
      return destroyEntity(this);
    }

    const entity = Object.assign({}, spec, {
      id,
      components,
      addTag,
      removeTag,
      getTag,
      addComponent,
      hasComponent,
      getComponent,
      removeComponent,
      destroy,
    });

    // If we are focing a specific entity id, we need to migrate any
    // entity that might already occupy this space.
    if (spec.id !== undefined && state[$eMap][spec.id]) {
      migrateEntityId(spec.id, createId());
    }

    state[$eMap][id] = entity;
    state[$eciMap][id] = {};

    state[$onEntityCreated].forEach((fn) => {
      fn(entity);
    });

    return entity as unknown as T & Entity;
  }

  /**
   * migrateEntityId updates the id of an entity in the world, and all
   * associated world maps.
   * @param oldId The id of the entity to migrate.
   * @param newId The id to migrate the entity to.
   */
  function migrateEntityId(oldId: string, newId: string) {
    const entity = state[$eMap][oldId];

    if (!entity) return;

    entity.id = newId;

    state[$eMap][newId] = entity;
    delete state[$eMap][oldId];

    state[$eciMap][newId] = state[$eciMap][oldId];
    delete state[$eciMap][oldId];
  }

  function getEntity(id: string): Entity {
    return state[$eMap][id];
  }

  return {
    state,
    query,
    createEntity,
    getEntity,
    onEntityCreated,
    addSystem,
    removeSystem,
    start,
    stop,
    step,
    defineMain,
  };
};
