import { handle, asOutcome } from "@/server/http";
import { requireActor } from "@/modules/identity/access";
import { formatSanitizedZoomAccount } from "@/modules/zoom/account";
export function GET(request: Request) {
  return handle(request, (ctx) =>
    asOutcome(async () => {
      const user = await requireActor(ctx);
      const [memberships, links, student, zoomRow] = await Promise.all([
        ctx.db.academyMembership.findMany({
          where: { userId: user.id, active: true },
          include: { academy: true },
        }),
        ctx.db.guardianLink.findMany({
          where: { guardianId: user.id, revokedAt: null },
          include: { student: true },
        }),
        ctx.db.studentProfile.findUnique({ where: { accountUserId: user.id } }),
        ctx.db.zoomAccount.findUnique({ where: { userId: user.id } }),
      ]);
      const ownedAcademyIds = memberships
        .filter((m) => m.role === "owner")
        .map((m) => m.academyId);
      const instructors = await ctx.db.academyMembership.findMany({
        where: {
          academyId: {
            in: ownedAcademyIds,
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
      const canViewStudents = user.platformAdmin || ownedAcademyIds.length > 0;
      const allStudents = canViewStudents
        ? await ctx.db.studentProfile.findMany({
            include: {
              account: { select: { email: true } },
              enrollments: {
                include: {
                  offering: {
                    include: {
                      course: { select: { title: true } },
                      academy: { select: { id: true, name: true, region: true } },
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
          })
        : [];
      const registeredStudents = allStudents.map((sp) => {
        const firstEnrollment = sp.enrollments?.[0];
        return {
          id: sp.id,
          name: sp.name,
          grade: sp.grade,
          email: sp.account?.email ?? null,
          academyName: firstEnrollment?.offering?.academy?.name ?? null,
          academyRegion: firstEnrollment?.offering?.academy?.region ?? null,
          courseTitle: firstEnrollment?.offering?.course?.title ?? null,
          enrollmentStatus: firstEnrollment?.status ?? "active",
        };
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
        registeredStudents,
        zoomAccount: formatSanitizedZoomAccount(zoomRow, ctx.now()),
      };
    }),
  );
}
