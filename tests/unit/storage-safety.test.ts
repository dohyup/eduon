import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  validateFile,
  safeDownloadUrl,
  getStorageProvider,
  getFileScanner,
} from "../../src/integrations/storage/provider";

beforeEach(() => {
  vi.stubEnv("AUTH_PROVIDER", "test");
  vi.stubEnv(
    "E2E_AUTH_SECRET",
    "test-storage-auth-secret-with-more-than-32-characters",
  );
  vi.stubEnv("STORAGE_PROVIDER", "fake");
  vi.stubEnv(
    "TEST_DATABASE_URL",
    "postgresql://test:test@127.0.0.1:5432/eduon_test",
  );
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());
it("rejects MIME, extension and magic disagreement and oversized files", () => {
  expect(() =>
    validateFile({
      filename: "answer.pdf",
      mime: "application/pdf",
      data: Buffer.from("not PDF"),
    }),
  ).toThrow();
  expect(() =>
    validateFile({
      filename: "answer.exe",
      mime: "application/pdf",
      data: Buffer.from("%PDF-1.7"),
    }),
  ).toThrow();
  expect(() =>
    validateFile({
      filename: "answer.png",
      mime: "image/png",
      data: Buffer.alloc(10 * 1024 * 1024 + 1),
    }),
  ).toThrow();
  expect(
    validateFile({
      filename: "answer.pdf",
      mime: "application/pdf",
      data: Buffer.from("%PDF-1.7\nhello"),
    }).bytes,
  ).toBe(14);
});
it("never enables a retained fake in production or non-test authentication", async () => {
  const storage = getStorageProvider();
  vi.stubEnv("AUTH_PROVIDER", "supabase");
  await expect(
    storage.upload({
      key: "quarantine/a",
      data: Buffer.from("x"),
      mime: "application/pdf",
    }),
  ).rejects.toThrow();
  expect(() => getStorageProvider()).toThrow();
  vi.stubEnv("NODE_ENV", "production");
  expect(() => getFileScanner()).toThrow();
});
it("rejects signed URLs outside the provider's explicit HTTPS host allowlist", () => {
  expect(() =>
    safeDownloadUrl("https://evil.example/file", ["storage.example.test"]),
  ).toThrow();
  expect(() =>
    safeDownloadUrl("http://storage.example.test/file", [
      "storage.example.test",
    ]),
  ).toThrow();
  expect(
    safeDownloadUrl("https://storage.example.test/file?expires=60", [
      "storage.example.test",
    ]),
  ).toContain("expires=60");
});
it("rejects fake use with remote databases or real Supabase configuration", () => {
  vi.stubEnv(
    "TEST_DATABASE_URL",
    "postgresql://test:test@remote.example/eduon_test",
  );
  expect(() => getStorageProvider()).toThrow();
  vi.stubEnv(
    "TEST_DATABASE_URL",
    "postgresql://test:test@127.0.0.1:5432/eduon_test",
  );
  vi.stubEnv("SUPABASE_URL", "https://real.example.supabase.co");
  expect(() => getStorageProvider()).toThrow();
});
it("rejects any configured remote application database for factories and retained fake scan/sign calls", async () => {
  const storage = getStorageProvider();
  const scanner = getFileScanner();
  const data = Buffer.from("%PDF-1.7\nhello");
  const key =
    "quarantine/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000001";
  await storage.upload({ key, data, mime: "application/pdf" });
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://test:test@remote.example/eduon_test",
  );
  expect(() => getStorageProvider()).toThrow("TEST_STORAGE_FORBIDDEN");
  expect(() => getFileScanner()).toThrow("TEST_STORAGE_FORBIDDEN");
  await expect(
    scanner.scan({ data, mime: "application/pdf", sha256: "f".repeat(64) }),
  ).rejects.toThrow("TEST_STORAGE_FORBIDDEN");
  await expect(storage.signDownload({ key, expiresIn: 60 })).rejects.toThrow(
    "TEST_STORAGE_FORBIDDEN",
  );
});
