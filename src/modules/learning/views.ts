import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { ServiceContext } from "@/server/context";
import type {
  LearningView,
  LearningOverview,
  LearningOffering,
} from "@/contracts/learning";
import { attempt, ensure } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import { requireLearningRead, requireTeachingAccess } from "./access";

export function listLearningOfferings(
  ctx: ServiceContext,
  input: { view: LearningView; studentId?: string; cursor?: string },
) {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    z.object({
      view: z.enum(["student", "instructor", "parent"]),
      studentId: z.uuid().optional(),
      cursor: z.uuid().optional(),
    })
      .strict()
      .parse(input);
    let studentId: string | undefined;
    if (input.view === "student") {
      studentId = (
        await ctx.db.studentProfile.findUnique({
          where: { accountUserId: actor.id },
        })
      )?.id;
      ensure(studentId, "FORBIDDEN");
    }
    if (input.view === "parent") {
      ensure(input.studentId && actor.guardianVerifiedAt, "FORBIDDEN");
      const link = await ctx.db.guardianLink.findUnique({
        where: {
          guardianId_studentId: {
            guardianId: actor.id,
            studentId: input.studentId,
          },
        },
      });
      ensure(
        link && !link.revokedAt && link.verifiedAt <= ctx.now(),
        "FORBIDDEN",
      );
      studentId = input.studentId;
    }
    const scope: Prisma.OfferingWhereInput = studentId
      ? {
          enrollments: {
            some: {
              studentId,
              status: { in: ["active", "completed"] },
              sessions: { some: { status: "allowed" } },
              order: {
                is: {
                  status: { in: ["paid", "partially_refunded"] },
                  payment: {
                    is: {
                      status: { in: ["paid", "partially_refunded"] },
                      verifiedAt: { not: null },
                    },
                  },
                },
              },
            },
          },
        }
      : {
          instructors: { some: { userId: actor.id } },
          academy: {
            memberships: {
              some: {
                userId: actor.id,
                active: true,
                role: { in: ["owner", "instructor"] },
              },
            },
          },
        };
    const rows = await ctx.db.offering.findMany({
      where: {
        ...scope,
        ...(input.cursor ? { id: { gt: input.cursor } } : {}),
      },
      take: 21,
      orderBy: { id: "asc" },
      include: {
        course: true,
        academy: { select: { name: true } },
        sessions: { orderBy: { startsAt: "asc" } },
        enrollments: {
          where: studentId ? { studentId } : { id: { in: [] } },
          select: { id: true, status: true },
        },
      },
    });
    const items: LearningOffering[] = rows.slice(0, 20).map((o) => ({
      id: o.id,
      courseTitle: o.course.title,
      academyName: o.academy.name,
      status: o.status,
      ...(o.enrollments[0]
        ? {
            enrollmentId: o.enrollments[0].id,
            enrollmentStatus: o.enrollments[0].status,
          }
        : {}),
      nextSessionAt: o.sessions
        .find((s) => s.endsAt >= ctx.now())
        ?.startsAt.toISOString(),
    }));
    return { items, nextCursor: rows.length > 20 ? rows[19].id : null };
  });
}
export function listRoster(
  ctx: ServiceContext,
  offeringId: string,
  cursor?: string,
) {
  return attempt(async () => {
    await requireTeachingAccess(ctx, offeringId);
    z.uuid().optional().parse(cursor);
    const rows = await ctx.db.studentProfile.findMany({
      where: {
        ...(cursor ? { id: { gt: cursor } } : {}),
        enrollments: {
          some: {
            offeringId,
            status: { in: ["active", "completed"] },
            order: { is: { status: { in: ["paid", "partially_refunded"] } } },
          },
        },
      },
      orderBy: { id: "asc" },
      take: 21,
      select: { id: true, name: true },
    });
    return {
      items: rows.slice(0, 20),
      nextCursor: rows.length > 20 ? rows[19].id : null,
    };
  });
}
export function getLearningOverview(
  ctx: ServiceContext,
  offeringId: string,
  input: { studentId?: string } = {},
) {
  return attempt(async () => {
    const access = await requireLearningRead(ctx, offeringId, input),
      teacher = access.role === "instructor";
    const course = await ctx.db.offering.findUniqueOrThrow({
      where: { id: offeringId },
      include: {
        course: true,
        academy: { select: { id: true, name: true } },
        sessions: { orderBy: { startsAt: "asc" } },
      },
    });
    const rosterPage = teacher ? await listRoster(ctx, offeringId) : null;
    const roster = rosterPage?.ok ? rosterPage.value.items : [];
    const studentId = access.studentId || input.studentId;
    if (teacher && studentId)
      ensure(
        await ctx.db.enrollment.findFirst({
          where: {
            offeringId,
            studentId,
            status: { in: ["active", "completed"] },
          },
        }),
        "FORBIDDEN",
      );
    const visibleStudentIds = studentId ? [studentId] : roster.map((s) => s.id);
    const enrollment = studentId
      ? await ctx.db.enrollment.findUnique({
          where: { offeringId_studentId: { offeringId, studentId } },
          include: {
            sessions: true,
            student: { select: { id: true, name: true } },
          },
        })
      : null;
    const allowedSessions =
      enrollment?.sessions
        .filter((s) => s.status === "allowed")
        .map((s) => s.sessionId) || [];
    const sessionFilter = teacher
      ? {}
      : { OR: [{ sessionId: null }, { sessionId: { in: allowedSessions } }] };
    const assignments = await ctx.db.assignment.findMany({
      where: { offeringId, ...sessionFilter },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 21,
      include: {
        submissions: {
          where: { studentId: { in: visibleStudentIds } },
          take: 21,
          orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
          include: {
            student: { select: { name: true } },
            files: {
              select: {
                materialId: true,
                material: { select: { filename: true } },
              },
            },
            feedback: {
              take: 20,
              orderBy: { version: "desc" },
              select: { id: true, version: true, text: true, createdAt: true },
            },
          },
        },
      },
    });
    const materials = await ctx.db.material.findMany({
      where: {
        offeringId,
        purpose: "material",
        deletedAt: null,
        ...sessionFilter,
        ...(!teacher ? { scanStatus: "clean" } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 21,
      select: {
        id: true,
        filename: true,
        mime: true,
        bytes: true,
        purpose: true,
        scanStatus: true,
        sessionId: true,
        createdAt: true,
      },
    });
    const attendance = await ctx.db.attendance.findMany({
      where: { offeringId, studentId: { in: visibleStudentIds } },
      include: {
        revisions: {
          take: 20,
          orderBy: { createdAt: "desc" },
          select: { status: true, reason: true, createdAt: true },
        },
      },
    });
    const review = enrollment
      ? await ctx.db.review.findUnique({
          where: { enrollmentId: enrollment.id },
          select: { id: true, rating: true, text: true, hiddenAt: true },
        })
      : null;
    const next = await ctx.db.offering.findMany({
      where: {
        courseId: course.courseId,
        id: { not: offeringId },
        status: "published",
        academy: { status: "approved" },
        enrollmentOpensAt: { lte: ctx.now() },
        enrollmentClosesAt: { gt: ctx.now() },
        sessions: { some: { startsAt: { gt: ctx.now() } } },
      },
      take: 20,
      orderBy: { id: "asc" },
      include: { sessions: { take: 1, orderBy: { startsAt: "asc" } } },
    });
    const result: LearningOverview = {
      id: course.id,
      role: teacher
        ? "instructor"
        : access.role === "guardian"
          ? "parent"
          : "student",
      course: {
        id: course.course.id,
        title: course.course.title,
        subject: course.course.subject,
      },
      academy: course.academy,
      status: course.status,
      ...(enrollment
        ? {
            enrollment: { id: enrollment.id, status: enrollment.status },
            student: enrollment.student,
          }
        : {}),
      roster,
      sessions: course.sessions.map((s) => ({
        id: s.id,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        rightStatus: enrollment?.sessions.find((r) => r.sessionId === s.id)
          ?.status,
        attendance: attendance
          .filter((a) => a.sessionId === s.id)
          .map((a) => ({
            studentId: a.studentId,
            status: a.status,
            reason: a.reason,
            recordedAt: a.recordedAt.toISOString(),
            revisions: a.revisions.map((r) => ({
              ...r,
              createdAt: r.createdAt.toISOString(),
            })),
          })),
      })),
      assignments: assignments.slice(0, 20).map((a) => ({
        id: a.id,
        title: a.title,
        instructions: a.instructions,
        dueAt: a.dueAt.toISOString(),
        sessionId: a.sessionId,
        createdAt: a.createdAt.toISOString(),
        submissions: a.submissions.slice(0, 20).map((s) => ({
          id: s.id,
          studentId: s.studentId,
          studentName: s.student.name,
          version: s.version,
          text: s.text,
          late: s.late,
          submittedAt: s.submittedAt.toISOString(),
          files: s.files.map((f) => ({
            materialId: f.materialId,
            filename: f.material.filename,
          })),
          feedback: s.feedback.map((f) => ({
            ...f,
            createdAt: f.createdAt.toISOString(),
          })),
        })),
        submissionsNextCursor:
          a.submissions.length > 20 ? a.submissions[19].id : null,
      })),
      materials: materials
        .slice(0, 20)
        .map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
      ...(review
        ? {
            review: {
              ...review,
              hiddenAt: review.hiddenAt?.toISOString() || null,
            },
          }
        : {}),
      nextOfferings: next
        .filter((o) => o.sessions[0])
        .map((o) => ({
          id: o.id,
          startsAt: o.sessions[0].startsAt.toISOString(),
          priceWon: o.priceWon,
          title: course.course.title,
        })),
      rosterNextCursor: rosterPage?.ok ? rosterPage.value.nextCursor : null,
      assignmentsNextCursor:
        assignments.length > 20 ? assignments[19].id : null,
      materialsNextCursor: materials.length > 20 ? materials[19].id : null,
    };
    return result;
  });
}
