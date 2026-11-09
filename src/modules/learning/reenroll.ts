import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { ServiceContext } from "@/server/context";
import { attempt, ensure, AppError } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import { createOrder } from "@/modules/enrollment/orders";
import { recordConversion } from "@/modules/analytics/events";
export function startReenrollment(
  ctx: ServiceContext,
  input: {
    enrollmentId: string;
    nextOfferingId: string;
    requestKey: string;
    consent?: boolean;
  },
) {
  return attempt(async () => {
    const actor = await requireActor(ctx),
      data = z
        .object({
          enrollmentId: z.uuid(),
          nextOfferingId: z.uuid(),
          requestKey: z.string().min(1).max(120),
          consent: z.literal(true).optional(),
        })
        .strict()
        .parse(input);
    const old = await ctx.db.enrollment.findUnique({
      where: { id: data.enrollmentId },
      include: { offering: true, order: true },
    });
    ensure(
      old?.status === "completed" &&
        old.order?.parentId === actor.id &&
        actor.guardianVerifiedAt,
      "FORBIDDEN",
    );
    const link = await ctx.db.guardianLink.findUnique({
      where: {
        guardianId_studentId: {
          guardianId: actor.id,
          studentId: old.studentId,
        },
      },
    });
    ensure(
      link && !link.revokedAt && link.verifiedAt <= ctx.now(),
      "FORBIDDEN",
    );
    const target = await ctx.db.offering.findUnique({
      where: { id: data.nextOfferingId },
    });
    ensure(
      target &&
        target.id !== old.offeringId &&
        target.courseId === old.offering.courseId &&
        target.academyId === old.offering.academyId,
      "FORBIDDEN",
    );
    const key =
      "reenroll:" +
      createHash("sha256").update(`${old.id}:${data.requestKey}`).digest("hex");
    const r = await createOrder(ctx, {
      studentId: old.studentId,
      offeringId: target.id,
      requestKey: key,
      consent: data.consent,
    });
    if (!r.ok) throw new AppError(r.code);
    await recordConversion(ctx.db, {
      stage: "reenrollment",
      academyId: target.academyId,
      offeringId: target.id,
      orderId: r.value.orderId,
      actorId: actor.id,
      dedupeKey: `reenrollment:${r.value.orderId}`,
      now: ctx.now(),
    });
    return r.value;
  });
}
