"use client";

import { useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { pluralise } from "@/lib/format";
import type { StyleLook } from "@/lib/style-looks";
import { Panel } from "./primitives";
import type { PickerProduct } from "./product-picker";
import { StyleLookEditor } from "./style-look-editor";
import { StyleLookRow } from "./style-look-row";

/**
 * Every style hint in the shop, on one page.
 *
 * This is the overview. The usual way to add a photograph is from a product's own edit page
 * (see `ProductStylePanel`), where it belongs to that product by default. This page is for
 * seeing the lot together, and for photographs that cover several products.
 *
 * Ordering uses two arrow buttons rather than drag-and-drop, as banners do: keyboard
 * accessible with no extra work, and fine on touch.
 */
export function StyleLookManager({
  looks,
  products,
}: {
  looks: StyleLook[];
  products: PickerProduct[];
}) {
  /** `null` = closed, `""` = creating, otherwise the id being edited. */
  const [editing, setEditing] = useState<string | null>(null);
  const current = editing ? looks.find((look) => look.id === editing) : undefined;

  const productsById = new Map(products.map((product) => [product.id, product]));

  const liveCount = looks.filter(
    (look) =>
      look.active &&
      look.shownOn.some((id) => productsById.get(id)?.status === "active"),
  ).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr] xl:items-start">
      <Panel
        title="All style hints"
        description={
          looks.length === 0
            ? "No style hints yet."
            : `${pluralise(looks.length, "style hint")}, ${liveCount} showing on product pages.`
        }
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(editing === "" ? null : "")}
          >
            <Plus size={13} aria-hidden />
            New style hint
          </Button>
        }
        bodyClassName="px-0 py-0"
      >
        {looks.length === 0 ? (
          <p className="px-5 py-6 text-sm text-content-muted">
            Product pages have no styling photographs yet. Open a product and add one under
            &ldquo;Style hints&rdquo;, or add one here.
          </p>
        ) : (
          <ol className="divide-y divide-line">
            {looks.map((look, index) => (
              <StyleLookRow
                key={look.id}
                look={look}
                index={index}
                count={looks.length}
                productsById={productsById}
                onEdit={() => setEditing(editing === look.id ? null : look.id)}
              />
            ))}
          </ol>
        )}
      </Panel>

      {editing !== null ? (
        <StyleLookEditor
          key={editing}
          look={current}
          products={products}
          onClose={() => setEditing(null)}
        />
      ) : (
        <Panel title="How style hints work">
          <div className="flex flex-col gap-3 text-sm leading-relaxed text-content-muted">
            <p>
              Each product has its <em>own</em> style photographs. The easiest way to add one is
              to open the product and use its &ldquo;Style hints&rdquo; section, where the
              photograph is attached to that product.
            </p>
            <p>
              A photograph lists every product worn in it when a shopper opens it, so they can
              buy the whole outfit. It only <em>appears</em> on the pages you tick &ldquo;Show
              on its page&rdquo; for &mdash; by default, just the one it was added to.
            </p>
            <p>
              Only published products are listed to shoppers. A photograph that includes a
              draft shows the rest and leaves that piece out until it is published.
            </p>
          </div>
          <Button variant="outline" size="md" className="mt-5" onClick={() => setEditing("")}>
            <Plus size={13} aria-hidden />
            New style hint
          </Button>
        </Panel>
      )}
    </div>
  );
}
