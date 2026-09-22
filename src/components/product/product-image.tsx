import Image from "next/image";
import { canOptimiseImage } from "@/lib/image-hosts";
import type { ArtSubject, ProductColor } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GarmentArt } from "./garment-art";

interface ProductImageProps {
  product: ArtSubject;
  color: ProductColor;
  /** 0-indexed gallery view. */
  view?: number;
  /** Load eagerly — set on the first card above the fold and the hero image. */
  priority?: boolean;
  /** Responsive sizes hint for next/image. */
  sizes?: string;
  /**
   * Enable the grain filter on generated art. Only worth it for hero and gallery
   * sized renders — see `GarmentArt`.
   */
  texture?: boolean;
  className?: string;
}

/**
 * Renders real photography when a colourway has it, and falls back to generated
 * art otherwise. Every consumer in the app goes through this component, so
 * switching the catalogue to a photo CDN needs no changes anywhere else.
 */
export function ProductImage({
  product,
  color,
  view = 0,
  priority = false,
  sizes = "(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 50vw",
  texture = false,
  className,
}: ProductImageProps) {
  const src = color.images?.[view] ?? color.images?.[0];
  const alt = `${product.name} in ${color.name}`;

  if (src) {
    /*
     * `next/image` throws — an error page, not a broken image — when handed a host that
     * is missing from `remotePatterns`, and the admin accepts any absolute https URL for
     * product photography. So an unrecognised host renders as a plain `<img>` instead:
     * unoptimised, but on the page, and impossible for a pasted URL to take a listing
     * down. Uploaded images and the configured CDNs still go through the optimiser.
     */
    if (!canOptimiseImage(src)) {
      return (
        /*
         * Deliberate. The optimiser cannot serve this host and throws rather than
         * degrading, which would take out the whole listing for one bad URL.
         */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          className={cn("absolute inset-0 size-full object-cover", className)}
        />
      );
    }

    return (
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        className={cn("object-cover", className)}
      />
    );
  }

  return (
    <GarmentArt
      product={product}
      colorHex={color.hex}
      colorName={color.name}
      view={view}
      texture={texture}
      className={className}
    />
  );
}
