-- PRESTINE — demo catalogue
--
-- Four sample products so the storefront and admin panel are not empty on
-- first run. Real photography from Unsplash (a host already allow-listed in
-- `src/lib/image-hosts.ts`, so `next/image` optimises these without any
-- config change) rather than placeholder/broken URLs.
--
-- This is demo content, not a fixture the app depends on: delete any or all
-- of these rows from the admin panel whenever real products are ready to
-- take their place. `on conflict do nothing` throughout, so this file is
-- safe to leave applied even after you've edited or removed the rows it
-- created — re-running it will not resurrect or duplicate anything.

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------

insert into products (
  id, slug, name, tagline, department, category, price, compare_at_price,
  size_system, description, details, composition, care, fit_note, origin,
  rating, review_count, released_at, popularity, sustainable, show_on_home,
  status, sku, cost_price, weight_grams, taxable, seo_title, seo_description
) values
  (
    'p-demo0001', 'double-faced-wool-overcoat', 'Double-Faced Wool Overcoat',
    'Cut from 380gsm Italian wool, finished without a lining so both faces show.',
    'unisex', 'outerwear', 68000, 82000,
    'alpha',
    'A knee-length overcoat in double-faced wool, woven in the same Biella mill we have used since our first season. Constructed with a full horsehair canvas through the chest and a natural shoulder, so it holds its shape without feeling built-up.',
    array[
      'Double-faced wool, no lining — both sides are finished',
      'Full horsehair canvas through the chest and lapel',
      'Horn buttons, hand-set buttonholes',
      'Interior ticket pocket'
    ],
    '100% wool',
    array['Dry clean only', 'Store on a wide-shouldered hanger', 'Steam rather than press'],
    'True to size. Sized for a mid-layer knit underneath; go one size down for a closer, jacket-style fit.',
    'Woven and finished in Biella, Italy',
    4.70, 128, now() - interval '40 days', 96, true, true,
    'active', 'PR-OC-001', 31000, 1450, true,
    'Double-Faced Wool Overcoat — PRESTINE',
    'A knee-length double-faced wool overcoat, woven in Biella and cut with a full horsehair canvas.'
  ),
  (
    'p-demo0002', 'grade-a-cashmere-crew', 'Grade-A Cashmere Crew',
    'Fully-fashioned in twelve-gauge Grade-A Mongolian cashmere.',
    'unisex', 'knitwear', 24000, null,
    'alpha',
    'Our best-selling crew, knitted in twelve-gauge Grade-A Mongolian cashmere and fully fashioned rather than cut-and-sewn, so there is no bulk at the seams. Garment-washed once to soften the hand before it ever reaches you.',
    array[
      'Grade-A Mongolian cashmere, 12-gauge',
      'Fully-fashioned — no cut-and-sew side seams',
      'Ribbed collar, cuffs and hem',
      'Garment-washed for softness before finishing'
    ],
    '100% cashmere',
    array['Hand wash cold or dry clean', 'Dry flat, never on a hanger', 'Store folded to avoid shoulder stretch'],
    'True to size, with a little room through the body for layering.',
    'Knitted and finished in Inner Mongolia',
    4.85, 342, now() - interval '15 days', 210, false, true,
    'active', 'PR-KW-014', 8600, 420, true,
    'Grade-A Cashmere Crew — PRESTINE',
    'A fully-fashioned crew neck in twelve-gauge Grade-A Mongolian cashmere.'
  ),
  (
    'p-demo0003', 'okayama-selvedge-jean', 'Okayama Selvedge Jean',
    'Fourteen-ounce selvedge denim, woven on vintage shuttle looms in Okayama.',
    'men', 'denim', 21000, 26000,
    'waist',
    'A straight-leg jean in fourteen-ounce selvedge denim, woven on the same vintage shuttle looms Okayama has used for sixty years. Unwashed at sale, so it will fade to whatever you actually wear — every crease is yours, not a factory sandblaster''s.',
    array[
      '14oz selvedge denim, shuttle-loomed in Okayama',
      'Unwashed — fades develop from wear, not a factory finish',
      'Copper rivets, leather patch',
      'Chain-stitched hem'
    ],
    '100% cotton',
    array['Wash inside-out, cold, as infrequently as you can stand', 'Hang dry', 'Avoid washing for the first month to let fades set'],
    'Runs small through the seat and thigh — most reorder true to size once broken in, but go up half a size if between sizes.',
    'Woven and sewn in Okayama, Japan',
    4.55, 96, now() - interval '70 days', 74, false, false,
    'active', 'PR-DN-007', 7200, 680, true,
    'Okayama Selvedge Jean — PRESTINE',
    'A straight-leg jean in unwashed 14oz selvedge denim, shuttle-loomed in Okayama.'
  ),
  (
    'p-demo0004', 'bridle-leather-belt', 'Bridle Leather Belt',
    'Northampton bridle leather, hand-cut and edge-painted in-house.',
    'unisex', 'accessories', 9500, null,
    'one-size',
    'A 35mm belt in Northampton bridle leather, curried with the same tallow-and-wax process saddlers have used for generations. It arrives stiff and dark; both soften and lighten with wear, which is the point rather than a flaw.',
    array[
      'Northampton bridle leather, hand-cut',
      'Solid brass buckle, nickel-free',
      'Edges hand-painted, not machine-bound',
      '35mm width'
    ],
    'Full-grain leather, brass hardware',
    array['Wipe clean with a dry cloth', 'Condition twice a year with a neutral leather balm', 'Keep away from prolonged damp'],
    'Sized to waist measurement, not trouser size — see the size guide for the conversion.',
    'Cut and finished in Northamptonshire, England',
    4.90, 61, now() - interval '5 days', 58, false, true,
    'active', 'PR-AC-022', 2900, 310, true,
    'Bridle Leather Belt — PRESTINE',
    'A 35mm belt in Northampton bridle leather with a solid brass buckle.'
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Colourways (real photography — front/detail/back/on-figure order)
-- ---------------------------------------------------------------------------

insert into product_colors (id, product_id, name, hex, images, position) values
  -- Double-Faced Wool Overcoat
  (
    'camel', 'p-demo0001', 'Camel', '#B08D63',
    array[
      'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=1200&q=80',
      'https://images.unsplash.com/photo-1544923246-77307dd654cb?w=1200&q=80',
      'https://images.unsplash.com/photo-1614251055880-ee96e4803393?w=1200&q=80',
      'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=1200&q=80'
    ],
    0
  ),
  (
    'charcoal', 'p-demo0001', 'Charcoal', '#3B3B3D',
    array[
      'https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=1200&q=80',
      'https://images.unsplash.com/photo-1520975916090-3105956dac38?w=1200&q=80'
    ],
    1
  ),
  -- Grade-A Cashmere Crew
  (
    'bone', 'p-demo0002', 'Bone', '#E8E1D3',
    array[
      'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=1200&q=80',
      'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=1200&q=80',
      'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=1200&q=80'
    ],
    0
  ),
  (
    'forest', 'p-demo0002', 'Forest', '#3C4A3C',
    array[
      'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=1200&q=80',
      'https://images.unsplash.com/photo-1516826957135-700dedea698c?w=1200&q=80'
    ],
    1
  ),
  (
    'camel-knit', 'p-demo0002', 'Camel', '#C8A177',
    array[
      'https://images.unsplash.com/photo-1608234807905-4466023792f5?w=1200&q=80'
    ],
    2
  ),
  -- Okayama Selvedge Jean
  (
    'indigo', 'p-demo0003', 'Raw Indigo', '#2B3A55',
    array[
      'https://images.unsplash.com/photo-1542272604-787c3835535d?w=1200&q=80',
      'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=1200&q=80',
      'https://images.unsplash.com/photo-1475178626620-a4d074967452?w=1200&q=80'
    ],
    0
  ),
  -- Bridle Leather Belt
  (
    'chestnut', 'p-demo0004', 'Chestnut', '#7B4B2A',
    array[
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=1200&q=80',
      'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=1200&q=80'
    ],
    0
  ),
  (
    'black', 'p-demo0004', 'Black', '#1C1C1C',
    array[
      'https://images.unsplash.com/photo-1611923134239-b9be5816e23c?w=1200&q=80'
    ],
    1
  )
on conflict (product_id, id) do nothing;

-- ---------------------------------------------------------------------------
-- Sizes
-- ---------------------------------------------------------------------------

insert into product_sizes (product_id, label, position) values
  ('p-demo0001', 'S', 0), ('p-demo0001', 'M', 1), ('p-demo0001', 'L', 2), ('p-demo0001', 'XL', 3),
  ('p-demo0002', 'XS', 0), ('p-demo0002', 'S', 1), ('p-demo0002', 'M', 2), ('p-demo0002', 'L', 3), ('p-demo0002', 'XL', 4),
  ('p-demo0003', '30', 0), ('p-demo0003', '32', 1), ('p-demo0003', '34', 2), ('p-demo0003', '36', 3),
  ('p-demo0004', 'One Size', 0)
on conflict (product_id, label) do nothing;

-- ---------------------------------------------------------------------------
-- Collection tags
-- ---------------------------------------------------------------------------

insert into product_collections (product_id, collection_slug) values
  ('p-demo0001', 'new-arrivals'),
  ('p-demo0001', 'autumn-winter'),
  ('p-demo0002', 'best-sellers'),
  ('p-demo0002', 'essentials'),
  ('p-demo0003', 'essentials'),
  ('p-demo0004', 'new-arrivals'),
  ('p-demo0004', 'essentials')
on conflict (product_id, collection_slug) do nothing;

-- ---------------------------------------------------------------------------
-- Cross-sell pairings ("Pairs well with")
-- ---------------------------------------------------------------------------

insert into product_pairings (product_id, paired_with_id, position) values
  ('p-demo0001', 'p-demo0002', 0),
  ('p-demo0002', 'p-demo0001', 0),
  ('p-demo0002', 'p-demo0003', 1),
  ('p-demo0003', 'p-demo0002', 0),
  ('p-demo0003', 'p-demo0004', 1),
  ('p-demo0004', 'p-demo0001', 0)
on conflict (product_id, paired_with_id) do nothing;
