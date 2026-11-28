INSERT INTO coreguard.period_fingerprints (lock_id, tenant_id, period, tb_hash, tb_json)
SELECT pl.id, pl.tenant_id, pl.period, x.tb_hash, x.tb_json
  FROM period_locks pl
 CROSS JOIN LATERAL coreguard.tb_through_period(pl.tenant_id, pl.period) x
 WHERE pl.status = 'locked' AND pl.voided_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM coreguard.period_fingerprints f WHERE f.lock_id = pl.id);
