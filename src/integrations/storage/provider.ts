import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { AppError, ensure } from "@/server/errors";
import type { StoragePort, FileScanner } from "./port";
export function validateFile(input: {
  filename: string;
  mime: string;
  data: Uint8Array;
}) {
  ensure(
    input.filename.length > 0 &&
      input.filename.length <= 200 &&
      !/[\\/\x00-\x1f]/.test(input.filename),
    "VALIDATION",
  );
  ensure(
    input.data.byteLength > 0 && input.data.byteLength <= 10 * 1024 * 1024,
    "VALIDATION",
  );
  const bytes = Buffer.from(input.data);
  const extension = input.filename.split(".").pop()?.toLowerCase();
  const valid =
    (input.mime === "application/pdf" &&
      extension === "pdf" &&
      bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) ||
    (input.mime === "image/png" &&
      extension === "png" &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (input.mime === "image/jpeg" &&
      (extension === "jpg" || extension === "jpeg") &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255);
  ensure(valid, "VALIDATION");
  return {
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
export function safeDownloadUrl(url: string, hosts: readonly string[]) {
  const parsed = new URL(url);
  ensure(
    parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      (!parsed.port || parsed.port === "443") &&
      hosts.includes(parsed.hostname),
    "PROVIDER_UNAVAILABLE",
  );
  return parsed.toString();
}
export function assertTestStorageAllowed() {
  let isolated = false;
  try {
    const selected =
      process.env.NODE_ENV === "test"
        ? process.env.TEST_DATABASE_URL
        : process.env.DATABASE_URL;
    // Test-mode services may still construct the application DB from DATABASE_URL.
    // Every configured application target must be isolated, not only the test DB.
    isolated = [
      selected ?? "",
      ...(process.env.DATABASE_URL ? [process.env.DATABASE_URL] : []),
    ].every((url) => {
      const database = new URL(url);
      return (
        ["postgres:", "postgresql:"].includes(database.protocol) &&
        ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) &&
        database.pathname === "/eduon_test"
      );
    });
  } catch {
    /* Missing or malformed configuration stays disabled. */
  }
  if (
    !isolated ||
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NODE_ENV === "production" ||
    (process.env.NODE_ENV !== "test" && process.env.E2E_TEST_MODE !== "1") ||
    process.env.AUTH_PROVIDER !== "test" ||
    (process.env.E2E_AUTH_SECRET?.length ?? 0) < 32 ||
    process.env.STORAGE_PROVIDER !== "fake"
  )
    throw new Error("TEST_STORAGE_FORBIDDEN");
}
/** In-memory only and guarded on every operation, including retained references. */
export class FakeStorageProvider implements StoragePort, FileScanner {
  readonly downloadHosts = ["storage.example.test"];
  private readonly objects = new Map<string, Uint8Array>();
  async upload(input: { key: string; data: Uint8Array; mime: string }) {
    assertTestStorageAllowed();
    ensure(
      /^quarantine\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/.test(input.key),
      "VALIDATION",
    );
    this.objects.set(input.key, new Uint8Array(input.data));
  }
  async scan(input: {
    data: Uint8Array;
    mime: string;
    sha256: string;
  }): Promise<"clean" | "rejected"> {
    assertTestStorageAllowed();
    return Buffer.from(input.data).includes(Buffer.from("EICAR"))
      ? "rejected"
      : "clean";
  }
  async signDownload(input: { key: string; expiresIn: 60 }) {
    assertTestStorageAllowed();
    ensure(
      this.objects.has(input.key) && input.expiresIn === 60,
      "PROVIDER_UNAVAILABLE",
    );
    return `https://storage.example.test/private/${randomUUID()}?expires=60`;
  }
  async delete(key: string) {
    assertTestStorageAllowed();
    this.objects.delete(key);
  }
}
const runtime = globalThis as typeof globalThis & {
  eduonTestStorage?: { secret: string; port: FakeStorageProvider };
};
export function getStorageProvider(): StoragePort {
  if (process.env.STORAGE_PROVIDER !== "fake")
    throw new AppError("PROVIDER_UNAVAILABLE");
  assertTestStorageAllowed();
  const secret = process.env.E2E_AUTH_SECRET!;
  if (runtime.eduonTestStorage?.secret !== secret)
    runtime.eduonTestStorage = { secret, port: new FakeStorageProvider() };
  return runtime.eduonTestStorage.port;
}
export function getFileScanner(): FileScanner {
  if (process.env.STORAGE_PROVIDER === "fake")
    return getStorageProvider() as FakeStorageProvider;
  return { scan: async () => "unavailable" };
}
