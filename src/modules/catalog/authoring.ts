import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { ServiceContext } from "@/server/context";
import { attempt, ensure } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import { lockAcademy, requireAcademyOwner } from "@/modules/academies/service";
import {
  syncOfferingZoomMeetingsInternal,
  toZoomMeetingSummary,
} from "@/modules/zoom/meetings";

const offeringInput = z
  .object({
    academyId: z.uuid(),
    title: z.string().trim().min(1).max(160),
    subject: z.enum(["math", "english"]),
    gradeMin: z.number().int().min(1).max(12),
    gradeMax: z.number().int().min(1).max(12),
    level: z.enum(["beginner", "intermediate", "advanced"]),
    priceWon: z.number().int().min(0).max(2147483647),
    capacity: z.number().int().min(1).max(10000),
    enrollmentOpensAt: z.iso.datetime({ offset: true }),
    enrollmentClosesAt: z.iso.datetime({ offset: true }),
    instructorIds: z.array(z.uuid()).min(1).max(20),
    isZoomLive: z.boolean().optional(),
    zoomWaitingRoom: z.boolean().optional(),
    zoomAutoRecording: z.enum(["none", "cloud", "local"]).optional(),
    sessions: z
      .array(
        z.object({
          startsAt: z.iso.datetime({ offset: true }),
          endsAt: z.iso.datetime({ offset: true }),
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((data, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (data.gradeMin > data.gradeMax) fail("Invalid grade range");
    if (
      Date.parse(data.enrollmentOpensAt) >= Date.parse(data.enrollmentClosesAt)
    )
      fail("Invalid enrollment period");
    if (new Set(data.instructorIds).size !== data.instructorIds.length)
      fail("Duplicate instructor");
    const sessions = [...data.sessions].sort(
      (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
    );
    for (let i = 0; i < sessions.length; i++) {
      if (Date.parse(sessions[i].startsAt) >= Date.parse(sessions[i].endsAt))
        fail("Invalid session");
      if (
        i &&
        Date.parse(sessions[i - 1].endsAt) > Date.parse(sessions[i].startsAt)
      )
        fail("Overlapping sessions");
    }
    if (
      sessions.length &&
      Date.parse(data.enrollmentClosesAt) > Date.parse(sessions[0].startsAt)
    )
      fail("Enrollment must close before the first session");
  });

export type CreateOfferingInput = z.input<typeof offeringInput>;

async function lockInstructors(tx: Prisma.TransactionClient, ids: string[]) {
  for (const id of [...new Set(ids)].sort())
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`instructor:${id}`}))`;
}

async function verifyInstructors(
  tx: Prisma.TransactionClient,
  academyId: string,
  ids: string[],
) {
  const members = await tx.academyMembership.findMany({
    where: {
      academyId,
      userId: { in: ids },
      active: true,
      role: { in: ["instructor", "owner"] },
      user: { disabledAt: null },
    },
    select: { userId: true },
  });
  ensure(members.length === ids.length, "FORBIDDEN");
}

function courseData(data: CreateOfferingInput) {
  return {
    academyId: data.academyId,
    title: data.title,
    subject: data.subject,
    gradeMin: data.gradeMin,
    gradeMax: data.gradeMax,
    level: data.level,
  };
}

function sessionData(data: CreateOfferingInput) {
  return data.sessions.map((s) => ({
    startsAt: new Date(s.startsAt),
    endsAt: new Date(s.endsAt),
  }));
}

export function createOffering(
  ctx: ServiceContext,
  input: CreateOfferingInput,
) {
  return attempt(async () => {
    await requireActor(ctx);
    const data = offeringInput.parse(input);
    const created = await ctx.db.$transaction(async (tx) => {
      await lockAcademy(tx, data.academyId);
      await requireAcademyOwner(tx, ctx.actor.userId, data.academyId);
      await lockInstructors(tx, data.instructorIds);
      await verifyInstructors(tx, data.academyId, data.instructorIds);
      const course = await tx.course.create({ data: courseData(data) });
      const offering = await tx.offering.create({
        data: {
          academyId: data.academyId,
          courseId: course.id,
          priceWon: data.priceWon,
          capacity: data.capacity,
          enrollmentOpensAt: new Date(data.enrollmentOpensAt),
          enrollmentClosesAt: new Date(data.enrollmentClosesAt),
          isZoomLive: data.isZoomLive ?? false,
          zoomWaitingRoom: data.zoomWaitingRoom ?? true,
          zoomAutoRecording: data.zoomAutoRecording ?? "none",
          instructors: {
            create: data.instructorIds.map((userId) => ({ userId })),
          },
          sessions: { create: sessionData(data) },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action: "offering.created",
          targetId: offering.id,
          createdAt: ctx.now(),
        },
      });
      return { offeringId: offering.id };
    });

    if (data.isZoomLive) {
      const zoomSync = await syncOfferingZoomMeetingsInternal(
        ctx,
        created.offeringId,
      );
      return { offeringId: created.offeringId, zoomSync };
    }
    return created;
  });
}

export function updateOffering(
  ctx: ServiceContext,
  offeringId: string,
  input: CreateOfferingInput,
) {
  return attempt(async () => {
    await requireActor(ctx);
    z.uuid().parse(offeringId);
    const data = offeringInput.parse(input);
    const result = await ctx.db.$transaction(async (tx) => {
      await lockAcademy(tx, data.academyId);
      await requireAcademyOwner(tx, ctx.actor.userId, data.academyId);
      const current = await tx.offering.findUnique({
        where: { id: offeringId },
        include: {
          sessions: { orderBy: { startsAt: "asc" } },
          instructors: true,
          _count: { select: { enrollments: { where: { status: "active" } } } },
        },
      });
      ensure(current && current.academyId === data.academyId, "FORBIDDEN");
      await lockInstructors(tx, [
        ...data.instructorIds,
        ...current.instructors.map((i) => i.userId),
      ]);
      ensure(current.status === "draft", "CONFLICT");
      if (current.purchaseLockedAt) {
        const previous = current.sessions
          .map((s) => `${s.startsAt.toISOString()}/${s.endsAt.toISOString()}`)
          .sort();
        const next = data.sessions
          .map(
            (s) =>
              `${new Date(s.startsAt).toISOString()}/${new Date(s.endsAt).toISOString()}`,
          )
          .sort();
        ensure(
          current.priceWon === data.priceWon &&
            JSON.stringify(previous) === JSON.stringify(next),
          "CONFLICT",
        );
      }
      ensure(data.capacity >= current._count.enrollments, "CONFLICT");
      await verifyInstructors(tx, data.academyId, data.instructorIds);
      // A fresh course revision avoids changing another cohort sharing this course.
      const course = await tx.course.create({ data: courseData(data) });

      const nextIsZoomLive = data.isZoomLive ?? current.isZoomLive;
      const nextWaitingRoom = data.zoomWaitingRoom ?? current.zoomWaitingRoom;
      const nextAutoRecording =
        data.zoomAutoRecording ??
        (current.zoomAutoRecording as "none" | "cloud" | "local");

      if (!current.purchaseLockedAt) {
        const incomingSessions = sessionData(data);
        const commonCount = Math.min(
          current.sessions.length,
          incomingSessions.length,
        );
        for (let i = 0; i < commonCount; i++) {
          await tx.session.update({
            where: { id: current.sessions[i].id },
            data: incomingSessions[i],
          });
        }
        if (incomingSessions.length > current.sessions.length) {
          await tx.session.createMany({
            data: incomingSessions.slice(commonCount).map((s) => ({
              offeringId,
              academyId: data.academyId,
              startsAt: s.startsAt,
              endsAt: s.endsAt,
            })),
          });
        } else if (current.sessions.length > incomingSessions.length) {
          const removedIds = current.sessions
            .slice(commonCount)
            .map((s) => s.id);
          await tx.zoomMeeting.deleteMany({
            where: { sessionId: { in: removedIds } },
          });
          await tx.session.deleteMany({
            where: { id: { in: removedIds } },
          });
        }
      }

      await tx.offering.update({
        where: { id: offeringId },
        data: {
          courseId: course.id,
          priceWon: data.priceWon,
          capacity: data.capacity,
          enrollmentOpensAt: new Date(data.enrollmentOpensAt),
          enrollmentClosesAt: new Date(data.enrollmentClosesAt),
          isZoomLive: nextIsZoomLive,
          zoomWaitingRoom: nextWaitingRoom,
          zoomAutoRecording: nextAutoRecording,
          instructors: {
            deleteMany: {},
            create: data.instructorIds.map((userId) => ({ userId })),
          },
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action: "offering.updated",
          targetId: offeringId,
          createdAt: ctx.now(),
        },
      });
      return { offeringId, shouldSyncZoom: nextIsZoomLive };
    });

    if (result.shouldSyncZoom) {
      const zoomSync = await syncOfferingZoomMeetingsInternal(ctx, offeringId);
      if (data.isZoomLive !== undefined) {
        return { offeringId, zoomSync };
      }
    }
    return { offeringId };
  });
}

export function publishOffering(ctx: ServiceContext, offeringId: string) {
  return attempt(async () => {
    await requireActor(ctx);
    z.uuid().parse(offeringId);
    const shouldSyncZoom = await ctx.db.$transaction(async (tx) => {
      const resource = await tx.offering.findUnique({
        where: { id: offeringId },
        select: { academyId: true },
      });
      ensure(resource, "NOT_FOUND");
      await lockAcademy(tx, resource.academyId);
      await requireAcademyOwner(tx, ctx.actor.userId, resource.academyId);
      const offering = await tx.offering.findUniqueOrThrow({
        where: { id: offeringId },
        include: {
          academy: true,
          course: true,
          sessions: true,
          instructors: true,
        },
      });
      ensure(
        offering.status === "draft" &&
          offering.academy.status === "approved" &&
          offering.enrollmentClosesAt > ctx.now(),
        "CONFLICT",
      );
      const data = offeringInput.parse({
        ...offering.course,
        priceWon: offering.priceWon,
        capacity: offering.capacity,
        enrollmentOpensAt: offering.enrollmentOpensAt.toISOString(),
        enrollmentClosesAt: offering.enrollmentClosesAt.toISOString(),
        instructorIds: offering.instructors.map((i) => i.userId),
        sessions: offering.sessions.map((s) => ({
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
        })),
      });
      await lockInstructors(tx, data.instructorIds);
      await verifyInstructors(tx, offering.academyId, data.instructorIds);
      const conflict = await tx.offering.findFirst({
        where: {
          id: { not: offeringId },
          status: "published",
          instructors: { some: { userId: { in: data.instructorIds } } },
          sessions: {
            some: {
              OR: offering.sessions.map((s) => ({
                startsAt: { lt: s.endsAt },
                endsAt: { gt: s.startsAt },
              })),
            },
          },
        },
        select: { id: true },
      });
      ensure(!conflict, "CONFLICT");
      await tx.offering.update({
        where: { id: offeringId },
        data: { status: "published" },
      });
      await tx.auditEvent.create({
        data: {
          actorId: ctx.actor.userId,
          action: "offering.published",
          targetId: offeringId,
          createdAt: ctx.now(),
        },
      });
      return offering.isZoomLive;
    });

    if (shouldSyncZoom) {
      await syncOfferingZoomMeetingsInternal(ctx, offeringId);
    }
  });
}

export function listManagedOfferings(ctx: ServiceContext, cursor?: string) {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    z.uuid().optional().parse(cursor);
    const memberships = await ctx.db.academyMembership.findMany({
      where: { userId: actor.id, active: true },
      select: { academyId: true, role: true },
    });
    const ownerAcademies = memberships
      .filter((m) => m.role === "owner")
      .map((m) => m.academyId);
    const teacherAcademies = memberships
      .filter((m) => m.role === "instructor")
      .map((m) => m.academyId);
    const offerings = await ctx.db.offering.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      where: {
        OR: [
          { academyId: { in: ownerAcademies } },
          {
            academyId: { in: teacherAcademies },
            instructors: { some: { userId: actor.id } },
          },
        ],
      },
      include: {
        course: true,
        sessions: {
          orderBy: { startsAt: "asc" },
          include: {
            zoomMeeting: true,
            _count: {
              select: {
                attendanceRecords: true,
                zoomRecordings: true,
              },
            },
          },
        },
        instructors: {
          include: { instructor: { select: { id: true, email: true } } },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    });
    return offerings.map((offering) => ({
      ...offering,
      sessions: offering.sessions.map((s) => ({
        ...s,
        zoomMeeting: s.zoomMeeting
          ? toZoomMeetingSummary(s.zoomMeeting)
          : null,
      })),
      instructors: offering.instructors.map((assignment) => ({
        ...assignment,
        instructor: {
          id: assignment.instructor.id,
          email: ownerAcademies.includes(offering.academyId)
            ? assignment.instructor.email
            : undefined,
        },
      })),
    }));
  });
}
