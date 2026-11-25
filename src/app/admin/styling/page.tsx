import type { Metadata } from "next";
import { StyleLookManager } from "@/components/admin/style-look-manager";
import type { PickerProduct } from "@/components/admin/product-picker";
import type { StyleLook } from "@/lib/style-looks";
import { listLooks } from "@/server/repositories/looks";
import { listProducts } from "@/server/repositories/products";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = {
  title: "Style hints",
  robots: { index: false, follow: false },
};

export default async function StylingPage() {
  await requireAdmin();

  /*
   * The tables come from migration 17. If it has not been run, say so plainly instead of
   * showing a generic error page, which would leave the merchant guessing at the cause.
   */
  let looks: StyleLook[] = [];
  let missingTables = false;

  try {
    looks = await listLooks();
  } catch (error) {
    if (/style_looks|schema cache/i.test((error as Error).message)) {
      missingTables = true;
    } else {
      throw error;
    }
  }

  const products = await listProducts();

  const pickable: PickerProduct[] = products
    .map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      // Optional on the type; the column defaults to 'active', so absent means published.
      status: product.status ?? "active",
      image: product.colors[0]?.images?.[0],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl leading-tight">Style hints</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-content-muted">
          An overview of every styling photograph. Each product has its own &mdash; add and
          order them from the product&rsquo;s edit page. Shoppers can open a photograph to see
          and buy every piece worn in it.
        </p>
      </header>

      {missingTables ? (
        <p
          role="alert"
          className="rounded-xl border border-warning-500/40 bg-warning-100/60 px-4 py-3 text-sm text-warning-700"
        >
          Style hints need one more database step. Run{" "}
          <code className="font-mono text-xs">
            supabase/migrations/00000000000017_style_looks.sql
          </code>{" "}
          in the Supabase SQL editor, then reload this page.
        </p>
      ) : (
        <StyleLookManager looks={looks} products={pickable} />
      )}
    </div>
  );
}
