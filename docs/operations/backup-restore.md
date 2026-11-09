# Backup and restore verification

**Current status: restore drill blocked; no successful restore is claimed.** The 2026-11-09 local check found no matching `pg_dump` and `pg_restore` executables. The embedded PostgreSQL 17.11 Windows package contains `initdb.exe`, `pg_ctl.exe` and `postgres.exe`, but omits both backup tools. Neither is on PATH. Scoped checks also found no `C:/Program Files/PostgreSQL` or `C:/tools/postgresql` directory. Evidence is in [p4-restore-result.json](./p4-restore-result.json).

The benchmark and migration tests successfully created/disposed local databases, but those are not backup/restore tests. No production database, Supabase account, `.env.local`, remote server or provider storage was accessed by the restore check.

## Reproducible isolated drill

```powershell
npx tsx --conditions=react-server scripts/test-backup.mts
```

If PostgreSQL 17 client tools are already available in another local directory, give that directory explicitly:

```powershell
npx tsx --conditions=react-server scripts/test-backup.mts --pg-bin="C:/local/postgresql-17/bin"
```

This script discovers only local tools in the embedded package, scoped common installation directories and PATH. It reports `BLOCKED` with nonzero status when tools are missing. It does not download or install software. The optional directory must be an absolute local path; remote UNC paths are rejected.

When matching tools are available, the script will:

1. Start its own generated loopback-only cluster under `.tmp`, with new ephemeral credentials and port. Existing `DATABASE_URL`/`TEST_DATABASE_URL` values are replaced rather than used. Inherited libpq `PG*` settings are cleared for tool subprocesses; host, port, user and database are explicit. Passwords go through the child environment and are not printed or placed in command arguments.
2. Apply checked-in migrations into a generated test schema. Create a synthetic consented order, verified test payment, enrollment, manual attendance/history and completion through real services.
3. Run a custom-format `pg_dump` of that schema and restore into a **separate newly created database** using `pg_restore --exit-on-error --no-owner --no-privileges`. It does not restore over the source database or use `--clean` against an existing environment.
4. Compare every table's row count and sorted row-content SHA-256 digest, compare RLS flags and trigger names, and verify the restored settlement ledger still rejects updates. Only a fully matching result reports `PASSED`.
5. Disconnect clients and stop/remove the generated cluster. A synthetic dump can remain under ignored `.tmp`; it contains no real users or provider secrets. The JSON report contains tool versions, counts/digests and check results, never connection strings or passwords.

The execution branch remains unverified until the required executables are available and the drill actually completes. A blocked inventory check is not evidence that dump/restore commands work.

## Production acceptance and limits

A local schema dump excludes global roles, actual Supabase Auth configuration, private object-storage files, provider media and offsite backup controls. It does not prove point-in-time recovery, encryption/key recovery, access restrictions, production RPO/RTO, migration rollback or the completeness of a managed backup.

Before operational data is collected, the accountable operator must confirm the selected database plan's backup/PITR coverage, retention and deletion obligations; storage backup/versioning separately; access and encryption/key ownership; an isolated restore destination; service reconnection and reconciliation steps; and a timed staging restore against agreed recovery objectives. Do not infer these guarantees from the synthetic test or treat an inverse schema migration as a recovery procedure.

Restore approval should identify the recovery point, source backup, empty destination and responsible operator. After restoration, verify database migrations, payment/refund ledger consistency, enrollment/session rights, RLS, private-file references and job idempotency before resuming writes. Preserve financial history and reconcile provider facts; do not delete ledger rows to make restored totals match. The actual-account restore procedure and timed staging drill remain release checks.
