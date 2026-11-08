import { afterEach, expect, it, vi } from "vitest";
import {
  signTestSession,
  verifyTestSession,
} from "../../src/integrations/auth/test-session";
import { isTestAuthEnabled } from "../../src/server/config";
afterEach(() => vi.unstubAllEnvs());
it("테스트 쿠키 위조·만료를 거부한다", () => {
  const key = "a".repeat(40);
  const id = "11111111-1111-4111-8111-111111111111";
  const signed = signTestSession(id, key, 2000);
  expect(verifyTestSession(signed, key, 1000)).toBe(id);
  expect(verifyTestSession(signed + "x", key, 1000)).toBeNull();
  expect(verifyTestSession(signed, key, 3000)).toBeNull();
});
it("프로덕션에서는 테스트 인증을 활성화할 수 없다", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AUTH_PROVIDER", "test");
  vi.stubEnv("E2E_TEST_MODE", "1");
  vi.stubEnv("E2E_AUTH_SECRET", "a".repeat(40));
  expect(isTestAuthEnabled()).toBe(false);
});
