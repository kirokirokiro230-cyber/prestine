import type { Metadata } from "next";
import { TaxonomyManager } from "@/components/admin/taxonomy-manager";
import { collectionUsage, listCollections } from "@/server/repositories/taxonomy";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Collections" };

export default async function CollectionsPage() {
  await requirePermission("products:write");

  const [collections, usage] = await Promise.all([listCollections(), collectionUsage()]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl leading-tight">Collections</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-content-muted">
          Collections are merchandising tags — a product can be in several. Deleting one
          detaches it from every product rather than blocking, because unlike a category
          it is not structural.
        </p>
      </header>

      <TaxonomyManager
        kind="collection"
        items={collections.map((collection) => ({
          slug: collection.slug,
          name: collection.name,
          blurb: collection.blurb,
          description: collection.description,
          hidden: collection.hidden,
          count: usage[collection.slug] ?? 0,
        }))}
      />
    </div>
  );
}
