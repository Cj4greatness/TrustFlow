BEGIN READ ONLY;

WITH gaps AS (
  SELECT p.organization_id, p.id AS payment_id, p.confirmed_at,
         p.status AS payment_status
  FROM payments p
  LEFT JOIN receipts r
    ON r.organization_id = p.organization_id
   AND r.payment_id = p.id
  WHERE p.status = 'success'
    AND r.id IS NULL
)
SELECT 'total_successful_payments_without_receipt' AS metric,
       count(*)::text AS value
FROM gaps
UNION ALL
SELECT 'organizations_affected',
       count(DISTINCT organization_id)::text
FROM gaps
UNION ALL
SELECT 'oldest_confirmed_at',
       coalesce(min(confirmed_at)::text, '')
FROM gaps
UNION ALL
SELECT 'newest_confirmed_at',
       coalesce(max(confirmed_at)::text, '')
FROM gaps;

SELECT organization_id,
       count(*) AS successful_payments_without_receipt
FROM payments p
LEFT JOIN receipts r
  ON r.organization_id = p.organization_id
 AND r.payment_id = p.id
WHERE p.status = 'success'
  AND r.id IS NULL
GROUP BY organization_id
ORDER BY successful_payments_without_receipt DESC, organization_id;

SELECT date_trunc('day', confirmed_at) AS payment_day,
       count(*) AS successful_payments_without_receipt
FROM payments p
LEFT JOIN receipts r
  ON r.organization_id = p.organization_id
 AND r.payment_id = p.id
WHERE p.status = 'success'
  AND r.id IS NULL
GROUP BY 1
ORDER BY 1;

ROLLBACK;
