import { GamepadButtonState } from "..";
import { GamepadMapping, PlayStation5, SCUFVantage2, Xbox } from "./mappings/gamepad";

interface GamepadState {
  axes: {
    0: number;
    1: number;
    2: number;
    3: number;
  };
  buttons: {
    [key: string]: GamepadButtonState;
  };
}

type RumbleOptions = {
  duration?: number;
  startDelay?: number;
  strongMagnitude?: number;
  weakMagnitude?: number;
};

const gamepadMapping = {};
const gamepadState: GamepadState = { axes: { 0: 0, 1: 0, 2: 0, 3: 0 }, buttons: {} };
const buttonsDownLastFrame = {};

const deadzone = 0.055;

/**
 * Squashes a number to either 0 or 1 if the absolute value of the number
 * is less than a specified deadzone. Otherwise, the original number is returned.
 * @param number - The number to squash.
 * @param deadzone - The deadzone threshold. Default is 0.5.
 * @returns Either the original number, 0, or 1 depending on the value of the deadzone.
 */
const squash = (number) => (Math.abs(number) >= deadzone ? number : Math.abs(number) < deadzone ? 0 : 1);

export const gamepadUpdate = () => {
  for (const pad of navigator.getGamepads()) {
    if (!pad) continue;

    gamepadState[pad.index] = {
      axes: {
        0: squash(pad.axes[0]),
        1: squash(pad.axes[1]),
        2: squash(pad.axes[2]),
        3: squash(pad.axes[3]),
      },
      buttons: {},
    };

    for (const [buttonIndex, button] of Object.entries(pad.buttons)) {
      gamepadState[pad.index].buttons[buttonIndex] = {
        pressed: button.pressed,
        touched: button.touched,
        value: button.value,
        justPressed: button.pressed && !buttonsDownLastFrame?.[pad.index]?.buttons?.[buttonIndex]?.pressed && !buttonsDownLastFrame?.[pad.index]?.buttons?.[buttonIndex]?.justPressed,
        justReleased: !button.pressed && buttonsDownLastFrame?.[pad.index]?.buttons?.[buttonIndex]?.pressed,
      };
    }

    for (const [buttonIndex, button] of Object.entries(gamepadState[pad.index]?.buttons)) {
      buttonsDownLastFrame[pad.index].buttons[buttonIndex] = {
        ...(button as any),
        justPressed: false,
      };
    }
  }
};

export const gamepad = () => ({
  gamepad(index: number) {
    if (!gamepadMapping[index]) reasonablyAssignMapping(navigator.getGamepads()[index]);

    return {
      /**
       * The gamepad object from the navigator at the specified index.
       */
      get device() {
        return navigator.getGamepads()[index];
      },

      rumble: (options: RumbleOptions) => {
        const { duration = 1000, startDelay = 0, strongMagnitude = 1.0, weakMagnitude = 1.0 } = options;

        const pad = navigator.getGamepads()[index];

        if ("vibrationActuator" in pad && pad.vibrationActuator) {
          pad.vibrationActuator.playEffect("dual-rumble", {
            startDelay,
            duration,
            strongMagnitude,
            weakMagnitude,
          });
        }
      },

      /**
       * Sets the gamepad mapping at the specified index using the provided function that returns a GamepadMapping object.
       *
       * @param m - A function that returns a GamepadMapping object.
       */
      useMapping: (m: () => GamepadMapping) => (gamepadMapping[index] = m()),
      /**
       * Returns the gamepad button state.
       * @param {string} b - Gamepad button name.
       * @returns {object} - Object containing information about the button state.
       */
      getButton(b: string): GamepadButtonState {
        if (!gamepadState[index])
          return {
            pressed: false,
            touched: false,
            value: 0,
            justPressed: false,
            justReleased: false,
          };
        const button = Object.keys(gamepadMapping[index].buttons)[Object.values(gamepadMapping[index].buttons).indexOf(b)];
        if (gamepadState[index].buttons[button]) return gamepadState[index].buttons[button];
        return {
          pressed: false,
          touched: false,
          value: 0,
          justPressed: false,
          justReleased: false,
        };
      },
      /**
       * Returns the value of a given axis on the gamepad.
       * @param a - The name of the axis to retrieve.
       * @returns The value of the given axis. Returns 0 if the gamepad state is not available or the axis value is not found.
       */
      getAxis(a: string): number {
        if (!gamepadState[index]) return 0;
        const ax = Object.keys(gamepadMapping[index].axes)[Object.values(gamepadMapping[index].axes).indexOf(a)];
        if (gamepadState[index].axes[ax]) return gamepadState[index].axes[ax];
        return 0;
      },
    };
  },
});

/**
 * Assigns a gamepad mapping based on the gamepad type. Reasonably assigns defaults.
 *
 * @param g - The gamepad to assign a mapping for.
 *
 * @returns void.
 */
const reasonablyAssignMapping = (g: Gamepad): void => {
  if (!g) return;

  const id = g.id.toLowerCase();
  const controllerTypes = [
    { ids: ["sony", "playstation"], mapping: PlayStation5 },
    { ids: ["xbox"], mapping: Xbox },
    { ids: ["scuf"], mapping: SCUFVantage2 },
  ];

  const controllerType = controllerTypes.find((type) => type.ids.some((controllerId) => id.includes(controllerId)));

  if (controllerType) {
    gamepadMapping[g.index] = controllerType.mapping();
  } else {
    console.warn(`couldn't reasonably find a mapping for controller with id ${g.id} - defaulting to xbox mapping.`);
    gamepadMapping[g.index] = Xbox();
  }
};

/**
 * Sets the default state for a gamepad by initializing the axes and buttons objects to empty objects.
 * @param index - The index of the gamepad to set the default state for.
 * @returns void
 */
export const setDefaultGamepadState = (index: number): void => {
  gamepadState[index] = { axes: {}, buttons: {} };
  buttonsDownLastFrame[index] = { axes: {}, buttons: {} };
};

const connectedCallbacks = [];
const disconnectedCallbacks = [];

export const onGamepadConnected = (callback: (e: GamepadEvent) => void) => {
  connectedCallbacks.push(callback);
};

export const onGamepadDisconnected = (callback: (e: GamepadEvent) => void) => {
  disconnectedCallbacks.push(callback);
};

// Internal
export const onConnected = (e: GamepadEvent): void => {
  connectedCallbacks.forEach((cb) => cb(e));
  setDefaultGamepadState(e.gamepad.index);
};

// Internal
export const onDisconnected = (e: GamepadEvent): void => {
  disconnectedCallbacks.forEach((cb) => cb(e));
  delete gamepadState[e.gamepad.index];
  delete buttonsDownLastFrame[e.gamepad.index];
};
