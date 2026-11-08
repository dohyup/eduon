# Payment recovery (internal test mode)

The current gateway is a guarded fake. No real payment provider has been selected, and live payments remain disabled. The fake keeps provider facts in process memory. A process restart can lose those simulated facts; durable EDUON jobs do not turn a fake fact into authentic provider evidence. A missing fake payment is retried and eventually becomes an operator exception. Do not mark it paid or refunded from a timeout or a redirect.

## Scheduler request

POST `/api/internal/jobs` with JSON `{ "limit": 25 }` (`limit` is an integer from 1 to 100). The body must be at most 32,768 bytes. The request does not use a user cookie. It requires these headers:

- `x-eduon-timestamp`: integer Unix seconds, from the present to at most 300 seconds old.
- `x-eduon-nonce`: 32 hexadecimal characters, generated freshly for every scheduler request.
- `x-eduon-signature`: lowercase or uppercase hexadecimal HMAC-SHA256 with `JOBS_SECRET` over the exact bytes `timestamp.nonce.` followed by the original request body.

`JOBS_SECRET` must contain at least 32 characters. Keep it in the scheduler secret store and server configuration. Never put it in a query parameter, browser script, log, or checked-in command. Reusing a valid nonce returns HTTP 409. A database Job with `scheduler:<nonce>` is committed before any work; a crash after that commit requires a fresh nonce. Keep nonce markers durably; any future cleanup must retain them beyond the full signature acceptance window, including clock skew.

Invalid signatures return 401, malformed payloads 400, oversized bodies 413, and missing scheduler/provider configuration or demo mode 503. Configure a scheduler to call this endpoint every minute in the isolated test environment. The endpoint first expires up to 100 reservations, repairs missing event/refund/reconciliation jobs, and processes the requested number of jobs.

## Recovery behavior

Reservation expiry and payment confirmation use the same student, academy, offering, and order locking sequence. Paid evidence received at or after the ten-minute reservation deadline records the payment, creates an exception and idempotent compensation refund, and grants no enrollment.

Workers claim jobs using an atomic conditional database update, with a 60-second lease and a fresh claim token. An expired lease is reclaimable after a crash. Every completion and retry update includes that token, so a slow old worker cannot overwrite the result of a replacement worker. Payment and refund domain writes are separately idempotent. All gateway calls run outside database transactions.

Each claim consumes one attempt. Failures retry after 1, 5, 30, and 30 minutes. Five attempts exhaust the job and leave it failed for an operator. Expired leases at the attempt limit also become failed. Error records contain controlled error codes, never gateway response bodies. Refund retries keep the original request key and first retrieve the refund. If lookup finds no refund, the service can retry the same key, including after a crash before the first send. The adapter must guarantee same-key idempotency across retries; a future adapter with a bounded provider idempotency window must return pending rather than send when it cannot safely guarantee that behavior. An uncertain provider result remains pending until authenticated evidence resolves it. A separate refund-attempt generation fence prevents a stale provider result from restoring or cancelling rights owned by a replacement attempt.

Reconciliation schedules at most 100 unresolved payment rows, 100 pending provider events, and 100 unfinished refunds per invocation. Each entity has a durable `reconciliation_cursor` Job (`scan:payments`, `scan:events`, `scan:refunds`). A serialized transaction advances its UUID keyset cursor with the enqueue commit and wraps after the end, so exhausted work in the first page cannot starve later rows. Each entity performs at most two bounded scan queries per invocation. Payment jobs retrieve authenticated current provider facts. Event jobs mark a provider event processed only after a successful domain application and fenced job completion. This also repairs a crash between event persistence and enqueue. Completed payment reconciliation jobs may be rearmed on a later scheduler run; failed jobs retain their attempt history and require intervention.

## Operator response

Monitor failed jobs and pending jobs with `lastError` in `/admin/payments` and `/api/payments/exceptions`. Only an enabled platform admin can see these records. Review the order, refund, attempts, last error, and next retry time. Alert the operator whenever a job reaches failed; no external notification delivery integration is configured in this internal test implementation.

After verifying the provider state, use the admin refund retry action for a failed or uncertain refund. It records an audit event, preserves its external request key, resets the durable job attempt budget, and rechecks session eligibility. Never edit settlement entries: they are append-only. Never retry an uncertain cancellation with a new external request key or infer refund success from a network timeout. A future real provider must supply durable authenticated payment and refund retrieval before production recovery can be approved.

The generic admin retry action posts to `/api/jobs/<jobId>/retry` with normal authenticated mutation origin checks. It allows failed jobs, pending jobs with an error, or processing jobs whose lease expired. It refuses live leases and records an audit event. Payment event retries retain the same persisted event; refund jobs delegate to the refund service so failed session rights are restored and the external request key is preserved. Exception rows expose `retryJobId` and `canRetry`; a plain order exception is informational, while its failed durable job provides the retry action.

## Verification

Run `npm.cmd run test:integration -- tests/integration/reconciliation.test.ts`. The runner creates an isolated ephemeral PostgreSQL cluster when no explicit test URL is supplied. These tests cover duplicate workers, lease recovery and fencing, persist-before-enqueue crashes, delayed compensation, retry exhaustion, admin access, nonce replay, and expiry/confirmation contention. They use no real provider or real database credentials.
