-- 062_coreguard_guards.sql
-- Ledger guards G01–G07 and G09. Always enforced: a violation raises SQLSTATE 23514 with a message
-- starting "COREGUARD Gxx:" and the whole transaction rolls back.
-- Only an authorised maintenance session (guide §4.6) skips them, and every such statement is logged.

-- ── Helpers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION coreguard.fail(p_guard text, p_message text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = format('COREGUARD %s: %s', p_guard, p_message);
END $$;

-- Returns the maintenance reason, or NULL. Raises if the setting is used without authorisation.
CREATE OR REPLACE FUNCTION coreguard.maintenance_reason() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_temp AS $$
DECLARE r text := NULLIF(current_setting('bookone.ledger_maintenance', true), '');
BEGIN
  IF r IS NULL THEN RETURN NULL; END IF;
  IF NOT pg_has_role(session_user, 'coreguard_maintenance', 'MEMBER') THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = format('COREGUARD G04: login %s is not allowed to use ledger maintenance', session_user);
  END IF;
  IF r NOT IN ('archive_restore', 'coreguard_cleanup', 'coreguard_corruption') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = format('COREGUARD G04: unknown maintenance reason %L', r);
  END IF;
  IF r = 'coreguard_corruption' AND current_database() !~* '(^|[_-])(test|pilot|coreguard|ci|lab)([_-]|$)' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COREGUARD G04: corruption mode is only allowed on lab/test databases';
  END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION coreguard.is_iso_date(p text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p IS NULL OR p !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN false; END IF;
  RETURN to_char(to_date(p, 'YYYY-MM-DD'), 'YYYY-MM-DD') = p;
EXCEPTION WHEN others THEN
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION coreguard.is_finite_number(p numeric) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT p IS NOT NULL AND p <> 'NaN'::numeric $$;

CREATE OR REPLACE FUNCTION coreguard.period_lock_key(p_tenant uuid, p_period text) RETURNS bigint
LANGUAGE sql IMMUTABLE AS $$ SELECT hashtextextended('bookone.period:' || p_tenant || ':' || p_period, 0) $$;

-- Statement-level log of every maintenance write to a guarded table.
CREATE OR REPLACE FUNCTION coreguard.trg_log_maintenance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = coreguard, pg_temp AS $$
DECLARE r text := coreguard.maintenance_reason();
BEGIN
  IF r IS NOT NULL THEN
    INSERT INTO coreguard.bypass_log (reason, table_name, operation) VALUES (r, TG_TABLE_NAME, TG_OP);
  END IF;
  RETURN NULL;
END $$;

-- ── G01: every live journal entry balances exactly, has a debit and a credit line, and no invalid line ──
CREATE OR REPLACE FUNCTION coreguard.trg_g01_entry_balanced() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
DECLARE
  v_entry uuid; v_voided timestamptz;
  v_net numeric; v_dr int; v_cr int; v_bad int;
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NULL; END IF;
  -- IF, not CASE: PL/pgSQL resolves NEW/OLD fields in every CASE branch, and NEW is unassigned on DELETE.
  IF TG_TABLE_NAME = 'journal_lines' THEN
    IF TG_OP = 'DELETE' THEN v_entry := OLD.journal_entry_id; ELSE v_entry := NEW.journal_entry_id; END IF;
  ELSE
    v_entry := NEW.id;
  END IF;
  SELECT voided_at INTO v_voided FROM journal_entries WHERE id = v_entry;
  IF NOT FOUND OR v_voided IS NOT NULL THEN RETURN NULL; END IF;
  -- ELSE 0 and explicit counts: SUM ignores NULL, so an invalid side must be counted, not summed.
  SELECT COALESCE(SUM(CASE side WHEN 'debit' THEN amount WHEN 'credit' THEN -amount ELSE 0 END), 0),
         COUNT(*) FILTER (WHERE side = 'debit'),
         COUNT(*) FILTER (WHERE side = 'credit'),
         COUNT(*) FILTER (WHERE side IS NULL OR side NOT IN ('debit','credit')
                             OR NOT coreguard.is_finite_number(amount) OR amount <= 0)
    INTO v_net, v_dr, v_cr, v_bad
    FROM journal_lines
   WHERE journal_entry_id = v_entry AND voided_at IS NULL;
  IF v_net <> 0 OR v_dr = 0 OR v_cr = 0 OR v_bad > 0 THEN
    PERFORM coreguard.fail('G01', format(
      'journal entry %s does not balance (difference %s, %s debit lines, %s credit lines, %s invalid lines)',
      v_entry, v_net, v_dr, v_cr, v_bad));
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS cg_g01_lines ON journal_lines;
CREATE CONSTRAINT TRIGGER cg_g01_lines AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g01_entry_balanced();
DROP TRIGGER IF EXISTS cg_g01_entries ON journal_entries;
CREATE CONSTRAINT TRIGGER cg_g01_entries AFTER INSERT OR UPDATE ON journal_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g01_entry_balanced();

-- ── G02: line shape ──
CREATE OR REPLACE FUNCTION coreguard.trg_g02_line_shape() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.side IS NULL OR NEW.side NOT IN ('debit','credit') THEN
    PERFORM coreguard.fail('G02', format('invalid side %L', NEW.side));
  END IF;
  -- PostgreSQL numeric accepts NaN (also numeric(18,2)) and orders it above every number, so "> 0" alone is not enough.
  IF NOT coreguard.is_finite_number(NEW.amount) OR NEW.amount <= 0 THEN
    PERFORM coreguard.fail('G02', format('amount must be a finite number greater than zero (got %s)', NEW.amount));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cg_g02_lines ON journal_lines;
CREATE TRIGGER cg_g02_lines BEFORE INSERT ON journal_lines FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g02_line_shape();

-- ── G03: tenant, account and party consistency ──
CREATE OR REPLACE FUNCTION coreguard.trg_g03_line_refs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
DECLARE e_tenant uuid; a accounts%ROWTYPE; p_tenant uuid; p_voided timestamptz;
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NEW; END IF;
  SELECT tenant_id INTO e_tenant FROM journal_entries WHERE id = NEW.journal_entry_id;
  SELECT * INTO a FROM accounts WHERE id = NEW.account_id;
  IF e_tenant IS DISTINCT FROM NEW.tenant_id OR a.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    PERFORM coreguard.fail('G03', format('journal line references another company''s entry or account (line tenant %s)', NEW.tenant_id));
  END IF;
  IF a.is_group = '1' THEN
    PERFORM coreguard.fail('G03', format('account %s is a group account and cannot be posted to', a.code));
  END IF;
  IF a.is_active IS DISTINCT FROM '1' OR a.voided_at IS NOT NULL THEN
    PERFORM coreguard.fail('G03', format('account %s is archived and cannot be posted to', a.code));
  END IF;
  IF NEW.party_id IS NOT NULL THEN
    SELECT tenant_id, voided_at INTO p_tenant, p_voided FROM parties WHERE id = NEW.party_id;
    IF p_tenant IS DISTINCT FROM NEW.tenant_id OR p_voided IS NOT NULL THEN
      PERFORM coreguard.fail('G03', 'journal line references a party of another company or an archived party');
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cg_g03_lines ON journal_lines;
CREATE TRIGGER cg_g03_lines BEFORE INSERT ON journal_lines FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g03_line_refs();

CREATE OR REPLACE FUNCTION coreguard.trg_g03_entry_refs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
DECLARE t_tenant uuid;
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NEW; END IF;
  SELECT tenant_id INTO t_tenant FROM transactions WHERE id = NEW.transaction_id;
  IF t_tenant IS DISTINCT FROM NEW.tenant_id THEN
    PERFORM coreguard.fail('G03', 'journal entry references a transaction of another company');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cg_g03_entries ON journal_entries;
CREATE TRIGGER cg_g03_entries BEFORE INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g03_entry_refs();

-- ── G04: posted ledger rows are immutable; corrections are reversals ──
CREATE OR REPLACE FUNCTION coreguard.trg_g04_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'period_locks' THEN
    PERFORM coreguard.fail('G04', 'period locks cannot be deleted; reopen the period with coreguard.unlock_period');
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM coreguard.fail('G04', format('%s rows cannot be deleted; post a reversal instead', TG_TABLE_NAME));
  END IF;
  IF TG_TABLE_NAME = 'journal_lines' THEN
    IF (NEW.tenant_id, NEW.journal_entry_id, NEW.account_id, NEW.side, NEW.amount, NEW.party_id,
        NEW.brand_id, NEW.location_id, NEW.voided_at, NEW.created_at)
       IS DISTINCT FROM
       (OLD.tenant_id, OLD.journal_entry_id, OLD.account_id, OLD.side, OLD.amount, OLD.party_id,
        OLD.brand_id, OLD.location_id, OLD.voided_at, OLD.created_at) THEN
      PERFORM coreguard.fail('G04', format('journal line %s is posted; only its memo can change', OLD.id));
    END IF;
  ELSIF TG_TABLE_NAME = 'journal_entries' THEN
    IF (NEW.tenant_id, NEW.user_id, NEW.transaction_id, NEW.entry_date, NEW.is_balanced, NEW.brand_id,
        NEW.location_id, NEW.book_domain, NEW.voided_at, NEW.created_at)
       IS DISTINCT FROM
       (OLD.tenant_id, OLD.user_id, OLD.transaction_id, OLD.entry_date, OLD.is_balanced, OLD.brand_id,
        OLD.location_id, OLD.book_domain, OLD.voided_at, OLD.created_at) THEN
      PERFORM coreguard.fail('G04', format('journal entry %s is posted; only memo and notes can change', OLD.id));
    END IF;
  ELSIF TG_TABLE_NAME = 'transactions' THEN
    IF (NEW.tenant_id, NEW.user_id, NEW.accounting_type, NEW.direction, NEW.amount, NEW.currency,
        NEW.payment_account_id, NEW.transfer_source_account_id, NEW.reverses_transaction_id, NEW.date,
        NEW.brand_id, NEW.location_id, NEW.book_domain, NEW.voided_at, NEW.created_at,
        NEW.source_kind, NEW.source_id)
       IS DISTINCT FROM
       (OLD.tenant_id, OLD.user_id, OLD.accounting_type, OLD.direction, OLD.amount, OLD.currency,
        OLD.payment_account_id, OLD.transfer_source_account_id, OLD.reverses_transaction_id, OLD.date,
        OLD.brand_id, OLD.location_id, OLD.book_domain, OLD.voided_at, OLD.created_at,
        OLD.source_kind, OLD.source_id) THEN
      PERFORM coreguard.fail('G04', format('transaction %s is posted; its financial fields cannot change', OLD.id));
    END IF;
    IF OLD.reversed_by_transaction_id IS NOT NULL
       AND NEW.reversed_by_transaction_id IS DISTINCT FROM OLD.reversed_by_transaction_id THEN
      PERFORM coreguard.fail('G04', format('transaction %s is already reversed', OLD.id));
    END IF;
  ELSIF TG_TABLE_NAME = 'period_locks' THEN
    IF (NEW.tenant_id, NEW.user_id, NEW.period, NEW.locked_at, NEW.voided_at, NEW.created_at)
       IS DISTINCT FROM (OLD.tenant_id, OLD.user_id, OLD.period, OLD.locked_at, OLD.voided_at, OLD.created_at)
       OR (OLD.status = 'unlocked' AND NEW.status <> 'unlocked')
       OR NEW.status NOT IN ('locked', 'unlocked') THEN
      PERFORM coreguard.fail('G04', 'a period lock can only change from locked to unlocked; relock creates a new lock');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cg_g04_lines ON journal_lines;
CREATE TRIGGER cg_g04_lines BEFORE UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g04_immutable();
DROP TRIGGER IF EXISTS cg_g04_entries ON journal_entries;
CREATE TRIGGER cg_g04_entries BEFORE UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g04_immutable();
DROP TRIGGER IF EXISTS cg_g04_transactions ON transactions;
CREATE TRIGGER cg_g04_transactions BEFORE UPDATE OR DELETE ON transactions FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g04_immutable();
DROP TRIGGER IF EXISTS cg_g04_period_locks ON period_locks;
CREATE TRIGGER cg_g04_period_locks BEFORE UPDATE OR DELETE ON period_locks FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g04_immutable();

DROP TRIGGER IF EXISTS cg_log_lines ON journal_lines;
CREATE TRIGGER cg_log_lines AFTER INSERT OR UPDATE OR DELETE ON journal_lines FOR EACH STATEMENT EXECUTE FUNCTION coreguard.trg_log_maintenance();
DROP TRIGGER IF EXISTS cg_log_entries ON journal_entries;
CREATE TRIGGER cg_log_entries AFTER INSERT OR UPDATE OR DELETE ON journal_entries FOR EACH STATEMENT EXECUTE FUNCTION coreguard.trg_log_maintenance();
DROP TRIGGER IF EXISTS cg_log_transactions ON transactions;
CREATE TRIGGER cg_log_transactions AFTER INSERT OR UPDATE OR DELETE ON transactions FOR EACH STATEMENT EXECUTE FUNCTION coreguard.trg_log_maintenance();

-- ── G05: nothing dated in a locked period. Takes the SHARED tenant-period lock first (close takes it EXCLUSIVE). ──
CREATE OR REPLACE FUNCTION coreguard.trg_g05_period_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
DECLARE v_date text;
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'journal_entries' THEN v_date := NEW.entry_date; ELSE v_date := NEW.movement_date; END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    PERFORM coreguard.fail('G05', format('ledger writes must run in READ COMMITTED (got %s)', current_setting('transaction_isolation')));
  END IF;
  PERFORM pg_advisory_xact_lock_shared(coreguard.period_lock_key(NEW.tenant_id, left(v_date, 7)));
  IF EXISTS (SELECT 1 FROM period_locks
              WHERE tenant_id = NEW.tenant_id AND period = left(v_date, 7)
                AND status = 'locked' AND voided_at IS NULL) THEN
    PERFORM coreguard.fail('G05', format('period %s is locked', left(v_date, 7)));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cg_g05_entries ON journal_entries;
CREATE TRIGGER cg_g05_entries BEFORE INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g05_period_lock();
DROP TRIGGER IF EXISTS cg_g05_movements ON inventory_movements;
CREATE TRIGGER cg_g05_movements BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g05_period_lock();

-- ── G06: field validity (dates, flags, finite amounts) ──
CREATE OR REPLACE FUNCTION coreguard.trg_g06_fields() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'journal_entries' THEN
    IF NOT coreguard.is_iso_date(NEW.entry_date) THEN PERFORM coreguard.fail('G06', format('invalid entry date %L', NEW.entry_date)); END IF;
    IF NEW.is_balanced NOT IN ('0','1') THEN PERFORM coreguard.fail('G06', 'is_balanced must be 0 or 1'); END IF;
  ELSIF TG_TABLE_NAME = 'transactions' THEN
    IF NOT coreguard.is_iso_date(NEW.date) THEN PERFORM coreguard.fail('G06', format('invalid transaction date %L', NEW.date)); END IF;
    IF NOT coreguard.is_finite_number(NEW.amount) OR NEW.amount <= 0 THEN
      PERFORM coreguard.fail('G06', format('transaction amount must be a finite number greater than zero (got %s)', NEW.amount));
    END IF;
    IF NEW.is_already_settled NOT IN ('0','1') THEN PERFORM coreguard.fail('G06', 'is_already_settled must be 0 or 1'); END IF;
  ELSIF TG_TABLE_NAME = 'inventory_movements' THEN
    IF NOT coreguard.is_iso_date(NEW.movement_date) THEN PERFORM coreguard.fail('G06', format('invalid movement date %L', NEW.movement_date)); END IF;
    IF NOT coreguard.is_finite_number(NEW.quantity) OR (NEW.unit_cost IS NOT NULL AND NOT coreguard.is_finite_number(NEW.unit_cost)) THEN
      PERFORM coreguard.fail('G06', 'stock quantity and unit cost must be finite numbers');
    END IF;
  ELSIF TG_TABLE_NAME = 'settlement_allocations' THEN
    IF NOT coreguard.is_finite_number(NEW.allocated_amount) OR NEW.allocated_amount <= 0 THEN
      PERFORM coreguard.fail('G06', format('allocated amount must be a finite number greater than zero (got %s)', NEW.allocated_amount));
    END IF;
  ELSIF TG_TABLE_NAME = 'business_documents' THEN
    IF 'NaN'::numeric IN (NEW.subtotal, NEW.discount_total, NEW.tax_total, NEW.total, NEW.paid_amount,
                          NEW.balance_due, NEW.freight_amount, NEW.duty_amount, NEW.other_charges, NEW.vat_rate) THEN
      PERFORM coreguard.fail('G06', 'document amounts must be finite numbers');
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cg_g06_entries ON journal_entries;
CREATE TRIGGER cg_g06_entries BEFORE INSERT OR UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g06_fields();
DROP TRIGGER IF EXISTS cg_g06_transactions ON transactions;
CREATE TRIGGER cg_g06_transactions BEFORE INSERT OR UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g06_fields();
DROP TRIGGER IF EXISTS cg_g06_movements ON inventory_movements;
CREATE TRIGGER cg_g06_movements BEFORE INSERT OR UPDATE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g06_fields();
DROP TRIGGER IF EXISTS cg_g06_allocations ON settlement_allocations;
CREATE TRIGGER cg_g06_allocations BEFORE INSERT OR UPDATE ON settlement_allocations FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g06_fields();
DROP TRIGGER IF EXISTS cg_g06_documents ON business_documents;
CREATE TRIGGER cg_g06_documents BEFORE INSERT OR UPDATE ON business_documents FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g06_fields();

-- ── G07: every transaction has a journal entry by COMMIT (index cg_one_live_entry_per_tx makes it exactly one) ──
CREATE OR REPLACE FUNCTION coreguard.trg_g07_tx_has_journal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, coreguard, pg_temp AS $$
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM transactions WHERE id = NEW.id) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE transaction_id = NEW.id AND voided_at IS NULL) THEN
    PERFORM coreguard.fail('G07', format('transaction %s was saved without a journal entry', NEW.id));
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS cg_g07_transactions ON transactions;
CREATE CONSTRAINT TRIGGER cg_g07_transactions AFTER INSERT ON transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g07_tx_has_journal();

-- ── G09: seal — lines only in the transaction that created their entry; entries only in the transaction that created their transaction ──
CREATE OR REPLACE FUNCTION coreguard.trg_g09_record_seal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = coreguard, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    INSERT INTO coreguard.entry_seal (journal_entry_id, tenant_id, created_xact) VALUES (NEW.id, NEW.tenant_id, pg_current_xact_id());
  ELSE
    INSERT INTO coreguard.tx_seal (transaction_id, tenant_id, created_xact) VALUES (NEW.id, NEW.tenant_id, pg_current_xact_id());
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS cg_g09_seal_entries ON journal_entries;
CREATE TRIGGER cg_g09_seal_entries AFTER INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g09_record_seal();
DROP TRIGGER IF EXISTS cg_g09_seal_transactions ON transactions;
CREATE TRIGGER cg_g09_seal_transactions AFTER INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g09_record_seal();

CREATE OR REPLACE FUNCTION coreguard.trg_g09_check_seal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = coreguard, pg_temp AS $$
DECLARE x xid8;
BEGIN
  IF coreguard.maintenance_reason() IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'journal_lines' THEN
    SELECT created_xact INTO x FROM coreguard.entry_seal WHERE journal_entry_id = NEW.journal_entry_id;
    IF x IS DISTINCT FROM pg_current_xact_id() THEN   -- no seal row (older entry) also counts as sealed
      PERFORM coreguard.fail('G09', format('journal entry %s is sealed; post a new entry or a reversal instead', NEW.journal_entry_id));
    END IF;
  ELSE
    SELECT created_xact INTO x FROM coreguard.tx_seal WHERE transaction_id = NEW.transaction_id;
    IF x IS DISTINCT FROM pg_current_xact_id() THEN
      PERFORM coreguard.fail('G09', format('transaction %s is sealed; it already has its journal', NEW.transaction_id));
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cg_g09_check_lines ON journal_lines;
CREATE TRIGGER cg_g09_check_lines BEFORE INSERT ON journal_lines FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g09_check_seal();
DROP TRIGGER IF EXISTS cg_g09_check_entries ON journal_entries;
CREATE TRIGGER cg_g09_check_entries BEFORE INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION coreguard.trg_g09_check_seal();
