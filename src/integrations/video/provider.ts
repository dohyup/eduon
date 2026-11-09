import "server-only";
import { randomBytes } from "node:crypto";
import type { VideoPort } from "./port";
import { DailyVideoProvider, validateDailyConfiguration } from "./daily";
export function assertTestVideoAllowed() {
  const isolated = (value: string | undefined) => {
    if (!value) return false;
    try {
      const url = new URL(value);
      return (
        ["postgres:", "postgresql:"].includes(url.protocol) &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
        url.pathname === "/eduon_test"
      );
    } catch {
      return false;
    }
  };
  const database =
    process.env.NODE_ENV === "test"
      ? process.env.TEST_DATABASE_URL
      : process.env.DATABASE_URL;
  if (
    process.env.NODE_ENV === "production" ||
    (process.env.NODE_ENV !== "test" && process.env.E2E_TEST_MODE !== "1") ||
    process.env.AUTH_PROVIDER !== "test" ||
    (process.env.E2E_AUTH_SECRET?.length ?? 0) < 32 ||
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    !isolated(database) ||
    (process.env.DATABASE_URL && !isolated(process.env.DATABASE_URL))
  )
    throw new Error("TEST_VIDEO_FORBIDDEN");
}
export type VideoReadiness = {
  configured: boolean;
  provider?: "daily" | "fake";
  reason?: "VIDEO_UNCONFIGURED" | "DAILY_UNCONFIGURED" | "TEST_VIDEO_FORBIDDEN";
};
export function videoReadiness(): VideoReadiness {
  try {
    if (process.env.VIDEO_PROVIDER === "daily") {
      validateDailyConfiguration({
        apiKey: process.env.DAILY_API_KEY ?? "",
        domain: process.env.DAILY_DOMAIN ?? "",
      });
      return { configured: true, provider: "daily" };
    }
    if (process.env.VIDEO_PROVIDER !== "fake")
      return { configured: false, reason: "VIDEO_UNCONFIGURED" };
    assertTestVideoAllowed();
    return { configured: true, provider: "fake" };
  } catch {
    return {
      configured: false,
      reason:
        process.env.VIDEO_PROVIDER === "daily"
          ? "DAILY_UNCONFIGURED"
          : "TEST_VIDEO_FORBIDDEN",
    };
  }
}
export function allowedVideoHost() {
  if (process.env.VIDEO_PROVIDER === "daily")
    return validateDailyConfiguration({
      apiKey: process.env.DAILY_API_KEY ?? "",
      domain: process.env.DAILY_DOMAIN ?? "",
    }).domain;
  if (process.env.VIDEO_PROVIDER === "fake") {
    assertTestVideoAllowed();
    return "classroom.example.test";
  }
  throw new Error("VIDEO_UNCONFIGURED");
}
export function getVideoProvider(): VideoPort {
  if (!videoReadiness().configured) throw new Error("VIDEO_UNCONFIGURED");
  if (process.env.VIDEO_PROVIDER === "daily")
    return new DailyVideoProvider({
      apiKey: process.env.DAILY_API_KEY!,
      domain: process.env.DAILY_DOMAIN!,
    });
  return {
    createJoin: async (input) => {
      assertTestVideoAllowed();
      return {
        joinUrl: `https://classroom.example.test/join/${input.sessionId}?token=${randomBytes(24).toString("base64url")}`,
      };
    },
  };
}
