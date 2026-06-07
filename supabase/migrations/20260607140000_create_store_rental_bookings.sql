-- ============================================================
-- Store Rental Bookings
-- Date ranges when a rental is booked / unavailable
-- ============================================================

CREATE TABLE IF NOT EXISTS store_rental_bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rental_id UUID NOT NULL REFERENCES store_rentals(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT store_rental_bookings_range_valid CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_store_rental_bookings_rental_id
  ON store_rental_bookings(rental_id);
CREATE INDEX IF NOT EXISTS idx_store_rental_bookings_user_id
  ON store_rental_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_store_rental_bookings_dates
  ON store_rental_bookings(rental_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_store_rental_bookings_status
  ON store_rental_bookings(rental_id, status);

ALTER TABLE store_rental_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own rental bookings" ON store_rental_bookings;
DROP POLICY IF EXISTS "Users can insert own rental bookings" ON store_rental_bookings;
DROP POLICY IF EXISTS "Users can update own rental bookings" ON store_rental_bookings;
DROP POLICY IF EXISTS "Users can delete own rental bookings" ON store_rental_bookings;
DROP POLICY IF EXISTS "Public can view active rental bookings" ON store_rental_bookings;
DROP POLICY IF EXISTS "Public can create pending rental bookings" ON store_rental_bookings;

CREATE POLICY "Users can view own rental bookings"
  ON store_rental_bookings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rental bookings"
  ON store_rental_bookings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rental bookings"
  ON store_rental_bookings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own rental bookings"
  ON store_rental_bookings
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Public can view active rental bookings"
  ON store_rental_bookings
  FOR SELECT
  USING (
    status IN ('pending', 'confirmed')
    AND EXISTS (
      SELECT 1
      FROM store_rentals sr
      JOIN users u ON u.user_id = sr.user_id
      WHERE sr.id = store_rental_bookings.rental_id
        AND sr.is_active = true
        AND u.bicycle_store = true
    )
  );

CREATE POLICY "Public can create pending rental bookings"
  ON store_rental_bookings
  FOR INSERT
  WITH CHECK (
    status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM store_rentals sr
      JOIN users u ON u.user_id = sr.user_id
      WHERE sr.id = store_rental_bookings.rental_id
        AND sr.user_id = store_rental_bookings.user_id
        AND sr.is_active = true
        AND sr.is_available = true
        AND u.bicycle_store = true
    )
  );

DROP TRIGGER IF EXISTS update_store_rental_bookings_updated_at ON store_rental_bookings;
CREATE TRIGGER update_store_rental_bookings_updated_at
  BEFORE UPDATE ON store_rental_bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE store_rental_bookings IS 'Booked date ranges for store rental products';
