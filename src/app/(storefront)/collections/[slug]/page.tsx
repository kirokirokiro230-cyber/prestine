import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductListing } from "@/components/shop/product-listing";
import {
  allCategories,
  getCollection,
  productsInCollection,
  storeSettings,
} from "@/lib/catalog";
import { parseSearchParams, type RawSearchParams } from "@/lib/search-params";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [collection, settings] = await Promise.all([getCollection(slug), storeSettings()]);

  // Bail out here, not in the page: metadata resolves first, and returning a title
  // for a missing collection commits a 200 and serves a soft 404.
  if (!collection) notFound();

  return {
    title: collection.name,
    description: collection.description,
    alternates: { canonical: `/collections/${collection.slug}` },
    openGraph: {
      title: `${collection.name} · ${settings.name}`,
      description: collection.blurb,
    },
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ slug }, rawParams] = await Promise.all([params, searchParams]);

  const collection = await getCollection(slug);
  if (!collection) notFound();

  const [scope, categories] = await Promise.all([
    productsInCollection(collection.slug),
    allCategories(),
  ]);

  const { filters, sort, page } = parseSearchParams(rawParams, {
    categorySlugs: categories.map((category) => category.slug),
  });

  return (
    <ProductListing
      scope={scope}
      filters={filters}
      sort={sort}
      page={page}
      basePath={`/collections/${collection.slug}`}
      searchParams={rawParams}
      eyebrow="Collection"
      title={collection.name}
      description={collection.description}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Collections", href: "/collections" },
        { label: collection.name },
      ]}
    />
  );
}
