import { expect, test, testSuite } from "manten";
import { keyboard, keyboardUpdate, onKeyDown, onKeyUp } from "../../packages/input/devices/keyboard";
import { KeyboardKey } from "../../packages/input/devices/mappings/keyboard";

export default testSuite(async ({ describe }) => {
  describe("keyboard", () => {
    test("should return an object with a keyboard property containing methods", () => {
      const kb = keyboard();
      expect(typeof kb.keyboard).toBe("object");
      expect(typeof kb.keyboard.useMapping).toBe("function");
      expect(typeof kb.keyboard.getKey).toBe("function");
    });

    test("should allow setting a custom keyboard mapping", () => {
      const customMapping = () => ({
        [KeyboardKey.KeyA]: "Left",
        [KeyboardKey.KeyD]: "Right",
      });
      const kb = keyboard();
      kb.keyboard.useMapping(customMapping);
      expect(kb.keyboard.getKey("Left")).toEqual({
        pressed: false,
        justPressed: false,
        justReleased: false,
      });
    });

    test("should set the default state for all keys", () => {
      const kb = keyboard();
      const state = kb.keyboard.getKey("Right");
      expect(state).toEqual({
        pressed: false,
        justPressed: false,
        justReleased: false,
      });
    });

    test("should get the state of a key", () => {
      const kb = keyboard();
      const state = kb.keyboard.getKey("Left");
      expect(state).toEqual({
        pressed: false,
        justPressed: false,
        justReleased: false,
      });
    });

    test("should update the keyboard state", () => {
      onKeyDown({ code: "KeyA", repeat: false } as KeyboardEvent);
      keyboardUpdate();
      const kb = keyboard();
      expect(kb.keyboard.getKey("Left")).toEqual({
        pressed: true,
        justPressed: true,
        justReleased: false,
      });
    });

    test("should set the state of a key to pressed", () => {
      onKeyUp({ code: "KeyA" } as KeyboardEvent);
      keyboardUpdate();
      onKeyDown({ code: "KeyA", repeat: false } as KeyboardEvent);
      keyboardUpdate();
      const kb = keyboard();
      expect(kb.keyboard.getKey("Left")).toEqual({
        pressed: true,
        justPressed: true,
        justReleased: false,
      });

      keyboardUpdate();
      expect(kb.keyboard.getKey("Left")).toEqual({
        pressed: true,
        justPressed: false,
        justReleased: false,
      });
    });

    test("should not update the state if the event is a repeat", () => {
      const kb = keyboard();
      onKeyUp({ code: "KeyA" } as KeyboardEvent);
      keyboardUpdate();
      expect(kb.keyboard.getKey("Left")).toEqual({
        pressed: false,
        justPressed: false,
        justReleased: true,
      });

      keyboardUpdate();
      expect(kb.keyboard.getKey("Left")).toEqual({
        pressed: false,
        justPressed: false,
        justReleased: false,
      });

      onKeyDown({ code: "KeyA", repeat: true } as KeyboardEvent);
      keyboardUpdate();
      expect(kb.keyboard.getKey("Left")).toEqual({
        pressed: false,
        justPressed: false,
        justReleased: false,
      });
    });

    test("should set the state of a key to not pressed", () => {
      onKeyDown({ code: "KeyA", repeat: false } as KeyboardEvent);
      keyboardUpdate();
      onKeyUp({ code: "KeyA" } as KeyboardEvent);
      keyboardUpdate();
      const kb = keyboard();
      expect(kb.keyboard.getKey("Left")).toEqual({
        pressed: false,
        justPressed: false,
        justReleased: true,
      });
    });
  });
});
