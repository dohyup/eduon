# P4 local performance evidence

This is a **local synthetic service benchmark**, not staging, HTTP, browser, provider or concurrent-user evidence. The staging acceptance target remains search p95 ≤ 1 second with 1,000 synthetic offerings and 20 results. That staging check is pending.

Measured 2026-11-09 01:20:22 UTC on Windows x64, Intel Core Ultra 7 256V / 8 logical CPUs, Node 24.18.0, PostgreSQL 17.11 embedded and Prisma 7.10.1. The script created a new loopback-only cluster and applied the checked-in migrations. No `.env.local` or existing database was used. All records were synthetic and the cluster was removed.

| Production service | Dataset / returned page                      | Warmups | Serial samples |     p50 |     p95 |       Min–max |
| ------------------ | -------------------------------------------- | ------: | -------------: | ------: | ------: | ------------: |
| `searchOfferings`  | 1,000 offerings / 20 items                   |      10 |            100 | 8.11 ms | 9.15 ms | 7.10–12.48 ms |
| `listRoster`       | 1,000 enrolled synthetic students / 20 items |      10 |            100 | 6.58 ms | 8.01 ms |  4.22–9.03 ms |

Percentiles use nearest rank, `ceil(n × p)`. Timings include real service authorization/query/DTO work through the original Prisma client, with warm database cache and concurrency 1. Query logging and EXPLAIN run after timing. Full samples, captured SQL, 12 JSON execution plans and runtime details are in [p4-benchmark-result.json](./p4-benchmark-result.json).

Reproduce from the repository root:

```powershell
npx tsx --conditions=react-server scripts/benchmark-p4.mts
```

The script accepts no database arguments and always generates a disposable PostgreSQL data directory under `.tmp`. On this Windows host PostgreSQL subprocess startup requires normal host execution outside the restricted sandbox. It writes a new `docs/operations/p4-benchmark-result.json`; update this narrative if the measured run changes. No package script was added.

## Actual SQL plans

These are EXPLAIN `(ANALYZE, BUFFERS, FORMAT JSON)` results for SELECT statements captured from the real Prisma services, replayed against the same synthetic database. They are not invented SQL plans.

| Statement                    | Root / useful child plan                                                                                      | Actual rows | Execution | Shared hits / reads |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------: | --------: | ------------------: |
| Search first candidate batch | Limit → Offering primary-key index; aggregate seat counts                                                     |          20 |  0.352 ms |              38 / 0 |
| Search continuation batch    | Limit with cursor, same joins                                                                                 |          20 |  0.321 ms |              37 / 0 |
| Search batched sessions      | Sort → Bitmap Heap/Index Scan, `Session_offeringId_academyId_idx`                                             |          20 |  0.054 ms |              10 / 0 |
| Roster page                  | Limit → StudentProfile primary-key scan → Enrollment offering/student unique index → Order primary-key lookup |          21 |  0.097 ms |             107 / 0 |

Search uses two bounded batches to obtain its extra continuation item: six SQL statements total for the 20-result response in this fixture. Course/session data is fetched in batches rather than once per result. Roster uses six SQL statements including actor, academy and assignment authorization, with one 21-row page query. Its Order lookup loops within one database query; this is not a client N+1 request loop.

The session FK index and enrollment offering/student index are used. Small one-row Course/Academy tables are scanned cheaply. The search enrollment-count aggregate scans all 1,000 Enrollment rows per candidate batch; its cost grows with enrollment volume even though returned pages are bounded. Existing indexes and this small local run do not establish acceptable performance at production scale. No index was added based solely on this run.

The production Prisma adapter caps each client pool at five connections and has connection/query deadlines. This run used one serial caller and does not test pool exhaustion, multiple application instances, connection poolers or concurrent checkout/classroom work.

## Remaining acceptance evidence

The fixture shares one course and one active academy, concentrates roster records in one offering, has no pending reservations and uses a warm local database. Repeat on deployment-equivalent staging with realistic academy/course distributions, active holds, session counts, concurrent users and both warm/cold cache. Measure route p95 and separate provider latency for payment/video. Record deployment/database versions, network location and raw samples before claiming the staging target is met. The local figures above establish a reproducible baseline only.
