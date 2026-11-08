import type {
  CommercePolicySnapshot,
  SessionSnapshot,
} from "@/modules/payments/policy";
export type CreateOrderInput = {
  studentId: string;
  offeringId: string;
  requestKey: string;
  consent?: boolean;
};
export type OrderView = {
  id: string;
  studentId: string;
  studentName: string;
  offeringId: string;
  courseTitle: string;
  academyId: string;
  academyName: string;
  amountWon: number;
  currency: "KRW";
  status: string;
  policyVersion: string;
  policySnapshot: CommercePolicySnapshot;
  sessions: SessionSnapshot[];
  expiresAt: string;
  consentedAt: string | null;
  createdAt: string;
  exceptionReason: string | null;
  enrollment: null | {
    id: string;
    status: string;
    sessions: {
      id: string;
      sessionId: string;
      status: string;
      startsAt: string;
      endsAt: string;
      amountWon: number;
    }[];
  };
  refunds: {
    id: string;
    status: string;
    amountWon: number;
    reason: string;
    createdAt: string;
  }[];
};
