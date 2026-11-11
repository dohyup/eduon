import "server-only";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ServiceContext } from "@/server/context";
import { attempt, ensure, type Outcome } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";

export type TimeInterval = { startMs: number; endMs: number };

export function mergeTimeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  const valid = intervals
    .filter(
      (i) =>
        Number.isFinite(i.startMs) &&
        Number.isFinite(i.endMs) &&
        i.endMs > i.startMs,
    )
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  if (valid.length === 0) return [];
  const merged: TimeInterval[] = [{ ...valid[0] }];
  for (let i = 1; i < valid.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = valid[i];
    if (curr.startMs <= prev.endMs) {
      prev.endMs = Math.max(prev.endMs, curr.endMs);
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

export function computeAttendanceStatusFromRate(
  attendanceRate: number,
  joinedLatencySeconds = 0,
): "present" | "late" | "absent" {
  // LMS Attendance Standard:
  // - >= 80% participation -> present (unless joined > 15 mins late and < 90%, still >= 80% is present)
  // - >= 50% participation -> late
  // - < 50% participation -> absent
  if (attendanceRate >= 80) {
    if (joinedLatencySeconds > 15 * 60 && attendanceRate < 85) {
      return "late";
    }
    return "present";
  }
  if (attendanceRate >= 50) return "late";
  return "absent";
}

export async function resolveParticipantToStudent(
  db: PrismaClient,
  offeringId: string,
  participant: {
    participantId: string;
    customerKey?: string | null;
    email?: string | null;
    userName?: string | null;
  },
): Promise<{
  studentId: string | null;
  enrollmentId: string | null;
  mappingStatus: "mapped" | "ambiguous" | "unmapped";
}> {
  const enrollments = await db.enrollment.findMany({
    where: {
      offeringId,
      status: { in: ["active", "completed"] },
    },
    include: {
      student: {
        include: {
          account: { select: { id: true, email: true } },
        },
      },
    },
  });

  // 1. Exact match by customerKey or participantId == studentId or accountUserId
  const candidatesByKey = [
    participant.customerKey?.trim(),
    participant.participantId?.trim(),
  ].filter(Boolean) as string[];

  for (const key of candidatesByKey) {
    const byStudentId = enrollments.find(
      (e) => e.studentId === key || e.student.accountUserId === key,
    );
    if (byStudentId) {
      return {
        studentId: byStudentId.studentId,
        enrollmentId: byStudentId.id,
        mappingStatus: "mapped",
      };
    }
  }

  // 2. Match by verified student account email
  if (participant.email) {
    const cleanEmail = participant.email.trim().toLowerCase();
    const byEmail = enrollments.filter(
      (e) => e.student.account?.email.toLowerCase() === cleanEmail,
    );
    if (byEmail.length === 1) {
      return {
        studentId: byEmail[0].studentId,
        enrollmentId: byEmail[0].id,
        mappingStatus: "mapped",
      };
    }
    if (byEmail.length > 1) {
      return {
        studentId: null,
        enrollmentId: null,
        mappingStatus: "ambiguous",
      };
    }
  }

  // 3. Match by student name only if unique among enrolled students in this offering
  if (participant.userName) {
    const cleanName = participant.userName.trim();
    const byName = enrollments.filter(
      (e) => e.student.name.trim() === cleanName,
    );
    if (byName.length === 1) {
      return {
        studentId: byName[0].studentId,
        enrollmentId: byName[0].id,
        mappingStatus: "mapped",
      };
    }
    if (byName.length > 1) {
      // Homonym (동명이인): Never auto-confirm attendance when mapping is uncertain!
      return {
        studentId: null,
        enrollmentId: null,
        mappingStatus: "ambiguous",
      };
    }
  }

  return {
    studentId: null,
    enrollmentId: null,
    mappingStatus: "unmapped",
  };
}

export async function recalculateSessionAttendance(
  db: PrismaClient,
  sessionId: string,
  options: { markAbsentForNonAttendees?: boolean; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      offering: {
        include: {
          enrollments: {
            where: { status: { in: ["active", "completed"] } },
          },
        },
      },
      zoomAttendanceSessions: true,
    },
  });
  if (!session) return;

  const sessionDurationSeconds = Math.max(
    60,
    Math.round((session.endsAt.getTime() - session.startsAt.getTime()) / 1000),
  );

  // Group mapped attendance sessions by studentId
  const byStudent = new Map<
    string,
    typeof session.zoomAttendanceSessions
  >();
  for (const att of session.zoomAttendanceSessions) {
    if (att.mappingStatus === "mapped" && att.studentId) {
      const list = byStudent.get(att.studentId) ?? [];
      list.push(att);
      byStudent.set(att.studentId, list);
    }
  }

  for (const enrollment of session.offering.enrollments) {
    const studentSessions = byStudent.get(enrollment.studentId) ?? [];
    const existingRecord = await db.attendanceRecord.findUnique({
      where: {
        sessionId_studentId: {
          sessionId: session.id,
          studentId: enrollment.studentId,
        },
      },
    });

    if (studentSessions.length === 0) {
      if (options.markAbsentForNonAttendees && !existingRecord) {
        await db.attendanceRecord.create({
          data: {
            sessionId: session.id,
            studentId: enrollment.studentId,
            enrollmentId: enrollment.id,
            totalSeconds: 0,
            sessionDurationSeconds,
            attendanceRate: 0,
            status: "absent",
            source: "zoom_webhook",
            calculatedAt: now,
          },
        });
      } else if (
        options.markAbsentForNonAttendees &&
        existingRecord &&
        existingRecord.source !== "manual_override" &&
        existingRecord.status === "pending"
      ) {
        await db.attendanceRecord.update({
          where: { id: existingRecord.id },
          data: {
            status: "absent",
            calculatedAt: now,
          },
        });
      }
      continue;
    }

    // Build intervals from completed join/leave pairs
    const rawIntervals: TimeInterval[] = [];
    let firstJoinMs = Number.POSITIVE_INFINITY;
    let lastLeaveMs = 0;

    for (const item of studentSessions) {
      const startMs = item.joinTime.getTime();
      if (startMs < firstJoinMs) firstJoinMs = startMs;
      if (item.leaveTime) {
        const endMs = item.leaveTime.getTime();
        if (endMs > lastLeaveMs) lastLeaveMs = endMs;
        if (endMs > startMs) {
          rawIntervals.push({ startMs, endMs });
        }
      }
    }

    const merged = mergeTimeIntervals(rawIntervals);
    const totalSeconds = merged.reduce(
      (acc, cur) => acc + Math.round((cur.endMs - cur.startMs) / 1000),
      0,
    );
    const rawRate = (totalSeconds / sessionDurationSeconds) * 100;
    const attendanceRate = Math.min(100, Math.round(rawRate * 10) / 10);

    const joinedLatencySeconds = Number.isFinite(firstJoinMs)
      ? Math.max(
          0,
          Math.round((firstJoinMs - session.startsAt.getTime()) / 1000),
        )
      : 0;

    const computedStatus =
      totalSeconds === 0 && !options.markAbsentForNonAttendees
        ? "pending"
        : computeAttendanceStatusFromRate(attendanceRate, joinedLatencySeconds);

    const preserveManual = existingRecord?.source === "manual_override";

    await db.attendanceRecord.upsert({
      where: {
        sessionId_studentId: {
          sessionId: session.id,
          studentId: enrollment.studentId,
        },
      },
      create: {
        sessionId: session.id,
        studentId: enrollment.studentId,
        enrollmentId: enrollment.id,
        totalSeconds,
        sessionDurationSeconds,
        attendanceRate,
        status: computedStatus,
        source: "zoom_webhook",
        firstJoinedAt: Number.isFinite(firstJoinMs)
          ? new Date(firstJoinMs)
          : null,
        lastLeftAt: lastLeaveMs > 0 ? new Date(lastLeaveMs) : null,
        calculatedAt: now,
      },
      update: {
        enrollmentId: enrollment.id,
        totalSeconds,
        sessionDurationSeconds,
        attendanceRate,
        ...(preserveManual ? {} : { status: computedStatus }),
        firstJoinedAt: Number.isFinite(firstJoinMs)
          ? new Date(firstJoinMs)
          : null,
        lastLeftAt: lastLeaveMs > 0 ? new Date(lastLeaveMs) : null,
        calculatedAt: now,
      },
    });
  }
}

export function overrideStudentAttendance(
  ctx: ServiceContext,
  input: {
    sessionId: string;
    studentId: string;
    status: "present" | "late" | "absent";
    reason: string;
  },
): Promise<Outcome<{ recordId: string; status: string }>> {
  return attempt(async () => {
    const actor = await requireActor(ctx);
    const data = z
      .object({
        sessionId: z.uuid(),
        studentId: z.uuid(),
        status: z.enum(["present", "late", "absent"]),
        reason: z.string().trim().min(2).max(500),
      })
      .strict()
      .parse(input);

    const session = await ctx.db.session.findUnique({
      where: { id: data.sessionId },
      include: { offering: { include: { instructors: true } } },
    });
    ensure(session, "NOT_FOUND");

    if (!actor.platformAdmin) {
      const membership = await ctx.db.academyMembership.findUnique({
        where: {
          academyId_userId: {
            academyId: session.academyId,
            userId: actor.id,
          },
        },
      });
      const allowed =
        Boolean(membership?.active) &&
        (membership?.role === "owner" ||
          session.offering.instructors.some((i) => i.userId === actor.id));
      ensure(allowed, "FORBIDDEN");
    }

    const enrollment = await ctx.db.enrollment.findUnique({
      where: {
        offeringId_studentId: {
          offeringId: session.offeringId,
          studentId: data.studentId,
        },
      },
    });
    ensure(enrollment, "NOT_FOUND");

    const sessionDurationSeconds = Math.max(
      60,
      Math.round(
        (session.endsAt.getTime() - session.startsAt.getTime()) / 1000,
      ),
    );

    const saved = await ctx.db.$transaction(async (tx) => {
      const row = await tx.attendanceRecord.upsert({
        where: {
          sessionId_studentId: {
            sessionId: session.id,
            studentId: data.studentId,
          },
        },
        create: {
          sessionId: session.id,
          studentId: data.studentId,
          enrollmentId: enrollment.id,
          totalSeconds:
            data.status === "present" ? sessionDurationSeconds : 0,
          sessionDurationSeconds,
          attendanceRate: data.status === "present" ? 100 : 0,
          status: data.status,
          source: "manual_override",
          manualReason: data.reason,
          updatedById: actor.id,
          calculatedAt: ctx.now(),
        },
        update: {
          status: data.status,
          source: "manual_override",
          manualReason: data.reason,
          updatedById: actor.id,
          calculatedAt: ctx.now(),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: "attendance.manual_override",
          targetId: row.id,
          reason: `${data.status}:${data.reason}`,
          createdAt: ctx.now(),
        },
      });
      return row;
    });

    return { recordId: saved.id, status: saved.status };
  });
}

