export type ExplanationCandidate = {
  id: string;
  publicFacts: {
    subject: string;
    gradeMin: number;
    gradeMax: number;
    level: string;
    priceWon: number;
    availableSeats: number;
    allowedReasons: string[];
  };
};
export interface LlmPort {
  explain(
    input: { candidates: ExplanationCandidate[] },
    options?: { signal?: AbortSignal },
  ): Promise<{ id: string; reasons: string[] }[]>;
}
