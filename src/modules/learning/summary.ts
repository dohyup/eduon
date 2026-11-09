import "server-only";
import { z } from "zod";
import type { ServiceContext } from "@/server/context";
import { attempt, ensure } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
/** Only factual aggregates of a student's own or currently linked child's data. */
export function getLearningSummary(ctx: ServiceContext, studentId: string) {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    z.uuid().parse(studentId);
    const student = await ctx.db.studentProfile.findUnique({
      where: { id: studentId },
    });
    ensure(student, "FORBIDDEN");
    if (student.accountUserId !== actor.id) {
      const link = await ctx.db.guardianLink.findUnique({
        where: { guardianId_studentId: { guardianId: actor.id, studentId } },
      });
      ensure(
        actor.guardianVerifiedAt &&
          link &&
          !link.revokedAt &&
          link.verifiedAt <= ctx.now(),
        "FORBIDDEN",
      );
    }
    const enrollments = await ctx.db.enrollment.findMany({
      where: {
        studentId,
        status: { in: ["active", "completed"] },
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
      select: {
        offeringId: true,
        sessions: { where: { status: "allowed" }, select: { sessionId: true } },
      },
    });
    const scope = enrollments
      .filter((e) => e.sessions.length)
      .map((e) => ({
        offeringId: e.offeringId,
        OR: [
          { sessionId: null },
          { sessionId: { in: e.sessions.map((s) => s.sessionId) } },
        ],
      }));
    if (!scope.length)
      return {
        studentId,
        attendanceCount: 0,
        pendingAssignments: 0,
        lateSubmissions: 0,
      };
    const [attendanceCount, pendingAssignments, lateSubmissions] =
      await Promise.all([
        ctx.db.attendance.count({
          where: {
            studentId,
            status: { in: ["present", "late"] },
            sessionId: {
              in: enrollments.flatMap((e) =>
                e.sessions.map((s) => s.sessionId),
              ),
            },
          },
        }),
        ctx.db.assignment.count({
          where: { OR: scope, submissions: { none: { studentId } } },
        }),
        ctx.db.submission
          .groupBy({
            by: ["assignmentId"],
            where: { studentId, late: true, assignment: { OR: scope } },
            _count: { _all: true },
          })
          .then((r) => r.length),
      ]);
    return { studentId, attendanceCount, pendingAssignments, lateSubmissions };
  });
}
