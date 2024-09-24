import { gamepad as _gamepad, gamepadUpdate, onConnected as onGamepadConnected, onDisconnected as onGamepadDisconnected } from "./devices/gamepad";
import { keyboard as _keyboard, keyboardUpdate, onKeyDown, onKeyUp, setDefaultKeyboardState } from "./devices/keyboard";
import { GamepadMapping, PlayStation4, PlayStation5, SCUFVantage2, Xbox } from "./devices/mappings/gamepad";
import { KeyboardKey, KeyboardMapping, StandardKeyboard } from "./devices/mappings/keyboard";
import { MouseButton, MouseMapping, StandardMouse } from "./devices/mappings/mouse";
import { mouse as _mouse, mouseUpdate, onMouseDown, onMouseMove, onMouseUp, onMouseWheel, setDefaultMouseState } from "./devices/mouse";

export interface ButtonState {
  justPressed: boolean;
  pressed: boolean;
  justReleased: boolean;
}

export interface GamepadButtonState extends ButtonState {
  touched: boolean;
  value: number;
}

let boundEvents = false;

const setDefaultStates = () => {
  setDefaultKeyboardState();
  setDefaultMouseState();
};

export const inputSystem = (through: any) => {
  if (typeof window === "undefined") return through;

  if (!boundEvents) {
    bindEvents();
    setDefaultStates();
    boundEvents = true;
  }

  mouseUpdate();
  keyboardUpdate();
  gamepadUpdate();

  return through;
};

export const destroyInput = () => {
  destroyEvents();
  boundEvents = false;
};

const bindEvents = () => {
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("mousewheel", onMouseWheel);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("gamepadconnected", onGamepadConnected);
  window.addEventListener("gamepaddisconnected", onGamepadDisconnected);
};

const destroyEvents = () => {
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mousedown", onMouseDown);
  window.removeEventListener("mouseup", onMouseUp);
  window.removeEventListener("mousewheel", onMouseWheel);
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("gamepadconnected", onGamepadConnected);
  window.removeEventListener("gamepaddisconnected", onGamepadDisconnected);
};

export const keyboard = { ..._keyboard() };
export const mouse = { ..._mouse() };
export const gamepad = { ..._gamepad() };

export {
  GamepadMapping,
  SCUFVantage2,
  Xbox,
  PlayStation4,
  PlayStation5,
  KeyboardKey,
  KeyboardMapping,
  StandardKeyboard,
  MouseButton,
  MouseMapping,
  StandardMouse,
  onGamepadConnected,
  onGamepadDisconnected,
};
