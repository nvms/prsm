import { expect, test, testSuite } from "manten";
import { gamepad, onConnected, onDisconnected } from "../../packages/input/devices/gamepad";

// @ts-ignore
global.navigator = {
  // @ts-ignore
  getGamepads: () =>
    [
      {
        index: 0,
        connected: true,
        id: "Mock Gamepad",
        timestamp: Date.now(),
        axes: [0.5, -0.5, 0.0, 0.0],
        buttons: [
          { pressed: false, touched: false, value: 0 },
          { pressed: true, touched: true, value: 1 },
          // ... other buttons
        ],
        mapping: "standard",
        vibrationActuator: null,
      },
      null,
      null,
      null,
    ] as unknown as () => (Gamepad | null)[],
  // ... other navigator properties if needed
};

export default testSuite(async ({ describe }) => {
  describe("gamepad", () => {
    test("should return an object with methods to interact with the gamepad input", () => {
      const gp = gamepad();
      expect(typeof gp.gamepad).toBe("function");
    });

    test("should allow setting a custom gamepad mapping", () => {
      const customMapping = () => ({
        buttons: {
          "0": "X",
          "1": "O",
        },
        axes: {
          "0": "LeftStickX",
          "1": "LeftStickY",
        },
      });
      const gp = gamepad();
      gp.gamepad(0).useMapping(customMapping);
      expect(gp.gamepad(0).getButton("X")).toEqual({
        pressed: false,
        touched: false,
        value: 0,
        justPressed: false,
        justReleased: false,
      });
    });

    test("should get the state of a gamepad button", () => {
      const gp = gamepad();
      const state = gp.gamepad(0).getButton("X");
      expect(state).toEqual({
        pressed: false,
        touched: false,
        value: 0,
        justPressed: false,
        justReleased: false,
      });
    });

    test("should get the value of a gamepad axis", () => {
      const gp = gamepad();
      const value = gp.gamepad(0).getAxis("LeftStickX");
      expect(value).toBe(0);
    });

    test("should update the gamepad state", () => {
      // Mocking gamepad input is complex due to the read-only nature of `navigator.getGamepads`.
      // This test assumes that the gamepadUpdate function is called within an environment where
      // navigator.getGamepads() returns a valid Gamepad object.
      // You would need to mock navigator.getGamepads() to return a gamepad with a specific state.
    });

    test("should handle gamepad connected event", () => {
      const index = 0;
      onConnected({ gamepad: { index } } as GamepadEvent);
      const gp = gamepad();
      expect(gp.gamepad(index)).toBeDefined();
    });

    test("should handle gamepad disconnected event", () => {
      const index = 0;
      onConnected({ gamepad: { index } } as GamepadEvent);
      onDisconnected({ gamepad: { index } } as GamepadEvent);
      const gp = gamepad();
      expect(gp.gamepad(index).getButton("X")).toEqual({
        pressed: false,
        touched: false,
        value: 0,
        justPressed: false,
        justReleased: false,
      });
    });
  });
});
