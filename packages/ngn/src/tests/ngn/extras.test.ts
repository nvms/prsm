import { expect, test, testSuite } from "manten";
import { createLogSystem } from "../../packages/log";

export default testSuite(async ({ describe }) => {
  test("createLogSystem", () => {
    const logSystem = createLogSystem();
    expect(logSystem).toBeDefined();
    expect(logSystem.update).toBeDefined();
    expect(logSystem.log).toBeDefined();
    logSystem.log("");
    expect(logSystem.expiringLogs.length).toEqual(1);
  });
});
