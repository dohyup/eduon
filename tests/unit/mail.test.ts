import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { deliverInvitation } from "../../src/integrations/mail/provider";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("키가 없으면 발송 성공이 아니라 직접 전달로 안내한다", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  const fn = vi.fn();
  vi.stubGlobal("fetch", fn);
  const result = await deliverInvitation(
    "student",
    "a".repeat(43),
    "student@example.test",
  );
  expect(result.delivery).toBe("manual");
  expect("inviteUrl" in result ? result.inviteUrl : "").toContain("#token=");
  expect(fn).not.toHaveBeenCalled();
});
it("메일 제공자 실패는 성공으로 표시하지 않는다", async () => {
  vi.stubEnv("RESEND_API_KEY", "test-only");
  vi.stubEnv("MAIL_FROM", "test@example.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 503 })),
  );
  expect(
    (
      await deliverInvitation(
        "instructor",
        "a".repeat(43),
        "teacher@example.test",
      )
    ).delivery,
  ).toBe("failed");
});
