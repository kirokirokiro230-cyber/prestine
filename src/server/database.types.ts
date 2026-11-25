/**
 * Hand-written types for the Supabase Postgres schema.
 *
 * Normally generated with `supabase gen types typescript --linked`, which
 * needs a live connection to the linked project. There isn't one available
 * while this migration is being written, so this file is authored by hand to
 * match `supabase/migrations/00000000000001_schema.sql` column for column.
 *
 * Once the migrations have been run against a real project, regenerate this
 * file for real and it should come out equivalent:
 *
 *   npx supabase gen types typescript --linked > src/server/database.types.ts
 *
 * Only `Row` shapes are written out in full; `Insert`/`Update` are derived
 * with `Partial` over the columns that have a database default (identity
 * columns, `created_at`/`updated_at`, etc.), which is enough for the
 * repository layer's own insert/update helpers — this file is not meant to
 * be a byte-for-byte replica of the CLI's output, just a correctly-shaped one.
 */

export type Department = "women" | "men" | "unisex";
export type SizeSystemEnum = "alpha" | "waist" | "one-size" | "shoe";
export type ProductStatusEnum = "active" | "draft" | "archived";
export type SilhouetteKeyEnum =
  | "coat"
  | "sweater"
  | "shirt"
  | "tee"
  | "trouser"
  | "jean"
  | "dress"
  | "accessory"
  | "belt"
  | "scarf"
  | "wallet"
  | "beanie"
  | "bag";
export type OrderStatusEnum = "processing" | "shipped" | "delivered" | "cancelled";
export type PaymentStatusEnum = "pending" | "paid" | "failed";
export type AdminRoleEnum = "owner" | "manager" | "staff";
export type AuditActionEnum =
  | "create"
  | "update"
  | "delete"
  | "login"
  | "login:failed"
  | "logout"
  | "status";
export type EmailTemplateKeyEnum =
  | "order-confirmation"
  | "out-for-delivery"
  | "delivered"
  | "review-request"
  | "order-cancelled";
export type EmailStatusEnum = "sent" | "failed" | "logged";
export type OtpPurposeEnum = "signup" | "password-reset";
export type OtpProviderEnum = "local" | "twilio-verify" | "2factor";
export type TextToneEnum = "light" | "dark";
export type BannerAlignEnum = "left" | "center";
export type FitFeedbackEnum = "runs-small" | "true-to-size" | "runs-large";

export interface CategoryRow {
  slug: string;
  name: string;
  blurb: string;
  image_url: string | null;
  image_url_wide: string | null;
  silhouette: SilhouetteKeyEnum;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CollectionRow {
  slug: string;
  name: string;
  blurb: string;
  description: string;
  position: number;
  hidden: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  department: Department;
  category: string;
  price: number;
  compare_at_price: number | null;
  size_system: SizeSystemEnum;
  description: string;
  details: string[];
  composition: string;
  care: string[];
  fit_note: string;
  origin: string;
  rating: number;
  review_count: number;
  released_at: string;
  popularity: number;
  sustainable: boolean;
  show_on_home: boolean;
  status: ProductStatusEnum;
  sku: string | null;
  cost_price: number | null;
  weight_grams: number | null;
  taxable: boolean;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductCollectionRow {
  product_id: string;
  collection_slug: string;
}

export interface ProductPairingRow {
  product_id: string;
  paired_with_id: string;
  position: number;
}

export interface ProductColorRow {
  id: string;
  product_id: string;
  name: string;
  hex: string;
  images: string[];
  position: number;
}

export interface ProductSizeRow {
  product_id: string;
  label: string;
  position: number;
}

export interface BannerRow {
  id: string;
  eyebrow: string | null;
  heading: string;
  body: string | null;
  cta_label: string | null;
  cta_href: string | null;
  image_url: string | null;
  image_url_mobile: string | null;
  image_url_tablet: string | null;
  image_alt: string | null;
  accent_hex: string | null;
  text_tone: TextToneEnum;
  align: BannerAlignEnum;
  active: boolean;
  position: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromoCodeRow {
  code: string;
  description: string;
  percent_off: number | null;
  amount_off: number | null;
  min_subtotal: number | null;
  created_at: string;
  updated_at: string;
}

export interface SettingsRow {
  id: true;
  name: string;
  legal_name: string;
  tagline: string;
  description: string;
  url: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  locale: string;
  free_shipping_threshold: number;
  standard_shipping_rate: number;
  cod_enabled: boolean;
  cod_fee: number;
  cod_min_order: number;
  cod_max_order: number;
  /**
   * Percentage off a customer's first order. Zero is off. Added by migration 21, so a row
   * read before that migration has run has no such column: read it as `?? 0`.
   */
  first_order_discount_percent?: number;
  tax_rate: number;
  /** @deprecated Superseded by `return_window_hours` in migration 13. */
  return_window_days: number;
  return_window_hours: number;
  delivery_days_min: number;
  delivery_days_max: number;
  review_request_delay_days: number;
  social_instagram: string;
  social_pinterest: string;
  social_youtube: string;
  announcements: string[];
  marquee_items: string[];
  home_new_arrivals_count: number;
  service_promises: Array<{ title: string; body: string }>;
  shipping_returns_copy: string[];
  maintenance_mode: boolean;
  updated_at: string;
}

export interface AdminRow {
  id: string;
  email: string;
  name: string;
  role: AdminRoleEnum;
  password_hash: string;
  password_salt: string;
  disabled: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface CustomerRow {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  password_hash: string;
  password_salt: string;
  phone_verified_at: string;
  disabled: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface PhoneVerificationRow {
  id: string;
  phone: string;
  purpose: OtpPurposeEnum;
  provider: OtpProviderEnum;
  code_hash: string | null;
  code_salt: string | null;
  /** 2Factor.in's session id from AUTOGEN. Null for the local and twilio-verify providers. */
  provider_ref: string | null;
  expires_at: string;
  attempts: number;
  created_at: string;
  pending_name: string | null;
  pending_password_hash: string | null;
  pending_password_salt: string | null;
  pending_email: string | null;
}

/**
 * A row of `shipping_info`, as returned by `shipments_awaiting_tracking`.
 *
 * The shipping tables are not in the `Tables` map below: `repositories/shipping.ts`
 * reaches Postgres through its own client rather than the shared `db()`. This
 * row type exists only so the tracking sweep's RPC has a real return type
 * instead of `unknown`.
 */
export interface ShippingInfoRow {
  id: string;
  order_id: string;
  carrier: string;
  waybill: string;
  status: string | null;
  status_code: string | null;
  tracking_url: string | null;
  label_url: string | null;
  pickup_scheduled_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  expected_delivery_date: string | null;
  origin: string | null;
  destination: string | null;
  weight_grams: number | null;
  shipment_type: string;
  payment_mode: string;
  cod_amount: number | null;
  shipping_charges: number | null;
  raw_response: unknown;
  created_at: string;
  updated_at: string;
}

export interface OrderRow {
  id: string;
  placed_at: string;
  status: OrderStatusEnum;
  customer_id: string | null;
  email: string | null;
  promo_code: string | null;
  card_last4: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  ship_name: string;
  ship_line1: string;
  ship_city: string;
  ship_region: string;
  ship_phone: string;
  ship_first_name: string | null;
  ship_last_name: string | null;
  ship_line2: string | null;
  ship_postal_code: string | null;
  ship_country: string | null;
  tracking_number: string | null;
  carrier: string | null;
  /** Latest courier status, mirrored from `shipping_info` by the SQL functions. */
  shipping_status: string | null;
  expected_delivery_date: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  review_requested_at: string | null;
  payment_status: PaymentStatusEnum;
  /** `'prepaid'` or `'cod'`, constrained by a check in migration 12. */
  payment_method: string;
  cod_fee: number;
  payment_provider: string | null;
  cashfree_order_id: string | null;
  cashfree_payment_session_id: string | null;
  cashfree_payment_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderLineRow {
  id: number;
  order_id: string;
  product_id: string | null;
  slug: string;
  name: string;
  color_id: string | null;
  color_name: string;
  color_hex: string;
  size: string;
  quantity: number;
  unit_price: number;
  category: string;
  position: number;
}

export interface OrderNoteRow {
  id: number;
  order_id: string;
  body: string;
  created_at: string;
}

export interface SubmittedReviewRow {
  id: string;
  product_slug: string;
  customer_id: string;
  order_id: string;
  author: string;
  rating: number;
  fit: FitFeedbackEnum;
  reasons: string[];
  body: string;
  created_at: string;
}

export interface HiddenReviewRow {
  review_id: string;
  hidden_at: string;
}

export interface AuditLogRow {
  id: string;
  at: string;
  actor_id: string | null;
  actor_email: string;
  action: AuditActionEnum;
  entity: string;
  entity_id: string;
  summary: string;
}

export interface AdminNotificationRow {
  id: string;
  created_at: string;
  kind: string;
  severity: "info" | "success" | "warning" | "critical";
  title: string;
  body: string;
  order_id: string | null;
  href: string | null;
  dedupe_key: string | null;
}

export interface AdminNotificationStateRow {
  admin_id: string;
  seen_at: string;
}

export type OrderRefundStatusEnum =
  | "requested"
  | "pending"
  | "onhold"
  | "success"
  | "failed"
  | "cancelled";

/** One refund issued on a prepaid order through Cashfree. See migration 20. */
export interface OrderRefundRow {
  id: string;
  /** The `refund_id` sent to Cashfree. Unique. */
  refund_id: string;
  order_id: string;
  return_id: string | null;
  /** The Cashfree order that was actually paid, which a retried payment makes differ from `order_id`. */
  cashfree_order_id: string;
  cf_refund_id: string | null;
  /** Paise. */
  amount: number;
  status: OrderRefundStatusEnum;
  note: string;
  actor_email: string;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}

/** An order priced with the first-order discount, and who claimed it. Migration 21. */
export interface FirstOrderClaimRow {
  id: string;
  order_id: string;
  keys: string[];
  /** Minor units taken off. */
  discount: number;
  created_at: string;
}

export interface StyleLookRow {
  id: string;
  title: string;
  image_url: string;
  active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface StyleLookProductRow {
  look_id: string;
  product_id: string;
  position: number;
  /** Whether the look appears on this product's own page. */
  shown: boolean;
}

export interface EmailTemplateRow {
  key: EmailTemplateKeyEnum;
  enabled: boolean;
  subject: string;
  heading: string;
  body: string;
  updated_at: string;
}

export interface EmailLogRow {
  id: string;
  at: string;
  to: string;
  subject: string;
  template_key: EmailTemplateKeyEnum | null;
  order_id: string | null;
  status: EmailStatusEnum;
  error: string | null;
}

/**
 * Argument/return shapes for the `security definer` RPCs in
 * `supabase/migrations/00000000000003_functions.sql`. Kept alongside the
 * table types because `supabase-js`'s `.rpc()` call needs them to type-check
 * the same way `.from()` does.
 */
export interface CreateOrderWithLinesArgs {
  p_id: string;
  p_placed_at: string;
  p_customer_id: string | null;
  p_email: string | null;
  p_promo_code: string | null;
  p_card_last4: string | null;
  p_subtotal: number;
  p_discount: number;
  p_shipping: number;
  p_tax: number;
  p_total: number;
  p_ship_name: string;
  p_ship_line1: string;
  p_ship_city: string;
  p_ship_region: string;
  p_ship_phone: string;
  p_ship_postal_code: string | null;
  p_payment_method?: string;
  p_cod_fee?: number;
  p_lines: Array<{
    productId: string | null;
    slug: string;
    name: string;
    colorId: string | null;
    colorName: string;
    colorHex: string;
    size: string;
    quantity: number;
    unitPrice: number;
    category: string;
  }>;
  p_payment_provider?: string | null;
  p_cashfree_order_id?: string | null;
  p_cashfree_payment_session_id?: string | null;
}

export interface MarkOrderPaidArgs {
  p_order_id: string;
  p_cashfree_payment_id: string;
  p_paid_at?: string;
}

export interface MarkOrderPaymentFailedArgs {
  p_order_id: string;
}

export interface UpdateOrderStatusArgs {
  p_order_id: string;
  p_next_status: OrderStatusEnum;
  p_tracking_number?: string | null;
  p_carrier?: string | null;
  p_reason?: string | null;
}

export interface CancelOrderAsCustomerArgs {
  p_order_id: string;
  p_reason: string;
}

export interface RenameCategorySlugArgs {
  p_old_slug: string;
  p_new_slug: string;
}

export interface RenameCollectionSlugArgs {
  p_old_slug: string;
  p_new_slug: string;
}

export interface DeleteCategoryIfUnusedArgs {
  p_slug: string;
}

export interface DeleteBannerAndCloseGapArgs {
  p_id: string;
}

export interface SubmitReviewOnceArgs {
  p_id: string;
  p_product_slug: string;
  p_customer_id: string;
  p_order_id: string;
  p_author: string;
  p_rating: number;
  p_fit: FitFeedbackEnum;
  p_reasons: string[];
  p_body: string;
}

export interface IncrementVerificationAttemptsArgs {
  p_id: string;
}

/** Helper: every column that has a database-side default, for Insert types. */
type WithDefaults<Row, DefaultedKeys extends keyof Row> = Omit<Row, DefaultedKeys> &
  Partial<Pick<Row, DefaultedKeys>>;

/**
 * A `GenericTable` (from `@supabase/postgrest-js`) needs `Row`/`Insert`/
 * `Update`/`Relationships`. `Relationships` is only meaningful when a
 * `.select()` embeds a related table by name (e.g. `.select("*, orders(*)")`)
 * — nothing in this codebase's repository layer does that; every join is
 * done as a second explicit query instead (see `loadVariants()` in
 * `repositories/products.ts`), so every table here declares no relationships
 * and this helper exists purely to attach the empty tuple consistently
 * without repeating it by hand twenty-one times below.
 */
type Table<Row, DefaultedKeys extends keyof Row = never> = {
  Row: Row;
  Insert: WithDefaults<Row, DefaultedKeys>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      categories: Table<CategoryRow, "blurb" | "silhouette" | "position" | "created_at" | "updated_at">;
      collections: Table<
        CollectionRow,
        "blurb" | "description" | "position" | "hidden" | "created_at" | "updated_at"
      >;
      products: Table<
        ProductRow,
        | "tagline"
        | "compare_at_price"
        | "size_system"
        | "description"
        | "details"
        | "composition"
        | "care"
        | "fit_note"
        | "origin"
        | "rating"
        | "review_count"
        | "released_at"
        | "popularity"
        | "sustainable"
        | "show_on_home"
        | "status"
        | "sku"
        | "cost_price"
        | "weight_grams"
        | "taxable"
        | "seo_title"
        | "seo_description"
        | "created_at"
        | "updated_at"
      >;
      product_collections: Table<ProductCollectionRow>;
      product_pairings: Table<ProductPairingRow, "position">;
      product_colors: Table<ProductColorRow, "images" | "position">;
      product_sizes: Table<ProductSizeRow, "position">;
      banners: Table<
        BannerRow,
        | "eyebrow"
        | "body"
        | "cta_label"
        | "cta_href"
        | "image_url"
        | "image_url_mobile"
        | "image_url_tablet"
        | "image_alt"
        | "accent_hex"
        | "text_tone"
        | "align"
        | "active"
        | "position"
        | "starts_at"
        | "ends_at"
        | "created_at"
        | "updated_at"
      >;
      promo_codes: Table<
        PromoCodeRow,
        "description" | "percent_off" | "amount_off" | "min_subtotal" | "created_at" | "updated_at"
      >;
      settings: Table<SettingsRow, keyof SettingsRow>;
      admins: Table<AdminRow, "role" | "disabled" | "last_login_at" | "created_at">;
      customers: Table<
        CustomerRow,
        "email" | "phone_verified_at" | "disabled" | "last_login_at" | "created_at"
      >;
      phone_verifications: Table<
        PhoneVerificationRow,
        | "provider"
        | "code_hash"
        | "code_salt"
        | "provider_ref"
        | "attempts"
        | "created_at"
        | "pending_name"
        | "pending_password_hash"
        | "pending_password_salt"
        | "pending_email"
      >;
      orders: Table<
        OrderRow,
        | "placed_at"
        | "status"
        | "customer_id"
        | "email"
        | "promo_code"
        | "card_last4"
        | "discount"
        | "shipping"
        | "tax"
        | "ship_first_name"
        | "ship_last_name"
        | "ship_line2"
        | "ship_postal_code"
        | "ship_country"
        | "tracking_number"
        | "carrier"
        | "shipped_at"
        | "delivered_at"
        | "cancelled_at"
        | "cancellation_reason"
        | "review_requested_at"
        | "payment_status"
        | "payment_provider"
        | "cashfree_order_id"
        | "cashfree_payment_session_id"
        | "cashfree_payment_id"
        | "paid_at"
        | "created_at"
        | "updated_at"
      >;
      order_lines: Table<
        OrderLineRow,
        "id" | "product_id" | "color_id" | "color_name" | "color_hex" | "position"
      >;
      order_notes: Table<OrderNoteRow, "id" | "created_at">;
      submitted_reviews: Table<
        SubmittedReviewRow,
        "author" | "fit" | "reasons" | "body" | "created_at"
      >;
      hidden_reviews: Table<HiddenReviewRow, "hidden_at">;
      audit_log: Table<AuditLogRow, "at" | "summary">;
      admin_notifications: Table<
        AdminNotificationRow,
        "id" | "created_at" | "body" | "order_id" | "href" | "dedupe_key"
      >;
      admin_notification_state: Table<AdminNotificationStateRow, "seen_at">;
      first_order_claims: Table<FirstOrderClaimRow, "id" | "created_at">;
      order_refunds: Table<
        OrderRefundRow,
        | "id"
        | "return_id"
        | "cf_refund_id"
        | "status"
        | "failure_reason"
        | "created_at"
        | "updated_at"
        | "processed_at"
      >;
      style_looks: Table<StyleLookRow, "active" | "position" | "created_at" | "updated_at">;
      style_look_products: Table<StyleLookProductRow, "position" | "shown">;
      email_templates: Table<EmailTemplateRow, "enabled" | "heading" | "body" | "updated_at">;
      email_log: Table<EmailLogRow, "at" | "template_key" | "order_id" | "error">;
    };
    Views: Record<string, never>;
    Functions: {
      create_order_with_lines: {
        Args: CreateOrderWithLinesArgs;
        Returns: string;
      };
      update_order_status: {
        Args: UpdateOrderStatusArgs;
        Returns: OrderRow;
      };
      cancel_order_as_customer: {
        Args: CancelOrderAsCustomerArgs;
        Returns: OrderRow;
      };
      rename_category_slug: {
        Args: RenameCategorySlugArgs;
        Returns: void;
      };
      rename_collection_slug: {
        Args: RenameCollectionSlugArgs;
        Returns: void;
      };
      delete_category_if_unused: {
        Args: DeleteCategoryIfUnusedArgs;
        Returns: void;
      };
      delete_banner_and_close_gap: {
        Args: DeleteBannerAndCloseGapArgs;
        Returns: void;
      };
      submit_review_once: {
        Args: SubmitReviewOnceArgs;
        Returns: SubmittedReviewRow;
      };
      increment_verification_attempts: {
        Args: IncrementVerificationAttemptsArgs;
        Returns: number;
      };
      mark_order_paid: {
        Args: MarkOrderPaidArgs;
        Returns: OrderRow;
      };
      mark_order_payment_failed: {
        Args: MarkOrderPaymentFailedArgs;
        Returns: OrderRow;
      };
      mark_cod_order_collected: {
        Args: { p_order_id: string; p_collected_at?: string };
        Returns: OrderRow;
      };
      update_shipment_status: {
        Args: {
          p_waybill: string;
          p_status: string;
          p_status_code?: string | null;
          p_location?: string | null;
          p_picked_up_at?: string | null;
          p_delivered_at?: string | null;
          p_expected_delivery_date?: string | null;
        };
        Returns: string | null;
      };
      add_shipping_scan: {
        Args: {
          p_waybill: string;
          p_scan_datetime: string;
          p_scan_type?: string | null;
          p_scan_status?: string | null;
          p_status_code?: string | null;
          p_location?: string | null;
          p_instructions?: string | null;
          p_raw_data?: unknown;
        };
        Returns: string | null;
      };
      shipments_awaiting_tracking: {
        Args: { p_limit?: number; p_stale_minutes?: number };
        Returns: ShippingInfoRow[];
      };
      record_rate_limit_hit: {
        Args: { p_key: string; p_window_seconds: number };
        Returns: void;
      };
      rate_limit_hits_in_window: {
        Args: { p_key: string; p_window_seconds: number };
        /** `setof timestamptz`, which arrives as ISO strings. */
        Returns: string[];
      };
      clear_rate_limit_hits: {
        Args: { p_key: string };
        Returns: void;
      };
      first_order_discount_status: {
        Args: { p_keys: string[]; p_order_id?: string | null };
        Returns: string;
      };
      claim_first_order_discount: {
        Args: { p_keys: string[]; p_order_id: string; p_discount: number };
        Returns: string;
      };
      release_first_order_claim: {
        Args: { p_order_id: string };
        Returns: void;
      };
      reserve_order_refund: {
        Args: {
          p_order_id: string;
          p_refund_id: string;
          p_amount: number;
          p_note: string;
          p_actor_email: string;
          p_cashfree_order_id: string;
          p_return_id?: string | null;
        };
        Returns: OrderRefundRow;
      };
    };
    Enums: {
      department: Department;
      size_system: SizeSystemEnum;
      product_status: ProductStatusEnum;
      silhouette_key: SilhouetteKeyEnum;
      order_status: OrderStatusEnum;
      admin_role: AdminRoleEnum;
      audit_action: AuditActionEnum;
      email_template_key: EmailTemplateKeyEnum;
      email_status: EmailStatusEnum;
      otp_purpose: OtpPurposeEnum;
      otp_provider: OtpProviderEnum;
      text_tone: TextToneEnum;
      banner_align: BannerAlignEnum;
      fit_feedback: FitFeedbackEnum;
    };
  };
}
