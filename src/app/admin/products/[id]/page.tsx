import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { deleteProductAction } from "@/app/admin/actions/products";
import { ProductForm } from "@/components/admin/product-form";
import { ProductStylePanel } from "@/components/admin/product-style-panel";
import type { PickerProduct } from "@/components/admin/product-picker";
import { ConfirmSubmit, FormFeedback, Panel } from "@/components/admin/primitives";
import { formatDate } from "@/lib/format";
import type { StyleLook } from "@/lib/style-looks";
import { auditFor } from "@/server/audit";
import { listLooks } from "@/server/repositories/looks";
import { getProduct, listProducts } from "@/server/repositories/products";
import { getSettings } from "@/server/repositories/settings";
import { listCategories, listCollections } from "@/server/repositories/taxonomy";
import { requirePermission } from "@/server/session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  return { title: product ? product.name : "Product not found" };
}

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  await requirePermission("products:write");

  const [{ id }, { created }] = await Promise.all([params, searchParams]);

  const product = await getProduct(id);
  if (!product) notFound();

  const [categories, collections, products, settings, history] = await Promise.all([
    listCategories(),
    listCollections(),
    listProducts(),
    getSettings(),
    auditFor("product", id),
  ]);

  /*
   * This product's own style photographs. Loaded defensively: the product editor is core,
   * and styling is an extra. If the tables are missing (a migration not run) or the query
   * fails, the panel is left out and the rest of the page works — a failure here must not
   * stop anyone editing a price.
   */
  let styleLooks: StyleLook[] = [];
  let otherStyleLooks = 0;
  let stylingAvailable = true;

  try {
    const all = await listLooks();
    styleLooks = all.filter((look) => look.shownOn.includes(id));
    otherStyleLooks = all.filter(
      (look) => look.productIds.includes(id) && !look.shownOn.includes(id),
    ).length;
  } catch (error) {
    stylingAvailable = false;
    console.error(`[styling] could not load style hints for ${id}:`, error);
  }

  const pickable: PickerProduct[] = products
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      category: candidate.category,
      // Optional on the type; the column defaults to 'active', so absent means published.
      status: candidate.status ?? "active",
      image: candidate.colors[0]?.images?.[0],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-1.5 text-xs text-content-muted transition-colors hover:text-content"
          >
            <CaretLeft size={12} aria-hidden />
            Products
          </Link>
          <h1 className="mt-2 truncate font-display text-3xl leading-tight">
            {product.name}
          </h1>
          <p data-numeric className="mt-1.5 text-sm text-content-muted">
            {product.sku ?? product.id}
            {product.updatedAt ? ` · updated ${formatDate(product.updatedAt, "short")}` : ""}
          </p>
        </div>
      </div>

      {created ? <FormFeedback success="Product created." /> : null}

      <ProductForm
        product={product}
        categories={categories}
        collections={collections}
        otherProducts={products
          .filter((candidate) => candidate.id !== product.id)
          .map((candidate) => ({ slug: candidate.slug, name: candidate.name }))}
        currency={settings.currency}
      />

      {stylingAvailable ? (
        <ProductStylePanel
          productId={product.id}
          looks={styleLooks}
          otherCount={otherStyleLooks}
          products={pickable}
        />
      ) : null}

      {history.length > 0 ? (
        <Panel title="History" description="Changes recorded against this product.">
          <ul className="flex flex-col divide-y divide-line">
            {history.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm">{entry.summary}</span>
                <span className="text-xs text-content-subtle">
                  {entry.actorEmail} · {formatDate(entry.at, "short")}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel
        title="Danger zone"
        description="Deleting is permanent. Archive instead to retire a product while keeping its order history readable."
      >
        <form action={deleteProductAction}>
          <input type="hidden" name="ids" value={product.id} />
          <ConfirmSubmit confirmLabel="Delete permanently — confirm">
            Delete this product
          </ConfirmSubmit>
        </form>
      </Panel>
    </div>
  );
}
