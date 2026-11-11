-- AlterTable Offering for Zoom Live options
ALTER TABLE "Offering"
  ADD COLUMN "isZoomLive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "zoomWaitingRoom" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "zoomAutoRecording" TEXT NOT NULL DEFAULT 'none';

ALTER TABLE "Offering"
  ADD CONSTRAINT "offering_zoom_recording_check" CHECK ("zoomAutoRecording" IN ('none', 'cloud', 'local'));

-- AlterTable Enrollment for expiration policy
ALTER TABLE "Enrollment"
  ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateTable zoom_accounts
CREATE TABLE "zoom_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "zoomUserId" TEXT NOT NULL,
    "zoomEmail" TEXT,
    "zoomDisplayName" TEXT,
    "accountType" INTEGER NOT NULL DEFAULT 1,
    "cloudRecordingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'connected',
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "reconnectionNotifiedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zoom_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "zoom_accounts_status_check" CHECK ("status" IN ('connected', 'expired', 'reauth_required', 'disconnected', 'error'))
);

-- CreateTable zoom_oauth_states
CREATE TABLE "zoom_oauth_states" (
    "id" UUID NOT NULL,
    "stateHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "redirectPath" TEXT NOT NULL DEFAULT '/instructor',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zoom_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable zoom_meetings
CREATE TABLE "zoom_meetings" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "instructorId" UUID NOT NULL,
    "zoomAccountId" UUID,
    "zoomMeetingId" TEXT NOT NULL,
    "zoomMeetingUuid" TEXT,
    "zoomHostId" TEXT NOT NULL,
    "joinUrl" TEXT NOT NULL,
    "encryptedPassword" TEXT,
    "waitingRoom" BOOLEAN NOT NULL DEFAULT true,
    "autoRecording" TEXT NOT NULL DEFAULT 'none',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "syncError" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "recordingConsentRequired" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zoom_meetings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "zoom_meetings_status_check" CHECK ("status" IN ('scheduled', 'started', 'ended', 'cancelled', 'sync_failed', 'needs_admin_review')),
    CONSTRAINT "zoom_meetings_recording_check" CHECK ("autoRecording" IN ('none', 'cloud', 'local'))
);

-- CreateTable zoom_attendance_sessions
CREATE TABLE "zoom_attendance_sessions" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "studentId" UUID,
    "zoomMeetingRowId" UUID NOT NULL,
    "zoomMeetingUuid" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "participantEmail" TEXT,
    "participantName" TEXT,
    "mappingStatus" TEXT NOT NULL DEFAULT 'mapped',
    "joinTime" TIMESTAMP(3) NOT NULL,
    "leaveTime" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "isCorrectedOnEnd" BOOLEAN NOT NULL DEFAULT false,
    "joinEventId" TEXT,
    "leaveEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zoom_attendance_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "zoom_attendance_mapping_check" CHECK ("mappingStatus" IN ('mapped', 'ambiguous', 'unmapped'))
);

-- CreateTable attendance_records
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "enrollmentId" UUID,
    "totalSeconds" INTEGER NOT NULL DEFAULT 0,
    "sessionDurationSeconds" INTEGER NOT NULL DEFAULT 0,
    "attendanceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'zoom_webhook',
    "firstJoinedAt" TIMESTAMP(3),
    "lastLeftAt" TIMESTAMP(3),
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manualReason" TEXT,
    "updatedById" UUID,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attendance_records_status_check" CHECK ("status" IN ('present', 'late', 'absent', 'pending', 'unverified_mapping')),
    CONSTRAINT "attendance_records_source_check" CHECK ("source" IN ('zoom_webhook', 'manual_override'))
);

-- CreateTable zoom_recordings
CREATE TABLE "zoom_recordings" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "zoomMeetingRowId" UUID NOT NULL,
    "zoomMeetingUuid" TEXT NOT NULL,
    "zoomRecordingFileId" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "recordingType" TEXT,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "encryptedPlayUrl" TEXT,
    "encryptedDownloadUrl" TEXT,
    "recordingStart" TIMESTAMP(3),
    "recordingEnd" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "consentNoticeConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zoom_recordings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "zoom_recordings_status_check" CHECK ("status" IN ('processing', 'completed', 'failed', 'deleted'))
);

-- CreateTable zoom_webhook_events
CREATE TABLE "zoom_webhook_events" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventTs" BIGINT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "zoom_webhook_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "zoom_webhook_events_status_check" CHECK ("status" IN ('pending', 'processing', 'processed', 'failed', 'ignored'))
);

-- CreateTable session_materials
CREATE TABLE "session_materials" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX "zoom_accounts_userId_key" ON "zoom_accounts"("userId");
CREATE INDEX "zoom_accounts_zoomUserId_idx" ON "zoom_accounts"("zoomUserId");
CREATE INDEX "zoom_accounts_status_lastSyncedAt_idx" ON "zoom_accounts"("status", "lastSyncedAt");

CREATE UNIQUE INDEX "zoom_oauth_states_stateHash_key" ON "zoom_oauth_states"("stateHash");
CREATE INDEX "zoom_oauth_states_userId_expiresAt_idx" ON "zoom_oauth_states"("userId", "expiresAt");

CREATE UNIQUE INDEX "zoom_meetings_sessionId_key" ON "zoom_meetings"("sessionId");
CREATE INDEX "zoom_meetings_zoomMeetingId_idx" ON "zoom_meetings"("zoomMeetingId");
CREATE INDEX "zoom_meetings_zoomMeetingUuid_idx" ON "zoom_meetings"("zoomMeetingUuid");
CREATE INDEX "zoom_meetings_offeringId_status_idx" ON "zoom_meetings"("offeringId", "status");
CREATE INDEX "zoom_meetings_instructorId_status_idx" ON "zoom_meetings"("instructorId", "status");

CREATE UNIQUE INDEX "zoom_attendance_sessions_joinEventId_key" ON "zoom_attendance_sessions"("joinEventId");
CREATE UNIQUE INDEX "zoom_attendance_sessions_leaveEventId_key" ON "zoom_attendance_sessions"("leaveEventId");
CREATE INDEX "zoom_attendance_sessions_sessionId_studentId_idx" ON "zoom_attendance_sessions"("sessionId", "studentId");
CREATE INDEX "zoom_attendance_sessions_zoomMeetingRowId_participantId_idx" ON "zoom_attendance_sessions"("zoomMeetingRowId", "participantId");
CREATE INDEX "zoom_attendance_sessions_zoomMeetingUuid_participantId_idx" ON "zoom_attendance_sessions"("zoomMeetingUuid", "participantId");

CREATE UNIQUE INDEX "attendance_records_sessionId_studentId_key" ON "attendance_records"("sessionId", "studentId");
CREATE INDEX "attendance_records_studentId_status_idx" ON "attendance_records"("studentId", "status");

CREATE UNIQUE INDEX "zoom_recordings_zoomRecordingFileId_key" ON "zoom_recordings"("zoomRecordingFileId");
CREATE INDEX "zoom_recordings_sessionId_isPublic_status_idx" ON "zoom_recordings"("sessionId", "isPublic", "status");
CREATE INDEX "zoom_recordings_zoomMeetingUuid_idx" ON "zoom_recordings"("zoomMeetingUuid");

CREATE UNIQUE INDEX "zoom_webhook_events_eventId_key" ON "zoom_webhook_events"("eventId");
CREATE INDEX "zoom_webhook_events_status_receivedAt_idx" ON "zoom_webhook_events"("status", "receivedAt");
CREATE INDEX "zoom_webhook_events_eventType_receivedAt_idx" ON "zoom_webhook_events"("eventType", "receivedAt");

CREATE INDEX "session_materials_sessionId_idx" ON "session_materials"("sessionId");

-- AddForeignKeys
ALTER TABLE "zoom_accounts" ADD CONSTRAINT "zoom_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "zoom_oauth_states" ADD CONSTRAINT "zoom_oauth_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "zoom_meetings" ADD CONSTRAINT "zoom_meetings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "zoom_meetings" ADD CONSTRAINT "zoom_meetings_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "zoom_meetings" ADD CONSTRAINT "zoom_meetings_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "zoom_meetings" ADD CONSTRAINT "zoom_meetings_zoomAccountId_fkey" FOREIGN KEY ("zoomAccountId") REFERENCES "zoom_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "zoom_attendance_sessions" ADD CONSTRAINT "zoom_attendance_sessions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "zoom_attendance_sessions" ADD CONSTRAINT "zoom_attendance_sessions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "zoom_attendance_sessions" ADD CONSTRAINT "zoom_attendance_sessions_zoomMeetingRowId_fkey" FOREIGN KEY ("zoomMeetingRowId") REFERENCES "zoom_meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "zoom_recordings" ADD CONSTRAINT "zoom_recordings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "zoom_recordings" ADD CONSTRAINT "zoom_recordings_zoomMeetingRowId_fkey" FOREIGN KEY ("zoomMeetingRowId") REFERENCES "zoom_meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "session_materials" ADD CONSTRAINT "session_materials_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable Row Level Security on all new tables
ALTER TABLE "zoom_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "zoom_oauth_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "zoom_meetings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "zoom_attendance_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "zoom_recordings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "zoom_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session_materials" ENABLE ROW LEVEL SECURITY;

