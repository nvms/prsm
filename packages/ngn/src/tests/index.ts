import { describe } from "manten";

await describe("ngn", async ({ runTestSuite }) => {
  runTestSuite(import("./ngn"));
});
