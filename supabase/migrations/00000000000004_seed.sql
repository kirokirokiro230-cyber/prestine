-- PRESTINE — starter data
--
-- Equivalent to seed() in the old src/server/store.ts: the taxonomy, promo
-- codes, email copy and hero banners a fresh install needs so the admin panel
-- and storefront are not blank on first run. No products, no orders, no
-- admins and no customers are seeded here — per the migration brief, this is
-- a from-scratch build with no historical data carried over. The first admin
-- account is still created through /admin/setup exactly as before, so a
-- seeded password never ends up in this repository.
--
-- Uses `on conflict do nothing` throughout so this file can be re-run safely
-- (e.g. after `supabase db reset`) without duplicate-key errors.

-- ---------------------------------------------------------------------------
-- Settings — the one row
-- ---------------------------------------------------------------------------

insert into settings (
  id, name, legal_name, tagline, description, url, email, phone, address,
  currency, locale, free_shipping_threshold, standard_shipping_rate, tax_rate,
  return_window_days, delivery_days_min, delivery_days_max, review_request_delay_days,
  social_instagram, social_pinterest, social_youtube,
  announcements, marquee_items, home_new_arrivals_count,
  service_promises, shipping_returns_copy, maintenance_mode
) values (
  true,
  'PRESTINE',
  'Prestine Atelier Ltd.',
  'Considered clothing, built to outlast the season.',
  'PRESTINE makes small-batch wardrobe essentials from natural fibres — tailored outerwear, hand-finished knitwear and denim, designed in London and made in family-run European mills.',
  'https://prestine.example.com',
  'clientcare@prestine.example.com',
  '+44 20 7946 0102',
  '12 Redchurch Street, London E2 7DP',
  'USD',
  'en-US',
  20000,
  900,
  0.08,
  -- return_window_days, deprecated. Migration 13 replaces this column with
  -- return_window_hours and backfills it as days * 24, so 2 here is what makes a
  -- freshly seeded store land on the intended 48-hour policy. The hours column
  -- cannot be set directly from this file: it does not exist yet at migration 4.
  2,
  3,
  5,
  5,
  'https://instagram.com',
  'https://pinterest.com',
  'https://youtube.com',
  array[
    'Complimentary shipping on orders over $200',
    '48-hour returns, collected from your door',
    'Free monogramming on knitwear and leather goods'
  ],
  array[
    'Italian double-faced wool',
    'Grade-A Mongolian cashmere',
    'Okayama selvedge denim',
    'European flax linen',
    'Northampton bridle leather',
    'GOTS organic cotton'
  ],
  4,
  '[
    {"title": "Complimentary shipping", "body": "On all orders over $200, carbon-neutral by default."},
    {"title": "48-hour returns", "body": "Collected from your door, refunded within three working days."},
    {"title": "Repairs for life", "body": "Free repairs on every piece we make, for as long as you own it."}
  ]'::jsonb,
  array[
    'Standard delivery is complimentary on orders over $200 and arrives in 3–5 business days, tracked and carbon-neutral. Express and nominated-day options are offered at checkout.',
    'Returns are free within 48 hours of delivery, after which we can no longer accept them. Book a collection from your door in your account, or use any drop-off point. Refunds are issued within three working days of the parcel reaching us.'
  ],
  false
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

insert into categories (slug, name, blurb, silhouette, position) values
  ('outerwear', 'Outerwear', 'Wool-rich coats and weatherproof shells cut for layering.', 'coat', 0),
  ('knitwear', 'Knitwear', 'Fully-fashioned cashmere, merino and cotton, finished by hand.', 'sweater', 1),
  ('shirts', 'Shirts', 'Long-staple poplin and washed linen with mother-of-pearl buttons.', 'shirt', 2),
  ('tees', 'T-Shirts', 'Heavyweight organic jersey that holds its shape after fifty washes.', 'tee', 3),
  ('trousers', 'Trousers', 'Pleated wool, cotton twill and drawstring tailoring.', 'trouser', 4),
  ('denim', 'Denim', 'Selvedge and comfort stretch woven in Okayama and Candiani.', 'jean', 5),
  ('dresses', 'Dresses', 'Bias-cut silk, poplin shirt dresses and knitted column shapes.', 'dress', 6),
  ('accessories', 'Accessories', 'Leather goods, scarves and belts to close the look.', 'accessory', 7)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Collections
-- ---------------------------------------------------------------------------

insert into collections (slug, name, blurb, description, position) values
  (
    'new-arrivals', 'New Arrivals', 'The latest pieces to land in the atelier.',
    'Delivered weekly in small runs. Each piece is sampled three times before it reaches production, which is why our drops are modest and rarely repeated.',
    0
  ),
  (
    'best-sellers', 'Best Sellers', 'The pieces our clients reorder in every colour.',
    'Ranked on repeat purchases rather than page views. If it lives here, someone has bought it twice.',
    1
  ),
  (
    'essentials', 'The Essentials', 'Twelve pieces that carry a whole wardrobe.',
    'Our permanent collection — never discounted, never discontinued, restocked in the same colours season after season so a favourite can always be replaced.',
    2
  ),
  (
    'the-tailoring-edit', 'The Tailoring Edit', 'Soft structure, natural shoulders, room to move.',
    'Tailoring built on a half-canvas construction with a lightly padded shoulder, cut to be worn with a knit rather than a tie.',
    3
  ),
  (
    'autumn-winter', 'Autumn / Winter', 'Heavier weights, deeper tones, longer lines.',
    'Fabrics from 380gsm upward — brushed lambswool, double-faced cashmere and dry-finish moleskin, in a palette drawn from wet stone and winter bark.',
    4
  ),
  (
    'sale', 'Archive Sale', 'Final pieces from past seasons, reduced once.',
    'Discontinued colourways and end-of-run sizes. Reduced a single time and sold as final — these do not return.',
    5
  )
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Promo codes
-- ---------------------------------------------------------------------------

insert into promo_codes (code, description, percent_off, amount_off, min_subtotal) values
  ('WELCOME10', '10% off your first order', 10, null, null),
  ('ATELIER25', '25% off orders over $400', 25, null, 40000),
  ('STUDIO50', '$50 off orders over $250', null, 5000, 25000)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Email templates
-- ---------------------------------------------------------------------------

insert into email_templates (key, enabled, subject, heading, body) values
  (
    'order-confirmation', true,
    'Your {{storeName}} order {{orderId}}',
    'Thank you, {{customerFirstName}}.',
    E'We have your order and we are getting it ready. You will hear from us again the moment it leaves us.\n\n{{itemLines}}\n\nTotal paid: {{orderTotal}}\n\nDelivering to:\n{{shippingAddress}}\n\nEstimated arrival is {{deliveryEstimate}} from dispatch. You can check your order at any time at {{orderUrl}}.'
  ),
  (
    'out-for-delivery', true,
    'Your order {{orderId}} is on its way',
    'It has left us.',
    E'Order {{orderId}} is with the courier and heading to you.\n\n{{trackingBlock}}\n\nExpected arrival is {{deliveryEstimate}}. Nobody needs to be home — the courier will leave it in a safe place if you are out.\n\nTrack your order any time at {{orderUrl}}.'
  ),
  (
    'delivered', true,
    'Your order {{orderId}} has arrived',
    'Delivered.',
    E'Order {{orderId}} has been delivered. We hope it was worth the wait.\n\n{{itemLines}}\n\nIf anything is not right — the fit, the colour, a fault — reply to this email and we will sort it out. Returns are free within {{returnWindow}} of delivery.'
  ),
  (
    'review-request', true,
    'How is your {{storeName}} order?',
    'How did we do?',
    E'You received order {{orderId}} a little while ago, so you have had a chance to wear it properly.\n\n{{itemLines}}\n\nIf you have a minute, a short review helps the next person decide. Honest is more useful than kind — we would rather know.\n\nLeave a review at {{orderUrl}}.'
  ),
  (
    'order-cancelled', true,
    'Your order {{orderId}} has been cancelled',
    'Your order is cancelled.',
    E'Order {{orderId}} has been cancelled and nothing further will be charged. Any payment already taken is refunded to the original method within three working days.\n\n{{cancellationReason}}\n\nIf this was not what you expected, reply to this email and we will look into it.'
  )
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Starter banners
-- ---------------------------------------------------------------------------
--
-- No image URLs, so they render as generated gradients from accent_hex — the
-- same "never show a broken image" rule the product artwork follows.

insert into banners (
  id, eyebrow, heading, body, cta_label, cta_href, accent_hex,
  text_tone, align, active, position
) values
  (
    'ban_seed0001', 'Autumn / Winter 2026', 'Clothing made to outlast the season.',
    'Small-batch pieces in natural fibres, cut in London and made in family-run European mills.',
    'Shop new arrivals', '/collections/new-arrivals', '#B08D63',
    'light', 'left', true, 0
  ),
  (
    'ban_seed0002', 'The Essentials', 'Twelve pieces that carry a whole wardrobe.',
    'Never discounted, never discontinued, restocked in the same colours season after season.',
    'Shop the Essentials', '/collections/essentials', '#3C4A3C',
    'light', 'left', true, 1
  ),
  (
    'ban_seed0003', 'Repairs for life', 'Free repairs, for as long as you own it.',
    'A seam, a button, a moth. Send it back and we will put it right.',
    'More about us', '/about', '#2C3A55',
    'light', 'center', true, 2
  )
on conflict (id) do nothing;
