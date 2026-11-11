export type Subject = "english" | "math";
export type Level = "beginner" | "intermediate" | "advanced";
export type SearchInput = {
  subject?: Subject;
  grade?: number;
  level?: Level;
  maxPriceWon?: number;
  availableWindows?: { startsAt: string; endsAt: string }[];
  cursor?: string;
};
export type PublicOffering = {
  academyName?: string;
  academyRegion?: string;
  instructorName?: string;
  id: string;
  academyId: string;
  title: string;
  subject: Subject;
  gradeMin: number;
  gradeMax: number;
  level: Level;
  priceWon: number;
  availableSeats: number;
  isZoomLive?: boolean;
  zoomWaitingRoom?: boolean;
  zoomAutoRecording?: string;
  sessions: {
    id: string;
    startsAt: string;
    endsAt: string;
    zoomStatus?: string | null;
  }[];
};
export type SearchResult = {
  items: PublicOffering[];
  nextCursor: string | null;
};
