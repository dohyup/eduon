-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "platformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "guardianVerifiedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Academy" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Academy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyMembership" (
    "id" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AcademyMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "accountUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardianLink" (
    "id" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "GuardianLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentInvitation" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "issuedById" UUID NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "StudentInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstructorInvitation" (
    "issuedById" UUID NOT NULL,
    "id" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "InstructorInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "gradeMin" INTEGER NOT NULL,
    "gradeMax" INTEGER NOT NULL,
    "level" TEXT NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offering" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "priceWon" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "enrollmentOpensAt" TIMESTAMP(3) NOT NULL,
    "enrollmentClosesAt" TIMESTAMP(3) NOT NULL,
    "purchaseLockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstructorAssignment" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "InstructorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RecommendationEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "candidateIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Academy_status_createdAt_idx" ON "Academy"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AcademyMembership_userId_active_idx" ON "AcademyMembership"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyMembership_academyId_userId_key" ON "AcademyMembership"("academyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_accountUserId_key" ON "StudentProfile"("accountUserId");

-- CreateIndex
CREATE INDEX "GuardianLink_studentId_revokedAt_idx" ON "GuardianLink"("studentId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuardianLink_guardianId_studentId_key" ON "GuardianLink"("guardianId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentInvitation_tokenHash_key" ON "StudentInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "StudentInvitation_studentId_expiresAt_idx" ON "StudentInvitation"("studentId", "expiresAt");

-- CreateIndex
CREATE INDEX "StudentInvitation_issuedById_idx" ON "StudentInvitation"("issuedById");

-- CreateIndex
CREATE UNIQUE INDEX "InstructorInvitation_tokenHash_key" ON "InstructorInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "InstructorInvitation_academyId_expiresAt_idx" ON "InstructorInvitation"("academyId", "expiresAt");

-- CreateIndex
CREATE INDEX "Course_academyId_idx" ON "Course"("academyId");

-- CreateIndex
CREATE UNIQUE INDEX "Course_id_academyId_key" ON "Course"("id", "academyId");

-- CreateIndex
CREATE INDEX "Offering_academyId_status_idx" ON "Offering"("academyId", "status");

-- CreateIndex
CREATE INDEX "Offering_status_enrollmentClosesAt_id_idx" ON "Offering"("status", "enrollmentClosesAt", "id");

-- CreateIndex
CREATE INDEX "Offering_courseId_academyId_idx" ON "Offering"("courseId", "academyId");

-- CreateIndex
CREATE UNIQUE INDEX "Offering_id_academyId_key" ON "Offering"("id", "academyId");

-- CreateIndex
CREATE INDEX "Session_offeringId_academyId_idx" ON "Session"("offeringId", "academyId");

-- CreateIndex
CREATE INDEX "Session_startsAt_endsAt_idx" ON "Session"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "InstructorAssignment_userId_idx" ON "InstructorAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InstructorAssignment_offeringId_userId_key" ON "InstructorAssignment"("offeringId", "userId");

-- CreateIndex
CREATE INDEX "Enrollment_studentId_status_idx" ON "Enrollment"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_offeringId_studentId_key" ON "Enrollment"("offeringId", "studentId");

-- CreateIndex
CREATE INDEX "AuditEvent_targetId_createdAt_idx" ON "AuditEvent"("targetId", "createdAt");

-- CreateIndex
CREATE INDEX "RecommendationEvent_actorId_createdAt_idx" ON "RecommendationEvent"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "AcademyMembership" ADD CONSTRAINT "AcademyMembership_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyMembership" ADD CONSTRAINT "AcademyMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_accountUserId_fkey" FOREIGN KEY ("accountUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianLink" ADD CONSTRAINT "GuardianLink_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianLink" ADD CONSTRAINT "GuardianLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInvitation" ADD CONSTRAINT "StudentInvitation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInvitation" ADD CONSTRAINT "StudentInvitation_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorInvitation" ADD CONSTRAINT "InstructorInvitation_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorInvitation" ADD CONSTRAINT "InstructorInvitation_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offering" ADD CONSTRAINT "Offering_courseId_academyId_fkey" FOREIGN KEY ("courseId", "academyId") REFERENCES "Course"("id", "academyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offering" ADD CONSTRAINT "Offering_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_offeringId_academyId_fkey" FOREIGN KEY ("offeringId", "academyId") REFERENCES "Offering"("id", "academyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorAssignment" ADD CONSTRAINT "InstructorAssignment_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorAssignment" ADD CONSTRAINT "InstructorAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business invariants remain true for direct SQL writes.
ALTER TABLE "Academy" ADD CONSTRAINT "academy_status_check" CHECK (status IN ('draft','submitted','approved','rejected','suspended'));
ALTER TABLE "AcademyMembership" ADD CONSTRAINT "membership_role_check" CHECK (role IN ('owner','instructor'));
ALTER TABLE "StudentProfile" ADD CONSTRAINT "student_grade_check" CHECK (grade BETWEEN 1 AND 12);
ALTER TABLE "Course" ADD CONSTRAINT "course_fields_check" CHECK ("gradeMin" BETWEEN 1 AND 12 AND "gradeMax" BETWEEN "gradeMin" AND 12 AND subject IN ('math','english') AND level IN ('beginner','intermediate','advanced'));
ALTER TABLE "Offering" ADD CONSTRAINT "offering_fields_check" CHECK ("priceWon">=0 AND capacity>0 AND "enrollmentClosesAt">"enrollmentOpensAt" AND status IN ('draft','published','closed','completed','cancelled'));
ALTER TABLE "Session" ADD CONSTRAINT "session_time_check" CHECK ("endsAt">"startsAt");
ALTER TABLE "Enrollment" ADD CONSTRAINT "enrollment_status_check" CHECK (status IN ('active','cancelled','completed','pending_payment'));
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Academy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademyMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuardianLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InstructorInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Course" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Offering" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InstructorAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateLimit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecommendationEvent" ENABLE ROW LEVEL SECURITY;
