import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readJson, verifyOrigin } from "../../src/server/http";
afterEach(() => vi.unstubAllEnvs());
it("외부 Origin과 Origin 누락을 거부한다", () => {
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3000");
  expect(() =>
    verifyOrigin(
      new Request("http://127.0.0.1:3000", {
        headers: { Origin: "https://evil.invalid" },
      }),
    ),
  ).toThrow("FORBIDDEN");
  expect(() => verifyOrigin(new Request("http://127.0.0.1:3000"))).toThrow(
    "FORBIDDEN",
  );
  expect(() =>
    verifyOrigin(
      new Request("https://www.eduonlink.com/api/auth/password", {
        headers: { Origin: "https://www.eduonlink.com" },
      }),
    ),
  ).not.toThrow();
  expect(() =>
    verifyOrigin(
      new Request("https://eduonlink.com/api/auth/password", {
        headers: { Origin: "https://www.eduonlink.com" },
      }),
    ),
  ).not.toThrow();
});
it("길이 헤더를 속여도 스트리밍 본문 상한을 적용한다", async () => {
  const r = new Request("http://127.0.0.1", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": "0" },
    body: "x".repeat(40000),
  });
  await expect(readJson(r)).rejects.toThrow("VALIDATION");
});
it("정상 JSON만 파싱하고 텍스트·깨진 JSON은 거부한다", async () => {
  await expect(
    readJson(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"name":"합성"}',
      }),
    ),
  ).resolves.toEqual({ name: "합성" });
  await expect(
    readJson(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      }),
    ),
  ).rejects.toThrow("VALIDATION");
});
