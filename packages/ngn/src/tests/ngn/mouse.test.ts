import { expect, test, testSuite } from "manten";
import { MouseButton } from "../../packages/input/devices/mappings/mouse";
import { mouse, mouseUpdate, onMouseDown, onMouseMove, onMouseUp, onMouseWheel } from "../../packages/input/devices/mouse";

class MockMouseEvent {
  constructor(
    public type: string,
    public config: {
      button?: number;
      movementX?: number;
      movementY?: number;
      clientX?: number;
      clientY?: number;
    },
  ) {}
  get button() {
    return this.config.button ?? 0;
  }
  get movementX() {
    return this.config.movementX ?? 0;
  }
  get movementY() {
    return this.config.movementY ?? 0;
  }
  get clientX() {
    return this.config.clientX ?? 0;
  }
  get clientY() {
    return this.config.clientY ?? 0;
  }
}

class MockWheelEvent {
  constructor(
    public type: string,
    public config: { deltaY?: number },
  ) {}
  get deltaY() {
    return this.config.deltaY ?? 0;
  }
}

export default testSuite(async ({ describe }) => {
  describe("mouse", () => {
    test("should return an object with methods to interact with the mouse input", () => {
      const m = mouse();
      expect(typeof m.mouse).toBe("object");
      expect(typeof m.mouse.useMapping).toBe("function");
      expect(typeof m.mouse.getButton).toBe("function");
      expect(typeof m.mouse.getAxis).toBe("function");
      expect(typeof m.mouse.getPosition).toBe("function");
    });

    test("should allow setting a custom mouse mapping", () => {
      const customMapping = () => ({
        buttons: {
          [MouseButton.Mouse1]: "Shoot",
          // [MouseButton.Mouse2]: 'Aim',
          // [MouseButton.Mouse3]: '',
          // [MouseButton.Mouse4]: '',
          // [MouseButton.Mouse5]: '',
        },
        axes: {
          "0": "MoveX",
          "1": "MoveY",
          "2": "Scroll",
        },
      });
      const m = mouse();
      m.mouse.useMapping(customMapping);
      expect(m.mouse.getButton("Shoot")).toEqual({
        pressed: false,
        justPressed: false,
        justReleased: false,
      });
    });

    test("should get the state of a mouse button", () => {
      const m = mouse();
      const state = m.mouse.getButton("Shoot");
      expect(state).toEqual({
        pressed: false,
        justPressed: false,
        justReleased: false,
      });
    });

    test("should get the state of a mouse button even if it doesnt exist", () => {
      const m = mouse();
      const state = m.mouse.getButton("Pancakes");
      expect(state).toEqual({
        pressed: false,
        justPressed: false,
        justReleased: false,
      });
    });

    test("should get the value of a mouse axis", () => {
      const m = mouse();
      const value = m.mouse.getAxis("0");
      expect(value).toBe(0);
    });

    test("should get the mouse position", () => {
      const m = mouse();
      const position = m.mouse.getPosition();
      expect(position).toEqual({ x: 0, y: 0 });
    });

    test("should handle mouse down and up events", () => {
      const m = mouse();

      onMouseDown(
        new MockMouseEvent("mousedown", {
          button: Number(MouseButton.Mouse1),
        }) as any,
      );
      mouseUpdate();
      expect(m.mouse.getButton("Shoot")).toEqual({
        pressed: true,
        justPressed: true,
        justReleased: false,
      });

      onMouseUp(
        new MockMouseEvent("mouseup", {
          button: Number(MouseButton.Mouse1),
        }) as any,
      );
      mouseUpdate();
      expect(m.mouse.getButton("Shoot")).toEqual({
        pressed: false,
        justPressed: false,
        justReleased: true,
      });
    });

    test("should handle mouse move events", () => {
      onMouseMove(
        new MockMouseEvent("mousemove", {
          movementX: 100,
          movementY: 50,
        }) as any,
      );
      const m = mouse();
      expect(m.mouse.getAxis("0")).toBe(100);
      expect(m.mouse.getAxis("1")).toBe(50);
      expect(m.mouse.getPosition()).toEqual({ x: 0, y: 0 });
    });

    test("should handle mouse wheel events", () => {
      onMouseWheel(new MockWheelEvent("wheel", { deltaY: 120 }) as any);
      const m = mouse();
      expect(m.mouse.getAxis("2")).toBe(120);
    });
  });
});
