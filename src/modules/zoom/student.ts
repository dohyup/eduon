import "server-only";
import type { ServiceContext } from "@/server/context";
import { attempt, ensure, type Outcome } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import { toZoomMeetingSummary } from "./meetings";

export function getStudentZoomLearningOverview(
  ctx: ServiceContext,
): Promise<
  Outcome<{
    student: { id: string; name: string; grade: number };
    overallAttendanceRate: number;
    totalParticipatedMinutes: number;
    enrollments: Array<{
      enrollmentId: string;
      status: string;
      expiresAt: string | null;
      offering: {
        id: string;
        title: string;
        subject: string;
        academyName: string;
        isZoomLive: boolean;
      };
      sessions: Array<{
        id: string;
        startsAt: string;
        endsAt: string;
        zoomMeeting: ReturnType<typeof toZoomMeetingSummary> | null;
        attendance: {
          status: string;
          totalSeconds: number;
          attendanceRate: number;
        } | null;
        publicRecordings: Array<{
          id: string;
          fileType: string;
          durationSeconds: number;
        }>;
      }>;
    }>;
  }>
> {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    const student = await ctx.db.studentProfile.findUnique({
      where: { accountUserId: actor.id },
    });
    ensure(student, "FORBIDDEN");

    const enrollments = await ctx.db.enrollment.findMany({
      where: {
        studentId: student.id,
        status: { in: ["active", "completed"] },
      },
      include: {
        offering: {
          include: {
            course: true,
            academy: { select: { name: true } },
            sessions: {
              orderBy: { startsAt: "asc" },
              include: {
                zoomMeeting: true,
                attendanceRecords: {
                  where: { studentId: student.id },
                },
                zoomRecordings: {
                  where: { isPublic: true, status: "completed" },
                },
              },
            },
          },
        },
      },
      orderBy: { id: "desc" },
    });

    let allRatesSum = 0;
    let allRatesCount = 0;
    let totalSecondsSum = 0;

    const mapped = enrollments.map((e) => ({
      enrollmentId: e.id,
      status: e.status,
      expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null,
      offering: {
        id: e.offering.id,
        title: e.offering.course.title,
        subject: e.offering.course.subject,
        academyName: e.offering.academy.name,
        isZoomLive: e.offering.isZoomLive,
      },
      sessions: e.offering.sessions.map((s) => {
        const att = s.attendanceRecords[0] ?? null;
        if (att) {
          allRatesSum += att.attendanceRate;
          allRatesCount += 1;
          totalSecondsSum += att.totalSeconds;
        }
        return {
          id: s.id,
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          zoomMeeting: s.zoomMeeting
            ? toZoomMeetingSummary(s.zoomMeeting)
            : null,
          attendance: att
            ? {
                status: att.status,
                totalSeconds: att.totalSeconds,
                attendanceRate: att.attendanceRate,
              }
            : null,
          publicRecordings: s.zoomRecordings.map((r) => ({
            id: r.id,
            fileType: r.fileType,
            durationSeconds: r.durationSeconds,
          })),
        };
      }),
    }));

    return {
      student: {
        id: student.id,
        name: student.name,
        grade: student.grade,
      },
      overallAttendanceRate:
        allRatesCount > 0
          ? Math.round((allRatesSum / allRatesCount) * 10) / 10
          : 0,
      totalParticipatedMinutes: Math.round(totalSecondsSum / 60),
      enrollments: mapped,
    };
  });
}

