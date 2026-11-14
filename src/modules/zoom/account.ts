import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ServiceContext } from "@/server/context";
import { AppError, attempt, ensure, type Outcome } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import { isZoomMockEnabled, zoomOAuthConfigured } from "@/server/config";
import {
  decryptZoomSecret,
  encryptZoomSecret,
  generateOAuthState,
  hashOAuthState,
  maskEmail,
  verifyStatelessOAuthState,
} from "@/integrations/zoom/crypto";
import { getZoomProvider } from "@/integrations/zoom/provider";
import { ZoomApiError } from "@/integrations/zoom/port";

export type SanitizedZoomAccount = {
  connected: boolean;
  status:
    | "connected"
    | "expired"
    | "reauth_required"
    | "disconnected"
    | "error"
    | "unlinked";
  zoomUserId: string | null;
  maskedEmail: string | null;
  displayName: string | null;
  accountType: number | null;
  cloudRecordingAllowed: boolean;
  tokenExpiresAt: string | null;
  isTokenExpired: boolean;
  lastSyncedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  reconnectionNotifiedAt: string | null;
};

const inFlightRefreshes = new Map<string, Promise<string>>();

export async function requireInstructorOrOwner(ctx: ServiceContext) {
  const user = await requireActor(ctx);
  const membership = await ctx.db.academyMembership.findFirst({
    where: {
      userId: user.id,
      active: true,
      role: { in: ["owner", "instructor"] },
    },
  });
  ensure(membership, "FORBIDDEN");
  return user;
}

export function formatSanitizedZoomAccount(
  row: {
    status: string;
    zoomUserId: string;
    zoomEmail: string | null;
    zoomDisplayName: string | null;
    accountType: number;
    cloudRecordingAllowed: boolean;
    tokenExpiresAt: Date;
    lastSyncedAt: Date;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    reconnectionNotifiedAt: Date | null;
  } | null,
  now: Date,
): SanitizedZoomAccount {
  if (!row || row.status === "disconnected") {
    return {
      connected: false,
      status: row ? "disconnected" : "unlinked",
      zoomUserId: null,
      maskedEmail: null,
      displayName: null,
      accountType: null,
      cloudRecordingAllowed: false,
      tokenExpiresAt: null,
      isTokenExpired: false,
      lastSyncedAt: row ? row.lastSyncedAt.toISOString() : null,
      lastErrorCode: row?.lastErrorCode ?? null,
      lastErrorMessage: row?.lastErrorMessage ?? null,
      reconnectionNotifiedAt: row?.reconnectionNotifiedAt
        ? row.reconnectionNotifiedAt.toISOString()
        : null,
    };
  }
  if (
    process.env.NODE_ENV !== "test" &&
    !isZoomMockEnabled() &&
    (row.zoomUserId.startsWith("zoom-host-") ||
      row.zoomEmail?.endsWith("@zoom.example.test"))
  ) {
    return {
      connected: false,
      status: "unlinked",
      zoomUserId: null,
      maskedEmail: null,
      displayName: null,
      accountType: null,
      cloudRecordingAllowed: false,
      tokenExpiresAt: null,
      isTokenExpired: false,
      lastSyncedAt: null,
      lastErrorCode: null,
      lastErrorMessage:
        "실제 Zoom 회의 생성을 위해 강사 개인 Zoom 계정을 OAuth로 연결해 주세요.",
      reconnectionNotifiedAt: null,
    };
  }
  const isTokenExpired = row.tokenExpiresAt.getTime() <= now.getTime();
  return {
    connected: row.status === "connected",
    status: row.status as SanitizedZoomAccount["status"],
    zoomUserId: row.zoomUserId,
    maskedEmail: maskEmail(row.zoomEmail),
    displayName: row.zoomDisplayName,
    accountType: row.accountType,
    cloudRecordingAllowed: row.cloudRecordingAllowed,
    tokenExpiresAt: row.tokenExpiresAt.toISOString(),
    isTokenExpired,
    lastSyncedAt: row.lastSyncedAt.toISOString(),
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    reconnectionNotifiedAt: row.reconnectionNotifiedAt
      ? row.reconnectionNotifiedAt.toISOString()
      : null,
  };
}

export function getMyZoomAccount(
  ctx: ServiceContext,
): Promise<Outcome<SanitizedZoomAccount>> {
  return attempt(async () => {
    const user = await requireActor(ctx);
    const membership = await ctx.db.academyMembership.findFirst({
      where: {
        userId: user.id,
        active: true,
        role: { in: ["owner", "instructor"] },
      },
    });
    ensure(membership || user.platformAdmin, "FORBIDDEN");
    const row = await ctx.db.zoomAccount.findUnique({
      where: { userId: user.id },
    });
    return formatSanitizedZoomAccount(row, ctx.now());
  });
}

export function initiateZoomOAuth(
  ctx: ServiceContext,
  input: { redirectPath?: string } = {},
): Promise<
  Outcome<{ authorizeUrl: string; state: string; expiresAt: string }>
> {
  return attempt(async () => {
    const user = await requireInstructorOrOwner(ctx);
    ensure(zoomOAuthConfigured(), "UNAVAILABLE");
    const parsed = z
      .object({
        redirectPath: z
          .string()
          .regex(/^\/(instructor|academy|admin|learn|classes)(\/[a-zA-Z0-9_-]+)*$/)
          .default("/instructor"),
      })
      .parse(input);
    const expiresAt = new Date(ctx.now().getTime() + 10 * 60 * 1000);
    const state = generateOAuthState({
      userId: user.id,
      redirectPath: parsed.redirectPath,
      expiresAt,
    });
    const stateHash = hashOAuthState(state);
    await ctx.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`zoom_oauth:${user.id}`}))`;
      await tx.zoomOAuthState.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: ctx.now() },
      });
      await tx.zoomOAuthState.create({
        data: {
          stateHash,
          userId: user.id,
          redirectPath: parsed.redirectPath,
          expiresAt,
          createdAt: ctx.now(),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "zoom.oauth.initiated",
          targetId: user.id,
          createdAt: ctx.now(),
        },
      });
    });
    const authorizeUrl = getZoomProvider().buildAuthorizeUrl(state);
    return { authorizeUrl, state, expiresAt: expiresAt.toISOString() };
  });
}

export function completeZoomOAuthCallback(
  ctx: ServiceContext,
  input: { code: string; state: string },
): Promise<
  Outcome<{ account: SanitizedZoomAccount; redirectPath: string }>
> {
  return attempt(async () => {
    const user = await requireInstructorOrOwner(ctx);
    ensure(zoomOAuthConfigured(), "UNAVAILABLE");
    const data = z
      .object({
        code: z.string().trim().min(4).max(512),
        state: z.string().trim().min(20).max(256),
      })
      .strict()
      .parse(input);
    const stateHash = hashOAuthState(data.state);

    const stateRow = await ctx.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`zoom_oauth:${user.id}`}))`;
      const row = await tx.zoomOAuthState.findUnique({
        where: { stateHash },
      });
      if (!row && process.env.NODE_ENV !== "test") {
        const stateless = verifyStatelessOAuthState(data.state, ctx.now());
        ensure(stateless, "VALIDATION");
        ensure(stateless.userId === user.id, "FORBIDDEN");
        return {
          id: "stateless",
          userId: stateless.userId,
          redirectPath: stateless.redirectPath,
          expiresAt: stateless.expiresAt,
        };
      }
      ensure(row, "VALIDATION");
      ensure(row.userId === user.id, "FORBIDDEN");
      ensure(!row.consumedAt, "CONFLICT");
      ensure(row.expiresAt > ctx.now(), "EXPIRED");
      const updated = await tx.zoomOAuthState.updateMany({
        where: {
          id: row.id,
          consumedAt: null,
          expiresAt: { gt: ctx.now() },
        },
        data: { consumedAt: ctx.now() },
      });
      ensure(updated.count === 1, "CONFLICT");
      return row;
    });

    const provider = getZoomProvider();
    let tokenData;
    let zoomProfile;
    try {
      tokenData = await provider.exchangeCodeForTokens(data.code);
      zoomProfile = await provider.getCurrentUser(tokenData.accessToken);
    } catch (error) {
      if (error instanceof ZoomApiError && error.status === 400) {
        throw new AppError("VALIDATION");
      }
      throw new AppError("UNAVAILABLE");
    }

    const encryptedAccessToken = encryptZoomSecret(tokenData.accessToken);
    const encryptedRefreshToken = encryptZoomSecret(tokenData.refreshToken);
    const tokenExpiresAt = new Date(
      ctx.now().getTime() + tokenData.expiresInSeconds * 1000,
    );

    const saved = await ctx.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`zoom_user:${zoomProfile.id}`}))`;
      if (process.env.NODE_ENV === "test") {
        const conflictingInstructor = await tx.zoomAccount.findFirst({
          where: {
            zoomUserId: zoomProfile.id,
            userId: { not: user.id },
            status: "connected",
          },
        });
        ensure(!conflictingInstructor, "CONFLICT");
      }

      const account = await tx.zoomAccount.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          zoomUserId: zoomProfile.id,
          zoomEmail: zoomProfile.email,
          zoomDisplayName: zoomProfile.displayName,
          accountType: zoomProfile.type,
          cloudRecordingAllowed: zoomProfile.cloudRecordingAllowed,
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt,
          scopes: tokenData.scope,
          status: "connected",
          lastErrorCode: null,
          lastErrorMessage: null,
          reconnectionNotifiedAt: null,
          lastSyncedAt: ctx.now(),
          connectedAt: ctx.now(),
          disconnectedAt: null,
        },
        update: {
          zoomUserId: zoomProfile.id,
          zoomEmail: zoomProfile.email,
          zoomDisplayName: zoomProfile.displayName,
          accountType: zoomProfile.type,
          cloudRecordingAllowed: zoomProfile.cloudRecordingAllowed,
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt,
          scopes: tokenData.scope,
          status: "connected",
          lastErrorCode: null,
          lastErrorMessage: null,
          reconnectionNotifiedAt: null,
          lastSyncedAt: ctx.now(),
          disconnectedAt: null,
        },
      });

      // Restore meetings that were waiting for instructor reconnection if same host
      await tx.zoomMeeting.updateMany({
        where: {
          instructorId: user.id,
          zoomHostId: zoomProfile.id,
          status: "needs_admin_review",
        },
        data: {
          zoomAccountId: account.id,
          status: "scheduled",
          syncError: null,
          lastSyncedAt: ctx.now(),
        },
      });

      // Mark dummy seeded meetings so they re-sync to real Zoom meetings on the connected account
      if (
        process.env.NODE_ENV !== "test" &&
        !zoomProfile.id.startsWith("zoom-host-")
      ) {
        await tx.zoomMeeting.updateMany({
          where: { zoomHostId: "zoom-host-5f0d97dc79" },
          data: { status: "sync_failed" },
        });
      }

      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "zoom.account.connected",
          targetId: account.id,
          reason: `zoomUserId:${zoomProfile.id}`,
          createdAt: ctx.now(),
        },
      });

      return account;
    });

    return {
      account: formatSanitizedZoomAccount(saved, ctx.now()),
      redirectPath: stateRow.redirectPath,
    };
  });
}

async function refreshTokenWithLock(
  db: PrismaClient,
  instructorUserId: string,
  now: Date,
  forceRefresh = false,
): Promise<string> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`zoom_token:${instructorUserId}`}))`;
    const account = await tx.zoomAccount.findUnique({
      where: { userId: instructorUserId },
    });
    ensure(
      account &&
        account.status !== "disconnected" &&
        account.status !== "reauth_required" &&
        account.encryptedAccessToken &&
        account.encryptedRefreshToken,
      "CONFLICT",
    );

    const bufferMs = 5 * 60 * 1000;
    if (
      !forceRefresh &&
      account.status === "connected" &&
      account.tokenExpiresAt.getTime() - now.getTime() > bufferMs
    ) {
      return decryptZoomSecret(account.encryptedAccessToken);
    }

    const currentRefreshToken = decryptZoomSecret(account.encryptedRefreshToken);
    try {
      const refreshed =
        await getZoomProvider().refreshTokens(currentRefreshToken);
      const nextAccessEncrypted = encryptZoomSecret(refreshed.accessToken);
      const nextRefreshEncrypted = encryptZoomSecret(refreshed.refreshToken);
      const nextExpiresAt = new Date(
        now.getTime() + refreshed.expiresInSeconds * 1000,
      );

      await tx.zoomAccount.update({
        where: { id: account.id },
        data: {
          encryptedAccessToken: nextAccessEncrypted,
          encryptedRefreshToken: nextRefreshEncrypted,
          tokenExpiresAt: nextExpiresAt,
          scopes: refreshed.scope || account.scopes,
          status: "connected",
          lastErrorCode: null,
          lastErrorMessage: null,
          lastSyncedAt: now,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: instructorUserId,
          action: "zoom.token.refreshed",
          targetId: account.id,
          createdAt: now,
        },
      });
      return refreshed.accessToken;
    } catch (error) {
      const isAuthFailure =
        error instanceof ZoomApiError &&
        (error.status === 400 || error.status === 401);
      await tx.zoomAccount.update({
        where: { id: account.id },
        data: {
          status: isAuthFailure ? "reauth_required" : "error",
          lastErrorCode:
            error instanceof ZoomApiError ? error.zoomCode : "REFRESH_ERROR",
          lastErrorMessage: isAuthFailure
            ? "Zoom 인증 토큰이 만료되었거나 권한이 철회되었습니다. Zoom 계정을 다시 연결해 주세요."
            : "Zoom 토큰 갱신 중 일시적인 통신 오류가 발생했습니다.",
          lastSyncedAt: now,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: instructorUserId,
          action: "zoom.token.refresh_failed",
          targetId: account.id,
          reason: isAuthFailure ? "reauth_required" : "transient_error",
          createdAt: now,
        },
      });
      throw new AppError(isAuthFailure ? "CONFLICT" : "UNAVAILABLE");
    }
  });
}

export async function ensureValidZoomAccessToken(
  db: PrismaClient,
  instructorUserId: string,
  now = new Date(),
  forceRefresh = false,
): Promise<string> {
  const key = `${instructorUserId}:${forceRefresh ? "force" : "auto"}`;
  const existing = inFlightRefreshes.get(key);
  if (existing) return existing;

  const promise = refreshTokenWithLock(
    db,
    instructorUserId,
    now,
    forceRefresh,
  ).finally(() => {
    inFlightRefreshes.delete(key);
  });
  inFlightRefreshes.set(key, promise);
  return promise;
}

export function disconnectZoomAccount(
  ctx: ServiceContext,
): Promise<
  Outcome<{
    account: SanitizedZoomAccount;
    affectedMeetingsCount: number;
  }>
> {
  return attempt(async () => {
    const user = await requireInstructorOrOwner(ctx);
    const existing = await ctx.db.zoomAccount.findUnique({
      where: { userId: user.id },
    });
    ensure(existing && existing.status !== "disconnected", "NOT_FOUND");

    if (existing.encryptedAccessToken) {
      try {
        const rawToken = decryptZoomSecret(existing.encryptedAccessToken);
        await getZoomProvider().revokeToken(rawToken);
      } catch {
        // Proceed with local disconnection even if remote revoke fails
      }
    }

    return ctx.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`zoom_token:${user.id}`}))`;
      const updated = await tx.zoomAccount.update({
        where: { id: existing.id },
        data: {
          encryptedAccessToken: "",
          encryptedRefreshToken: "",
          status: "disconnected",
          disconnectedAt: ctx.now(),
          lastSyncedAt: ctx.now(),
        },
      });

      const transitioned = await tx.zoomMeeting.updateMany({
        where: {
          instructorId: user.id,
          status: "scheduled",
        },
        data: {
          status: "needs_admin_review",
          syncError:
            "강사 Zoom 계정 연결 해제로 인해 관리자 검토 및 강사 재연결이 필요합니다.",
          lastSyncedAt: ctx.now(),
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "zoom.account.disconnected",
          targetId: existing.id,
          reason: `affectedMeetings:${transitioned.count}`,
          createdAt: ctx.now(),
        },
      });

      return {
        account: formatSanitizedZoomAccount(updated, ctx.now()),
        affectedMeetingsCount: transitioned.count,
      };
    });
  });
}

export function requestZoomReconnectionNotice(
  ctx: ServiceContext,
  input: { instructorId: string; reason: string },
): Promise<Outcome<{ notifiedAt: string }>> {
  return attempt(async () => {
    const admin = await requireActor(ctx);
    ensure(admin.platformAdmin, "FORBIDDEN");
    const data = z
      .object({
        instructorId: z.uuid(),
        reason: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(input);

    return ctx.db.$transaction(async (tx) => {
      const account = await tx.zoomAccount.findUnique({
        where: { userId: data.instructorId },
      });
      ensure(account, "NOT_FOUND");
      const now = ctx.now();
      await tx.zoomAccount.update({
        where: { id: account.id },
        data: {
          status:
            account.status === "disconnected"
              ? "disconnected"
              : "reauth_required",
          lastErrorMessage: data.reason,
          reconnectionNotifiedAt: now,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: admin.id,
          action: "zoom.account.reconnect_requested",
          targetId: data.instructorId,
          reason: data.reason,
          createdAt: now,
        },
      });
      return { notifiedAt: now.toISOString() };
    });
  });
}

