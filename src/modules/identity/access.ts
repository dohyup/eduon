import type { ServiceContext } from "@/server/context";
import { attempt, ensure } from "@/server/errors";
export async function requireActor(ctx: ServiceContext) {
  const user = await ctx.db.user.findUnique({
    where: { id: ctx.actor.userId },
  });
  ensure(user && !user.disabledAt, "UNAUTHENTICATED");
  return user;
}
export async function authorizeAcademy(
  ctx: ServiceContext,
  academyId: string,
  role: "owner" | "instructor",
) {
  return attempt(async () => {
    await requireActor(ctx);
    const member = await ctx.db.academyMembership.findUnique({
      where: { academyId_userId: { academyId, userId: ctx.actor.userId } },
    });
    ensure(
      member?.active && (member.role === "owner" || member.role === role),
      "FORBIDDEN",
    );
  });
}
export async function canReadStudent(ctx: ServiceContext, studentId: string) {
  return attempt(async () => {
    await requireActor(ctx);
    const student = await ctx.db.studentProfile.findUnique({
      where: { id: studentId },
    });
    ensure(student, "FORBIDDEN");
    if (student.accountUserId === ctx.actor.userId) return;
    const guardian = await ctx.db.guardianLink.findFirst({
      where: { studentId, guardianId: ctx.actor.userId, revokedAt: null },
    });
    if (guardian) return;
    const enrollment = await ctx.db.enrollment.findFirst({
      where: {
        studentId,
        status: "active",
        offering: {
          OR: [
            {
              academy: {
                memberships: {
                  some: {
                    userId: ctx.actor.userId,
                    role: "owner",
                    active: true,
                  },
                },
              },
            },
            {
              instructors: { some: { userId: ctx.actor.userId } },
              academy: {
                memberships: {
                  some: { userId: ctx.actor.userId, active: true },
                },
              },
            },
          ],
        },
      },
    });
    ensure(enrollment, "FORBIDDEN");
  });
}
