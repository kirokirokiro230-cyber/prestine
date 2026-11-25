import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/page-header";
import { TaxonomyManager } from "@/components/admin/taxonomy-manager";
import { categoryUsage, listCategories } from "@/server/repositories/taxonomy";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  await requirePermission("products:write");

  const [categories, usage] = await Promise.all([listCategories(), categoryUsage()]);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        eyebrow="Catalogue"
        title="Categories"
        description="Categories structure storefront navigation. Every product belongs to one; slug changes move assigned products automatically."
      />

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
