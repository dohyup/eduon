-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "orderId" UUID;

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "parentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "requestKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "amountWon" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "feeWon" INTEGER NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "policySnapshot" JSONB NOT NULL,
    "sessionsSnapshot" JSONB NOT NULL,
    "consentedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "exceptionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatReservation" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'held',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeatReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentSession" (
    "id" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'allowed',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "amountWon" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "EnrollmentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'fake',
    "transactionId" TEXT NOT NULL,
    "amountWon" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestedById" UUID,
    "kind" TEXT NOT NULL DEFAULT 'customer',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "amountWon" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "providerReference" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "succeededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundSession" (
    "id" UUID NOT NULL,
    "refundId" UUID NOT NULL,
    "enrollmentSessionId" UUID NOT NULL,

    CONSTRAINT "RefundSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderEvent" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'fake',
    "eventId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payloadJson" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementEntry" (
    "id" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "paymentId" UUID,
    "refundId" UUID,
    "kind" TEXT NOT NULL,
    "amountWon" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "idempotencyKey" TEXT NOT NULL,
    "originalEntryId" UUID,
    "externalReference" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dedupeKey" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "claimedBy" TEXT,
    "claimToken" UUID,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_parentId_createdAt_id_idx" ON "Order"("parentId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Order_studentId_status_idx" ON "Order"("studentId", "status");

-- CreateIndex
CREATE INDEX "Order_offeringId_academyId_status_idx" ON "Order"("offeringId", "academyId", "status");

-- CreateIndex
CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Order_academyId_status_idx" ON "Order"("academyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Order_parentId_requestKey_key" ON "Order"("parentId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "Order_id_studentId_offeringId_academyId_key" ON "Order"("id", "studentId", "offeringId", "academyId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatReservation_orderId_key" ON "SeatReservation"("orderId");

-- CreateIndex
CREATE INDEX "SeatReservation_offeringId_status_expiresAt_idx" ON "SeatReservation"("offeringId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "SeatReservation_studentId_status_expiresAt_idx" ON "SeatReservation"("studentId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeatReservation_orderId_studentId_offeringId_academyId_key" ON "SeatReservation"("orderId", "studentId", "offeringId", "academyId");

-- CreateIndex
CREATE INDEX "EnrollmentSession_sessionId_idx" ON "EnrollmentSession"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentSession_enrollmentId_sessionId_key" ON "EnrollmentSession"("enrollmentId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");

-- CreateIndex
CREATE INDEX "Payment_status_updatedAt_idx" ON "Payment"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_requestKey_key" ON "Refund"("requestKey");

-- CreateIndex
CREATE INDEX "Refund_orderId_status_idx" ON "Refund"("orderId", "status");

-- CreateIndex
CREATE INDEX "Refund_paymentId_status_idx" ON "Refund"("paymentId", "status");

-- CreateIndex
CREATE INDEX "Refund_status_updatedAt_idx" ON "Refund"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "RefundSession_enrollmentSessionId_idx" ON "RefundSession"("enrollmentSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundSession_refundId_enrollmentSessionId_key" ON "RefundSession"("refundId", "enrollmentSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderEvent_eventId_key" ON "ProviderEvent"("eventId");

-- CreateIndex
CREATE INDEX "ProviderEvent_status_createdAt_idx" ON "ProviderEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderEvent_transactionId_idx" ON "ProviderEvent"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementEntry_idempotencyKey_key" ON "SettlementEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SettlementEntry_academyId_createdAt_id_idx" ON "SettlementEntry"("academyId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "SettlementEntry_orderId_idx" ON "SettlementEntry"("orderId");

-- CreateIndex
CREATE INDEX "SettlementEntry_paymentId_idx" ON "SettlementEntry"("paymentId");

-- CreateIndex
CREATE INDEX "SettlementEntry_refundId_idx" ON "SettlementEntry"("refundId");

-- CreateIndex
CREATE INDEX "SettlementEntry_originalEntryId_idx" ON "SettlementEntry"("originalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Job_status_leaseUntil_idx" ON "Job"("status", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_orderId_key" ON "Enrollment"("orderId");

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_offeringId_academyId_fkey" FOREIGN KEY ("offeringId", "academyId") REFERENCES "Offering"("id", "academyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_orderId_studentId_offeringId_academyId_fkey" FOREIGN KEY ("orderId", "studentId", "offeringId", "academyId") REFERENCES "Order"("id", "studentId", "offeringId", "academyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentSession" ADD CONSTRAINT "EnrollmentSession_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentSession" ADD CONSTRAINT "EnrollmentSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundSession" ADD CONSTRAINT "RefundSession_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundSession" ADD CONSTRAINT "RefundSession_enrollmentSessionId_fkey" FOREIGN KEY ("enrollmentSessionId") REFERENCES "EnrollmentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementEntry" ADD CONSTRAINT "SettlementEntry_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementEntry" ADD CONSTRAINT "SettlementEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementEntry" ADD CONSTRAINT "SettlementEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementEntry" ADD CONSTRAINT "SettlementEntry_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementEntry" ADD CONSTRAINT "SettlementEntry_originalEntryId_fkey" FOREIGN KEY ("originalEntryId") REFERENCES "SettlementEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- All commerce writes use the server connection. Data API roles default deny.
ALTER TABLE "Order" ADD CONSTRAINT order_fields_check CHECK (status IN ('pending_payment','paid','expired','cancelled','payment_exception','partially_refunded','refunded') AND "amountWon">=0 AND "feeWon">=0 AND "feeWon"<="amountWon" AND currency='KRW' AND "expiresAt">"createdAt");
ALTER TABLE "SeatReservation" ADD CONSTRAINT reservation_status_check CHECK (status IN ('held','consumed','expired','released') AND "expiresAt">"createdAt");
ALTER TABLE "Payment" ADD CONSTRAINT payment_fields_check CHECK (status IN ('pending','paid','failed','cancelled','partially_refunded','refunded') AND "amountWon">=0 AND currency='KRW');
ALTER TABLE "Refund" ADD CONSTRAINT refund_fields_check CHECK (status IN ('requested','processing','pending','succeeded','failed') AND kind IN ('customer','compensation') AND "amountWon">=0 AND attempts>=0);
ALTER TABLE "EnrollmentSession" ADD CONSTRAINT enrollment_session_check CHECK (status IN ('allowed','refund_pending','cancelled') AND "amountWon">=0 AND "endsAt">"startsAt");
ALTER TABLE "ProviderEvent" ADD CONSTRAINT provider_event_check CHECK (status IN ('pending','processed','failed') AND attempts>=0);
ALTER TABLE "SettlementEntry" ADD CONSTRAINT settlement_fields_check CHECK (kind IN ('payment','refund','fee','academy_due','payout','adjustment') AND currency='KRW');
ALTER TABLE "Job" ADD CONSTRAINT job_fields_check CHECK (status IN ('pending','processing','succeeded','failed') AND attempts>=0 AND "maxAttempts">0);
CREATE UNIQUE INDEX "Order_active_student_offering_key" ON "Order"("studentId","offeringId") WHERE status IN ('pending_payment','paid','partially_refunded');
ALTER TABLE "Order" ADD CONSTRAINT order_guardian_link_fkey FOREIGN KEY ("parentId","studentId") REFERENCES "GuardianLink"("guardianId","studentId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Order_id_studentId_offeringId_key" ON "Order"(id,"studentId","offeringId");
ALTER TABLE "Enrollment" ADD CONSTRAINT enrollment_order_scope_fkey FOREIGN KEY ("orderId","studentId","offeringId") REFERENCES "Order"(id,"studentId","offeringId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Order_id_academyId_key" ON "Order"(id,"academyId");
CREATE UNIQUE INDEX "Payment_id_orderId_key" ON "Payment"(id,"orderId");
CREATE UNIQUE INDEX "Refund_id_orderId_key" ON "Refund"(id,"orderId");
ALTER TABLE "Refund" ADD CONSTRAINT refund_payment_scope_fkey FOREIGN KEY ("paymentId","orderId") REFERENCES "Payment"(id,"orderId") ON DELETE RESTRICT;
ALTER TABLE "SettlementEntry" ADD CONSTRAINT settlement_order_scope_fkey FOREIGN KEY ("orderId","academyId") REFERENCES "Order"(id,"academyId") ON DELETE RESTRICT;
ALTER TABLE "SettlementEntry" ADD CONSTRAINT settlement_payment_scope_fkey FOREIGN KEY ("paymentId","orderId") REFERENCES "Payment"(id,"orderId") ON DELETE RESTRICT;
ALTER TABLE "SettlementEntry" ADD CONSTRAINT settlement_refund_scope_fkey FOREIGN KEY ("refundId","orderId") REFERENCES "Refund"(id,"orderId") ON DELETE RESTRICT;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SeatReservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Refund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefundSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EnrollmentSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProviderEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SettlementEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Job" ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION commerce_ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SETTLEMENT_APPEND_ONLY' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER settlement_no_update_delete BEFORE UPDATE OR DELETE ON "SettlementEntry" FOR EACH ROW EXECUTE FUNCTION commerce_ledger_append_only();
CREATE TRIGGER settlement_no_truncate BEFORE TRUNCATE ON "SettlementEntry" FOR EACH STATEMENT EXECUTE FUNCTION commerce_ledger_append_only();

CREATE FUNCTION commerce_protect_offering() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE occupied integer; clock_now timestamp;
BEGIN
  IF OLD."purchaseLockedAt" IS NOT NULL AND (NEW."priceWon"<>OLD."priceWon" OR NEW."purchaseLockedAt" IS DISTINCT FROM OLD."purchaseLockedAt") THEN
    RAISE EXCEPTION 'PURCHASE_SNAPSHOT_LOCKED' USING ERRCODE='23514';
  END IF;
  IF NEW.capacity<OLD.capacity THEN
    clock_now := COALESCE(NULLIF(current_setting('eduon.now',true), '')::timestamp, CURRENT_TIMESTAMP::timestamp);
    EXECUTE format('SELECT (SELECT count(*) FROM %I."Enrollment" WHERE "offeringId"=$1 AND status IN (''active'',''pending_payment''))+(SELECT count(*) FROM %I."SeatReservation" WHERE "offeringId"=$1 AND status=''held'' AND "expiresAt">$2)', TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO occupied USING OLD.id,clock_now;
    IF NEW.capacity<occupied THEN RAISE EXCEPTION 'CAPACITY_RESERVED' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER offering_purchase_lock BEFORE UPDATE ON "Offering" FOR EACH ROW EXECUTE FUNCTION commerce_protect_offering();

CREATE FUNCTION commerce_protect_session() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE locked timestamp; target uuid;
BEGIN
  target := CASE WHEN TG_OP='DELETE' THEN OLD."offeringId" ELSE NEW."offeringId" END;
  EXECUTE format('SELECT "purchaseLockedAt" FROM %I."Offering" WHERE id=$1 FOR UPDATE',TG_TABLE_SCHEMA) INTO locked USING target;
  IF locked IS NOT NULL THEN RAISE EXCEPTION 'PURCHASE_SESSIONS_LOCKED' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD."offeringId"<>NEW."offeringId" THEN
    EXECUTE format('SELECT "purchaseLockedAt" FROM %I."Offering" WHERE id=$1 FOR UPDATE',TG_TABLE_SCHEMA) INTO locked USING OLD."offeringId";
    IF locked IS NOT NULL THEN RAISE EXCEPTION 'PURCHASE_SESSIONS_LOCKED' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER session_purchase_lock BEFORE INSERT OR UPDATE OR DELETE ON "Session" FOR EACH ROW EXECUTE FUNCTION commerce_protect_session();
