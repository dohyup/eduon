export type ZoomOAuthTokenResponse = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scope: string;
};

export type ZoomUserProfile = {
  id: string;
  email: string;
  displayName: string;
  type: number; // 1 = Basic, 2 = Licensed, 3 = On-Prem
  cloudRecordingAllowed: boolean;
};

export type ZoomCreateMeetingInput = {
  topic: string;
  startTimeIso: string;
  durationMinutes: number;
  waitingRoom: boolean;
  autoRecording: "none" | "cloud" | "local";
  agenda?: string;
};

export type ZoomMeetingResource = {
  meetingId: string;
  meetingUuid: string;
  hostId: string;
  joinUrl: string;
  password: string;
  waitingRoom: boolean;
  autoRecording: "none" | "cloud" | "local";
  status: string;
};

export type ZoomRecordingFileResource = {
  id: string;
  meetingUuid: string;
  fileType: string;
  recordingType: string;
  fileSize: number;
  playUrl: string;
  downloadUrl: string;
  recordingStart: string;
  recordingEnd: string;
  status: string;
};

export class ZoomApiError extends Error {
  constructor(
    public status: number,
    public zoomCode: string,
    message = zoomCode,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export interface ZoomPort {
  buildAuthorizeUrl(state: string): string;
  exchangeCodeForTokens(code: string): Promise<ZoomOAuthTokenResponse>;
  refreshTokens(refreshToken: string): Promise<ZoomOAuthTokenResponse>;
  revokeToken(accessToken: string): Promise<void>;
  getCurrentUser(accessToken: string): Promise<ZoomUserProfile>;
  getHostZakToken(accessToken: string): Promise<{ zak: string; expiresIn: number }>;
  createMeeting(
    accessToken: string,
    input: ZoomCreateMeetingInput,
  ): Promise<ZoomMeetingResource>;
  updateMeeting(
    accessToken: string,
    meetingId: string,
    input: Partial<ZoomCreateMeetingInput>,
  ): Promise<void>;
  deleteMeeting(accessToken: string, meetingId: string): Promise<void>;
  getMeetingRecordings(
    accessToken: string,
    meetingIdOrUuid: string,
  ): Promise<ZoomRecordingFileResource[]>;
}

