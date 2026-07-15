-- Booking drafts contain customer names, phone numbers, bike details and
-- service requests. They are used only by trusted server-side Nest functions.
ALTER TABLE public.nest_brand_lightspeed_booking_state
  ENABLE ROW LEVEL SECURITY;

-- No browser role needs direct Data API access. Keep the existing service-role
-- grant explicit; service_role bypasses RLS for the Edge Function workflow.
REVOKE ALL ON TABLE public.nest_brand_lightspeed_booking_state
  FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.nest_brand_lightspeed_booking_state
  TO service_role;

COMMENT ON COLUMN public.nest_brand_lightspeed_booking_state.status IS
  'collecting | awaiting_confirm | creating | created';
