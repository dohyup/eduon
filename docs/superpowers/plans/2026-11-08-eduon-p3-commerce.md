# EDUON P3 Commerce Implementation Plan

**진행 상태 (2026-11-09):** 사용자가 결제 공급자 선택을 보류해 내부 테스트 범위로 P3-01~04를 구현했다. 실제 PG sandbox·실결제·원격 P3 마이그레이션은 수행하지 않았다. 원래 체크리스트의 외부 검증 항목은 완료로 간주하지 않는다. 상세 증거와 경계는 [P3 검증 기록](../../operations/p3-qa.md), 서비스 추천·정책은 [거래 결정 기록](../../operations/commerce-decisions.md)을 따른다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 마지막 좌석 경합·결제 지연·환불 실패에도 일관된 수강권을 제공한다.
**Architecture:** 짧은 DB 트랜잭션으로 좌석/주문을 만들고, 외부 PG 호출은 트랜잭션 밖에서 한다. 이벤트·재처리 작업은 DB에 영속 저장한다.
**Tech Stack:** P2의 실제 PostgreSQL·Prisma, Vitest 통합 테스트, PG sandbox.
**Spec:** `../specs/2026-11-08-eduon-mvp-design.md` §9~10 및 마스터 계획.

## Global Constraints

마스터 Global Constraints·테스트 훅을 적용한다. 주문 금액은 서버 산출, 원화 정수, 한 자녀·한 기수다. 실결제 전에 판매자·수수료·환불·정산 정책과 PG 계약을 확정한다. 8%를 확정 수수료로 하드코딩하지 않는다. 아래 테스트용 정책은 고정 금액 검증을 위한 합성 규칙이며 법적 환불 정책이 아니다.

## Task P3-01: 좌석 예약·주문과 정책 스냅샷

**Files — Create:** `src/modules/enrollment/orders.ts`, `src/modules/enrollment/reservations.ts`, `src/modules/enrollment/types.ts`, `src/modules/payments/policy.ts`, `src/app/api/orders/route.ts`, `src/app/checkout/[id]/page.tsx`, `tests/integration/reservations.test.ts`, `docs/operations/commerce-decisions.md`. **Modify:** schema + `0002_commerce` migration, 수업 상세 신청 및 학부모 주문 화면.

**Interfaces:** `createOrder(ctx, { studentId: string, offeringId: string, requestKey: string }): Promise<Outcome<{ orderId: string; amountWon: number; expiresAt: string }>>`; `getOrder(ctx, orderId): Promise<Outcome<OrderView>>`. OrderView는 id/studentId/offeringId/amountWon/status/policyVersion/expiresAt 필드를 가진다.

- [ ] 정책 기록에 판매자·원화·수수료·회차별 환불·구매자/학생 관계·정원 예약 시간을 명시한다. 미확정 시 테스트 전용 `test-policy-v1`과 10분 예약만 허용하고 운영 결제 활성화를 차단한다.
- [ ] 아래를 작성하고 `npm run test:integration -- tests/integration/reservations.test.ts` RED 확인. 두 보호자는 서로 다른 학생에게 확인된 연결이 있다.

```ts
it("마지막 한 자리는 한 주문만 확보한다", async () => {
  const x = await seedScenario(db, { capacity: 1 });
  const results = await Promise.all([
    createOrder(makeContext(db, x.parent), {
      studentId: x.studentId,
      offeringId: x.offeringId,
      requestKey: "r1",
    }),
    createOrder(makeContext(db, x.otherParent), {
      studentId: x.otherStudentId,
      offeringId: x.offeringId,
      requestKey: "r2",
    }),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.filter((r) => !r.ok && r.code === "SOLD_OUT")).toHaveLength(1);
});
```

- [ ] Order/SeatReservation/Enrollment/Payment/Refund/ProviderEvent/SettlementEntry/Job 모델을 추가한다. offering 행 잠금 후 유효 예약+활성 수강 수를 검사하고 주문·예약을 함께 만든다. academyId 관계 일치, parent+requestKey 고유, 학생+기수의 활성/대기 중복 제한, provider transaction/event 고유, 환불 요청키 고유를 DB에서 강제한다. 문자열 상태 값도 enum/check로 제한한다.
- [ ] 연결된 자녀·공개 기수·학원 상태·시간·정원·학생 일정 충돌을 재검증한다. 금액·수수료·회차별 정책을 서버에서 스냅샷한다. 같은 멱등키로 다른 payload가 오면 CONFLICT. PG 호출 중 DB 잠금을 유지하지 않는다. checkout에 자녀·시간·총액·환불 정책을 보여주고 결제 동의를 기록한다.
- [ ] 중복 클릭·타 자녀·가격 변조·정원 감소 경합·예약 만료·첫 주문 이후 가격/회차 변경 차단 테스트를 추가해 GREEN/typecheck 확인 후 `feat: reserve seats and create scoped orders`로 명시 파일만 커밋한다.

## Task P3-02: PG 어댑터·웹훅·수강권 활성화

**Files — Create:** `src/integrations/payments/port.ts`, `src/integrations/payments/provider.ts`, `tests/support/fake-payment-provider.ts`, `src/modules/payments/confirm.ts`, `src/modules/payments/events.ts`, `src/app/api/payments/prepare/route.ts`, `src/app/api/payments/webhook/route.ts`, `src/app/checkout/[id]/result/page.tsx`, `tests/integration/payment-events.test.ts`, `tests/e2e/checkout.spec.ts`. **Modify:** 주문 화면, migrations 필요 시 추가.

**Interfaces:**

```ts
type VerifiedPayment = {
  transactionId: string;
  orderId: string;
  amountWon: number;
  currency: "KRW";
  status: "paid" | "pending" | "failed";
};
interface PaymentPort {
  prepare(input: {
    orderId: string;
    amountWon: number;
    requestKey: string;
  }): Promise<{ checkoutUrl: string }>;
  verifyWebhook(
    rawBody: Uint8Array,
    headers: Headers,
  ): Promise<{ eventId: string; transactionId: string }>;
  fetchPayment(transactionId: string): Promise<VerifiedPayment>;
  refund(input: {
    transactionId: string;
    amountWon: number;
    requestKey: string;
  }): Promise<{
    reference: string;
    status: "succeeded" | "pending" | "failed";
  }>;
}
// applyVerifiedPayment(ctx, payment: VerifiedPayment): Promise<Outcome<void>>
// ingestPaymentEvent(rawBody, headers, port: PaymentPort): Promise<{ accepted: boolean }>
```

`ctx`에 엔드유저가 없는 웹훅/작업은 `SystemContext = { db, now, source: 'webhook' | 'job' }`를 별도로 사용한다. SystemContext 생성자는 서버 전용이고 사용자 입력으로 주입할 수 없다. 결제 결과와 주문의 관계를 서버에서 다시 확인한다.

- [ ] PG를 공식 sandbox·서명 방식·중복/재시도 정책 기준으로 선택하고 `commerce-decisions.md`에 결과를 기록한다. 공급자 미확정 시 fake adapter 계약까지만 구현한다.
- [ ] 아래 RED를 `npm run test:integration -- tests/integration/payment-events.test.ts`로 확인한다. `systemContext(db)`는 tests/support/context.ts에 생성자를 추가한다.

```ts
it("동일 결제 확인은 수강권을 중복 생성하지 않는다", async () => {
  const order = await createOrder(ctx, {
    studentId: s.studentId,
    offeringId: s.offeringId,
    requestKey: "pay-1",
  });
  if (!order.ok) throw new Error(order.code);
  const payment: VerifiedPayment = {
    transactionId: "tx-1",
    orderId: order.value.orderId,
    amountWon: order.value.amountWon,
    currency: "KRW",
    status: "paid",
  };
  const sys = systemContext(db);
  await applyVerifiedPayment(sys, payment);
  await applyVerifiedPayment(sys, payment);
  expect(
    await db.enrollment.count({ where: { orderId: order.value.orderId } }),
  ).toBe(1);
});
```

- [ ] prepare는 소유 주문만 허용, 서버 금액 사용, 반환 URL allowlist 적용. webhook은 raw body 서명 검증 후 event를 영속 저장하고 작업을 만든 뒤 응답한다. 처리자는 PG 재조회 후 금액/원화/order/transaction 관계를 검증하고 잠금 하에서 payment·order·reservation·enrollment를 함께 갱신한다. 브라우저 redirect는 조회만 허용하고 성공을 기록하지 못한다.
- [ ] 서명 위조·금액 불일치·타 주문 transaction·중복/역순 이벤트·PG timeout·이미 환불된 결제 재통보를 검증한다. 이벤트 상태가 오래된 결과로 역행하지 않게 한다. `checkout.spec.ts`는 테스트 PG로 학부모 결제 후 학생 수강권 생성 확인. 실제 PG sandbox 계약 테스트는 fake 통과와 구분한다.
- [ ] GREEN/typecheck와 sandbox 증거를 기록하고 `feat: verify payment events and activate enrollment`로 명시 파일만 커밋한다.

## Task P3-03: 예약 만료·지연 성공·재처리

**Files — Create:** `src/modules/enrollment/expire.ts`, `src/modules/payments/reconcile.ts`, `src/server/jobs.ts`, `src/app/api/internal/jobs/route.ts`, `tests/integration/reconciliation.test.ts`, `docs/operations/payment-recovery.md`. **Modify:** admin 거래 예외 화면·Job migration·tests/support/context.ts.

**Interfaces:** `expireReservations(sys): Promise<{ expired: number }>`; `reconcilePayments(sys, port: PaymentPort): Promise<{ checked: number }>`; `runJobs(sys, limit: number): Promise<{ processed: number }>`; `getPaymentExceptions(ctx): Promise<Outcome<{ orderId: string; reason: string }[]>>`.

- [ ] 아래 RED와 만료-결제 확인 경합 테스트를 작성한다. `getEnrollmentForOrder(sys, orderId): Promise<{ status: string } | null>`을 enrollment/orders.ts에 추가한다.

```ts
it("만료된 예약의 지연 성공은 활성 수강권을 만들지 않는다", async () => {
  const created = await createOrder(ctx, {
    studentId: s.studentId,
    offeringId: s.offeringId,
    requestKey: "late",
  });
  if (!created.ok) throw new Error(created.code);
  const sys = systemContext(db, new Date("2029-12-31T00:11:00Z"));
  await expireReservations(sys);
  await applyVerifiedPayment(sys, {
    transactionId: "late-tx",
    orderId: created.value.orderId,
    amountWon: created.value.amountWon,
    currency: "KRW",
    status: "paid",
  });
  expect(await getEnrollmentForOrder(sys, created.value.orderId)).toBeNull();
});
```

- [ ] `npm run test:integration -- tests/integration/reconciliation.test.ts`에서 RED 확인 후 만료 예약 해제와 DB 작업 claim을 구현한다. `FOR UPDATE SKIP LOCKED` 또는 원자적 lease를 사용해 중복 작업자를 막고 lease 만료 후 재시도를 허용한다. 외부 PG는 DB 트랜잭션 밖에서 호출한다.
- [ ] 만료 후 paid이면 금액은 결제 사실로 기록하되 enrollment는 생성하지 않고 예외+보상 환불 작업을 원자적으로 저장한다. P3-04 환불 서비스를 연결해 테스트를 완성한다. 재시도 간격 1/5/30분, 5회 실패 후 운영 예외 전환; 요청키로 외부 중복 환불을 막는다. 값은 운영 설정으로 기록한다.
- [ ] 스케줄러는 서명/비밀키·만료·재전송 검증, 정기 미확정 결제 재조회, 작업 실패 경보를 제공한다. 공개 사용자가 실행하지 못하게 한다. 운영 화면은 재시도 사유·횟수·마지막 오류를 표시하고 수동 처리도 감사 기록한다.
- [ ] 프로세스 중단 후 재실행·이벤트 저장 후 작업 실패·두 작업자 동시 실행 테스트를 GREEN 확인하고 `feat: recover expired and delayed payments`로 커밋한다. P3-04 후 보상 환불 E2E를 다시 실행한다.

## Task P3-04: 취소·부분 환불·정산 기록

**Files — Create:** `src/modules/payments/refunds.ts`, `src/modules/payments/settlement.ts`, `src/app/api/orders/[id]/refunds/route.ts`, `src/app/api/refunds/[id]/retry/route.ts`, `src/app/api/settlements/[id]/paid/route.ts`, `tests/integration/refunds.test.ts`, `tests/integration/settlement.test.ts`, `tests/e2e/refunds.spec.ts`. **Modify:** 학부모 orders·academy finance·admin payments와 migrations.

**Interfaces:** `requestRefund(ctx, { orderId, cancelSessionIds: string[], reason, requestKey }): Promise<Outcome<{ refundId: string }>>`; `processRefund(sys, refundId, port: PaymentPort): Promise<Outcome<void>>`; `recordSettlementPaid(ctx, { settlementId, externalReference }): Promise<Outcome<void>>`.

- [ ] 테스트 지원에 `payOrder(sys, orderId): Promise<void>`를 만든다. 이 함수는 주문 서버금액을 조회하고 `applyVerifiedPayment`를 호출한다. 아래 RED를 `npm run test:integration -- tests/integration/refunds.test.ts`로 확인한다.

```ts
it("환불 요청만으로 환불 완료를 표시하지 않는다", async () => {
  const created = await createOrder(ctx, {
    studentId: s.studentId,
    offeringId: s.offeringId,
    requestKey: "refund",
  });
  if (!created.ok) throw new Error(created.code);
  await payOrder(systemContext(db), created.value.orderId);
  const requested = await requestRefund(ctx, {
    orderId: created.value.orderId,
    cancelSessionIds: [s.sessionId],
    reason: "일정 변경",
    requestKey: "refund-1",
  });
  expect(requested.ok).toBe(true);
  const order = await getOrder(ctx, created.value.orderId);
  expect(order.ok && order.value.status).toBe("paid");
});
```

- [ ] 주문 소유자·남은 환불 가능액·회차 이수 여부·정책 스냅샷으로 서버 금액을 계산한다. 동일 회차 중복 환불·합산 환불액 초과를 잠금과 고유 제약으로 막는다. requested/processing에서는 화면에 ‘취소 처리 중’을 표시하고 대상 미래 회차의 신규 입장을 임시 중지한다. failed면 기존 정책상 유효 접근을 복원하고 운영 예외를 남긴다. succeeded에서만 재무 상태와 최종 접근 범위를 변경한다.
- [ ] 회차별 권리 상태(allowed/refund_pending/cancelled)를 관리해 부분 환불이 다른 회차를 취소하지 않게 한다. 이수 기록과 결제 내역은 보존한다. PG timeout이면 즉시 중복 요청하지 않고 같은 요청키로 조회/재처리한다. P3-03 지연 결제 보상 환불은 시스템 권한 경로로 연결한다.
- [ ] 거래 원장은 결제·환불·수수료·학원 귀속·지급 조정별 append-only 항목을 만들고 원거래 참조/고유 키를 보존한다. 이미 지급 후 환불은 다음 정산 조정으로 남기고 과거 지급을 덮어쓰지 않는다. 수동 외부 송금 참조는 운영자만 기록, 다른 학원 재무 403/404 검증.
- [ ] 부분/전체·중복·실패 후 재시도·지연 보상 환불·정산 후 환불과 타 자녀 접근 E2E/통합 테스트를 실행해 GREEN 확인 후 `feat: add auditable refunds and settlement ledger`로 커밋한다.

## P3 완료 기준

주문·금액·잔여좌석·수강권·환불 상태가 일치한다. 실제 PG sandbox의 서명/조회/취소 검증까지 완료해야 외부 연동 완료다. 공급자 미확정이면 내부 거래 구현 완료와 연동 미완료를 분리 보고한다. 자동 정산 송금은 포함하지 않는다.
