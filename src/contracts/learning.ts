export type LearningView = "student" | "instructor" | "parent";
export type LearningReadiness = {
  enabled: boolean;
  videoConfigured: boolean;
  storageConfigured: boolean;
  scanningConfigured: boolean;
  testMode: boolean;
};
export type LearningOffering = {
  id: string;
  courseTitle: string;
  academyName: string;
  status: string;
  enrollmentId?: string;
  enrollmentStatus?: string;
  nextSessionAt?: string;
};
export type LearningMaterial = {
  id: string;
  filename: string;
  mime: string;
  bytes: number;
  purpose: string;
  scanStatus: string;
  sessionId: string | null;
  createdAt: string;
};
export type LearningFeedback = {
  id: string;
  version: number;
  text: string;
  createdAt: string;
};
export type LearningSubmission = {
  id: string;
  studentId: string;
  studentName?: string;
  version: number;
  text: string;
  late: boolean;
  submittedAt: string;
  files: { materialId: string; filename: string }[];
  feedback: LearningFeedback[];
};
export type LearningAssignment = {
  id: string;
  title: string;
  instructions: string;
  dueAt: string;
  sessionId: string | null;
  createdAt: string;
  submissions: LearningSubmission[];
  submissionsNextCursor?: string | null;
};
export type LearningAttendance = {
  studentId: string;
  status: string;
  reason: string;
  recordedAt: string;
  revisions?: { status: string; reason: string; createdAt: string }[];
};
export type LearningOverview = {
  id: string;
  role: LearningView;
  course: { id: string; title: string; subject: string };
  academy: { id: string; name: string };
  status: string;
  sessions: {
    id: string;
    startsAt: string;
    endsAt: string;
    rightStatus?: string;
    attendance: LearningAttendance[];
  }[];
  enrollment?: { id: string; status: string };
  student?: { id: string; name: string };
  roster: { id: string; name: string }[];
  assignments: LearningAssignment[];
  materials: LearningMaterial[];
  review?: {
    id: string;
    rating: number;
    text: string;
    hiddenAt: string | null;
  };
  nextOfferings: {
    id: string;
    startsAt: string;
    priceWon: number;
    title?: string;
  }[];
  rosterNextCursor: string | null;
  assignmentsNextCursor: string | null;
  materialsNextCursor: string | null;
};
