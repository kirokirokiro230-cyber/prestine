"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { pluralise } from "@/lib/format";
import type { StyleLook } from "@/lib/style-looks";
import { Panel } from "./primitives";
import type { PickerProduct } from "./product-picker";
import { StyleLookEditor } from "./style-look-editor";
import { StyleLookRow } from "./style-look-row";

/**
 * A product's own style hints, on its admin page.
 *
 * This is where a photograph is normally added: it belongs to THIS product, appears on this
 * product's page, and lists whichever other products are worn in it when opened. Each
 * product has its own set, in its own order.
 *
 * @param looks The photographs shown on this product's page, in display order.
 * @param otherCount Photographs that include this product but appear on other pages.
 */
export function ProductStylePanel({
  productId,
  looks,
  otherCount,
  products,
}: {
  productId: string;
  looks: StyleLook[];
  otherCount: number;
  products: PickerProduct[];
}) {
  /** `null` = closed, `""` = creating, otherwise the id being edited. */
  const [editing, setEditing] = useState<string | null>(null);
  const current = editing ? looks.find((look) => look.id === editing) : undefined;

  const productsById = new Map(products.map((product) => [product.id, product]));

  return (
    <Panel
      title="Style hints"
      description={
        looks.length === 0
          ? "No style photographs on this product's page yet."
          : `${pluralise(looks.length, "photograph")} on this product's page.`
      }
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing(editing === "" ? null : "")}
        >
          <Plus size={13} aria-hidden />
          Add photograph
        </Button>
      }
      bodyClassName="px-0 py-0"
    >
      {looks.length === 0 && editing === null ? (
        <p className="px-5 py-6 text-sm leading-relaxed text-content-muted">
          Show shoppers how this piece is worn. Add a photograph, then tick the other products
          in it &mdash; when a shopper opens the photo they see every piece, each with a link.
        </p>
      ) : null}

      {looks.length > 0 ? (
        <ol className="divide-y divide-line">
          {looks.map((look, index) => (
            <StyleLookRow
              key={look.id}
              look={look}
              index={index}
              count={looks.length}
              productsById={productsById}
              withinProductId={productId}
              onEdit={() => setEditing(editing === look.id ? null : look.id)}
            />
          ))}
        </ol>
      ) : null}

      {editing !== null ? (
        <div className="border-t border-line p-5">
          <StyleLookEditor
            key={editing}
            look={current}
            products={products}
            pinnedProductId={productId}
            onClose={() => setEditing(null)}
          />
        </div>
      ) : null}

      {otherCount > 0 ? (
        <p className="border-t border-line px-5 py-3 text-xs text-content-muted">
          {pluralise(otherCount, "other photograph")} include
          {otherCount === 1 ? "s" : ""} this product but{" "}
          {otherCount === 1 ? "appears" : "appear"} on other pages.{" "}
          <Link href="/admin/styling" className="link-underline">
            See all style hints
          </Link>
        </p>
      ) : null}
    </Panel>
  );
}
