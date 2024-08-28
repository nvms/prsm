# ngn

An ECS framework (and robust input system) for the web.

<!-- vim-markdown-toc GFM -->

- [Comprehensive sample](#comprehensive-sample)
- [Installation](#installation)
- [API overview](#api-overview)
  - [createWorld](#createworld)
    - [Entities](#entities)
    - [Components](#components)
      - [Extending components](#extending-components)
  - [Extras](#extras)
    - [Keyboard, mouse and gamepad input](#keyboard-mouse-and-gamepad-input)
      - [Input system](#input-system)
      - [ButtonState](#buttonstate)
      - [Mouse](#mouse)
      - [Keyboard](#keyboard)
      - [Gamepad](#gamepad)
      - [Input usage examples](#input-usage-examples)
        - [Gamepad](#gamepad-1)
        - [Keyboard](#keyboard-1)
        - [Mouse](#mouse-1)
    - [Expiring log system](#expiring-log-system)

<!-- vim-markdown-toc -->

# Comprehensive sample

```typescript
import { createWorld, type WorldState } from "@prsm/ngn";
import {
  inputSystem,
  gamepad,
  GamepadMapping,
  SCUFVantage2,
  onGamepadConnected,
} from "@prsm/ngn/input";

// Create a mapping with unique button/key names.
const MyMapping = (): GamepadMapping => {
  return Object.assign(SCUFVantage2(), {
    axes: {
      2: "LookHorizontal",
      3: "LookVertical",
    },
    buttons: {
      0: "Sprint", // X
      2: "Jump", // ■
      3: "Action", // ▲
    },
  });
};

// Assign this mapping to gamepads when they connect.
onGamepadConnected((e: GamepadEvent) => {
  gamepad(e.gamepad.index).useMapping(MyMapping);
});

// Create a world
const {
  state,
  query,
  createEntity,
  addSystem,
  start,
  step,
  defineMain,
} = createWorld();

// Create components
const Position = () => ({ x: 0, y: 0 });
const Velocity = () => ({ x: 0, y: 0 });
const Alive = () => ({});
const Dead = () => ({});

// Create entities
const player =
  createEntity()
    .addComponent(Position)
    .addComponent(Velocity)
    .addComponent(Alive)
    .addTag("player");

Array
  .from(Array(50))
  .forEach((i) =>
    createEntity({ name: `monster ${i}`, hp: 100 })
      .addComponent(Position)
      .addComponent(Velocity)
      .addComponent(Alive)
      .addTag("monster");

// Create queries
const movables = query({ and: [Position, Velocity] });
const livingMonsters = query({ tag: ["monster"], and: [Alive] });
const deadOrAliveMonsters = query({ tag: ["monster"], or: [Dead, Alive] });

// Create systems
const moveSystem = (_: WorldState) => {
  movables((results) => {
    results.forEach(({ entity, Position, Velocity }) => {
      Position.x += Velocity.x;
      Position.y += Velocity.y;
    });
  });
};

const monsterDeathSystem = (_: WorldState) => {
  livingMonsters((results) => {
    results.forEach(({ entity }) => {
      if (entity.hp <= 0) {
        entity.removeComponent(Alive);
      }
    })
  });

  // Just for demonstration of 'or' query results:
  deadOrAliveMonsters((results) => {
    // Since this query uses 'or', `Dead` OR `Alive` will be
    // present on the results. You will need to check for existence:
    results.forEach(({ entity, Dead, Alive }) => {
      if (Dead) { }
      if (Alive) { }
    });
  });
};

const gravitySystem = (w: WorldState) => {
  movables((results) => {
    results.
      forEach(({ Velocity }) => {
        Velocity.y += 4.9 * w.time.delta;
      })
  });
};

const playerControlSystem = (_: WorldState) => {
  if (gamepad(0).getButton("Jump").justPressed) {
    player.getComponent(Velocity).y = 1;
  }
};

// Add or remove systems at any time
addSystem(inputSystem, moveSystem, monsterDeathSystem);

// Finally, define your main entry point with `defineMain`:
defineMain(() => {
  // Once `start` is called, this will be called every frame.

  // Call `step` to call each registered system, passing the state of the world to each.
  //
  // This is intentionally handled by *you*, because there's a good chance
  // you'd prefer to dictate the order of execution here.
  step();
});

start();
```

# Installation

```bash
npm install @prsm/ngn
```

# API overview

## createWorld

```typescript
const { state, createEntity, getEntity, onEntityCreated, query, addSystem, removeSystem, start, stop, step } = createWorld();
```

- **`state`**

  - Stores all the entities.
  - Tracks relationships between entities and components for fast lookups.
  - Tracks query dependencies and caches results.
  - Is passed to all systems (if you use ngn's system mechanics, which is optional).
  - Contains a useful `time` object that looks like:

  * `state.time.delta` - time since last frame in ms, unaffected by scale.
  * `state.time.loopDelta` - time since last call to main game loop, affected by sclae. useful for calculations involving time and scale.
  * `state.time.scale` - time scale. (default: `1`, valid: `0.1 - 1`).
    - Does not affect framerate at all. The scale determines how often to call the main game loop (if you use choose to use ngn's ticker). On a 60hz display, at a scale of 1, the main game loop is called every 16~ms, and every 33~ms at a scale of 0.5.
  * `state.time.elapsed` - time since `start` was called in ms.
  * `state.time.fps` - frames per second.

This table may help provide clarity to the behavior of `time.scale`.

| scale | fps | delta | loopDelta |
| ----- | --- | ----- | --------- |
| 1     | 120 | 8.33  | 8.33      |
| 0.5   | 120 | 8.33  | 16.66     |
| 0.1   | 120 | 8.33  | 83.33     |

### Entities

- **`World > createEntity`**

  ```typescript
  const { id, addTag, removeTag, getTag, addComponent, hasComponent, getComponent, removeComponent, destroy } = createEntity({ optional: "default values" });
  ```

  **Forcefully setting the entity ID**

  You can forcefully set the entity ID by providing it as one of the properties of the object passed to `createEntity`. This is a feature that's probably not very useful in the context of this library alone, but this is a critical feature that `@prsm/ngn-net` relies on. An authoritative game server must be able to assign IDs to entities.

  ```typescript
  // IDs are not numbers, but this example serves to
  // illustrate a behavior.

  // This entity will have id 1 (not really, but go with it).
  const firstEntity = createEntity();
  // Now this entity has id 1, and `firstEntity` has id 2.
  const secondEntity = createEntity({ id: 1 });
  // This entity has id 3.
  const thirdEntity = createEntity();
  ```

  - **`Entity > addTag`**

    Adds a tag to the entity. Tags are only useful for querying entities. An entity can only have one tag.

    ```typescript
    entity.addTag("coin");
    ```

  - **`Entity > removeTag`**

    Removes the tag from the entity.

    ```typescript
    entity.removeTag();
    ```

  - **`Entity > getTag`**

    Returns the tag of the entity.

    ```typescript
    const tag = entity.getTag();
    ```

  - **`Entity > destroy`**

    Destroys the entity. Removes it from the world.

    ```typescript
    entity.destroy();
    ```

- **`World > getEntity`**

  Returns the entity with the given ID.

  ```typescript
  const entity = getEntity("ngnluxhlpj30271be3f727d31");
  ```

### Components

- **`Entity > addComponent`**

  Adds a component to the entity. Components are functions that return an object.
  An entity can only have one of each type of a component. Components are just stored
  as an array of objects on the entity.

  ```typescript
  const Position = () => ({ x: 50, y: 50 });
  const Velocity = () => ({ x: 0, y: 0 });
  entity.addComponent(Position).addComponent(Velocity);

  // entity:
  // {
  //   ...,
  //   components: [
  //     { x: 50, y: 50 }, <-- Position
  //     { x: 0, y: 0 },   <-- Velocity
  //   ],
  // }
  ```

  If the object returned by the component function includes an `onAttach` function, it is called at this time.

  ```typescript
  const MeshComponent = () => ({
    entityId: null,
    mesh: null,
    onAttach(entity: Entity) {
      this.entityId = entity.id;
    },
  });
  ```

  You can override default values:

  ```typescript
  entity.addComponent(Position, { y: 10 });

  // entity:
  // {
  //   ...,
  //   components: [
  //     { x: 50, y: 10 }, <-- Position
  //   ],
  // }
  ```

- **`Entity > hasComponent`**

  Returns `true` if the entity has the component.

  ```typescript
  const hasPosition = entity.hasComponent(Position);
  ```

- **`Entity > getComponent`**

  Returns the component of the entity.

  ```typescript
  const position = entity.getComponent<typeof Position>(Position);
  ```

- **`Entity > removeComponent`**

  Removes the component from the entity. Provide either the component function or the string name of the component (`.name` property).

  ```typescript
  entity.removeComponent(Position);
  // is the same as:
  entity.removeComponent("Position");
  ```

  If the object returned by the component function includes an `onDetach` function, it is called at this time.

  ```typescript
  const MeshComponent = () => ({
    mesh: null,
    onDetach(entity: Entity) {
      if (mesh) {
        dispose(mesh);
      }
    },
  });
  ```

#### Extending components

Occasionally you will want to override the component defaults when instantiating a component.

You can do something like `addComponent(Position, { y: CURRENT_Y })`, but for something more generic you can `extend` the component:

```typescript
import { extend } from "@prsm/ngn";

const Health = () => ({ max: 100 });
const WarriorHealth = extend(Health)({ max: 200 });
const MageHealth = extend(Health)({ max: 75 });

// Internally, `WarriorHealth` and `MageHealth` are still
// identified as a `Health` components.
// This means that queries that match against `Health` will be updated
// to include anything that has `WarriorHealth` or `MageHealth`.

warriorEntity.addComponent(WarriorHealth));

const mortals = query({ and: [Health] });

mortals((results) => {
  // results includes warriorEntity
});
```

- **`World > query`**

  Queries the world for entities with the given tags and components.

  `query` returns a function that accepts a callback. The callback is immediately called
  with an array of results. Each result is an object that contains an `entity` key, and a key
  for each component that is found on the entity.

  `query` accepts an object with the following properties:

  ```typescript
  {
    and: [], // matched Entities will have all of these components
    or: [], // matched Entities will have any of these components
    not: [], // matched Entities will have none of these components
    tags: [], // matched Entities will have any of these tags
  }
  ```

  ```typescript
  createEntity().addComponent(Position).addComponent(Velocity);
  createEntity().addComponent(Position).addComponent(Velocity).addComponent(Dead);

  const movables = query({ and: [Position, Velocity], not: [Dead] });

  movables((results) => {
    results.forEach(({ Position, Velocity }) => {
      Position.x += Velocity.x;
      Position.y += Velocity.y;
    });
  });
  ```

  For optimum performance, query results are cached while entity state is clean. When an entity is created, destroyed, or has a component added or removed, the cache is invalidated.

- **`World > addSystem`**

  Adds a system to the world. Systems are either:

  - A function that receives the `WorldState` as its only argument.
  - An object with an `update` function that receives the `WorldState` as its only argument.
  - An instance of a class that has an `update` function that receives the `WorldState` as its only argument.

  None of these need to return anything, and the `WorldState` they receive is mutable.

  Systems are called in the order they were added.

  ```typescript
  const MovementSystem = (state: WorldState) => {};
  addSystem(MovementSystem);

  const MovementSystem = { update: (state: WorldState) => {} };
  addSystem(MovementSystem);

  class MovementSystem {
    update(state: WorldState) {}
  }
  addSystem(new MovementSystem());
  ```

- **`World > removeSystem`**

  Removes a system from the world. Preserves the order of the remaining systems.

  ```typescript
  removeSystem(movableSystem);
  ```

  **`World > defineMain`**

  Defines the main program loop. The callback will be called every frame once `start` is called.

  ```typescript
  defineMain(() => {
    // ..
  });
  ```

- **`World > start`**

  Starts the main program loop. Does not do anything other than call
  the callback provided to `defineMain`.

  You can use your own loop instead of this one if you prefer, but the builtin loop does things like calculate fps and frame delta for you. These values are stored in `state.time`. If you create your own loop, it would be a good idea to calculate these values yourself and populate `state.time` with them.

  ```typescript
  start();
  ```

- **`World > stop`**

  Stops the main program loop (which was defined by passing it to `defineMain`).

  ```typescript
  // if gameover, or something
  stop();
  ```

- **`World > step`**

  Calls all systems once. Passes the `WorldState` to each system. You should do this in your main program loop, e.g.:

  ```typescript
  const main = () => {
    step();
  };

  defineMain(main);

  start();

  // later on:
  stop();
  ```

## Extras

Some _completely optional_ extras are provided.

### Keyboard, mouse and gamepad input

#### Input system

This input system recognizes keyboard, mouse and gamepad input and has a simple API.

There is a provided input system that is responsible for deriving the state of devices from their inputs. Import it, and make sure it's called _before_ any systems that depend on the latest input state.

```typescript
import { inputSystem } from "@prsm/ngn/input";

world.addSystem(inputSystem);
```

#### ButtonState

For keyboard and mouse devices, the state of a button is represented as a `ButtonState` object:

```typescript
export interface ButtonState {
  // This is true for one frame only.
  justPressed: boolean;
  // This is true for as long as the button is being pressed.
  pressed: boolean;
  // This is true for one frame only.
  justReleased: boolean;
}
```

Gamepad button state is represented as a `GamepadButtonState` object:

```typescript
export interface GamepadButtonState extends ButtonState {
  // This is true for as long as the button is being touched (e.g. the touchpad on a PS5 controller)
  touched: boolean;
  // This is the value of the button, between 0 and 1. For triggers, this is the amount the trigger is pressed.
  value: number;
}
```

#### Mouse

```typescript
import { mouse } from "@prsm/ngn/input";
```

- `useMapping`

  ```typescript
  mouse.useMapping(m: MouseMapping): void
  ```

  Defines a human-readable mapping to mouse buttons and axes.

  By default, the [`StandardMouse`](./src/packages/input/devices/mappings/mouse.ts) mapping is used and you probably don't need to call this.

- `getButton`

  ```typescript
  mouse.getButton(): ButtonState
  ```

  Returns the state of a mouse button, e.g.:

  ```typescript
  const { pressed, justPressed, justReleased } = mouse.getButton("Mouse1");
  ```

- `getAxis`

  ```typescript
  mouse.getAxis(axis: string): number
  ```

  Returns the value of a mouse axis.
  With the `StandardMouse` mapping, the axes are: `Horizontal`, `Vertical`, and `Wheel`.

- `getPosition`

  ```typescript
  mouse.getPosition(): { x: number, y: number }
  ```

  Returns the position of the mouse relative to the window.

- `getAcceleration`

  ```typescript
  mouse.getAcceleration(): number
  ```

  Returns the acceleration of the mouse.

#### Keyboard

```typescript
import { keyboard } from "@prsm/ngn/input";
```

- `useMapping`

  ```typescript
  keyboard.useMapping(m: KeyboardMapping): void
  ```

  Defines a human-readable mapping to keyboard keys.

  By default, the [`StandardKeyboard`](./src/packages/input/devices/mappings/keyboard.ts) mapping is used and you probably don't need to call this, unless you want to rename some keys:

  ```typescript
  import { StandardKeyboard } from "@prsm/ngn";

  const MyKeyboardMapping = (): KeyboardMapping => {
    return {
      ...StandardKeyboard(),
      [KeyboardKey.Space]: "Jump",
      [KeyboardKey.KeyC]: "FireLazerz",
    };
  };

  keyboard.useMapping(MyKeyboardMapping);
  keyboard.getKey("FireLazerz");
  ```

- `getKey`

  ```typescript
  keyboard.getKey(b: string): ButtonState
  ```

  Returns the state of a keyboard key. The key should be the human readable name value defined in the mapping used.

#### Gamepad

```typescript
import { gamepad } from "@prsm/ngn/input";
```

- `useMapping`

  ```typescript
  gamepad(index: number).useMapping(m: GamepadMapping): void
  ```

  Defines a human-readable mapping to gamepad buttons and axes.

  The default mapping is assigned by inspecting the `Gamepad.id` property.

  You can see all of the built-in mappings [`here`](./src/packages/input/devices/mappings/gamepad.ts), which includes mappings for PlayStation5, Xbox, and SCUF Vantage 2 controllers.

  _PRs that add additional mappings are welcome_!

- `getButton`

  ```typescript
  gamepad(index: number).getButton(button: string): GamepadButtonState
  ```

  Returns the state of a gamepad button.

- `getAxis`

  ```typescript
  gamepad(index: number).getAxis(axis: string): number
  ```

  Returns the value of a gamepad axis.

  ```typescript
  if (gamepad(0).getAxis("Look") < 0) {
    /* Left */
  }
  ```

- `device`

  ```typescript
  gamepad(index: number).device: Gamepad
  ```

  Returns the Gamepad object from the navigator at the provided index.

- `rumble`

  ```typescript
  gamepad(index: number).rumble(options: RumbleOptions): void
  ```

  Rumble the device.

  ```typescript
  gamepad(1).rumble({
    startDelay: 0,
    duration: 500,
    strongMagnitude: 1.0,
    weakMagnitude: 1.0,
  });
  ```

#### Input usage examples

##### Gamepad

```typescript
import { keyboard, mouse, gamepad } from "@prsm/ngn/input";

if (gamepad(0).getAxis("Look") < 0) {
  /* Left */
}
if (gamepad(0).getAxis("Look") > 0) {
  /* Right */
}

gamepad(1).rumble({
  startDelay: 0,
  duration: 500,
  strongMagnitude: 1.0,
  weakMagnitude: 1.0,
});
```

##### Keyboard

```typescript
import { keyboard } from "@prsm/ngn/input";

if (keyboard.getKey("Space").justPressed) {
  /* Jump! */
}
```

##### Mouse

```typescript
import { mouse } from "@prsm/ngn/input";

if (mouse.getAxis("Wheel")) {
  /* Scrolling */
}
if (mouse.getAcceleration() > 5) {
  /* Woah, slow down */
}
```

### Expiring log system

- **`logSystem`**

  This log system takes advantage of `state.time.delta` to expire log entries over
  time. By default, this is 10 seconds, but this is configurable.

  The whole point of this system is to draw debug messages to a canvas, but have them disappear after a while.

  ```typescript
  import { createLogSystem, type WorldState } from "@prsm/ngn";

  const logSystem = createLogSystem({ maxLifetime: 5_000 });

  const logDrawSystem = (state: WorldState) => {
    logSystem.expiringLogs.forEach(({ message }, index) => {
      drawTextToCanvas(message, { x: 0, y: index * 20 });
    });

    logSystem.update(state);
  };

  addSystem(logDrawSystem);

  logSystem.log("some useful debug message");
  ```
