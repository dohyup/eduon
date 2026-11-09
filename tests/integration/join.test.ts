import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "../support/database";
import {
  seedLearningScenario,
  refundLearningScenario,
} from "../support/learning";
import { makeContext } from "../support/context";
import { requestJoin } from "../../src/modules/learning/join";
import type { VideoPort } from "../../src/integrations/video/port";
import {
  assertTestVideoAllowed,
  getVideoProvider,
} from "../../src/integrations/video/provider";
const at = new Date("2030-01-01T00:55:00Z");
const port: VideoPort = {
  createJoin: async () => ({
    joinUrl: "https://classroom.example.test/join/private-token",
  }),
};
describe("classroom admission", () => {
  let store: Awaited<ReturnType<typeof createTestDatabase>>;
  let s: Awaited<ReturnType<typeof seedLearningScenario>>;
  beforeEach(async () => {
    process.env.AUTH_PROVIDER = "test";
    process.env.E2E_TEST_MODE = "1";
    process.env.E2E_AUTH_SECRET =
      "test-video-secret-at-least-thirty-two-characters";
    process.env.VIDEO_PROVIDER = "fake";
    store = await createTestDatabase();
    s = await seedLearningScenario(store.db);
  });
  afterEach(async () => {
    await store?.close();
  });
  it("issues a short lived student admission for paid bound learners without marking attendance", async () => {
    const result = await requestJoin(
      makeContext(store.db, s.student, at),
      s.sessionId,
      port,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        joinUrl: "https://classroom.example.test/join/private-token",
        expiresAt: "2030-01-01T00:57:00.000Z",
      },
    });
    expect(await store.db.attendance.count()).toBe(0);
  });
  it("never admits the paying guardian, other students, or unassigned instructors", async () => {
    for (const actor of [s.parent, s.otherTeacher, s.otherParent])
      expect(
        await requestJoin(makeContext(store.db, actor, at), s.sessionId, port),
      ).toEqual({ ok: false, code: "FORBIDDEN" });
  });
  it("admits the assigned active instructor with a separate teacher role", async () => {
    const check: VideoPort = {
      createJoin: async (input) => {
        expect(input.role).toBe("instructor");
        expect(input.recordingEnabled).toBe(false);
        return { joinUrl: "https://classroom.example.test/teacher" };
      },
    };
    expect(
      (
        await requestJoin(
          makeContext(store.db, s.teacher, at),
          s.sessionId,
          check,
        )
      ).ok,
    ).toBe(true);
    await store.db.academyMembership.update({
      where: {
        academyId_userId: { academyId: s.academyId, userId: s.teacher.userId },
      },
      data: { active: false },
    });
    expect(
      await requestJoin(
        makeContext(store.db, s.teacher, at),
        s.sessionId,
        port,
      ),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
  });
  it("denies outside the exact ten minute class window", async () => {
    for (const date of ["2030-01-01T00:49:59Z", "2030-01-01T02:10:01Z"])
      expect(
        await requestJoin(
          makeContext(store.db, s.student, new Date(date)),
          s.sessionId,
          port,
        ),
      ).toEqual({ ok: false, code: "EXPIRED" });
  });
  it("denies cancelled session rights and unbound or disabled student accounts", async () => {
    await store.db.enrollmentSession.updateMany({
      where: { enrollmentId: s.enrollmentId },
      data: { status: "cancelled" },
    });
    expect(
      await requestJoin(
        makeContext(store.db, s.student, at),
        s.sessionId,
        port,
      ),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    await store.db.enrollmentSession.updateMany({
      where: { enrollmentId: s.enrollmentId },
      data: { status: "allowed" },
    });
    await store.db.studentProfile.update({
      where: { id: s.studentId },
      data: { accountUserId: null },
    });
    expect(
      await requestJoin(
        makeContext(store.db, s.student, at),
        s.sessionId,
        port,
      ),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
  });
  it("rechecks rights after external mint and does not return access revoked during mint", async () => {
    const revoked: VideoPort = {
      createJoin: async () => {
        await store.db.enrollmentSession.updateMany({
          where: { enrollmentId: s.enrollmentId },
          data: { status: "refund_pending" },
        });
        return { joinUrl: "https://classroom.example.test/join/private" };
      },
    };
    expect(
      await requestJoin(
        makeContext(store.db, s.student, at),
        s.sessionId,
        revoked,
      ),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
  });
  it("rejects malicious hosts, insecure URLs and external failures with no token leakage", async () => {
    for (const joinUrl of [
      "https://classroom.example.test.evil.test/token",
      "http://classroom.example.test/token",
      "https://user:pass@classroom.example.test/token",
    ])
      expect(
        await requestJoin(makeContext(store.db, s.student, at), s.sessionId, {
          createJoin: async () => ({ joinUrl }),
        }),
      ).toEqual({ ok: false, code: "PROVIDER_UNAVAILABLE" });
    expect(
      await requestJoin(makeContext(store.db, s.student, at), s.sessionId, {
        createJoin: async () => {
          throw Error("secret");
        },
      }),
    ).toEqual({ ok: false, code: "PROVIDER_UNAVAILABLE" });
  });
  it("revokes admission after actual verified full refund while retaining financial history", async () => {
    await refundLearningScenario(store.db, s);
    expect(
      await requestJoin(
        makeContext(store.db, s.student, at),
        s.sessionId,
        port,
      ),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(
      (await store.db.order.findUniqueOrThrow({ where: { id: s.orderId } }))
        .status,
    ).toBe("refunded");
    expect(
      await store.db.settlementEntry.count({ where: { orderId: s.orderId } }),
    ).toBeGreaterThan(0);
  });
  it("does not mint for disabled actors or unverified payments", async () => {
    await store.db.payment.update({
      where: { orderId: s.orderId },
      data: { verifiedAt: null },
    });
    expect(
      await requestJoin(
        makeContext(store.db, s.student, at),
        s.sessionId,
        port,
      ),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
    await store.db.user.update({
      where: { id: s.student.userId },
      data: { disabledAt: at },
    });
    expect(
      await requestJoin(
        makeContext(store.db, s.student, at),
        s.sessionId,
        port,
      ),
    ).toEqual({ ok: false, code: "UNAUTHENTICATED" });
  });
  it("fake provider rejects remote databases even in test runtime and rechecks retained references", async () => {
    const saved = {
      DATABASE_URL: process.env.DATABASE_URL,
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
      SUPABASE_URL: process.env.SUPABASE_URL,
    };
    const retained = getVideoProvider();
    try {
      process.env.TEST_DATABASE_URL =
        "postgresql://test:test@remote.example.test/eduon_test";
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      expect(() => assertTestVideoAllowed()).toThrow("TEST_VIDEO_FORBIDDEN");
      await expect(
        retained.createJoin({
          sessionId: s.sessionId,
          participantId: s.student.userId,
          role: "student",
          expiresAt: at,
          startsAt: new Date("2030-01-01T01:00:00Z"),
          roomExpiresAt: new Date("2030-01-01T02:10:00Z"),
          recordingEnabled: false,
        }),
      ).rejects.toThrow("TEST_VIDEO_FORBIDDEN");
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
