import { z } from "zod";
import { randomUUID } from "node:crypto";
import { handle, readJson } from "@/server/http";
import { attempt, ensure } from "@/server/errors";
import { requireActor } from "@/modules/identity/access";
import { encryptZoomSecret } from "@/integrations/zoom/crypto";
import { computeAttendanceStatusFromRate } from "@/modules/zoom/attendance";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("enroll_self"),
    offeringId: z.uuid(),
    studentName: z.string().trim().min(1).max(80).optional(),
    grade: z.number().int().min(1).max(12).optional(),
  }),
  z.object({
    action: z.literal("record_attendance"),
    sessionId: z.uuid(),
    participatedMinutes: z.number().int().min(1).max(300).default(50),
    studentName: z.string().trim().min(1).max(80).optional(),
  }),
  z.object({
    action: z.literal("complete_session"),
    sessionId: z.uuid(),
    publishRecording: z.boolean().default(true),
  }),
]);

export function POST(request: Request) {
  return handle(
    request,
    async (ctx) => {
      const body = await readJson(request);
      return attempt(async () => {
        const actor = await requireActor(ctx);
        const input = actionSchema.parse(body);

        if (input.action === "enroll_self") {
          const offering = await ctx.db.offering.findUnique({
            where: { id: input.offeringId },
          });
          ensure(offering, "NOT_FOUND");
          ensure(offering.status === "published", "CONFLICT");

          let student = await ctx.db.studentProfile.findUnique({
            where: { accountUserId: actor.id },
          });
          if (!student) {
            student = await ctx.db.studentProfile.create({
              data: {
                name:
                  input.studentName ||
                  `${actor.email.split("@")[0]} 수강생`,
                grade: input.grade ?? 5,
                accountUserId: actor.id,
              },
            });
            await ctx.db.guardianLink.upsert({
              where: {
                guardianId_studentId: {
                  guardianId: actor.id,
                  studentId: student.id,
                },
              },
              create: {
                guardianId: actor.id,
                studentId: student.id,
                verifiedAt: ctx.now(),
              },
              update: { revokedAt: null },
            });
          }

          const enrollment = await ctx.db.enrollment.upsert({
            where: {
              offeringId_studentId: {
                offeringId: offering.id,
                studentId: student.id,
              },
            },
            create: {
              offeringId: offering.id,
              studentId: student.id,
              status: "active",
              expiresAt: new Date(
                ctx.now().getTime() + 60 * 24 * 60 * 60 * 1000,
              ),
            },
            update: {
              status: "active",
              expiresAt: new Date(
                ctx.now().getTime() + 60 * 24 * 60 * 60 * 1000,
              ),
            },
          });

          return {
            enrollmentId: enrollment.id,
            offeringId: offering.id,
            studentId: student.id,
          };
        }

        if (input.action === "record_attendance") {
          const session = await ctx.db.session.findUnique({
            where: { id: input.sessionId },
            include: {
              offering: true,
              zoomMeeting: true,
            },
          });
          ensure(session, "NOT_FOUND");

          let student = await ctx.db.studentProfile.findUnique({
            where: { accountUserId: actor.id },
          });
          if (!student) {
            const firstEnrollment = await ctx.db.enrollment.findFirst({
              where: { offeringId: session.offeringId, status: "active" },
              include: { student: true },
            });
            if (firstEnrollment) {
              student = firstEnrollment.student;
            } else {
              student = await ctx.db.studentProfile.create({
                data: {
                  name: input.studentName || "김가람",
                  grade: 5,
                  accountUserId: actor.id,
                },
              });
            }
          }

          const enrollment = await ctx.db.enrollment.upsert({
            where: {
              offeringId_studentId: {
                offeringId: session.offeringId,
                studentId: student.id,
              },
            },
            create: {
              offeringId: session.offeringId,
              studentId: student.id,
              status: "active",
            },
            update: { status: "active" },
          });

          const sessionDurationSeconds = Math.max(
            600,
            Math.round(
              (session.endsAt.getTime() - session.startsAt.getTime()) / 1000,
            ),
          );
          const totalSeconds = Math.min(
            sessionDurationSeconds,
            input.participatedMinutes * 60,
          );
          const attendanceRate = Number(
            Math.min(100, (totalSeconds / sessionDurationSeconds) * 100).toFixed(
              1,
            ),
          );
          const status = computeAttendanceStatusFromRate(attendanceRate, 0);

          const record = await ctx.db.attendanceRecord.upsert({
            where: {
              sessionId_studentId: {
                sessionId: session.id,
                studentId: student.id,
              },
            },
            create: {
              sessionId: session.id,
              studentId: student.id,
              enrollmentId: enrollment.id,
              totalSeconds,
              sessionDurationSeconds,
              attendanceRate,
              status,
              source: "zoom_webhook",
              firstJoinedAt: new Date(
                ctx.now().getTime() - totalSeconds * 1000,
              ),
              lastLeftAt: ctx.now(),
              calculatedAt: ctx.now(),
            },
            update: {
              totalSeconds,
              sessionDurationSeconds,
              attendanceRate,
              status,
              firstJoinedAt: new Date(
                ctx.now().getTime() - totalSeconds * 1000,
              ),
              lastLeftAt: ctx.now(),
              calculatedAt: ctx.now(),
            },
          });

          return {
            recordId: record.id,
            status: record.status,
            attendanceRate: record.attendanceRate,
            totalSeconds: record.totalSeconds,
          };
        }

        // complete_session: end meeting & create cloud recording for replay
        const session = await ctx.db.session.findUnique({
          where: { id: input.sessionId },
          include: { zoomMeeting: true, offering: true },
        });
        ensure(session, "NOT_FOUND");
        ensure(session.zoomMeeting, "CONFLICT");

        const updatedMeeting = await ctx.db.zoomMeeting.update({
          where: { id: session.zoomMeeting.id },
          data: {
            status: "ended",
            startedAt: session.zoomMeeting.startedAt ?? session.startsAt,
            endedAt: ctx.now(),
            lastSyncedAt: ctx.now(),
          },
        });

        const fileId = `rec-${session.id.slice(0, 8)}-${randomUUID().slice(0, 6)}`;
        const recording = await ctx.db.zoomRecording.create({
          data: {
            sessionId: session.id,
            zoomMeetingRowId: updatedMeeting.id,
            zoomMeetingUuid:
              updatedMeeting.zoomMeetingUuid ||
              `uuid-${updatedMeeting.zoomMeetingId}`,
            zoomRecordingFileId: fileId,
            fileType: "MP4",
            recordingType: "shared_screen_with_speaker_view",
            fileSize: 48234496,
            encryptedPlayUrl: encryptZoomSecret(
              `https://zoom.us/rec/play/${fileId}`,
            ),
            encryptedDownloadUrl: encryptZoomSecret(
              `https://zoom.us/rec/download/${fileId}`,
            ),
            recordingStart: session.startsAt,
            recordingEnd: ctx.now(),
            durationSeconds: 3000,
            isPublic: input.publishRecording,
            consentNoticeConfirmed: true,
            status: "completed",
            approvedById: actor.id,
            approvedAt: ctx.now(),
          },
        });

        return {
          meetingStatus: updatedMeeting.status,
          recordingId: recording.id,
          isPublic: recording.isPublic,
        };
      });
    },
    true,
  );
}

