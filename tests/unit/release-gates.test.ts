import { it, expect } from "vitest";
import {
  releaseConfiguration,
  enforceDeployment,
} from "../../src/server/release-gates";
const off = { payments: false, video: false, storage: false, scanner: false };
it("public preview can start while production release remains blocked", () => {
  expect(() => enforceDeployment({}, off)).not.toThrow();
  expect(releaseConfiguration({}, off).canRelease).toBe(false);
  expect(() =>
    enforceDeployment({ EDUON_DEPLOYMENT: "production" }, off),
  ).toThrow("RELEASE_GATES_NOT_MET");
});
it("demo and missing service evidence cannot be treated as launch readiness", () => {
  const r = releaseConfiguration(
    {
      DEMO_MODE: "true",
      AUTH_PROVIDER: "test",
      E2E_TEST_MODE: "1",
      PAYMENT_PROVIDER: "fake",
      VIDEO_PROVIDER: "fake",
      STORAGE_PROVIDER: "fake",
    },
    off,
  );
  expect(r.checks.find((c) => c.id === "no-demo")?.status).toBe("blocked");
  expect(r.checks.find((c) => c.id === "real-auth")?.status).toBe("blocked");
  expect(r.checks.find((c) => c.id === "staging-evidence")?.status).toBe(
    "unverified",
  );
  expect(JSON.stringify(r)).not.toContain("DATABASE_URL");
});
