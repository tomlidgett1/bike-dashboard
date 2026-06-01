-- Run this in the Supabase SQL editor to add the rejected products table.
-- Products added here are hidden from the Optimise page (e.g. workshop gloves
-- that are in inventory but not meant to be sold online).

create table if not exists optimizer_rejected_products (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users not null,
  product_id  text        not null,
  created_at  timestamptz default now() not null,
  unique (user_id, product_id)
);

alter table optimizer_rejected_products enable row level security;

create policy "Users manage own rejected products"
  on optimizer_rejected_products
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
