import { isUploadedImage } from "./uploads";
import type { ProductSummary } from "./types";

/**
 * Style hints: styling photographs and the products worn in them.
 *
 * Kept free of I/O so the rules the admin form and the server both rely on are in one
 * place and can be tested without a database.
 */

/** Most pieces a single look can list. A look with thirty items is a catalogue page. */
export const MAX_LOOK_PRODUCTS = 12;

export const MAX_LOOK_TITLE = 80;

/** A look as the merchant manages it. */
export interface StyleLook {
  id: string;
  title: string;
  imageUrl: string;
  active: boolean;
  position: number;
  /** Every product worn in the photograph, in display order. Listed when it is opened. */
  productIds: string[];
  /**
   * The product pages the photograph appears on. Always a subset of `productIds`: a photo
   * has no business on the page of a product that is not in it.
   */
  shownOn: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StyleLookInput {
  title: string;
  imageUrl: string;
  active: boolean;
  productIds: string[];
  shownOn: string[];
}

/**
 * A look as a product page renders it.
 *
 * Products are summaries, not full records: this is serialised into a client component
 * for the "pieces in this look" view, so it carries what a row needs and no catalogue
 * prose. Only products a shopper can actually buy are included.
 */
export interface StyleLookCard {
  id: string;
  title: string;
  imageUrl: string;
  products: ProductSummary[];
}

/**
 * Product ids from a form, cleaned.
 *
 * Duplicates are dropped keeping the FIRST occurrence, so the order the merchant ticked
 * them in survives; blanks are removed; and the list is capped. The cap is applied after
 * de-duplication, so repeating one id cannot use up slots that other pieces need.
 */
export function normaliseProductIds(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of raw) {
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out.slice(0, MAX_LOOK_PRODUCTS);
}

/**
 * Which of the worn products the photograph should appear on.
 *
 * Reduced to products that are actually worn in it, in the same order, with duplicates
 * gone. A form can submit a `shownOn` id for a product the merchant has since unticked
 * (the checkbox and the product list are separate fields), and a photo must not be shown
 * on a page it does not belong to.
 */
export function normaliseShownOn(
  productIds: readonly string[],
  shownOn: readonly string[],
): string[] {
  const wanted = new Set(shownOn.map((id) => id.trim()).filter(Boolean));
  return productIds.filter((id) => wanted.has(id));
}

/**
 * Why a look cannot be saved, or `null` when it can.
 *
 * Checked on the server as well as in the form: the form is a convenience and a server
 * action can be called without it. In particular the image is vetted here, because it
 * ends up in an `<img src>` on a public page.
 */
export function validateLook(input: StyleLookInput): string | null {
  const title = input.title.trim();
  if (!title) return "Give the look a title.";
  if (title.length > MAX_LOOK_TITLE) {
    return `Keep the title under ${MAX_LOOK_TITLE} characters.`;
  }

  const image = input.imageUrl.trim();
  if (!image) return "Upload a photograph for the look.";

  /*
   * An upload through the admin panel, or an absolute https URL. Nothing else: a
   * `javascript:` or `data:` URL must not reach an image source, and a bare relative path
   * could be used to point the look at some other route on the site.
   */
  if (!isUploadedImage(image) && !image.startsWith("https://")) {
    return "Upload a file, or give an absolute https:// URL to one hosted elsewhere.";
  }

  if (input.productIds.length === 0) {
    return "Pick at least one product worn in this look.";
  }
  if (input.productIds.length > MAX_LOOK_PRODUCTS) {
    return `A look can list at most ${MAX_LOOK_PRODUCTS} products.`;
  }

  /*
   * A photograph shown on no page is invisible to shoppers, however many products it
   * lists. Saying so beats saving something that looks done and never appears.
   */
  if (input.shownOn.length === 0) {
    return "Choose at least one product page to show this photograph on.";
  }

  const worn = new Set(input.productIds);
  if (input.shownOn.some((id) => !worn.has(id))) {
    return "A photograph can only appear on the page of a product that is in it.";
  }

  return null;
}
