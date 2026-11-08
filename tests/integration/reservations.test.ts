import { beforeEach, afterEach, expect, it } from "vitest";
import { createTestDatabase } from "../support/database";
import { seedScenario } from "../support/scenario";
import { makeContext } from "../support/context";
import type { Prisma } from "../../src/generated/prisma/client";
import {
  createOrder,
  getOrder,
  listOrders,
} from "../../src/modules/enrollment/orders";
let store: Awaited<ReturnType<typeof createTestDatabase>>;
beforeEach(async () => {
  store = await createTestDatabase();
});
afterEach(async () => {
  await store?.close();
});
async function scenario(capacity = 2) {
  const s = await seedScenario(store.db, { capacity });
  await store.db.offering.update({
    where: { id: s.offeringId },
    data: { status: "published" },
  });
  return s;
}
it("마지막 한 자리는 한 주문만 확보한다", async () => {
  const s = await scenario(1);
  const results = await Promise.all([
    createOrder(makeContext(store.db, s.parent), {
      studentId: s.studentId,
      offeringId: s.offeringId,
      requestKey: "r1",
    }),
    createOrder(makeContext(store.db, s.otherParent), {
      studentId: s.otherStudentId,
      offeringId: s.offeringId,
      requestKey: "r2",
    }),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.filter((r) => !r.ok && r.code === "SOLD_OUT")).toHaveLength(1);
});
it("동일 요청은 같은 주문을 반환하고 payload 변경은 거절한다", async () => {
  const s = await scenario();
  const input = {
    studentId: s.studentId,
    offeringId: s.offeringId,
    requestKey: "same",
  };
  const ctx = makeContext(store.db, s.parent);
  const results = await Promise.all([
    createOrder(ctx, input),
    createOrder(ctx, input),
  ]);
  expect(results[0].ok).toBe(true);
  expect(results[1]).toEqual(results[0]);
  expect(await store.db.order.count()).toBe(1);
  expect(await store.db.seatReservation.count()).toBe(1);
  expect(
    await createOrder(ctx, { ...input, studentId: s.otherStudentId }),
  ).toEqual({ ok: false, code: "CONFLICT" });
});
it("타 자녀와 미확인 보호자는 주문할 수 없다", async () => {
  const s = await scenario();
  const input = {
    studentId: s.otherStudentId,
    offeringId: s.offeringId,
    requestKey: "foreign",
  };
  expect(await createOrder(makeContext(store.db, s.parent), input)).toEqual({
    ok: false,
    code: "FORBIDDEN",
  });
  await store.db.user.update({
    where: { id: s.otherParent.userId },
    data: { guardianVerifiedAt: null },
  });
  expect(
    await createOrder(makeContext(store.db, s.otherParent), input),
  ).toEqual({ ok: false, code: "FORBIDDEN" });
});
it("금액은 서버에서 가져오고 브라우저 추가 필드는 거절한다", async () => {
  const s = await scenario();
  const ctx = makeContext(store.db, s.parent);
  const input = {
    studentId: s.studentId,
    offeringId: s.offeringId,
    requestKey: "price",
  };
  expect(
    await createOrder(ctx, { ...input, amountWon: 1 } as typeof input),
  ).toEqual({ ok: false, code: "VALIDATION" });
  const result = await createOrder(ctx, input);
  expect(result.ok && result.value.amountWon).toBe(100000);
  expect(result.ok && result.value.expiresAt).toBe("2029-12-01T00:10:00.000Z");
});
it("만료 예약은 좌석과 중복 대기를 막지 않는다", async () => {
  const s = await scenario(1);
  const input = {
    studentId: s.studentId,
    offeringId: s.offeringId,
    requestKey: "expired",
  };
  expect((await createOrder(makeContext(store.db, s.parent), input)).ok).toBe(
    true,
  );
  const later = makeContext(
    store.db,
    s.parent,
    new Date("2029-12-01T00:10:00Z"),
  );
  const second = await createOrder(later, { ...input, requestKey: "new" });
  expect(second.ok).toBe(true);
  expect(await store.db.order.count({ where: { status: "expired" } })).toBe(1);
});
it("주문 조회와 목록은 소유자 범위를 지킨다", async () => {
  const s = await scenario();
  const result = await createOrder(makeContext(store.db, s.parent), {
    studentId: s.studentId,
    offeringId: s.offeringId,
    requestKey: "view",
  });
  if (!result.ok) throw new Error(result.code);
  expect(
    await getOrder(makeContext(store.db, s.otherParent), result.value.orderId),
  ).toEqual({ ok: false, code: "NOT_FOUND" });
  const own = await getOrder(
    makeContext(store.db, s.parent),
    result.value.orderId,
  );
  expect(own.ok && own.value.policyVersion).toBe("test-policy-v1");
  expect(await listOrders(makeContext(store.db, s.otherParent))).toEqual({
    ok: true,
    value: [],
  });
});
it("동일 학생의 다른 기수 동시 주문은 시간 충돌을 막는다", async () => {
  const s = await scenario();
  const offering = await store.db.offering.findUniqueOrThrow({
    where: { id: s.offeringId },
    include: { sessions: true },
  });
  const other = await store.db.offering.create({
    data: {
      courseId: s.courseId,
      academyId: s.academyId,
      status: "published",
      priceWon: 1000,
      capacity: 2,
      enrollmentOpensAt: offering.enrollmentOpensAt,
      enrollmentClosesAt: offering.enrollmentClosesAt,
      sessions: {
        create: offering.sessions.map((x) => ({
          startsAt: x.startsAt,
          endsAt: x.endsAt,
        })),
      },
    },
  });
  const ctx = makeContext(store.db, s.parent);
  const results = await Promise.all([
    createOrder(ctx, {
      studentId: s.studentId,
      offeringId: s.offeringId,
      requestKey: "first",
    }),
    createOrder(ctx, {
      studentId: s.studentId,
      offeringId: other.id,
      requestKey: "second",
    }),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.filter((r) => !r.ok && r.code === "CONFLICT")).toHaveLength(1);
});
it("첫 주문 후 가격과 회차 변경 및 정원 축소는 DB에서도 막는다", async () => {
  const s = await scenario();
  expect(
    (
      await createOrder(makeContext(store.db, s.parent), {
        studentId: s.studentId,
        offeringId: s.offeringId,
        requestKey: "locked",
      })
    ).ok,
  ).toBe(true);
  await expect(
    store.db.offering.update({
      where: { id: s.offeringId },
      data: { priceWon: 1 },
    }),
  ).rejects.toThrow();
  await expect(
    store.db.session.update({
      where: { id: s.sessionId },
      data: { startsAt: new Date("2030-01-01T00:59:00Z") },
    }),
  ).rejects.toThrow();
  const other = await createOrder(makeContext(store.db, s.otherParent), {
    studentId: s.otherStudentId,
    offeringId: s.offeringId,
    requestKey: "second",
  });
  expect(other.ok).toBe(true);
  await expect(
    store.db.offering.update({
      where: { id: s.offeringId },
      data: { capacity: 1 },
    }),
  ).rejects.toThrow();
});
it.each([
  "revoked",
  "grade",
  "disabled",
  "suspended",
  "draft",
  "not_open",
  "closed",
])("판매 권한 또는 조건 %s 변경은 새 주문을 막는다", async (condition) => {
  const s = await scenario();
  if (condition === "revoked")
    await store.db.guardianLink.update({
      where: {
        guardianId_studentId: {
          guardianId: s.parent.userId,
          studentId: s.studentId,
        },
      },
      data: { revokedAt: new Date() },
    });
  if (condition === "grade")
    await store.db.studentProfile.update({
      where: { id: s.studentId },
      data: { grade: 12 },
    });
  if (condition === "disabled") {
    await store.db.studentProfile.update({
      where: { id: s.studentId },
      data: { accountUserId: s.student.userId },
    });
    await store.db.user.update({
      where: { id: s.student.userId },
      data: { disabledAt: new Date() },
    });
  }
  if (condition === "suspended")
    await store.db.academy.update({
      where: { id: s.academyId },
      data: { status: "suspended" },
    });
  if (condition === "draft")
    await store.db.offering.update({
      where: { id: s.offeringId },
      data: { status: "draft" },
    });
  if (condition === "not_open")
    await store.db.offering.update({
      where: { id: s.offeringId },
      data: { enrollmentOpensAt: new Date("2029-12-02T00:00:00Z") },
    });
  if (condition === "closed")
    await store.db.offering.update({
      where: { id: s.offeringId },
      data: { enrollmentClosesAt: new Date("2029-12-01T00:00:00Z") },
    });
  const result = await createOrder(makeContext(store.db, s.parent), {
    studentId: s.studentId,
    offeringId: s.offeringId,
    requestKey: condition,
  });
  expect(result.ok).toBe(false);
  expect(await store.db.order.count()).toBe(0);
  expect(await store.db.seatReservation.count()).toBe(0);
});
it("서버 회차 금액의 합과 동의 기록을 보존한다", async () => {
  const s = await scenario();
  await store.db.offering.update({
    where: { id: s.offeringId },
    data: {
      priceWon: 100001,
      sessions: {
        create: [
          {
            startsAt: new Date("2030-01-02T01:00:00Z"),
            endsAt: new Date("2030-01-02T02:00:00Z"),
          },
          {
            startsAt: new Date("2030-01-03T01:00:00Z"),
            endsAt: new Date("2030-01-03T02:00:00Z"),
          },
        ],
      },
    },
  });
  const ctx = makeContext(store.db, s.parent);
  const input = {
    studentId: s.studentId,
    offeringId: s.offeringId,
    requestKey: "snapshot",
  };
  const created = await createOrder(ctx, input);
  if (!created.ok) throw new Error(created.code);
  const before = await getOrder(ctx, created.value.orderId);
  expect(before.ok && before.value.consentedAt).toBeNull();
  await createOrder(ctx, { ...input, consent: true });
  const view = await getOrder(ctx, created.value.orderId);
  expect(view.ok && view.value.consentedAt).toBe("2029-12-01T00:00:00.000Z");
  expect(view.ok && view.value.sessions.map((s) => s.amountWon)).toEqual([
    33334, 33334, 33333,
  ]);
  expect(view.ok && view.value.policySnapshot.livePaymentsEnabled).toBe(false);
  expect(view.ok && view.value.policySnapshot.sellerAcademyId).toBe(
    s.academyId,
  );
});
it("기존 활성 수강권과 시간 충돌은 다른 기수에도 적용된다", async () => {
  const s = await scenario();
  const original = await store.db.offering.findUniqueOrThrow({
    where: { id: s.offeringId },
    include: { sessions: true },
  });
  const other = await store.db.offering.create({
    data: {
      courseId: s.courseId,
      academyId: s.academyId,
      status: "published",
      priceWon: 1000,
      capacity: 2,
      enrollmentOpensAt: original.enrollmentOpensAt,
      enrollmentClosesAt: original.enrollmentClosesAt,
      sessions: {
        create: original.sessions.map((x) => ({
          startsAt: x.startsAt,
          endsAt: x.endsAt,
        })),
      },
    },
  });
  await store.db.enrollment.create({
    data: { studentId: s.studentId, offeringId: other.id },
  });
  expect(
    await createOrder(makeContext(store.db, s.parent), {
      studentId: s.studentId,
      offeringId: s.offeringId,
      requestKey: "existing",
    }),
  ).toEqual({ ok: false, code: "CONFLICT" });
});
it("정원 축소와 마지막 좌석 예약 경합도 정원을 넘지 않는다", async () => {
  const s = await scenario();
  await store.db.enrollment.create({
    data: { offeringId: s.offeringId, studentId: s.otherStudentId },
  });
  const results = await Promise.allSettled([
    createOrder(makeContext(store.db, s.parent), {
      studentId: s.studentId,
      offeringId: s.offeringId,
      requestKey: "race",
    }),
    store.db.offering.update({
      where: { id: s.offeringId },
      data: { capacity: 1 },
    }),
  ]);
  expect(results[0].status).toBe("fulfilled");
  const offering = await store.db.offering.findUniqueOrThrow({
    where: { id: s.offeringId },
  });
  const occupied =
    (await store.db.enrollment.count({
      where: { offeringId: s.offeringId, status: "active" },
    })) +
    (await store.db.seatReservation.count({
      where: { offeringId: s.offeringId, status: "held" },
    }));
  expect(occupied).toBeLessThanOrEqual(offering.capacity);
});
it("주문 목록은 20개 페이지로 소유 주문만 반환한다", async () => {
  const s = await scenario();
  const created = await createOrder(makeContext(store.db, s.parent), {
    studentId: s.studentId,
    offeringId: s.offeringId,
    requestKey: "base",
  });
  if (!created.ok) throw new Error(created.code);
  const original = await store.db.order.findUniqueOrThrow({
    where: { id: created.value.orderId },
  });
  await store.db.order.createMany({
    data: Array.from({ length: 24 }, (_, i) => ({
      ...original,
      id: undefined,
      policySnapshot: original.policySnapshot as Prisma.InputJsonValue,
      sessionsSnapshot: original.sessionsSnapshot as Prisma.InputJsonValue,
      requestKey: `page-${i}`,
      status: "expired",
    })),
  });
  const ctx = makeContext(store.db, s.parent);
  const first = await listOrders(ctx);
  expect(first.ok && first.value.length).toBe(20);
  if (!first.ok) throw new Error(first.code);
  const next = await listOrders(ctx, first.value.at(-1)!.id);
  expect(next.ok && next.value.length).toBe(5);
  expect(
    next.ok && next.value.every((x) => !first.value.some((y) => x.id === y.id)),
  ).toBe(true);
});
it("신규 테이블의 RLS와 복합 외래키 및 원장 append-only를 강제한다", async () => {
  const s = await scenario();
  const created = await createOrder(makeContext(store.db, s.parent), {
    studentId: s.studentId,
    offeringId: s.offeringId,
    requestKey: "db-guards",
  });
  if (!created.ok) throw new Error(created.code);
  const schema = new URL(store.url).searchParams.get("schema")!;
  const security = await store.db.$queryRaw<
    { safe: boolean }[]
  >`SELECT bool_and(c.relrowsecurity) AS safe FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${schema} AND c.relkind='r'`;
  expect(security[0].safe).toBe(true);
  await expect(
    store.db.seatReservation.update({
      where: { orderId: created.value.orderId },
      data: { studentId: s.otherStudentId },
    }),
  ).rejects.toMatchObject({ code: "P2003" });
  await expect(
    store.db.enrollment.create({
      data: {
        orderId: created.value.orderId,
        studentId: s.otherStudentId,
        offeringId: s.offeringId,
      },
    }),
  ).rejects.toMatchObject({ code: "P2003" });
  await expect(
    store.db.settlementEntry.create({
      data: {
        academyId: s.otherAcademyId,
        orderId: created.value.orderId,
        kind: "payment",
        amountWon: 100000,
        idempotencyKey: "bad-academy",
      },
    }),
  ).rejects.toMatchObject({ code: "P2003" });
  const entry = await store.db.settlementEntry.create({
    data: {
      academyId: s.academyId,
      orderId: created.value.orderId,
      kind: "payment",
      amountWon: 100000,
      idempotencyKey: "ledger",
    },
  });
  await expect(
    store.db.settlementEntry.update({
      where: { id: entry.id },
      data: { amountWon: 1 },
    }),
  ).rejects.toThrow();
  await expect(
    store.db.settlementEntry.delete({ where: { id: entry.id } }),
  ).rejects.toThrow();
});
it("존재하지 않는 기수로 멱등키 payload를 바꿔도 충돌이다", async () => {
  const s = await scenario();
  const ctx = makeContext(store.db, s.parent);
  const input = {
    studentId: s.studentId,
    offeringId: s.offeringId,
    requestKey: "payload",
  };
  expect((await createOrder(ctx, input)).ok).toBe(true);
  expect(
    await createOrder(ctx, {
      ...input,
      offeringId: "00000000-0000-4000-8000-000000000001",
    }),
  ).toEqual({ ok: false, code: "CONFLICT" });
});
it("부분 취소한 회차는 학생 일정 충돌에서 제외한다", async () => {
  const s = await scenario();
  const original = await store.db.offering.findUniqueOrThrow({
    where: { id: s.offeringId },
  });
  const other = await store.db.offering.create({
    data: {
      courseId: s.courseId,
      academyId: s.academyId,
      status: "published",
      priceWon: 1000,
      capacity: 2,
      enrollmentOpensAt: original.enrollmentOpensAt,
      enrollmentClosesAt: original.enrollmentClosesAt,
      sessions: {
        create: [
          {
            startsAt: new Date("2030-01-01T01:00:00Z"),
            endsAt: new Date("2030-01-01T02:00:00Z"),
          },
          {
            startsAt: new Date("2030-01-02T01:00:00Z"),
            endsAt: new Date("2030-01-02T02:00:00Z"),
          },
        ],
      },
    },
    include: { sessions: { orderBy: { startsAt: "asc" } } },
  });
  await store.db.enrollment.create({
    data: {
      studentId: s.studentId,
      offeringId: other.id,
      sessions: {
        create: other.sessions.map((x, i) => ({
          sessionId: x.id,
          startsAt: x.startsAt,
          endsAt: x.endsAt,
          amountWon: 500,
          status: i === 0 ? "cancelled" : "allowed",
        })),
      },
    },
  });
  expect(
    (
      await createOrder(makeContext(store.db, s.parent), {
        studentId: s.studentId,
        offeringId: s.offeringId,
        requestKey: "free-session",
      })
    ).ok,
  ).toBe(true);
});
