import "server-only";
import { z } from "zod";

export type CommercePolicySnapshot = {
  version: "test-policy-v1";
  sellerAcademyId: string;
  currency: "KRW";
  livePaymentsEnabled: false;
  reservationMinutes: 10;
  fee: { kind: "synthetic"; basisPoints: 0 };
  refundRule: "unstarted_sessions_only";
  relationship: "verified_guardian";
};
export type SessionSnapshot = {
  sessionId: string;
  startsAt: string;
  endsAt: string;
  amountWon: number;
};

// Commercial terms are unapproved. This policy is explicitly synthetic and must
// never be used to enable a live gateway or imply an agreed commission.
export function commercePolicy(academyId: string): CommercePolicySnapshot {
  return {
    version: "test-policy-v1",
    sellerAcademyId: academyId,
    currency: "KRW",
    livePaymentsEnabled: false,
    reservationMinutes: 10,
    fee: { kind: "synthetic", basisPoints: 0 },
    refundRule: "unstarted_sessions_only",
    relationship: "verified_guardian",
  };
}
export function snapshotSessions(
  sessions: { id: string; startsAt: Date; endsAt: Date }[],
  amountWon: number,
): SessionSnapshot[] {
  const sorted = [...sessions].sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id),
  );
  const base = Math.floor(amountWon / sorted.length);
  return sorted.map((s, index) => ({
    sessionId: s.id,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    amountWon: base + (index < amountWon % sorted.length ? 1 : 0),
  }));
}
const sessionSnapshotSchema = z
  .array(
    z.object({
      sessionId: z.uuid(),
      startsAt: z.iso.datetime(),
      endsAt: z.iso.datetime(),
      amountWon: z.number().int().nonnegative(),
    }),
  )
  .min(1)
  .max(100);
export function readSessionSnapshots(value: unknown): SessionSnapshot[] {
  return sessionSnapshotSchema.parse(value);
}
