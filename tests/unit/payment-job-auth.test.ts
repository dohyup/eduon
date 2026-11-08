import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { verifyJobRequest } from "../../src/server/job-auth";

const nowMs = 1_800_000_000_000;
const secret = "internal-job-key-of-at-least-thirty-two-characters";
const nonce = "00112233445566778899aabbccddeeff";
const rawBody = new TextEncoder().encode('{"limit":10}');

function signedHeaders(
  timestamp = String(nowMs / 1000),
  body = rawBody,
  key = secret,
  requestNonce = nonce,
) {
  const signature = createHmac("sha256", key)
    .update(`${timestamp}.${requestNonce}.`)
    .update(body)
    .digest("hex");
  return new Headers({
    "x-eduon-timestamp": timestamp,
    "x-eduon-nonce": requestNonce,
    "x-eduon-signature": signature,
  });
}

beforeEach(() => vi.stubEnv("JOBS_SECRET", secret));
afterEach(() => vi.unstubAllEnvs());

describe("internal scheduler request authentication", () => {
  it("authenticates exact bytes and returns the nonce for durable replay claims", () => {
    expect(verifyJobRequest(rawBody, signedHeaders(), nowMs)).toEqual({
      nonce,
      timestamp: 1_800_000_000,
    });
  });
  it("accepts the last valid second of the five-minute window", () => {
    expect(
      verifyJobRequest(rawBody, signedHeaders("1799999700"), nowMs),
    ).toEqual({ nonce, timestamp: 1_799_999_700 });
  });
  it.each([
    "1799999699",
    "1800000001",
    "1800000000junk",
    "1800000000.0",
    "1.8e9",
    "",
    "NaN",
  ])("rejects expired, future, or malformed timestamp %s", (timestamp) => {
    expect(() =>
      verifyJobRequest(rawBody, signedHeaders(timestamp), nowMs),
    ).toThrow("JOB_UNAUTHORIZED");
  });
  it.each(["", "short"])(
    "fails closed without a strong configured job secret",
    (key) => {
      vi.stubEnv("JOBS_SECRET", key);
      expect(() => verifyJobRequest(rawBody, signedHeaders(), nowMs)).toThrow(
        "JOB_AUTH_UNCONFIGURED",
      );
    },
  );
  it("rejects modification of body, signature, nonce, or signing key", () => {
    const altered = new TextEncoder().encode('{"limit":11}');
    expect(() => verifyJobRequest(altered, signedHeaders(), nowMs)).toThrow(
      "JOB_UNAUTHORIZED",
    );
    expect(() =>
      verifyJobRequest(
        rawBody,
        signedHeaders(
          undefined,
          rawBody,
          "a-different-long-internal-job-signing-secret",
        ),
        nowMs,
      ),
    ).toThrow("JOB_UNAUTHORIZED");
    const headers = signedHeaders();
    headers.set("x-eduon-nonce", "ffeeddccbbaa99887766554433221100");
    expect(() => verifyJobRequest(rawBody, headers, nowMs)).toThrow(
      "JOB_UNAUTHORIZED",
    );
    headers.set("x-eduon-signature", "0".repeat(64));
    expect(() => verifyJobRequest(rawBody, headers, nowMs)).toThrow(
      "JOB_UNAUTHORIZED",
    );
  });
  it.each([
    "",
    "00112233",
    "g".repeat(32),
    "00112233445566778899aabbccddeeff00",
  ])("rejects nonce without the required 128-bit encoding", (requestNonce) => {
    expect(() =>
      verifyJobRequest(
        rawBody,
        signedHeaders(undefined, rawBody, secret, requestNonce),
        nowMs,
      ),
    ).toThrow("JOB_UNAUTHORIZED");
  });
  it("rejects missing or duplicate signing headers", () => {
    for (const name of [
      "x-eduon-timestamp",
      "x-eduon-nonce",
      "x-eduon-signature",
    ]) {
      const headers = signedHeaders();
      headers.delete(name);
      expect(() => verifyJobRequest(rawBody, headers, nowMs)).toThrow(
        "JOB_UNAUTHORIZED",
      );
      const duplicate = signedHeaders();
      duplicate.append(name, duplicate.get(name)!);
      expect(() => verifyJobRequest(rawBody, duplicate, nowMs)).toThrow(
        "JOB_UNAUTHORIZED",
      );
    }
  });
  it("does not expose secret values in authentication errors", () => {
    try {
      verifyJobRequest(rawBody, new Headers(), nowMs);
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
