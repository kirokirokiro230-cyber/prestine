import type { Metadata } from "next";
import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { ProductForm } from "@/components/admin/product-form";
import { listProducts } from "@/server/repositories/products";
import { getSettings } from "@/server/repositories/settings";
import { listCategories, listCollections } from "@/server/repositories/taxonomy";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  // Page-level authorisation as well as action-level: a staff account should not
  // even see the form.
  await requirePermission("products:write");

  const [categories, collections, products, settings] = await Promise.all([
    listCategories(),
    listCollections(),
    listProducts(),
    getSettings(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/products"
          className="inline-flex items-center gap-1.5 text-xs text-content-muted transition-colors hover:text-content"
        >
          <CaretLeft size={12} aria-hidden />
          Products
        </Link>
        <h1 className="mt-2 font-display text-3xl leading-tight">New product</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-content-muted">
          Products are created as drafts. Set the status to active when you are ready
          for it to appear on the storefront.
        </p>
      </div>

      <ProductForm
        categories={categories}
        collections={collections}
        otherProducts={products.map((product) => ({
          slug: product.slug,
          name: product.name,
        }))}
        currency={settings.currency}
      />
    </div>
  );
}
