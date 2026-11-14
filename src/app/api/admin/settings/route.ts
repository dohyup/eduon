import { z } from "zod";
import { handle, readJson } from "@/server/http";
import { attempt, ensure } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import {
  getRuntimeSettings,
  maskSecret,
  updateRuntimeSettings,
} from "@/server/runtime-settings";
import { createAuthClient } from "@/integrations/auth/provider";

const updateSchema = z
  .object({
    zoomMode: z.enum(["simulation", "live"]).optional(),
    zoomClientId: z.string().trim().max(200).optional(),
    zoomClientSecret: z.string().trim().max(256).optional(),
    zoomRedirectUri: z.string().trim().max(500).optional(),
    zoomWebhookSecret: z.string().trim().max(256).optional(),
    zoomTokenEncryptionKey: z.string().trim().max(256).optional(),
    zoomSdkKey: z.string().trim().max(200).optional(),
    zoomSdkSecret: z.string().trim().max(256).optional(),
    zoomExternalSdkApproved: z.boolean().optional(),
    adminEmails: z.string().trim().max(1000).optional(),
    databaseUrl: z.string().trim().max(1000).optional(),
  })
  .strict();

function toPublicSettingsView() {
  const s = getRuntimeSettings();
  return {
    zoomMode: s.zoomMode,
    zoomClientId: s.zoomClientId,
    hasClientSecret: Boolean(s.zoomClientSecret),
    maskedClientSecret: maskSecret(s.zoomClientSecret),
    zoomRedirectUri: s.zoomRedirectUri,
    hasWebhookSecret: Boolean(s.zoomWebhookSecret),
    maskedWebhookSecret: maskSecret(s.zoomWebhookSecret),
    zoomSdkKey: s.zoomSdkKey,
    hasSdkSecret: Boolean(s.zoomSdkSecret),
    maskedSdkSecret: maskSecret(s.zoomSdkSecret),
    zoomExternalSdkApproved: s.zoomExternalSdkApproved,
    adminEmails: s.adminEmails,
    hasDatabaseUrl: Boolean(s.databaseUrl),
    maskedDatabaseUrl: maskSecret(s.databaseUrl),
    updatedAt: s.updatedAt,
    updatedByEmail: s.updatedByEmail ?? null,
  };
}

export function GET(request: Request) {
  return handle(request, (ctx) =>
    attempt(async () => {
      const actor = await requireActor(ctx);
      ensure(actor.platformAdmin, "FORBIDDEN");
      return toPublicSettingsView();
    }),
  );
}

export function POST(request: Request) {
  return handle(
    request,
    async (ctx) => {
      const raw = await readJson(request);
      return attempt(async () => {
        const actor = await requireActor(ctx);
        ensure(actor.platformAdmin, "FORBIDDEN");
        const parsed = updateSchema.parse(raw);
        const current = getRuntimeSettings();

        const next = updateRuntimeSettings(
          {
            zoomMode: parsed.zoomMode ?? current.zoomMode,
            zoomClientId:
              parsed.zoomClientId !== undefined
                ? parsed.zoomClientId
                : current.zoomClientId,
            zoomClientSecret:
              parsed.zoomClientSecret && parsed.zoomClientSecret.length > 0
                ? parsed.zoomClientSecret
                : current.zoomClientSecret,
            zoomRedirectUri:
              parsed.zoomRedirectUri !== undefined
                ? parsed.zoomRedirectUri
                : current.zoomRedirectUri,
            zoomWebhookSecret:
              parsed.zoomWebhookSecret && parsed.zoomWebhookSecret.length > 0
                ? parsed.zoomWebhookSecret
                : current.zoomWebhookSecret,
            zoomTokenEncryptionKey:
              parsed.zoomTokenEncryptionKey &&
              parsed.zoomTokenEncryptionKey.length >= 32
                ? parsed.zoomTokenEncryptionKey
                : current.zoomTokenEncryptionKey,
            zoomSdkKey:
              parsed.zoomSdkKey !== undefined
                ? parsed.zoomSdkKey
                : current.zoomSdkKey,
            zoomSdkSecret:
              parsed.zoomSdkSecret && parsed.zoomSdkSecret.length > 0
                ? parsed.zoomSdkSecret
                : current.zoomSdkSecret,
            zoomExternalSdkApproved:
              parsed.zoomExternalSdkApproved ?? current.zoomExternalSdkApproved,
            adminEmails:
              parsed.adminEmails !== undefined
                ? parsed.adminEmails
                : current.adminEmails,
            databaseUrl:
              parsed.databaseUrl !== undefined
                ? parsed.databaseUrl
                : current.databaseUrl,
          },
          actor.email,
        );

        await ctx.db.auditEvent.create({
          data: {
            actorId: actor.id,
            action: "admin.settings.updated",
            targetId: actor.id,
            reason: `zoomMode:${next.zoomMode}`,
            createdAt: ctx.now(),
          },
        });

        try {
          const supabase = await createAuthClient();
          await supabase.auth.updateUser({
            data: {
              eduon_platform_settings: next,
            },
          });
        } catch {
          // ignore if running with offline admin fallback cookie
        }

        return toPublicSettingsView();
      });
    },
    true,
  );
}

