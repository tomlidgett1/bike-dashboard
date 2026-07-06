-- Atomic, drift-proof campaign analytics counters.
-- Instead of read-modify-write increments (which lose updates under concurrent
-- webhook deliveries), recount the denormalised counters straight from the
-- per-recipient timestamp columns, which are the source of truth.
CREATE OR REPLACE FUNCTION crm_recalc_campaign_counters(p_campaign_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE crm_campaigns c
  SET delivered_count = agg.delivered,
      opened_count = agg.opened,
      clicked_count = agg.clicked,
      bounced_count = agg.bounced,
      updated_at = now()
  FROM (
    SELECT
      COUNT(delivered_at) AS delivered,
      COUNT(opened_at) AS opened,
      COUNT(clicked_at) AS clicked,
      COUNT(bounced_at) AS bounced
    FROM crm_campaign_recipients
    WHERE campaign_id = p_campaign_id
  ) agg
  WHERE c.id = p_campaign_id;
$$;

REVOKE EXECUTE ON FUNCTION crm_recalc_campaign_counters(UUID) FROM anon, authenticated;
