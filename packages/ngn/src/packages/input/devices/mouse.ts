import { ButtonState } from "..";
import { MouseButton, MouseMapping, StandardMouse } from "./mappings/mouse";

let mouseMapping: MouseMapping = StandardMouse();

interface MouseState {
  axes: AxesToState;
  buttons: ButtonToState;
  position: { x: number; y: number };
  acceleration: number;
}

interface ObservedMouseState {
  buttons: ButtonToState;
}

type AxesToState = {
  [A in "0" | "1" | "2"]?: number;
};

type ButtonToState = {
  [B in MouseButton]?: ButtonState;
};

let mousemoveTimeout = null;
const mouseState: MouseState = { axes: {}, buttons: {}, position: { x: 0, y: 0 }, acceleration: 0 };
const observedMouseState: ObservedMouseState = { buttons: {} };
const buttonsDownLastFrame: ObservedMouseState = { buttons: {} };

/**
 * Updates the state of the mouse buttons and their respective justReleased and justPressed properties
 * @returns void
 */
export const mouseUpdate = (): void => {
  for (const [button, value] of Object.entries(observedMouseState.buttons)) {
    mouseState.buttons[button] = {
      ...value,
      justReleased: !value.pressed && buttonsDownLastFrame.buttons?.[button]?.pressed,
    };
    buttonsDownLastFrame.buttons[button] = { ...value, justPressed: false };
    observedMouseState.buttons[button] = { ...value, justPressed: false };
  }
};

let buttonNameMappingCache: { [key: string]: any } = {};
let axisNameMappingCache: { [key: string]: any } = {};

export const mouse = () => ({
  mouse: {
    useMapping: (m: () => MouseMapping) => {
      mouseMapping = m();
      buttonNameMappingCache = {};
      axisNameMappingCache = {};
      setDefaultMouseState();
    },
    getButton(b: string): ButtonState {
      // Get from cache.
      if (buttonNameMappingCache[b]) {
        return mouseState.buttons[buttonNameMappingCache[b]];
      }

      // Get from mapping.
      const button = Object.keys(mouseMapping.buttons)[Object.values(mouseMapping.buttons).indexOf(b)];

      if (button) {
        buttonNameMappingCache[b] = button;
        return mouseState.buttons[button];
      }

      if (mouseState.buttons[b]) return mouseState.buttons[b];
      return { pressed: false, justPressed: false, justReleased: false };
    },
    getAxis(a: string): number {
      if (axisNameMappingCache[a]) {
        return mouseState.axes[axisNameMappingCache[a]];
      }

      const ax = Object.keys(mouseMapping.axes)[Object.values(mouseMapping.axes).indexOf(a)];

      if (ax) {
        axisNameMappingCache[a] = ax;
        return mouseState.axes[ax];
      }
      if (mouseState.axes[a]) return mouseState.axes[a];
      return 0;
    },
    getPosition(): { x: number; y: number } {
      return mouseState.position;
    },
    getAcceleration(): number {
      return mouseState.acceleration;
    },
  },
});

export const setDefaultMouseState = () => {
  mouseState.axes = { "0": 0, "1": 0, "2": 0 };

  for (const key of Object.keys(mouseMapping.buttons)) {
    mouseState.buttons[key] = {
      pressed: false,
      justPressed: false,
      justReleased: false,
    };
  }
};

const drawAccel = () => {
  document.getElementById("accel").innerHTML = `${mouseState.axes[0]}, ${mouseState.axes[1]}`;
};

export const onMouseMove = (e: MouseEvent) => {
  clearTimeout(mousemoveTimeout);
  mousemoveTimeout = setTimeout(() => {
    mouseState.axes[0] = 0;
    mouseState.axes[1] = 0;
    mouseState.axes[2] = 0;
    // drawAccel();
  }, 30);

  mouseState.axes[0] = e.movementX;
  mouseState.axes[1] = e.movementY;
  mouseState.acceleration = Math.sqrt(e.movementX ** 2 + e.movementY ** 2);
  mouseState.position.x = e.clientX;
  mouseState.position.y = e.clientY;
  // drawAccel();
};

export const onMouseDown = (e: MouseEvent) => {
  observedMouseState.buttons[e.button] = {
    pressed: true,
    justPressed: true,
    justReleased: false,
  };
};

export const onMouseUp = (e: MouseEvent) => {
  observedMouseState.buttons[e.button] = {
    pressed: false,
    justPressed: false,
    justReleased: true,
  };
};

export const onMouseWheel = (e: WheelEvent) => {
  mouseState.axes[2] = e.deltaY;

  if (globalThis.requestAnimationFrame) {
    requestAnimationFrame(() => {
      mouseState.axes[2] = 0;
    });
  }
};
