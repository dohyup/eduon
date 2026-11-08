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
  id: string;
  academyId: string;
  title: string;
  subject: Subject;
  gradeMin: number;
  gradeMax: number;
  level: Level;
  priceWon: number;
  availableSeats: number;
  sessions: { id: string; startsAt: string; endsAt: string }[];
};
export type SearchResult = {
  items: PublicOffering[];
  nextCursor: string | null;
};
