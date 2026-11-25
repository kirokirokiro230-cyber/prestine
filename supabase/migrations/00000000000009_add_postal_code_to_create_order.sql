-- Add postal code parameter to create_order_with_lines function
-- This allows the checkout flow to save the customer's pincode to the database
-- so it can be used for Delhivery shipment creation

create or replace function create_order_with_lines(
  p_id text,
  p_placed_at timestamptz,
  p_customer_id text,
  p_email text,
  p_promo_code text,
  p_card_last4 text,
  p_subtotal integer,
  p_discount integer,
  p_shipping integer,
  p_tax integer,
  p_total integer,
  p_ship_name text,
  p_ship_line1 text,
  p_ship_city text,
  p_ship_region text,
  p_ship_phone text,
  p_ship_postal_code text,
  p_lines jsonb,
  p_payment_provider text default null,
  p_cashfree_order_id text default null,
  p_cashfree_payment_session_id text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line jsonb;
  v_position integer := 0;
begin
  insert into orders (
    id, placed_at, status, customer_id, email, promo_code, card_last4,
    subtotal, discount, shipping, tax, total,
    ship_name, ship_line1, ship_city, ship_region, ship_phone, ship_postal_code,
    payment_provider, cashfree_order_id, cashfree_payment_session_id
  ) values (
    p_id, p_placed_at, 'processing', p_customer_id, p_email, p_promo_code, p_card_last4,
    p_subtotal, p_discount, p_shipping, p_tax, p_total,
    p_ship_name, p_ship_line1, p_ship_city, p_ship_region, p_ship_phone, p_ship_postal_code,
    p_payment_provider, p_cashfree_order_id, p_cashfree_payment_session_id
  );

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into order_lines (
      order_id, product_id, slug, name, color_id, color_name, color_hex,
      size, quantity, unit_price, category, position
    ) values (
      p_id,
      v_line->>'productId',
      v_line->>'slug',
      v_line->>'name',
      v_line->>'colorId',
      coalesce(v_line->>'colorName', ''),
      coalesce(v_line->>'colorHex', ''),
      v_line->>'size',
      (v_line->>'quantity')::integer,
      (v_line->>'unitPrice')::integer,
      v_line->>'category',
      v_position
    );
    v_position := v_position + 1;
  end loop;

  return p_id;
end;
$$;
