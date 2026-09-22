import { categories } from "@/lib/config";
import type { ArtSubject, SilhouetteKey } from "@/lib/types";
import { cn, hashString } from "@/lib/utils";

/**
 * Generated product art direction.
 *
 * Real photography is what ships to production — drop absolute URLs into
 * `product.colors[].image` and `<ProductImage>` will use them. Until then this
 * renders a deterministic, on-brand SVG per product/colour/view so the grid is
 * never broken, never hits the network, and reads as a designed placeholder
 * rather than a grey box.
 *
 * Everything is derived from a hash of `${slug}:${colorId}` so a given variant
 * always looks identical between server and client render.
 */

/** Silhouette paths on a 300 x 400 canvas. */
const SILHOUETTES: Record<SilhouetteKey, { fill: string; lines: string[] }> = {
  coat: {
    fill: "M118 58 L94 72 L70 128 L60 302 L94 308 L98 350 L202 350 L206 308 L240 302 L230 128 L206 72 L182 58 Z",
    lines: ["M118 58 L150 134 L182 58", "M150 134 L150 350", "M94 308 L98 200", "M206 308 L202 200"],
  },
  sweater: {
    fill: "M114 66 Q150 90 186 66 L216 82 L246 176 L212 190 L206 336 L94 336 L88 190 L54 176 L84 82 Z",
    lines: ["M114 66 Q150 90 186 66", "M96 318 L204 318", "M100 302 L200 302"],
  },
  shirt: {
    fill: "M120 70 L94 84 L66 174 L94 184 L98 338 L202 338 L206 184 L234 174 L206 84 L180 70 L150 96 Z",
    lines: [
      "M132 58 L150 96 L168 58",
      "M150 96 L150 338",
      "M138 96 L138 338",
      "M96 300 L204 300",
    ],
  },
  tee: {
    fill: "M112 70 Q150 94 188 70 L228 90 L250 164 L216 178 L210 330 L90 330 L84 178 L50 164 L72 90 Z",
    lines: ["M112 70 Q150 94 188 70", "M92 312 L208 312"],
  },
  trouser: {
    fill: "M92 66 L208 66 L216 128 L206 348 L162 348 L150 188 L138 348 L94 348 L84 128 Z",
    lines: ["M92 92 L208 92", "M150 92 L150 188", "M112 120 Q124 138 118 156"],
  },
  jean: {
    fill: "M90 68 L210 68 L218 130 L208 350 L160 350 L150 190 L140 350 L92 350 L82 130 Z",
    lines: [
      "M90 96 L210 96",
      "M150 96 L150 190",
      "M96 96 Q118 122 104 150",
      "M204 96 Q182 122 196 150",
      "M126 68 L126 96",
    ],
  },
  dress: {
    fill: "M120 62 Q150 86 180 62 L208 80 L218 150 L200 160 L232 352 L68 352 L100 160 L82 150 L92 80 Z",
    lines: ["M120 62 Q150 86 180 62", "M100 160 L200 160", "M150 160 L150 352"],
  },
  accessory: {
    fill: "M78 132 L222 132 L222 268 L78 268 Z",
    lines: ["M78 176 L222 176", "M150 132 L150 268"],
  },
  belt: {
    fill: "M40 176 L214 176 L214 224 L40 224 Z",
    lines: ["M40 190 L214 190", "M40 210 L214 210"],
  },
  scarf: {
    fill: "M104 52 L196 52 L182 250 Q150 288 118 250 Z",
    lines: ["M104 96 L196 96", "M112 300 L188 300", "M114 322 L186 322", "M116 344 L184 344"],
  },
  wallet: {
    fill: "M66 148 L234 148 Q244 148 244 158 L244 246 Q244 256 234 256 L66 256 Q56 256 56 246 L56 158 Q56 148 66 148 Z",
    lines: ["M56 186 L244 186", "M150 148 L150 186"],
  },
  beanie: {
    fill: "M76 214 Q76 118 150 118 Q224 118 224 214 Z",
    lines: ["M76 214 L224 214", "M76 246 L224 246", "M116 128 L104 214", "M184 128 L196 214"],
  },
  bag: {
    fill: "M56 176 L244 176 L232 296 L68 296 Z",
    lines: ["M108 176 Q108 130 150 130 Q192 130 192 176", "M56 250 L244 250"],
  },
};

/** Accessories share one category but need distinct shapes. */
const ACCESSORY_OVERRIDES: Record<string, SilhouetteKey> = {
  "full-grain-leather-belt": "belt",
  "cashmere-silk-scarf": "scarf",
  "pebbled-leather-card-holder": "wallet",
  "ribbed-wool-beanie": "beanie",
  "canvas-weekend-holdall": "bag",
};

/**
 * Which shape to draw for a product.
 *
 * Order of preference: an explicit per-product override, then the silhouette the
 * seeded category declares, then a guess from the category slug.
 *
 * That last step matters because categories are editable in admin. A merchant who
 * adds "coats" or "light-jackets" gets a coat rather than the generic accessory
 * shape, without having to touch this file. `accessory` remains the final fallback,
 * so an unrecognised category still renders something deliberate.
 */
export function silhouetteFor(product: ArtSubject): SilhouetteKey {
  const override = ACCESSORY_OVERRIDES[product.slug];
  if (override) return override;

  const declared = categories.find((c) => c.slug === product.category)?.silhouette;
  if (declared) return declared;

  const slug = product.category.toLowerCase();
  const guessed = (Object.keys(SILHOUETTES) as SilhouetteKey[]).find((key) =>
    slug.includes(key),
  );
  return guessed ?? "accessory";
}

/**
 * How each gallery view is framed. Varying scale and offset means the four
 * thumbnails read as genuinely different shots rather than one image repeated.
 */
const VIEWS = [
  { scale: 1, x: 0, y: 0, label: "front view" },
  { scale: 1.85, x: -18, y: -26, label: "fabric detail" },
  { scale: 1, x: 0, y: 0, mirrored: true, label: "back view" },
  { scale: 0.82, x: 0, y: 14, figure: true, label: "on figure" },
] as const;

interface GarmentArtProps {
  product: ArtSubject;
  colorHex: string;
  colorName: string;
  /** 0–3, indexes into the view table above. */
  view?: number;
  /**
   * Add the film-grain filter. Off by default: `feTurbulence` is expensive to
   * rasterise and invisible at thumbnail size, so a grid of thirty cards should
   * never pay for it. Turn it on for hero and gallery-sized renders where the
   * texture actually reads.
   */
  texture?: boolean;
  className?: string;
}

export function GarmentArt({
  product,
  colorHex,
  colorName,
  view = 0,
  texture = false,
  className,
}: GarmentArtProps) {
  const silhouette = SILHOUETTES[silhouetteFor(product)];
  const frame = VIEWS[view % VIEWS.length];
  const seed = hashString(`${product.slug}:${colorHex}:${view}`);

  // Deterministic background angle and warmth so each variant feels distinct.
  const angle = 120 + (seed % 60);
  const uid = `${product.id}-${view}-${(seed % 9973).toString(36)}`;

  return (
    <svg
      viewBox="0 0 300 400"
      role="img"
      aria-label={`${product.name} in ${colorName}, ${frame.label}`}
      preserveAspectRatio="xMidYMid slice"
      className={cn("h-full w-full", className)}
    >
      <defs>
        <linearGradient id={`bg-${uid}`} gradientTransform={`rotate(${angle} 0.5 0.5)`}>
          <stop offset="0%" stopColor="var(--sem-surface-sunken)" />
          <stop offset="100%" stopColor="var(--sem-surface)" />
        </linearGradient>

        <linearGradient id={`cloth-${uid}`} x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor={colorHex} stopOpacity="0.95" />
          <stop offset="100%" stopColor={colorHex} stopOpacity="0.72" />
        </linearGradient>

        <radialGradient id={`vignette-${uid}`} cx="50%" cy="42%" r="72%">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.07" />
        </radialGradient>

        {/* Very light grain so the flat fill reads as cloth, not plastic. */}
        {texture ? (
          <filter id={`grain-${uid}`} x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="2"
              seed={seed % 100}
            />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.055" />
            </feComponentTransfer>
          </filter>
        ) : null}
      </defs>

      <rect width="300" height="400" fill={`url(#bg-${uid})`} />

      {/* Horizon line — a quiet studio reference that anchors the composition. */}
      <line
        x1="0"
        y1="318"
        x2="300"
        y2="318"
        stroke="var(--sem-line)"
        strokeWidth="1"
        opacity="0.7"
      />

      <g
        transform={[
          `translate(${150 + frame.x} ${200 + frame.y})`,
          `scale(${"mirrored" in frame && frame.mirrored ? -frame.scale : frame.scale} ${frame.scale})`,
          "translate(-150 -200)",
        ].join(" ")}
      >
        {"figure" in frame && frame.figure ? (
          // Minimal figure reference behind the garment for the styled shot.
          <g stroke="var(--sem-line-strong)" strokeWidth="1.5" fill="none" opacity="0.55">
            <circle cx="150" cy="42" r="24" />
            <path d="M150 66 L150 92" />
            <path d="M104 352 L112 400" />
            <path d="M196 352 L188 400" />
          </g>
        ) : null}

        <path d={silhouette.fill} fill={`url(#cloth-${uid})`} />
        <path
          d={silhouette.fill}
          fill="none"
          stroke={colorHex}
          strokeOpacity="0.55"
          strokeWidth="1.25"
        />

        <g
          fill="none"
          stroke="var(--sem-surface)"
          strokeOpacity="0.42"
          strokeWidth="1.25"
          strokeLinecap="round"
        >
          {silhouette.lines.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </g>

      <rect width="300" height="400" fill={`url(#vignette-${uid})`} />
      {texture ? (
        <rect width="300" height="400" filter={`url(#grain-${uid})`} opacity="0.5" />
      ) : null}
    </svg>
  );
}
