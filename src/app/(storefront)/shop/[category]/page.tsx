import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductListing } from "@/components/shop/product-listing";
import {
  allCategories,
  getCategory,
  productsInCategory,
  storeSettings,
} from "@/lib/catalog";
import { parseSearchParams, type RawSearchParams } from "@/lib/search-params";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const [category, settings] = await Promise.all([getCategory(slug), storeSettings()]);

  // Bail out here, not in the page: metadata resolves first, and returning a title
  // for a missing category commits a 200 and serves a soft 404.
  if (!category) notFound();

  const count = (await productsInCategory(category.slug)).length;

  return {
    title: category.name,
    description: `${category.blurb} ${count} pieces, with full material and construction detail on every one.`,
    alternates: { canonical: `/shop/${category.slug}` },
    openGraph: {
      title: `${category.name} · ${settings.name}`,
      description: category.blurb,
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ category: slug }, rawParams] = await Promise.all([params, searchParams]);

  const category = await getCategory(slug);
  if (!category) notFound();

  const [scope, categories] = await Promise.all([
    productsInCategory(category.slug),
    allCategories(),
  ]);

  const { filters, sort, page } = parseSearchParams(rawParams, {
    categorySlugs: categories.map((entry) => entry.slug),
  });

  return (
    <ProductListing
      scope={scope}
      filters={filters}
      sort={sort}
      page={page}
      basePath={`/shop/${category.slug}`}
      searchParams={rawParams}
      eyebrow="Category"
      title={category.name}
      description={category.blurb}
      hideCategories
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "All clothing", href: "/shop" },
        { label: category.name },
      ]}
    />
  );
}
