import { createHash, randomUUID } from "node:crypto";
import {
  isZoomMockEnabled,
  zoomApiBaseUrl,
  zoomOAuthBaseUrl,
  zoomRedirectUri,
} from "@/server/config";
import {
  ZoomApiError,
  type ZoomCreateMeetingInput,
  type ZoomMeetingResource,
  type ZoomOAuthTokenResponse,
  type ZoomPort,
  type ZoomRecordingFileResource,
  type ZoomUserProfile,
} from "./port";

export const ZOOM_REQUIRED_SCOPES = [
  "user:read:user",
  "meeting:write:meeting",
  "meeting:read:meeting",
  "cloud_recording:read:list_user_recordings",
] as const;

const TIMEOUT_MS = 8000;

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  let lastError: unknown;
  for (let attemptIndex = 0; attemptIndex <= maxRetries; attemptIndex++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.status === 429 && attemptIndex < maxRetries) {
        const retryAfter = Math.min(
          Number(response.headers.get("retry-after") || "1"),
          3,
        );
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 250));
        continue;
      }
      if (response.status >= 500 && attemptIndex < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, (attemptIndex + 1) * 200),
        );
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attemptIndex < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, (attemptIndex + 1) * 200),
        );
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ZoomApiError(
    503,
    "ZOOM_NETWORK_TIMEOUT",
    lastError instanceof Error ? lastError.message : "Zoom API unreachable",
  );
}

function basicAuthHeader(): string {
  const clientId = process.env.ZOOM_CLIENT_ID || "";
  const clientSecret = process.env.ZOOM_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    throw new ZoomApiError(503, "ZOOM_OAUTH_UNCONFIGURED");
  }
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
}

class HttpZoomProvider implements ZoomPort {
  buildAuthorizeUrl(state: string): string {
    const clientId = process.env.ZOOM_CLIENT_ID;
    if (!clientId) throw new ZoomApiError(503, "ZOOM_OAUTH_UNCONFIGURED");
    const url = new URL(`${zoomOAuthBaseUrl()}/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", zoomRedirectUri());
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeCodeForTokens(code: string): Promise<ZoomOAuthTokenResponse> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: zoomRedirectUri(),
    });
    const res = await fetchWithRetry(`${zoomOAuthBaseUrl()}/token`, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new ZoomApiError(res.status, "ZOOM_OAUTH_TOKEN_EXCHANGE_FAILED");
    }
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!data.access_token || !data.refresh_token) {
      throw new ZoomApiError(502, "ZOOM_OAUTH_INVALID_RESPONSE");
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresInSeconds: Number(data.expires_in || 3600),
      scope: String(data.scope || ZOOM_REQUIRED_SCOPES.join(" ")),
    };
  }

  async refreshTokens(refreshToken: string): Promise<ZoomOAuthTokenResponse> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    const res = await fetchWithRetry(`${zoomOAuthBaseUrl()}/token`, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    if (res.status === 400 || res.status === 401) {
      throw new ZoomApiError(res.status, "ZOOM_REFRESH_TOKEN_INVALID");
    }
    if (!res.ok) {
      throw new ZoomApiError(res.status, "ZOOM_REFRESH_FAILED");
    }
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!data.access_token || !data.refresh_token) {
      throw new ZoomApiError(502, "ZOOM_OAUTH_INVALID_RESPONSE");
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresInSeconds: Number(data.expires_in || 3600),
      scope: String(data.scope || ZOOM_REQUIRED_SCOPES.join(" ")),
    };
  }

  async revokeToken(accessToken: string): Promise<void> {
    const body = new URLSearchParams({ token: accessToken });
    await fetchWithRetry(
      `${zoomOAuthBaseUrl()}/revoke`,
      {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
      0,
    ).catch(() => undefined);
  }

  async getCurrentUser(accessToken: string): Promise<ZoomUserProfile> {
    const res = await fetchWithRetry(`${zoomApiBaseUrl()}/users/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401) {
      throw new ZoomApiError(401, "ZOOM_ACCESS_TOKEN_EXPIRED");
    }
    if (!res.ok) {
      throw new ZoomApiError(res.status, "ZOOM_USER_FETCH_FAILED");
    }
    const data = (await res.json()) as {
      id?: string;
      email?: string;
      first_name?: string;
      last_name?: string;
      display_name?: string;
      type?: number;
    };
    if (!data.id) throw new ZoomApiError(502, "ZOOM_USER_INVALID_RESPONSE");
    const accountType = Number(data.type || 1);
    return {
      id: data.id,
      email: (data.email || "").toLowerCase(),
      displayName:
        data.display_name ||
        [data.first_name, data.last_name].filter(Boolean).join(" ") ||
        "Zoom 강사",
      type: accountType,
      cloudRecordingAllowed: accountType >= 2,
    };
  }

  async getHostZakToken(
    accessToken: string,
  ): Promise<{ zak: string; expiresIn: number }> {
    const res = await fetchWithRetry(
      `${zoomApiBaseUrl()}/users/me/token?type=zak&ttl=7200`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!res.ok) {
      throw new ZoomApiError(res.status, "ZOOM_ZAK_FETCH_FAILED");
    }
    const data = (await res.json()) as { token?: string };
    if (!data.token) throw new ZoomApiError(502, "ZOOM_ZAK_INVALID_RESPONSE");
    return { zak: data.token, expiresIn: 7200 };
  }

  async createMeeting(
    accessToken: string,
    input: ZoomCreateMeetingInput,
  ): Promise<ZoomMeetingResource> {
    const res = await fetchWithRetry(`${zoomApiBaseUrl()}/users/me/meetings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: input.topic,
        type: 2, // Scheduled meeting
        start_time: input.startTimeIso,
        duration: input.durationMinutes,
        timezone: "Asia/Seoul",
        agenda: input.agenda || input.topic,
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: false,
          mute_upon_entry: true,
          waiting_room: input.waitingRoom,
          auto_recording: input.autoRecording,
        },
      }),
    });
    if (res.status === 429) {
      throw new ZoomApiError(
        429,
        "ZOOM_RATE_LIMITED",
        "Zoom API rate limit exceeded",
        Number(res.headers.get("retry-after") || "5"),
      );
    }
    if (!res.ok) {
      throw new ZoomApiError(res.status, "ZOOM_MEETING_CREATE_FAILED");
    }
    const data = (await res.json()) as {
      id?: number | string;
      uuid?: string;
      host_id?: string;
      join_url?: string;
      password?: string;
      status?: string;
      settings?: { waiting_room?: boolean; auto_recording?: string };
    };
    if (!data.id || !data.join_url || !data.host_id) {
      throw new ZoomApiError(502, "ZOOM_MEETING_INVALID_RESPONSE");
    }
    return {
      meetingId: String(data.id),
      meetingUuid: String(data.uuid || `uuid-${data.id}`),
      hostId: String(data.host_id),
      joinUrl: String(data.join_url),
      password: String(data.password || ""),
      waitingRoom: Boolean(data.settings?.waiting_room ?? input.waitingRoom),
      autoRecording:
        (data.settings?.auto_recording as "none" | "cloud" | "local") ||
        input.autoRecording,
      status: String(data.status || "waiting"),
    };
  }

  async updateMeeting(
    accessToken: string,
    meetingId: string,
    input: Partial<ZoomCreateMeetingInput>,
  ): Promise<void> {
    const encodedId = encodeURIComponent(meetingId);
    const res = await fetchWithRetry(
      `${zoomApiBaseUrl()}/meetings/${encodedId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(input.topic ? { topic: input.topic } : {}),
          ...(input.startTimeIso ? { start_time: input.startTimeIso } : {}),
          ...(input.durationMinutes ? { duration: input.durationMinutes } : {}),
          settings: {
            ...(input.waitingRoom !== undefined
              ? { waiting_room: input.waitingRoom }
              : {}),
            ...(input.autoRecording
              ? { auto_recording: input.autoRecording }
              : {}),
          },
        }),
      },
    );
    if (!res.ok && res.status !== 204) {
      throw new ZoomApiError(res.status, "ZOOM_MEETING_UPDATE_FAILED");
    }
  }

  async deleteMeeting(accessToken: string, meetingId: string): Promise<void> {
    const encodedId = encodeURIComponent(meetingId);
    const res = await fetchWithRetry(
      `${zoomApiBaseUrl()}/meetings/${encodedId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!res.ok && res.status !== 204 && res.status !== 404) {
      throw new ZoomApiError(res.status, "ZOOM_MEETING_DELETE_FAILED");
    }
  }

  async getMeetingRecordings(
    accessToken: string,
    meetingIdOrUuid: string,
  ): Promise<ZoomRecordingFileResource[]> {
    // Double encode if UUID starts with / or contains // per Zoom API specification
    const encoded =
      meetingIdOrUuid.startsWith("/") || meetingIdOrUuid.includes("//")
        ? encodeURIComponent(encodeURIComponent(meetingIdOrUuid))
        : encodeURIComponent(meetingIdOrUuid);
    const res = await fetchWithRetry(
      `${zoomApiBaseUrl()}/meetings/${encoded}/recordings`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!res.ok) {
      throw new ZoomApiError(res.status, "ZOOM_RECORDING_FETCH_FAILED");
    }
    const data = (await res.json()) as {
      uuid?: string;
      recording_files?: Array<{
        id?: string;
        meeting_id?: string;
        file_type?: string;
        recording_type?: string;
        file_size?: number;
        play_url?: string;
        download_url?: string;
        recording_start?: string;
        recording_end?: string;
        status?: string;
      }>;
    };
    return (data.recording_files || [])
      .filter((file) => Boolean(file.id))
      .map((file) => ({
        id: String(file.id),
        meetingUuid: String(data.uuid || meetingIdOrUuid),
        fileType: String(file.file_type || "MP4"),
        recordingType: String(
          file.recording_type || "shared_screen_with_speaker_view",
        ),
        fileSize: Number(file.file_size || 0),
        playUrl: String(file.play_url || ""),
        downloadUrl: String(file.download_url || ""),
        recordingStart: String(
          file.recording_start || new Date().toISOString(),
        ),
        recordingEnd: String(file.recording_end || new Date().toISOString()),
        status: String(file.status || "completed"),
      }));
  }
}

class MockZoomProvider implements ZoomPort {
  buildAuthorizeUrl(state: string): string {
    const url = new URL(`${zoomRedirectUri()}`);
    url.searchParams.set("code", `mock-zoom-code-${state.slice(0, 12)}`);
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeCodeForTokens(code: string): Promise<ZoomOAuthTokenResponse> {
    if (code === "invalid-code") {
      throw new ZoomApiError(400, "ZOOM_OAUTH_TOKEN_EXCHANGE_FAILED");
    }
    const suffix = createHash("sha256").update(code).digest("hex").slice(0, 12);
    return {
      accessToken: `mock-access-${code}-${suffix}`,
      refreshToken: `mock-refresh-${code}-${suffix}`,
      expiresInSeconds: 3600,
      scope: ZOOM_REQUIRED_SCOPES.join(" "),
    };
  }

  async refreshTokens(refreshToken: string): Promise<ZoomOAuthTokenResponse> {
    if (refreshToken.includes("revoked") || refreshToken.includes("invalid")) {
      throw new ZoomApiError(401, "ZOOM_REFRESH_TOKEN_INVALID");
    }
    const suffix = randomUUID().slice(0, 8);
    return {
      accessToken: `mock-refreshed-access-${suffix}`,
      refreshToken: `mock-refreshed-refresh-${suffix}`,
      expiresInSeconds: 3600,
      scope: ZOOM_REQUIRED_SCOPES.join(" "),
    };
  }

  async revokeToken(): Promise<void> {}

  async getCurrentUser(accessToken: string): Promise<ZoomUserProfile> {
    if (accessToken.includes("expired")) {
      throw new ZoomApiError(401, "ZOOM_ACCESS_TOKEN_EXPIRED");
    }
    const hash = createHash("sha256")
      .update(accessToken)
      .digest("hex")
      .slice(0, 10);
    const isBasic = accessToken.includes("basic-account");
    return {
      id: `zoom-host-${hash}`,
      email: `instructor-${hash.slice(0, 6)}@zoom.example.test`,
      displayName: `Zoom 강사 ${hash.slice(0, 4).toUpperCase()}`,
      type: isBasic ? 1 : 2,
      cloudRecordingAllowed: !isBasic,
    };
  }

  async getHostZakToken(
    accessToken: string,
  ): Promise<{ zak: string; expiresIn: number }> {
    const hash = createHash("sha256")
      .update(accessToken)
      .digest("hex")
      .slice(0, 16);
    return { zak: `zak-token-${hash}`, expiresIn: 7200 };
  }

  async createMeeting(
    accessToken: string,
    input: ZoomCreateMeetingInput,
  ): Promise<ZoomMeetingResource> {
    if (input.topic.includes("[ZOOM_FAIL]")) {
      throw new ZoomApiError(503, "ZOOM_MEETING_CREATE_FAILED");
    }
    if (input.topic.includes("[ZOOM_RATE_LIMIT]")) {
      throw new ZoomApiError(429, "ZOOM_RATE_LIMITED", "Rate limited", 1);
    }
    const hostHash = createHash("sha256")
      .update(accessToken)
      .digest("hex")
      .slice(0, 10);
    const numericId = String(
      80000000000 +
        (parseInt(
          createHash("sha256")
            .update(`${accessToken}:${input.topic}:${input.startTimeIso}`)
            .digest("hex")
            .slice(0, 9),
          16,
        ) %
          19999999999),
    );
    const uuid = `uuid-${numericId}-${randomUUID().slice(0, 8)}`;
    const pass = createHash("sha256")
      .update(numericId)
      .digest("hex")
      .slice(0, 6);
    return {
      meetingId: numericId,
      meetingUuid: uuid,
      hostId: `zoom-host-${hostHash}`,
      joinUrl: `https://zoom.us/j/${numericId}?pwd=${pass}`,
      password: pass,
      waitingRoom: input.waitingRoom,
      autoRecording: input.autoRecording,
      status: "waiting",
    };
  }

  async updateMeeting(
    _accessToken: string,
    meetingId: string,
    input: Partial<ZoomCreateMeetingInput>,
  ): Promise<void> {
    if (!meetingId || input.topic?.includes("[ZOOM_FAIL]")) {
      throw new ZoomApiError(503, "ZOOM_MEETING_UPDATE_FAILED");
    }
  }

  async deleteMeeting(_accessToken: string, meetingId: string): Promise<void> {
    if (!meetingId) {
      throw new ZoomApiError(404, "ZOOM_MEETING_DELETE_FAILED");
    }
  }

  async getMeetingRecordings(
    _accessToken: string,
    meetingIdOrUuid: string,
  ): Promise<ZoomRecordingFileResource[]> {
    const clean = meetingIdOrUuid.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16);
    return [
      {
        id: `rec-file-${clean}-mp4`,
        meetingUuid: meetingIdOrUuid,
        fileType: "MP4",
        recordingType: "shared_screen_with_speaker_view",
        fileSize: 52428800,
        playUrl: `https://zoom.us/rec/play/${clean}-mp4`,
        downloadUrl: `https://zoom.us/rec/download/${clean}-mp4`,
        recordingStart: new Date(Date.now() - 3600000).toISOString(),
        recordingEnd: new Date().toISOString(),
        status: "completed",
      },
    ];
  }
}

let customProvider: ZoomPort | null = null;
const httpProvider = new HttpZoomProvider();
const mockProvider = new MockZoomProvider();

export function setZoomProviderForTests(provider: ZoomPort | null) {
  customProvider = provider;
}

export function getZoomProvider(): ZoomPort {
  if (customProvider) return customProvider;
  if (
    isZoomMockEnabled() &&
    (!process.env.ZOOM_CLIENT_ID || !process.env.ZOOM_CLIENT_SECRET)
  ) {
    return mockProvider;
  }
  return httpProvider;
}

