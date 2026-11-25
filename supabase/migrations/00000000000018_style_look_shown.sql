-- PRESTINE — style hints: which product pages a photo appears on
--
-- Migration 17 treated "the products worn in a look" and "the product pages the look
-- appears on" as the same list: tick three products and the photo showed on all three
-- pages. That is how a lookbook works, and it is not what was asked for. Each product
-- should have its own style photos, and a photo of an outfit should not turn up on the page
-- of every garment in it.
--
-- ## The change
--
-- Two separate questions about each product in a look:
--
--   - is it WORN in the photo?  -> listed when the photo is opened (a row exists)
--   - is the photo SHOWN on its page?  -> `shown`
--
-- So a look can list a jumper, a jacket and trousers when opened, while appearing only on
-- the jacket's page. Showing it on the others is an explicit tick, not the default.
--
-- ## Existing rows
--
-- `default true` keeps anything created under migration 17 behaving exactly as it did:
-- shown on every product it lists. There are no such rows on the live database today (the
-- tables were created empty), so this only matters for a copy of the schema that has
-- already had looks added.
--
-- A look must be shown on at least one page or it is invisible. That is enforced by the
-- application, where it can say so, rather than by a constraint that would make the
-- error "check constraint violated".

alter table style_look_products
  add column if not exists shown boolean not null default true;

comment on column style_look_products.shown is
  'Whether the look appears on this product''s page. Every row is still listed when the photograph is opened, shown or not. See migration 18.';
