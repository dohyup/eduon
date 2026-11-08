import { handle, asOutcome } from "@/server/http";
import { requireActor } from "@/modules/identity/access";
export function GET(request: Request) {
  return handle(request, (ctx) =>
    asOutcome(async () => {
      const user = await requireActor(ctx);
      const [memberships, links, student] = await Promise.all([
        ctx.db.academyMembership.findMany({
          where: { userId: user.id, active: true },
          include: { academy: true },
        }),
        ctx.db.guardianLink.findMany({
          where: { guardianId: user.id, revokedAt: null },
          include: { student: true },
        }),
        ctx.db.studentProfile.findUnique({ where: { accountUserId: user.id } }),
      ]);
      const instructors = await ctx.db.academyMembership.findMany({
        where: {
          academyId: {
            in: memberships
              .filter((m) => m.role === "owner")
              .map((m) => m.academyId),
          },
          active: true,
          user: { disabledAt: null },
        },
        select: {
          academyId: true,
          userId: true,
          role: true,
          user: { select: { email: true } },
        },
      });
      return {
        instructors: instructors.map((m) => ({
          academyId: m.academyId,
          userId: m.userId,
          email: m.user.email,
          role: m.role,
        })),
        user: {
          id: user.id,
          email: user.email,
          platformAdmin: user.platformAdmin,
          guardianVerifiedAt: user.guardianVerifiedAt,
        },
        memberships,
        children: links.map((l) => l.student),
        student,
      };
    }),
  );
}
