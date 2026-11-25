import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ProductsTable } from "@/components/admin/products-table";
import { Panel } from "@/components/admin/primitives";
import { ButtonLink } from "@/components/ui/button";
import { queryProducts } from "@/server/repositories/products";
import { getSettings } from "@/server/repositories/settings";
import { listCategories, listCollections } from "@/server/repositories/taxonomy";
import { requireAdmin } from "@/server/session";
import type { ProductStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Products" };

const SORTS = [
  "updated-desc",
  "created-desc",
  "name-asc",
  "price-asc",
  "price-desc",
] as const;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const status = (["active", "draft", "archived"] as ProductStatus[]).includes(
    params.status as ProductStatus,
  )
    ? (params.status as ProductStatus)
    : "all";

  const sort = SORTS.includes(params.sort as (typeof SORTS)[number])
    ? (params.sort as (typeof SORTS)[number])
    : "updated-desc";

  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const [result, categories, collections, settings] = await Promise.all([
    queryProducts({
      search: params.q,
      status,
      category: params.category,
      collection: params.collection,
      sort,
      page,
      perPage: 20,
    }),
    listCategories(),
    listCollections(),
    getSettings(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        eyebrow="Catalogue"
        title="Products"
        description={`${result.total} product${result.total === 1 ? "" : "s"}${
          status !== "all" ? ` · ${status}` : ""
        } across your live and draft catalogue.`}
        actions={
          <ButtonLink href="/admin/products/new" size="md">
            <Plus size={14} aria-hidden />
            New product
          </ButtonLink>
        }
      />

      {params.deleted ? (
        <p role="status" className="border border-success-500/40 bg-success-100/60 px-3 py-2.5 text-sm text-success-700 dark:bg-success-700/20 dark:text-success-100">
          Product deleted.
        </p>
      ) : null}

      <Panel
        title="Catalogue"
        description="Filters are held in the URL, so a view can be bookmarked or shared."
        bodyClassName="px-0 py-0"
      >
        <ProductsTable
          products={result.items}
          total={result.total}
          page={result.page}
          totalPages={result.totalPages}
          categories={categories.map((category) => ({
            slug: category.slug,
            name: category.name,
          }))}
          collections={collections.map((collection) => ({
            slug: collection.slug,
            name: collection.name,
          }))}
          currency={settings.currency}
          locale={settings.locale}
        />
      </Panel>

      <p className="text-xs leading-relaxed text-content-subtle">
        Deleting a product is permanent and also removes it from any “pairs well
        with” lists. To take something off sale without losing it, set the status to
        archived instead —{" "}
        <Link href="/admin/products?status=archived" className="link-underline">
          view archived
        </Link>
        .
      </p>
    </div>
  );
}
