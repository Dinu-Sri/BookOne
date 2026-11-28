-- 063_coreguard_functions.sql
-- Period close/reopen protocol and the findings bookkeeping used by the CoreGuard worker.

-- ── Canonical trial balance through the end of a period (used by close and by check CG-S03) ──
CREATE OR REPLACE FUNCTION coreguard.tb_through_period(p_tenant uuid, p_period text)
RETURNS TABLE (tb_hash text, tb_json jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH live AS (
    SELECT a.code,
           SUM(CASE WHEN jl.side = 'debit'  THEN (jl.amount * 100)::bigint ELSE 0 END) AS debit_cents,
           SUM(CASE WHEN jl.side = 'credit' THEN (jl.amount * 100)::bigint ELSE 0 END) AS credit_cents
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      JOIN transactions t     ON t.id = je.transaction_id
      JOIN accounts a         ON a.id = jl.account_id
     WHERE jl.tenant_id = p_tenant AND je.tenant_id = p_tenant AND t.tenant_id = p_tenant
       AND jl.voided_at IS NULL AND je.voided_at IS NULL AND t.voided_at IS NULL
       AND je.entry_date <= to_char(to_date(p_period || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day', 'YYYY-MM-DD')
     GROUP BY a.code
  )
  SELECT encode(sha256(convert_to(COALESCE(string_agg(code || '|' || debit_cents || '|' || credit_cents, E'\n' ORDER BY code), ''), 'UTF8')), 'hex'),
         COALESCE(jsonb_object_agg(code, jsonb_build_object('debit_cents', debit_cents, 'credit_cents', credit_cents)), '{}'::jsonb)
    FROM live
$$;

-- ── Close a period. The only way to create a period lock. ──
CREATE OR REPLACE FUNCTION coreguard.lock_period(p_tenant uuid, p_period text, p_user uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
DECLARE v_lock uuid;
BEGIN
  IF current_setting('app.current_tenant_id', true) IS DISTINCT FROM p_tenant::text THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COREGUARD G05: tenant context mismatch';
  END IF;
  -- In REPEATABLE READ the snapshot predates the lock wait, so the fingerprint would miss postings committed meanwhile.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '25001',
      MESSAGE = format('COREGUARD G05: period close/reopen must run in READ COMMITTED (got %s)', current_setting('transaction_isolation'));
  END IF;
  -- The protocol only works if postings take the shared lock (trigger cg_g05_entries).
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'cg_g05_entries' AND tgenabled <> 'D') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'COREGUARD G05: period-lock trigger missing or disabled; refusing to close';
  END IF;
  IF p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = format('COREGUARD G05: invalid period %L', p_period);
  END IF;
  PERFORM pg_advisory_xact_lock(coreguard.period_lock_key(p_tenant, p_period));  -- exclusive: waits for in-flight postings
  SELECT id INTO v_lock FROM period_locks
   WHERE tenant_id = p_tenant AND period = p_period AND status = 'locked' AND voided_at IS NULL;
  IF FOUND THEN RETURN v_lock; END IF;                                            -- already locked: idempotent
  INSERT INTO period_locks (tenant_id, user_id, period, status, locked_at, notes)
  VALUES (p_tenant, p_user, p_period, 'locked', clock_timestamp(), p_reason)
  RETURNING id INTO v_lock;
  INSERT INTO coreguard.period_fingerprints (lock_id, tenant_id, period, tb_hash, tb_json)
  SELECT v_lock, p_tenant, p_period, x.tb_hash, x.tb_json FROM coreguard.tb_through_period(p_tenant, p_period) x;
  RETURN v_lock;
END $$;

-- ── Reopen a period. The only way to unlock. ──
CREATE OR REPLACE FUNCTION coreguard.unlock_period(p_tenant uuid, p_period text, p_user uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
DECLARE v_lock uuid;
BEGIN
  IF current_setting('app.current_tenant_id', true) IS DISTINCT FROM p_tenant::text THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'COREGUARD G05: tenant context mismatch';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '25001',
      MESSAGE = format('COREGUARD G05: period close/reopen must run in READ COMMITTED (got %s)', current_setting('transaction_isolation'));
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'COREGUARD G05: a reason is required to reopen a period';
  END IF;
  PERFORM pg_advisory_xact_lock(coreguard.period_lock_key(p_tenant, p_period));
  UPDATE period_locks SET status = 'unlocked', unlocked_at = clock_timestamp(),
         notes = concat_ws(E'\n', notes, format('Reopened by %s: %s', p_user, p_reason)), updated_at = now()
   WHERE tenant_id = p_tenant AND period = p_period AND status = 'locked' AND voided_at IS NULL
  RETURNING id INTO v_lock;
  IF v_lock IS NULL THEN RETURN; END IF;                                          -- not locked: idempotent
  UPDATE coreguard.period_fingerprints SET superseded_at = clock_timestamp() WHERE lock_id = v_lock;
END $$;

-- ── Findings bookkeeping: the ONLY code that creates, updates or resolves findings ──
-- p_rows: [{"fp": "...", "severity": "critical", "difference_cents": 123, "subject": {...}, "message": "...", "revision": 1}]
CREATE OR REPLACE FUNCTION coreguard.record_check_result(
  p_run uuid, p_tenant uuid, p_check text, p_outcome text, p_error text, p_rows jsonb
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  INSERT INTO coreguard.check_results (run_id, tenant_id, check_id, outcome, error, rows_found)
  VALUES (p_run, p_tenant, p_check, p_outcome, p_error, jsonb_array_length(COALESCE(p_rows, '[]')));
  IF p_outcome IN ('error', 'not_applicable') THEN
    RETURN;  -- a check that did not complete never creates, changes or resolves findings
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]')) LOOP
    INSERT INTO coreguard.findings (fingerprint, check_id, check_revision, tenant_id, severity, subject,
                                    difference_cents, message, first_seen_run, last_seen_run, last_checked_run)
    VALUES (r->>'fp', p_check, COALESCE((r->>'revision')::int, 1), p_tenant, r->>'severity', r->'subject',
            (r->>'difference_cents')::bigint, COALESCE(r->>'message', p_check), p_run, p_run, p_run)
    ON CONFLICT (fingerprint) WHERE status <> 'resolved' DO UPDATE
      SET last_seen_run = p_run, last_checked_run = p_run, last_seen_at = now(),
          occurrences = coreguard.findings.occurrences + 1,
          acknowledged_by = CASE WHEN coreguard.findings.difference_cents IS DISTINCT FROM EXCLUDED.difference_cents
                                 THEN NULL ELSE coreguard.findings.acknowledged_by END,
          acknowledged_at = CASE WHEN coreguard.findings.difference_cents IS DISTINCT FROM EXCLUDED.difference_cents
                                 THEN NULL ELSE coreguard.findings.acknowledged_at END,
          difference_cents = EXCLUDED.difference_cents;
  END LOOP;
  UPDATE coreguard.findings f SET status = 'resolved', resolved_run = p_run, resolved_at = now()
   WHERE f.tenant_id IS NOT DISTINCT FROM p_tenant AND f.check_id = p_check AND f.status <> 'resolved'
     AND f.fingerprint NOT IN (SELECT e->>'fp' FROM jsonb_array_elements(COALESCE(p_rows, '[]')) e);
END $$;

-- ── Company status: from findings and this run's check outcomes ONLY (acknowledgment is not an input) ──
CREATE OR REPLACE FUNCTION coreguard.tenant_status(p_tenant uuid, p_run uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM coreguard.findings WHERE tenant_id = p_tenant AND status = 'open'
                  AND severity IN ('critical','high'))                                          THEN 'red'
    WHEN EXISTS (SELECT 1 FROM coreguard.check_results WHERE run_id = p_run AND tenant_id = p_tenant
                  AND outcome = 'error')                                                        THEN 'check_failed'
    WHEN EXISTS (SELECT 1 FROM coreguard.findings WHERE tenant_id = p_tenant AND status = 'open')   THEN 'amber'
    WHEN EXISTS (SELECT 1 FROM coreguard.findings WHERE tenant_id = p_tenant AND status = 'waived') THEN 'known_gaps'
    ELSE 'green' END
$$;

GRANT EXECUTE ON FUNCTION coreguard.record_check_result(uuid, uuid, text, text, text, jsonb) TO coreguard_writer;
GRANT EXECUTE ON FUNCTION coreguard.tenant_status(uuid, uuid) TO coreguard_writer, coreguard_reader;
GRANT EXECUTE ON FUNCTION coreguard.tb_through_period(uuid, text) TO coreguard_reader;
