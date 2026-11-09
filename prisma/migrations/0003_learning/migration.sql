-- CreateTable
CREATE TABLE "Attendance" (
    "id" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRevision" (
    "id" UUID NOT NULL,
    "attendanceId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "sessionId" UUID,
    "uploaderId" UUID NOT NULL,
    "ownerStudentId" UUID,
    "purpose" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "scanStatus" TEXT NOT NULL DEFAULT 'quarantined',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "sessionId" UUID,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionFile" (
    "id" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "materialId" UUID NOT NULL,

    CONSTRAINT "SubmissionFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "authorId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3),
    "hiddenReason" TEXT,
    "moderatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewReport" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "resolutionReason" TEXT,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" UUID NOT NULL,
    "academyId" UUID,
    "offeringId" UUID,
    "orderId" UUID,
    "enrollmentId" UUID,
    "actorId" UUID,
    "stage" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attendance_academyId_idx" ON "Attendance"("academyId");

-- CreateIndex
CREATE INDEX "Attendance_offeringId_idx" ON "Attendance"("offeringId");

-- CreateIndex
CREATE INDEX "Attendance_sessionId_idx" ON "Attendance"("sessionId");

-- CreateIndex
CREATE INDEX "Attendance_enrollmentId_idx" ON "Attendance"("enrollmentId");

-- CreateIndex
CREATE INDEX "Attendance_studentId_idx" ON "Attendance"("studentId");

-- CreateIndex
CREATE INDEX "Attendance_authorId_idx" ON "Attendance"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_sessionId_studentId_key" ON "Attendance"("sessionId", "studentId");

-- CreateIndex
CREATE INDEX "AttendanceRevision_attendanceId_idx" ON "AttendanceRevision"("attendanceId");

-- CreateIndex
CREATE INDEX "AttendanceRevision_authorId_idx" ON "AttendanceRevision"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_objectKey_key" ON "Material"("objectKey");

-- CreateIndex
CREATE INDEX "Material_academyId_idx" ON "Material"("academyId");

-- CreateIndex
CREATE INDEX "Material_offeringId_idx" ON "Material"("offeringId");

-- CreateIndex
CREATE INDEX "Material_sessionId_idx" ON "Material"("sessionId");

-- CreateIndex
CREATE INDEX "Material_uploaderId_idx" ON "Material"("uploaderId");

-- CreateIndex
CREATE INDEX "Material_ownerStudentId_idx" ON "Material"("ownerStudentId");

-- CreateIndex
CREATE INDEX "Assignment_academyId_idx" ON "Assignment"("academyId");

-- CreateIndex
CREATE INDEX "Assignment_offeringId_idx" ON "Assignment"("offeringId");

-- CreateIndex
CREATE INDEX "Assignment_sessionId_idx" ON "Assignment"("sessionId");

-- CreateIndex
CREATE INDEX "Assignment_createdById_idx" ON "Assignment"("createdById");

-- CreateIndex
CREATE INDEX "Submission_offeringId_idx" ON "Submission"("offeringId");

-- CreateIndex
CREATE INDEX "Submission_assignmentId_idx" ON "Submission"("assignmentId");

-- CreateIndex
CREATE INDEX "Submission_studentId_idx" ON "Submission"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_assignmentId_studentId_version_key" ON "Submission"("assignmentId", "studentId", "version");

-- CreateIndex
CREATE INDEX "SubmissionFile_submissionId_idx" ON "SubmissionFile"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionFile_submissionId_materialId_key" ON "SubmissionFile"("submissionId", "materialId");

-- CreateIndex
CREATE INDEX "Feedback_submissionId_idx" ON "Feedback"("submissionId");

-- CreateIndex
CREATE INDEX "Feedback_authorId_idx" ON "Feedback"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_submissionId_version_key" ON "Feedback"("submissionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Review_enrollmentId_key" ON "Review"("enrollmentId");

-- CreateIndex
CREATE INDEX "Review_authorId_idx" ON "Review"("authorId");

-- CreateIndex
CREATE INDEX "Review_moderatedById_idx" ON "Review"("moderatedById");

-- CreateIndex
CREATE INDEX "ReviewReport_reviewId_idx" ON "ReviewReport"("reviewId");

-- CreateIndex
CREATE INDEX "ReviewReport_reporterId_idx" ON "ReviewReport"("reporterId");

-- CreateIndex
CREATE INDEX "ReviewReport_resolvedById_idx" ON "ReviewReport"("resolvedById");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewReport_reviewId_reporterId_key" ON "ReviewReport"("reviewId", "reporterId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsEvent_dedupeKey_key" ON "AnalyticsEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_academyId_idx" ON "AnalyticsEvent"("academyId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_offeringId_idx" ON "AnalyticsEvent"("offeringId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_orderId_idx" ON "AnalyticsEvent"("orderId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_enrollmentId_idx" ON "AnalyticsEvent"("enrollmentId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_actorId_idx" ON "AnalyticsEvent"("actorId");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRevision" ADD CONSTRAINT "AttendanceRevision_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRevision" ADD CONSTRAINT "AttendanceRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_ownerStudentId_fkey" FOREIGN KEY ("ownerStudentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReport" ADD CONSTRAINT "ReviewReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- P4 server-only tables: Data API roles default deny.
ALTER TABLE "Attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttendanceRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Material" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubmissionFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Review" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReviewReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalyticsEvent" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX learning_session_scope ON "Session"(id,"offeringId","academyId");
CREATE UNIQUE INDEX learning_enrollment_scope ON "Enrollment"(id,"offeringId","studentId");
CREATE UNIQUE INDEX learning_assignment_scope ON "Assignment"(id,"offeringId","academyId");
CREATE UNIQUE INDEX learning_submission_scope ON "Submission"(id,"offeringId","academyId","studentId");
CREATE UNIQUE INDEX learning_submission_feedback_scope ON "Submission"(id,"offeringId","academyId");
CREATE UNIQUE INDEX learning_material_scope ON "Material"(id,"offeringId","academyId","ownerStudentId");
CREATE UNIQUE INDEX learning_order_scope ON "Order"(id,"offeringId","academyId");
CREATE UNIQUE INDEX learning_enrollment_analytics_scope ON "Enrollment"(id,"offeringId");
ALTER TABLE "Attendance" ADD CONSTRAINT attendance_session_scope FOREIGN KEY("sessionId","offeringId","academyId") REFERENCES "Session"(id,"offeringId","academyId") ON DELETE RESTRICT;
ALTER TABLE "Attendance" ADD CONSTRAINT attendance_enrollment_scope FOREIGN KEY("enrollmentId","offeringId","studentId") REFERENCES "Enrollment"(id,"offeringId","studentId") ON DELETE RESTRICT;
ALTER TABLE "Attendance" ADD CONSTRAINT attendance_right_scope FOREIGN KEY("enrollmentId","sessionId") REFERENCES "EnrollmentSession"("enrollmentId","sessionId") ON DELETE RESTRICT;
ALTER TABLE "Material" ADD CONSTRAINT material_offering_scope FOREIGN KEY("offeringId","academyId") REFERENCES "Offering"(id,"academyId") ON DELETE RESTRICT;
ALTER TABLE "Material" ADD CONSTRAINT material_session_scope FOREIGN KEY("sessionId","offeringId","academyId") REFERENCES "Session"(id,"offeringId","academyId") ON DELETE RESTRICT;
ALTER TABLE "Assignment" ADD CONSTRAINT assignment_offering_scope FOREIGN KEY("offeringId","academyId") REFERENCES "Offering"(id,"academyId") ON DELETE RESTRICT;
ALTER TABLE "Assignment" ADD CONSTRAINT assignment_session_scope FOREIGN KEY("sessionId","offeringId","academyId") REFERENCES "Session"(id,"offeringId","academyId") ON DELETE RESTRICT;
ALTER TABLE "Submission" ADD CONSTRAINT submission_assignment_scope FOREIGN KEY("assignmentId","offeringId","academyId") REFERENCES "Assignment"(id,"offeringId","academyId") ON DELETE RESTRICT;
ALTER TABLE "Submission" ADD CONSTRAINT submission_enrollment_scope FOREIGN KEY("offeringId","studentId") REFERENCES "Enrollment"("offeringId","studentId") ON DELETE RESTRICT;
ALTER TABLE "SubmissionFile" ADD CONSTRAINT submission_file_scope FOREIGN KEY("submissionId","offeringId","academyId","studentId") REFERENCES "Submission"(id,"offeringId","academyId","studentId") ON DELETE RESTRICT;
ALTER TABLE "SubmissionFile" ADD CONSTRAINT submission_file_material_scope FOREIGN KEY("materialId","offeringId","academyId","studentId") REFERENCES "Material"(id,"offeringId","academyId","ownerStudentId") ON DELETE RESTRICT;
ALTER TABLE "Feedback" ADD CONSTRAINT feedback_submission_scope FOREIGN KEY("submissionId","offeringId","academyId") REFERENCES "Submission"(id,"offeringId","academyId") ON DELETE RESTRICT;
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT analytics_offering_scope FOREIGN KEY("offeringId","academyId") REFERENCES "Offering"(id,"academyId") ON DELETE RESTRICT;
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT analytics_order_scope FOREIGN KEY("orderId","offeringId","academyId") REFERENCES "Order"(id,"offeringId","academyId") ON DELETE RESTRICT;
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT analytics_enrollment_scope FOREIGN KEY("enrollmentId","offeringId") REFERENCES "Enrollment"(id,"offeringId") ON DELETE RESTRICT;

ALTER TABLE "Attendance" ADD CONSTRAINT attendance_fields CHECK(status IN ('present','absent','late') AND length(trim(reason)) BETWEEN 1 AND 2000);
ALTER TABLE "AttendanceRevision" ADD CONSTRAINT attendance_revision_fields CHECK(status IN ('present','absent','late') AND length(trim(reason)) BETWEEN 1 AND 2000);
ALTER TABLE "Material" ADD CONSTRAINT material_fields CHECK(purpose IN ('material','submission') AND "scanStatus" IN ('quarantined','clean','rejected') AND bytes BETWEEN 1 AND 10485760 AND mime IN ('application/pdf','image/png','image/jpeg') AND length(filename) BETWEEN 1 AND 255 AND sha256 ~ '^[0-9a-f]{64}$' AND ((purpose='material' AND "ownerStudentId" IS NULL) OR (purpose='submission' AND "ownerStudentId" IS NOT NULL)));
ALTER TABLE "Assignment" ADD CONSTRAINT assignment_fields CHECK(length(trim(title)) BETWEEN 1 AND 200 AND length(instructions)<=10000);
ALTER TABLE "Submission" ADD CONSTRAINT submission_fields CHECK(version>0 AND length(text)<=10000);
ALTER TABLE "Feedback" ADD CONSTRAINT feedback_fields CHECK(version>0 AND length(trim(text)) BETWEEN 1 AND 10000);
ALTER TABLE "Review" ADD CONSTRAINT review_fields CHECK(rating BETWEEN 1 AND 5 AND length(trim(text)) BETWEEN 1 AND 2000 AND (("hiddenAt" IS NULL AND "hiddenReason" IS NULL AND "moderatedById" IS NULL) OR ("hiddenAt" IS NOT NULL AND "hiddenReason" IS NOT NULL AND length(trim("hiddenReason"))>0 AND "moderatedById" IS NOT NULL)));
ALTER TABLE "ReviewReport" ADD CONSTRAINT review_report_fields CHECK(length(trim(reason)) BETWEEN 1 AND 2000 AND status IN ('open','resolved') AND ((status='open' AND resolution IS NULL AND "resolvedAt" IS NULL AND "resolvedById" IS NULL AND "resolutionReason" IS NULL) OR (status='resolved' AND resolution IS NOT NULL AND resolution IN ('keep','hide') AND "resolvedAt" IS NOT NULL AND "resolvedById" IS NOT NULL AND "resolutionReason" IS NOT NULL AND length(trim("resolutionReason")) BETWEEN 1 AND 2000)));
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT analytics_fields CHECK(stage IN ('search','detail','application','paid','first_participation','reenrollment') AND length("dedupeKey") BETWEEN 1 AND 200 AND ("offeringId" IS NULL OR "academyId" IS NOT NULL) AND ("orderId" IS NULL OR "offeringId" IS NOT NULL) AND ("enrollmentId" IS NULL OR "offeringId" IS NOT NULL));
CREATE INDEX learning_assignment_due ON "Assignment"("offeringId","dueAt");
CREATE INDEX learning_report_queue ON "ReviewReport"(status,"createdAt");
CREATE INDEX learning_analytics_aggregate ON "AnalyticsEvent"("academyId",stage,"createdAt");
CREATE INDEX learning_attendance_history ON "AttendanceRevision"("attendanceId","createdAt");
CREATE FUNCTION learning_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'LEARNING_HISTORY_APPEND_ONLY' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER attendance_revision_immutable BEFORE UPDATE OR DELETE ON "AttendanceRevision" FOR EACH ROW EXECUTE FUNCTION learning_append_only();
CREATE TRIGGER submission_immutable BEFORE UPDATE OR DELETE ON "Submission" FOR EACH ROW EXECUTE FUNCTION learning_append_only();
CREATE TRIGGER submission_file_immutable BEFORE UPDATE OR DELETE ON "SubmissionFile" FOR EACH ROW EXECUTE FUNCTION learning_append_only();
CREATE TRIGGER feedback_immutable BEFORE UPDATE OR DELETE ON "Feedback" FOR EACH ROW EXECUTE FUNCTION learning_append_only();

CREATE TRIGGER attendance_revision_no_truncate BEFORE TRUNCATE ON "AttendanceRevision" FOR EACH STATEMENT EXECUTE FUNCTION learning_append_only();
CREATE TRIGGER submission_no_truncate BEFORE TRUNCATE ON "Submission" FOR EACH STATEMENT EXECUTE FUNCTION learning_append_only();
CREATE TRIGGER submission_file_no_truncate BEFORE TRUNCATE ON "SubmissionFile" FOR EACH STATEMENT EXECUTE FUNCTION learning_append_only();
CREATE TRIGGER feedback_no_truncate BEFORE TRUNCATE ON "Feedback" FOR EACH STATEMENT EXECUTE FUNCTION learning_append_only();
