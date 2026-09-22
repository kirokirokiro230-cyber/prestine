import type { Metadata } from "next";
import { TaxonomyManager } from "@/components/admin/taxonomy-manager";
import { categoryUsage, listCategories } from "@/server/repositories/taxonomy";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  await requirePermission("products:write");

  const [categories, usage] = await Promise.all([listCategories(), categoryUsage()]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl leading-tight">Categories</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-content-muted">
          Categories are the structural navigation of the store — every product belongs
          to exactly one. Renaming a slug moves its products with it; deleting one is
          only possible once it is empty.
        </p>
      </header>

      <TaxonomyManager
        kind="category"
        items={categories.map((category) => ({
          slug: category.slug,
          name: category.name,
          blurb: category.blurb,
          imageUrl: category.imageUrl,
          imageUrlWide: category.imageUrlWide,
          count: usage[category.slug] ?? 0,
        }))}
      />
    </div>
  );
}
