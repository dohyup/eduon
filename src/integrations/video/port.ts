export type VideoJoinInput = {
  sessionId: string;
  participantId: string;
  role: "student" | "instructor";
  startsAt: Date;
  roomExpiresAt: Date;
  expiresAt: Date;
  recordingEnabled: false;
};
export type VideoPort = {
  createJoin(input: VideoJoinInput): Promise<{ joinUrl: string }>;
};
