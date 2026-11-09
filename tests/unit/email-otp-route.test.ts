import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const deps = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
  rateLimit: vi.fn(),
  findUnique: vi.fn(),
}));
vi.mock("../../src/integrations/auth/provider", () => ({
  createAuthClient: async () => ({
    auth: {
      verifyOtp: deps.verifyOtp,
      signOut: deps.signOut,
      signInWithOtp: deps.signInWithOtp,
    },
  }),
  getActor: vi.fn(),
}));
vi.mock("../../src/server/db", () => ({
  getDatabase: () => ({ user: { findUnique: deps.findUnique } }),
}));
vi.mock("../../src/server/rate-limit", () => ({ rateLimit: deps.rateLimit }));
import { POST } from "../../src/app/api/auth/verify-otp/route";
import { POST as requestOtp } from "../../src/app/api/auth/otp/route";
const request = (body: unknown, origin = "http://127.0.0.1:3000") =>
  new Request("http://127.0.0.1:3000/api/auth/verify-otp", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv("AUTH_PROVIDER", "supabase");
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-publishable");
  vi.stubEnv("DATABASE_URL", "postgresql://unused@localhost/eduon_test");
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3000");
  vi.stubEnv("DEMO_MODE", "false");
  deps.verifyOtp.mockResolvedValue({
    data: {
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "person@example.com",
        email_confirmed_at: "2030-01-01",
      },
      session: { access_token: "must-never-be-returned" },
    },
    error: null,
  });
  deps.findUnique.mockResolvedValue(null);
  deps.signOut.mockResolvedValue({ error: null });
  deps.rateLimit.mockResolvedValue(undefined);
  deps.signInWithOtp.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
it("does not report a mail request as successful when the provider is rate limited", async () => {
  deps.signInWithOtp.mockResolvedValueOnce({
    error: { status: 429, message: "private-provider-error" },
  });
  const result = await requestOtp(request({ email: "person@example.com" }));
  expect(result.status).toBe(429);
  expect(await result.text()).not.toContain("private-provider-error");
});
it("creates a real-provider session but returns neither OTP nor session tokens", async () => {
  const r = await POST(
    request({ email: "PERSON@example.com", token: "123456" }),
  );
  expect(r.status).toBe(200);
  const text = await r.text();
  expect(text).toContain('"authenticated":true');
  expect(text).not.toContain("123456");
  expect(text).not.toContain("must-never");
  expect(deps.verifyOtp).toHaveBeenCalledWith({
    email: "person@example.com",
    token: "123456",
    type: "email",
  });
  expect(deps.rateLimit).toHaveBeenCalledTimes(2);
});
it("rejects foreign origins and malformed codes before contacting the provider", async () => {
  expect(
    (
      await POST(
        request(
          { email: "person@example.com", token: "123456" },
          "https://other.example",
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (await POST(request({ email: "person@example.com", token: "bad-code" })))
      .status,
  ).toBe(422);
  expect(deps.verifyOtp).not.toHaveBeenCalled();
});
it("rejects expired OTP and disabled accounts without leaking provider details", async () => {
  deps.verifyOtp.mockResolvedValueOnce({
    data: { user: null, session: null },
    error: { status: 403, message: "secret-provider-body" },
  });
  const failed = await POST(
    request({ email: "person@example.com", token: "123456" }),
  );
  expect(failed.status).toBe(401);
  expect(await failed.text()).not.toContain("secret-provider-body");
  deps.findUnique.mockResolvedValueOnce({ disabledAt: new Date() });
  expect(
    (await POST(request({ email: "person@example.com", token: "123456" })))
      .status,
  ).toBe(403);
  expect(deps.signOut).toHaveBeenCalledWith({ scope: "local" });
});
it("retains the OTP attempt limit and demo/test-provider restrictions", async () => {
  const { AppError } = await import("../../src/server/errors");
  deps.rateLimit.mockRejectedValueOnce(new AppError("RATE_LIMITED"));
  expect(
    (await POST(request({ email: "person@example.com", token: "123456" })))
      .status,
  ).toBe(429);
  expect(deps.verifyOtp).not.toHaveBeenCalled();
  vi.stubEnv("AUTH_PROVIDER", "test");
  expect(
    (await POST(request({ email: "person@example.com", token: "123456" })))
      .status,
  ).toBe(503);
});
it("revokes a local session if the provider identity is unconfirmed or mismatched", async () => {
  deps.verifyOtp.mockResolvedValueOnce({
    data: {
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "other@example.com",
        email_confirmed_at: "2030-01-01",
      },
      session: {},
    },
    error: null,
  });
  expect(
    (await POST(request({ email: "person@example.com", token: "123456" })))
      .status,
  ).toBe(401);
  deps.verifyOtp.mockResolvedValueOnce({
    data: {
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "person@example.com",
        email_confirmed_at: null,
      },
      session: {},
    },
    error: null,
  });
  expect(
    (await POST(request({ email: "person@example.com", token: "123456" })))
      .status,
  ).toBe(401);
  expect(deps.signOut).toHaveBeenCalledTimes(2);
});
