vi.mock("server-only", () => ({}));
import { afterEach, describe, expect, it, vi } from "vitest";
import { DailyVideoProvider } from "../../src/integrations/video/daily";
import { videoReadiness } from "../../src/integrations/video/provider";
const input = {
  sessionId: "7be94c1a-b38e-4f51-81b8-ff4c0ac23a99",
  participantId: "b3de88d7-d297-465c-b645-e717410f3c83",
  role: "student" as const,
  startsAt: new Date("2030-01-01T01:00:00Z"),
  roomExpiresAt: new Date("2030-01-01T02:10:00Z"),
  expiresAt: new Date("2030-01-01T00:57:00Z"),
  recordingEnabled: false as const,
};
const now = () => new Date("2030-01-01T00:55:00Z");
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
describe("Daily Prebuilt provider contract", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it.each(["student", "instructor"] as const)(
    "creates private scoped rooms and least-privilege %s tokens without ending class at short token expiry",
    async (role) => {
      const calls: {
        url: string;
        method: string;
        body?: Record<string, unknown>;
      }[] = [];
      let name = "";
      let roomConfig: Record<string, unknown> = {};
      const http: typeof fetch = async (url, init) => {
        const method = init?.method ?? "GET",
          body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ url: String(url), method, body });
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer unit-key",
        );
        expect(init?.redirect).toBe("error");
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        if (method === "GET") return response({}, 404);
        if (String(url).endsWith("/rooms")) {
          name = body.name;
          roomConfig = body.properties;
          return response({
            name,
            privacy: "private",
            url: `https://unit-school.daily.co/${name}`,
            config: roomConfig,
          });
        }
        return response({ token: "signed.private.token" });
      };
      const provider = new DailyVideoProvider({
        apiKey: "unit-key",
        domain: "unit-school.daily.co",
        fetch: http,
        now,
      });
      const result = await provider.createJoin({ ...input, role });
      expect(calls.map((c) => [c.url, c.method])).toEqual([
        [`https://api.daily.co/v1/rooms/${name}`, "GET"],
        ["https://api.daily.co/v1/rooms", "POST"],
        ["https://api.daily.co/v1/meeting-tokens", "POST"],
      ]);
      expect(name).toMatch(/^eduon-[0-9a-f]{32}$/);
      expect(name).not.toContain(input.sessionId);
      expect(roomConfig).toMatchObject({
        nbf: 1893459000,
        exp: 1893463800,
        eject_at_room_exp: true,
        enable_knocking: false,
        enable_prejoin_ui: true,
        enable_recording: false,
        enable_transcription_storage: false,
        enable_live_captions_ui: false,
      });
      const properties = calls[2].body?.properties as Record<string, unknown>;
      expect(properties).toMatchObject({
        room_name: name,
        user_id: input.participantId,
        is_owner: role === "instructor",
        nbf: 1893459300,
        exp: 1893459420,
        enable_recording: false,
        enable_recording_ui: false,
        start_cloud_recording: false,
        auto_start_transcription: false,
        enable_live_captions_ui: false,
      });
      expect(properties).not.toHaveProperty("eject_at_token_exp");
      expect(properties).not.toHaveProperty("eject_after_elapsed");
      expect(properties).not.toHaveProperty("user_name");
      if (role === "student")
        expect(properties.permissions).toMatchObject({
          canAdmin: false,
          canSend: ["audio", "video"],
          hasPresence: true,
        });
      expect(result.joinUrl).toBe(
        `https://unit-school.daily.co/${name}?t=signed.private.token`,
      );
    },
  );
  it("reuses an existing strictly safe room and rejects changed room scope or recording configuration", async () => {
    for (const variant of [
      "safe",
      "public",
      "wrong-host",
      "recording",
      "unbounded",
    ]) {
      let name = "";
      const http: typeof fetch = async (url) => {
        if (String(url).includes("/rooms/")) {
          name = String(url).split("/").pop()!;
          return response({
            name,
            privacy: variant === "public" ? "public" : "private",
            url: `https://${variant === "wrong-host" ? "other.daily.co" : "unit-school.daily.co"}/${name}`,
            config: {
              nbf: 1893459000,
              exp: variant === "unbounded" ? 1993463800 : 1893463800,
              eject_at_room_exp: true,
              enable_knocking: false,
              enable_recording: variant === "recording" ? "cloud" : false,
              enable_transcription_storage: false,
            },
          });
        }
        return response({ token: "signed.private.token" });
      };
      const action = new DailyVideoProvider({
        apiKey: "unit-key",
        domain: "unit-school.daily.co",
        fetch: http,
        now,
      }).createJoin(input);
      if (variant === "safe") expect((await action).joinUrl).toContain(name);
      else
        await expect(action).rejects.toMatchObject({
          code: "PROVIDER_UNAVAILABLE",
        });
    }
  });
  it("fails closed on provider errors, redirects, missing token and invalid configured domains", async () => {
    for (const domain of [
      "daily.co",
      "evil.test",
      "unit-school.daily.co.evil.test",
      "https://unit-school.daily.co",
      "*.daily.co",
    ]) {
      expect(
        () => new DailyVideoProvider({ apiKey: "unit-key", domain, now }),
      ).toThrow();
    }
    for (const status of [401, 429, 500])
      await expect(
        new DailyVideoProvider({
          apiKey: "unit-key",
          domain: "unit-school.daily.co",
          now,
          fetch: async () => response({ error: "secret-token" }, status),
        }).createJoin(input),
      ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    await expect(
      new DailyVideoProvider({
        apiKey: "unit-key",
        domain: "unit-school.daily.co",
        now,
        fetch: async () => {
          throw Error("network-secret");
        },
      }).createJoin(input),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
  it("Daily readiness requires the exact tenant host and server API key", () => {
    vi.stubEnv("VIDEO_PROVIDER", "daily");
    vi.stubEnv("DAILY_API_KEY", "");
    vi.stubEnv("DAILY_DOMAIN", "unit-school.daily.co");
    expect(videoReadiness().configured).toBe(false);
    vi.stubEnv("DAILY_API_KEY", "unit-key");
    expect(videoReadiness()).toMatchObject({
      configured: true,
      provider: "daily",
    });
    vi.stubEnv("DAILY_DOMAIN", "daily.co");
    expect(videoReadiness().configured).toBe(false);
  });
  it("rejects redirects and missing token bodies after validating a private room", async () => {
    for (const variant of ["redirect", "empty-token"]) {
      const http: typeof fetch = async (url) => {
        if (String(url).includes("/rooms/")) {
          const name = String(url).split("/").pop()!;
          const r = response({
            name,
            privacy: "private",
            url: "https://unit-school.daily.co/" + name,
            config: {
              nbf: 1893459000,
              exp: 1893463800,
              eject_at_room_exp: true,
              enable_knocking: false,
              enable_recording: false,
              enable_transcription_storage: false,
            },
          });
          if (variant === "redirect")
            Object.defineProperty(r, "redirected", { value: true });
          return r;
        }
        return response({});
      };
      await expect(
        new DailyVideoProvider({
          apiKey: "unit-key",
          domain: "unit-school.daily.co",
          now,
          fetch: http,
        }).createJoin(input),
      ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    }
  });
  it("aborts a stalled provider within the five second HTTP deadline", async () => {
    const http: typeof fetch = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted-secret")),
          { once: true },
        );
      });
    const started = Date.now();
    await expect(
      new DailyVideoProvider({
        apiKey: "unit-key",
        domain: "unit-school.daily.co",
        now,
        fetch: http,
      }).createJoin(input),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(Date.now() - started).toBeLessThan(7000);
  }, 10000);
});
