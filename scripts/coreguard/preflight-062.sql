SELECT 'transactions with more than one live journal entry' AS problem, count(*) FROM (
  SELECT transaction_id FROM journal_entries WHERE voided_at IS NULL GROUP BY transaction_id HAVING count(*) > 1) d
UNION ALL
SELECT 'months with more than one active lock', count(*) FROM (
  SELECT tenant_id, period FROM period_locks WHERE status = 'locked' AND voided_at IS NULL GROUP BY 1, 2 HAVING count(*) > 1) d;
