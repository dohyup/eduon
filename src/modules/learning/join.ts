import "server-only";
import { z } from "zod";
import type { ServiceContext } from "@/server/context";
import { AppError, attempt, ensure } from "@/server/errors";
import { requireStudentAccess, requireTeachingAccess } from "./access";
import { lockOrder } from "@/modules/payments/locking";
import {
  allowedVideoHost,
  getVideoProvider,
} from "@/integrations/video/provider";
import type { VideoPort } from "@/integrations/video/port";
async function admission(ctx: ServiceContext, sessionId: string) {
  return ctx.db.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      include: { offering: { include: { academy: true } } },
    });
    ensure(session, "FORBIDDEN");
    ensure(
      session.offering.academy.status === "approved" &&
        ["published", "closed"].includes(session.offering.status),
      "FORBIDDEN",
    );
    const bound = await tx.studentProfile.findUnique({
      where: { accountUserId: ctx.actor.userId },
    });
    const scoped = { ...ctx, db: tx };
    let access;
    if (bound) {
      const enrollment = await tx.enrollment.findUnique({
        where: {
          offeringId_studentId: {
            offeringId: session.offeringId,
            studentId: bound.id,
          },
        },
      });
      ensure(enrollment?.orderId, "FORBIDDEN");
      await lockOrder(tx, enrollment.orderId, ctx.now());
      access = await requireStudentAccess(scoped, session.offeringId, {
        sessionId,
      });
    } else access = await requireTeachingAccess(scoped, session.offeringId);
    const now = ctx.now().getTime();
    ensure(
      now >= session.startsAt.getTime() - 600000 &&
        now <= session.endsAt.getTime() + 600000,
      "EXPIRED",
    );
    return {
      session,
      access,
      expiresAt: new Date(
        Math.min(now + 120000, session.endsAt.getTime() + 600000),
      ),
    };
  });
}
export function requestJoin(
  ctx: ServiceContext,
  sessionId: string,
  port?: VideoPort,
) {
  return attempt(async () => {
    z.uuid().parse(sessionId);
    const grant = await admission(ctx, sessionId);
    let result: { joinUrl: string };
    try {
      result = await (port ?? getVideoProvider()).createJoin({
        sessionId,
        participantId: ctx.actor.userId,
        role: grant.access.role,
        expiresAt: grant.expiresAt,
        recordingEnabled: false,
        startsAt: grant.session.startsAt,
        roomExpiresAt: new Date(grant.session.endsAt.getTime() + 600000),
      });
      const url = new URL(result.joinUrl);
      ensure(
        url.protocol === "https:" &&
          url.hostname === allowedVideoHost() &&
          !url.username &&
          !url.password &&
          !url.port,
        "PROVIDER_UNAVAILABLE",
      );
    } catch {
      throw new AppError("PROVIDER_UNAVAILABLE");
    }
    const checked = await admission(ctx, sessionId);
    ensure(
      checked.access.role === grant.access.role &&
        checked.access.userId === grant.access.userId,
      "FORBIDDEN",
    );
    ensure(ctx.now() < grant.expiresAt, "EXPIRED");
    return {
      joinUrl: result.joinUrl,
      expiresAt: grant.expiresAt.toISOString(),
    };
  });
}
