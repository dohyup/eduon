import "server-only";
import { z } from "zod";
import type { ServiceContext } from "@/server/context";
import { attempt, ensure, type Outcome } from "@/server/errors";
import { requireActor } from "./access";
import { configuredAdminEmails } from "@/server/config";

export type PlatformAdminItem = {
  id: string;
  email: string;
  createdAt: string;
  fromEnvConfig: boolean;
};

export function listPlatformAdmins(
  ctx: ServiceContext,
): Promise<
  Outcome<{
    admins: PlatformAdminItem[];
    configuredEmails: string[];
  }>
> {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    ensure(actor.platformAdmin, "FORBIDDEN");

    const envEmails = configuredAdminEmails();
    const rows = await ctx.db.user.findMany({
      where: {
        platformAdmin: true,
        disabledAt: null,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });

    return {
      admins: rows.map((row) => ({
        id: row.id,
        email: row.email,
        createdAt: row.createdAt.toISOString(),
        fromEnvConfig: envEmails.includes(row.email.toLowerCase()),
      })),
      configuredEmails: envEmails,
    };
  });
}

const operatorMutationInput = z
  .object({
    action: z.enum(["grant", "revoke", "replace"]),
    email: z.email().max(254),
    previousEmail: z.email().max(254).optional(),
    reason: z.string().trim().min(4).max(500),
  })
  .strict();

export function managePlatformAdminByEmail(
  ctx: ServiceContext,
  input: z.input<typeof operatorMutationInput>,
): Promise<
  Outcome<{
    action: "grant" | "revoke" | "replace";
    email: string;
    previousEmail?: string;
  }>
> {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    ensure(actor.platformAdmin, "FORBIDDEN");

    const data = operatorMutationInput.parse(input);
    const targetEmail = data.email.trim().toLowerCase();
    const prevEmail = data.previousEmail?.trim().toLowerCase();

    return ctx.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('platform_admins_lock'))`;

      if (data.action === "grant") {
        const user = await tx.user.findUnique({
          where: { email: targetEmail },
        });
        ensure(user && !user.disabledAt, "NOT_FOUND");

        await tx.user.update({
          where: { id: user.id },
          data: { platformAdmin: true },
        });
        await tx.auditEvent.create({
          data: {
            actorId: actor.id,
            action: "operator.granted",
            targetId: user.id,
            reason: `${targetEmail}:${data.reason}`,
            createdAt: ctx.now(),
          },
        });
        return { action: "grant" as const, email: targetEmail };
      }

      if (data.action === "revoke") {
        const user = await tx.user.findUnique({
          where: { email: targetEmail },
        });
        ensure(user, "NOT_FOUND");
        ensure(user.platformAdmin, "CONFLICT");

        const activeAdminCount = await tx.user.count({
          where: { platformAdmin: true, disabledAt: null },
        });
        // 최소 1명의 플랫폼 관리자는 항상 유지되어야 함
        ensure(activeAdminCount > 1, "CONFLICT");

        await tx.user.update({
          where: { id: user.id },
          data: { platformAdmin: false },
        });
        await tx.auditEvent.create({
          data: {
            actorId: actor.id,
            action: "operator.revoked",
            targetId: user.id,
            reason: `${targetEmail}:${data.reason}`,
            createdAt: ctx.now(),
          },
        });
        return { action: "revoke" as const, email: targetEmail };
      }

      // action === "replace": 기존 관리자 이메일에서 새 이메일로 관리자 권한 변경/이전
      ensure(prevEmail && prevEmail !== targetEmail, "VALIDATION");
      const [prevUser, nextUser] = await Promise.all([
        tx.user.findUnique({ where: { email: prevEmail } }),
        tx.user.findUnique({ where: { email: targetEmail } }),
      ]);
      ensure(prevUser && prevUser.platformAdmin, "NOT_FOUND");
      ensure(nextUser && !nextUser.disabledAt, "NOT_FOUND");

      await tx.user.update({
        where: { id: prevUser.id },
        data: { platformAdmin: false },
      });
      await tx.user.update({
        where: { id: nextUser.id },
        data: { platformAdmin: true },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: "operator.replaced",
          targetId: nextUser.id,
          reason: `${prevEmail}->${targetEmail}:${data.reason}`,
          createdAt: ctx.now(),
        },
      });
      return {
        action: "replace" as const,
        email: targetEmail,
        previousEmail: prevEmail,
      };
    });
  });
}

