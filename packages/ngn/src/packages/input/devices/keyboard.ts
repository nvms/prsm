import { ButtonState } from "..";
import { KeyboardKey, KeyboardMapping, StandardKeyboard } from "./mappings/keyboard";

let keyboardMapping: KeyboardMapping = StandardKeyboard();

interface KeyboardState {
  keys: KeyToState;
}

type KeyToState = {
  [K in KeyboardKey]?: ButtonState;
};

const keyboardState: KeyboardState = { keys: {} };
const observedKeyboardState: KeyboardState = { keys: {} };
const keysDownLastFrame: KeyboardState = { keys: {} };

/**
 * The `keyboard` function returns an object with a `keyboard` property. This property is an object with methods to interact with the keyboard input.
 */
export const keyboard = () => ({
  /**
   * An object with methods to interact with the keyboard input.
   */
  keyboard: {
    /**
     * Set the keyboard mapping.
     * @param m A function that returns a `KeyboardMapping` object.
     */
    useMapping: (m: () => KeyboardMapping) => {
      keyboardMapping = m();
      setDefaultKeyboardState();
    },

    /**
     * Get the state of a key.
     * @param b The name of the key as a string.
     * @returns The state of the key as a `ButtonState` object.
     * If the key is not found or not pressed, the `pressed`, `justPressed`, and `justReleased` properties will be set to `false`.
     */
    getKey(b: string): ButtonState {
      const key = Object.keys(keyboardMapping)[Object.values(keyboardMapping).indexOf(b)];
      if (key) return keyboardState.keys[key];
      if (keyboardState.keys[b]) return keyboardState.keys[b];
      return { pressed: false, justPressed: false, justReleased: false };
    },
  },
});

/**
 * Updates the keyboard state by detecting changes in key presses and releases.
 *
 * @returns void
 */
export const keyboardUpdate = (): void => {
  for (const [key, value] of Object.entries(observedKeyboardState.keys)) {
    keyboardState.keys[key] = {
      ...value,
      justReleased: !value.pressed && keysDownLastFrame.keys?.[key]?.pressed,
    };
    keysDownLastFrame.keys[key] = { ...value, justPressed: false };
    observedKeyboardState.keys[key] = { ...value, justPressed: false };
  }
};

/**
 * Sets the default state for all keyboard keys in the keyboard state object
 */
export const setDefaultKeyboardState = (): void => {
  for (const key of Object.keys(keyboardMapping)) {
    keyboardState.keys[key] = {
      pressed: false,
      justPressed: false,
      justReleased: false,
    };
  }
};

/**
 * Function called on keydown event to update the observed keyboard state.
 * @param e The KeyboardEvent object containing the keydown event details.
 * @returns void
 */
export const onKeyDown = (e: KeyboardEvent): void => {
  if (e.repeat) return;
  observedKeyboardState.keys[e.code] = {
    pressed: true,
    justPressed: true,
    justReleased: false,
  };
};

/**
 * Function called on keyup event to update the observed keyboard state.
 * @param {KeyboardEvent} e - The event object containing details of the keyup event.
 * @returns {void}
 */
export const onKeyUp = (e: KeyboardEvent): void => {
  observedKeyboardState.keys[e.code] = {
    pressed: false,
    justPressed: false,
    justReleased: true,
  };
};
