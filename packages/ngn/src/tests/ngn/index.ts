import { testSuite } from "manten";

export default testSuite(async ({ describe }) => {
  describe("world", async ({ runTestSuite }) => {
    runTestSuite(import("./world.test.js"));
  });

  describe("extras", async ({ runTestSuite }) => {
    runTestSuite(import("./extras.test.js"));
  });

  describe("keyboard input", async ({ runTestSuite }) => {
    runTestSuite(import("./keyboard.test.js"));
  });

  describe("gamepad input", async ({ runTestSuite }) => {
    runTestSuite(import("./gamepad.test.js"));
  });

  describe("mouse input", async ({ runTestSuite }) => {
    runTestSuite(import("./mouse.test.js"));
  });
});
