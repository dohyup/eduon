import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../src/generated/prisma/client";
export async function seedScenario(
  db: PrismaClient,
  input: { capacity?: number; academyStatus?: "approved" | "submitted" } = {},
) {
  const actors = Object.fromEntries(
    await Promise.all(
      [
        "owner",
        "otherOwner",
        "teacher",
        "otherTeacher",
        "parent",
        "otherParent",
        "student",
        "admin",
      ].map(async (name) => {
        const user = await db.user.create({
          data: {
            email: `${name}-${randomUUID()}@example.test`,
            platformAdmin: name === "admin",
            guardianVerifiedAt: name.includes("arent") ? new Date() : null,
          },
        });
        return [name, { userId: user.id }];
      }),
    ),
  ) as Record<
    | "owner"
    | "otherOwner"
    | "teacher"
    | "otherTeacher"
    | "parent"
    | "otherParent"
    | "student"
    | "admin",
    { userId: string }
  >;
  const academy = await db.academy.create({
    data: {
      name: "가상 이음학원",
      region: "대구",
      status: input.academyStatus || "approved",
    },
  });
  const other = await db.academy.create({
    data: { name: "가상 온빛학원", region: "대구", status: "approved" },
  });
  await db.academyMembership.createMany({
    data: [
      { academyId: academy.id, userId: actors.owner.userId, role: "owner" },
      {
        academyId: academy.id,
        userId: actors.teacher.userId,
        role: "instructor",
      },
      { academyId: other.id, userId: actors.otherOwner.userId, role: "owner" },
      {
        academyId: other.id,
        userId: actors.otherTeacher.userId,
        role: "instructor",
      },
    ],
  });
  const student = await db.studentProfile.create({
    data: { name: "가상 학생", grade: 5 },
  });
  const otherStudent = await db.studentProfile.create({
    data: { name: "다른 가상 학생", grade: 5 },
  });
  await db.guardianLink.createMany({
    data: [
      {
        guardianId: actors.parent.userId,
        studentId: student.id,
        verifiedAt: new Date(),
      },
      {
        guardianId: actors.otherParent.userId,
        studentId: otherStudent.id,
        verifiedAt: new Date(),
      },
    ],
  });
  const course = await db.course.create({
    data: {
      academyId: academy.id,
      title: "가상 수학",
      subject: "math",
      gradeMin: 4,
      gradeMax: 6,
      level: "beginner",
    },
  });
  const offering = await db.offering.create({
    data: {
      academyId: academy.id,
      courseId: course.id,
      priceWon: 100000,
      capacity: input.capacity || 2,
      enrollmentOpensAt: new Date("2029-01-01"),
      enrollmentClosesAt: new Date("2029-12-31"),
      instructors: { create: { userId: actors.teacher.userId } },
      sessions: {
        create: {
          startsAt: new Date("2030-01-01T01:00:00Z"),
          endsAt: new Date("2030-01-01T02:00:00Z"),
        },
      },
    },
    include: { sessions: true },
  });
  return {
    ...actors,
    studentId: student.id,
    otherStudentId: otherStudent.id,
    academyId: academy.id,
    otherAcademyId: other.id,
    courseId: course.id,
    offeringId: offering.id,
    sessionId: offering.sessions[0].id,
  };
}
