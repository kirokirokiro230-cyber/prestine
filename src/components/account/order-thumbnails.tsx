import { GarmentArt } from "@/components/product/garment-art";
import type { OrderLine } from "@/lib/types";

/**
 * A stack of what was bought.
 *
 * Replaces "3 pieces" in the collapsed order row. A shopper scanning their
 * history is looking for a particular order, and they remember it by what was in
 * it rather than by a reference number or a count — so showing the garments
 * makes the list findable in a way a number never did.
 *
 * Overlapped rather than laid out in a row: three or four small frames in a
 * tight stack reads as one object belonging to this order, and it stays the same
 * width whether the order held two pieces or nine.
 *
 * Artwork comes from the order's own line snapshot, like `OrderLines` — a
 * receipt shows what was bought, regardless of whether the product still exists.
 */
export function OrderThumbnails({
  lines,
  max = 3,
}: {
  lines: OrderLine[];
  max?: number;
}) {
  const shown = lines.slice(0, max);
  const hidden = lines.length - shown.length;

  return (
    <div className="flex shrink-0 items-center">
      <ul className="flex items-center">
        {shown.map((line, index) => (
          <li
            key={`${line.slug}-${line.size}-${index}`}
            // Negative margin on everything but the first produces the overlap.
            // The ring separates each frame from the one behind it, which is what
            // stops the stack reading as a single smeared image.
            className={index > 0 ? "-ml-4" : undefined}
            style={{ zIndex: shown.length - index }}
          >
            <span className="block w-11 overflow-hidden bg-surface-sunken ring-1 ring-line">
              <span className="block aspect-3/4">
                <GarmentArt
                  product={{
                    id: line.slug,
                    slug: line.slug,
                    name: line.name,
                    category: line.category,
                  }}
                  colorHex={line.colorHex}
                  colorName={line.colorName}
                />
              </span>
            </span>
          </li>
        ))}
      </ul>

      {hidden > 0 ? (
        <span
          data-numeric
          className="-ml-4 grid h-[3.666rem] w-11 place-items-center bg-surface-sunken text-2xs text-content-muted ring-1 ring-line"
        >
          +{hidden}
        </span>
      ) : null}
    </div>
  );
}
