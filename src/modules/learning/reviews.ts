import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ServiceContext } from "@/server/context";
import { attempt, ensure } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import { lockOrder } from "@/modules/payments/locking";
const reviewInput = z
  .object({
    enrollmentId: z.uuid(),
    rating: z.number().int().min(1).max(5),
    text: z.string().trim().min(1).max(2000),
  })
  .strict();
export function createReview(
  ctx: ServiceContext,
  input: z.input<typeof reviewInput>,
) {
  return attempt(async () => {
    const actor = await requireActor(ctx),
      data = reviewInput.parse(input);
    const ref = await ctx.db.enrollment.findUnique({
      where: { id: data.enrollmentId },
      select: { orderId: true },
    });
    ensure(ref?.orderId, "FORBIDDEN");
    return ctx.db.$transaction(async (tx) => {
      const order = await lockOrder(tx, ref.orderId!, ctx.now());
      const enrollment = await tx.enrollment.findUniqueOrThrow({
        where: { id: data.enrollmentId },
        include: { student: true, sessions: true },
      });
      ensure(
        enrollment.status === "completed" &&
          ["paid", "partially_refunded"].includes(order.status) &&
          order.payment &&
          order.payment.verifiedAt &&
          ["paid", "partially_refunded"].includes(order.payment.status) &&
          enrollment.sessions.some((s) => s.status === "allowed") &&
          enrollment.sessions.every((s) => s.endsAt <= ctx.now()),
        "FORBIDDEN",
      );
      if (enrollment.student.accountUserId !== actor.id) {
        const link = await tx.guardianLink.findUnique({
          where: {
            guardianId_studentId: {
              guardianId: actor.id,
              studentId: enrollment.studentId,
            },
          },
        });
        ensure(
          actor.id === order.parentId &&
            actor.guardianVerifiedAt &&
            link &&
            !link.revokedAt &&
            link.verifiedAt <= ctx.now(),
          "FORBIDDEN",
        );
      }
      ensure(
        !(await tx.review.findUnique({
          where: { enrollmentId: enrollment.id },
        })),
        "CONFLICT",
      );
      const r = await tx.review.create({
        data: {
          enrollmentId: enrollment.id,
          authorId: actor.id,
          rating: data.rating,
          text: data.text,
          createdAt: ctx.now(),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: "review.created",
          targetId: r.id,
          createdAt: ctx.now(),
        },
      });
      return { reviewId: r.id };
    });
  });
}
export function reportReview(
  ctx: ServiceContext,
  input: { reviewId: string; reason: string },
) {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    const data = z
      .object({ reviewId: z.uuid(), reason: z.string().trim().min(1).max(500) })
      .strict()
      .parse(input);
    const review = await ctx.db.review.findFirst({
      where: {
        id: data.reviewId,
        hiddenAt: null,
        enrollment: { offering: { academy: { status: "approved" } } },
      },
    });
    ensure(review, "NOT_FOUND");
    return ctx.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`review-report:${actor.id}:${review.id}`}))`;
      const old = await tx.reviewReport.findUnique({
        where: {
          reviewId_reporterId: { reviewId: review.id, reporterId: actor.id },
        },
      });
      if (old) {
        ensure(old.reason === data.reason, "CONFLICT");
        return { reportId: old.id };
      }
      const report = await tx.reviewReport.create({
        data: {
          reviewId: review.id,
          reporterId: actor.id,
          reason: data.reason,
          createdAt: ctx.now(),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: "review.reported",
          targetId: report.id,
          reason: data.reason,
          createdAt: ctx.now(),
        },
      });
      return { reportId: report.id };
    });
  });
}
export function resolveReport(
  ctx: ServiceContext,
  input: { reportId: string; action: "hide" | "keep"; reason: string },
) {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    ensure(actor.platformAdmin, "FORBIDDEN");
    const data = z
      .object({
        reportId: z.uuid(),
        action: z.enum(["hide", "keep"]),
        reason: z.string().trim().min(1).max(500),
      })
      .strict()
      .parse(input);
    await ctx.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`review-moderation:${data.reportId}`}))`;
      const report = await tx.reviewReport.findUnique({
        where: { id: data.reportId },
      });
      ensure(report, "NOT_FOUND");
      if (report.status === "resolved") {
        ensure(
          report.resolution === data.action &&
            report.resolutionReason === data.reason,
          "CONFLICT",
        );
        return;
      }
      await tx.reviewReport.update({
        where: { id: report.id },
        data: {
          status: "resolved",
          resolution: data.action,
          resolutionReason: data.reason,
          resolvedById: actor.id,
          resolvedAt: ctx.now(),
        },
      });
      if (data.action === "hide")
        await tx.review.update({
          where: { id: report.reviewId },
          data: {
            hiddenAt: ctx.now(),
            hiddenReason: data.reason,
            moderatedById: actor.id,
          },
        });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: `review.report.${data.action}`,
          targetId: report.id,
          reason: data.reason,
          createdAt: ctx.now(),
        },
      });
    });
  });
}
export async function listPublicReviews(
  db: PrismaClient,
  offeringId: string,
  cursor?: string,
) {
  z.uuid().parse(offeringId);
  z.uuid().optional().parse(cursor);
  const rows = await db.review.findMany({
    where: {
      hiddenAt: null,
      enrollment: {
        offeringId,
        offering: {
          academy: { status: "approved" },
          status: { in: ["published", "closed", "completed"] },
        },
      },
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: 21,
    select: { id: true, rating: true, text: true, createdAt: true },
  });
  return {
    items: rows
      .slice(0, 20)
      .map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    nextCursor: rows.length > 20 ? rows[19].id : null,
  };
}
export function listReviewReports(ctx: ServiceContext, cursor?: string) {
  return attempt(async () => {
    const user = await requireActor(ctx);
    ensure(user.platformAdmin, "FORBIDDEN");
    z.uuid().optional().parse(cursor);
    const rows = await ctx.db.reviewReport.findMany({
      where: cursor ? { id: { gt: cursor } } : {},
      orderBy: { id: "asc" },
      take: 21,
      include: {
        review: {
          select: { id: true, rating: true, text: true, hiddenAt: true },
        },
      },
    });
    return {
      items: rows.slice(0, 20).map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() || null,
        review: {
          ...r.review,
          hiddenAt: r.review.hiddenAt?.toISOString() || null,
        },
      })),
      nextCursor: rows.length > 20 ? rows[19].id : null,
    };
  });
}
