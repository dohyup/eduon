import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError, ensure } from "@/server/errors";
import type { VideoJoinInput, VideoPort } from "./port";
const API = "https://api.daily.co/v1";
export function validateDailyConfiguration(input: {
  apiKey: string;
  domain: string;
}) {
  ensure(
    input.apiKey.trim().length > 0 && !/[\r\n]/.test(input.apiKey),
    "PROVIDER_UNAVAILABLE",
  );
  ensure(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.daily\.co$/.test(input.domain),
    "PROVIDER_UNAVAILABLE",
  );
  return input;
}
/** Provider token links remain bearer credentials; user_id is pseudonymous metadata. */
export class DailyVideoProvider implements VideoPort {
  private readonly http: typeof fetch;
  private readonly clock: () => Date;
  private readonly config: { apiKey: string; domain: string };
  constructor(options: {
    apiKey: string;
    domain: string;
    fetch?: typeof fetch;
    now?: () => Date;
  }) {
    this.config = validateDailyConfiguration(options);
    this.http = options.fetch ?? fetch;
    this.clock = options.now ?? (() => new Date());
  }
  private async request(path: string, method: "GET" | "POST", body?: unknown) {
    try {
      return await this.http(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new AppError("PROVIDER_UNAVAILABLE");
    }
  }
  private async read(response: Response): Promise<unknown> {
    ensure(response.ok && !response.redirected, "PROVIDER_UNAVAILABLE");
    try {
      return await response.json();
    } catch {
      throw new AppError("PROVIDER_UNAVAILABLE");
    }
  }
  private validateRoom(value: unknown, name: string, nbf: number, exp: number) {
    const parsed = z
      .object({
        name: z.string(),
        privacy: z.literal("private"),
        url: z.url(),
        config: z.object({
          nbf: z.number().int(),
          exp: z.number().int(),
          eject_at_room_exp: z.literal(true),
          enable_knocking: z.literal(false),
          enable_recording: z.literal(false),
          enable_transcription_storage: z.literal(false),
        }),
      })
      .safeParse(value);
    ensure(parsed.success, "PROVIDER_UNAVAILABLE");
    const room = parsed.data,
      url = new URL(room.url);
    ensure(
      room.name === name &&
        url.protocol === "https:" &&
        url.hostname === this.config.domain &&
        !url.port &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === `/${name}` &&
        room.config.nbf === nbf &&
        room.config.exp === exp,
      "PROVIDER_UNAVAILABLE",
    );
    return url;
  }
  async createJoin(input: VideoJoinInput): Promise<{ joinUrl: string }> {
    try {
      z.uuid().parse(input.sessionId);
      z.uuid().parse(input.participantId);
      const now = this.clock().getTime(),
        nbf = Math.floor((input.startsAt.getTime() - 600000) / 1000),
        roomExp = Math.floor(input.roomExpiresAt.getTime() / 1000),
        exp = Math.floor(input.expiresAt.getTime() / 1000);
      ensure(
        input.recordingEnabled === false &&
          ["student", "instructor"].includes(input.role) &&
          Number.isFinite(now) &&
          now >= nbf * 1000 &&
          now < roomExp * 1000 &&
          exp > now / 1000 &&
          exp <= roomExp &&
          exp <= Math.floor((now + 300000) / 1000),
        "PROVIDER_UNAVAILABLE",
      );
      const name = `eduon-${createHash("sha256").update(input.sessionId).digest("hex").slice(0, 32)}`;
      let response = await this.request(`/rooms/${name}`, "GET");
      if (response.status === 404) {
        response = await this.request("/rooms", "POST", {
          name,
          privacy: "private",
          properties: {
            nbf,
            exp: roomExp,
            eject_at_room_exp: true,
            enable_knocking: false,
            enable_prejoin_ui: true,
            enable_recording: false,
            enable_transcription_storage: false,
            enable_live_captions_ui: false,
          },
        });
        // Another authorized participant may create the same deterministic room.
        if (!response.ok)
          response = await this.request(`/rooms/${name}`, "GET");
      }
      const value = await this.read(response);
      const url = this.validateRoom(value, name, nbf, roomExp);
      const tokenResponse = await this.request("/meeting-tokens", "POST", {
        properties: {
          room_name: name,
          user_id: input.participantId,
          is_owner: input.role === "instructor",
          nbf: Math.floor(now / 1000),
          exp,
          enable_prejoin_ui: true,
          enable_recording: false,
          enable_recording_ui: false,
          start_cloud_recording: false,
          auto_start_transcription: false,
          enable_live_captions_ui: false,
          ...(input.role === "student"
            ? {
                permissions: {
                  hasPresence: true,
                  canSend: ["audio", "video"],
                  canReceive: { base: true },
                  canAdmin: false,
                },
              }
            : {}),
        },
      });
      const token = z
        .object({
          token: z
            .string()
            .min(1)
            .max(8192)
            .regex(/^[A-Za-z0-9_.-]+$/),
        })
        .safeParse(await this.read(tokenResponse));
      ensure(token.success, "PROVIDER_UNAVAILABLE");
      url.searchParams.set("t", token.data.token);
      return { joinUrl: url.toString() };
    } catch {
      throw new AppError("PROVIDER_UNAVAILABLE");
    }
  }
}
