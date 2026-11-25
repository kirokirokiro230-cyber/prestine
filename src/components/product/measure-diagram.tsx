/**
 * Where each measurement on a T-shirt is taken, drawn front and back.
 *
 * Inline SVG rather than an image: it is sharp at any size, adds no request, follows the
 * page's language (`aria-label`), and can be corrected by editing the numbers below instead
 * of re-exporting a picture.
 *
 * ## Colours are fixed, not themed
 *
 * The shirt is a pale blue and the dashed lines and labels are near-black in BOTH light and
 * dark mode. A diagram drawn in theme colours would put dark lines on a dark shirt; the
 * tile behind it follows the theme, the drawing does not.
 *
 * ## The shapes
 *
 * One silhouette for front and back, 240 wide and 210 high, drawn on a dropped shoulder like
 * the relaxed tees the chart is for. The front has a deeper neckline. Lines:
 *
 * - Chest: round the body under the sleeves, drawn as an ellipse because it is a loop.
 * - Length: from the top of the shoulder at the collar straight down to the hem.
 * - Sleeve: from the shoulder seam to the hem of the sleeve.
 * - Shoulder (back): seam to seam across the back.
 */

const SHIRT = "#c9dbe7";
const SHIRT_EDGE = "#a9bfce";
const INK = "#16191d";

/** The outline shared by front and back, with the neckline left to the caller. */
const BODY =
  "L178 40 L218 72 L204 98 L170 84 L170 190 L70 190 L70 84 L36 98 L22 72 L62 40 Z";

function Label({ x, y, children }: { x: number; y: number; children: string }) {
  // Sized for 9px text in the 240-wide drawing; the width follows the word.
  const width = children.length * 5.2 + 12;

  return (
    <g>
      <rect x={x} y={y - 9} width={width} height={14} rx={2} fill={INK} />
      <text
        x={x + width / 2}
        y={y + 1}
        textAnchor="middle"
        fontSize={8.5}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill="#ffffff"
      >
        {children}
      </text>
    </g>
  );
}

const DASH = { stroke: INK, strokeWidth: 1.1, strokeDasharray: "4 3", fill: "none" } as const;

export function MeasureDiagram({ side }: { side: "front" | "back" }) {
  const front = side === "front";

  return (
    <svg
      viewBox="0 0 240 210"
      role="img"
      aria-label={
        front
          ? "The front of a T-shirt, showing where chest, length and sleeve are measured."
          : "The back of a T-shirt, showing where shoulder is measured."
      }
      className="h-auto w-full"
    >
      {/* The shirt. */}
      <path
        d={`M96 28 C104 ${front ? 48 : 36}, 136 ${front ? 48 : 36}, 144 28 ${BODY}`}
        fill={SHIRT}
        stroke={SHIRT_EDGE}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      {/* The collar band. */}
      <path
        d={`M96 28 C104 ${front ? 48 : 36}, 136 ${front ? 48 : 36}, 144 28`}
        fill="none"
        stroke={SHIRT_EDGE}
        strokeWidth={4}
        strokeLinecap="round"
      />
      {/* Sleeve hems. */}
      <path d="M36 98 L70 84 M204 98 L170 84" stroke={SHIRT_EDGE} strokeWidth={1} fill="none" />

      {front ? (
        <>
          <ellipse cx={120} cy={104} rx={50} ry={5} {...DASH} />
          <Label x={26} y={96}>
            Chest
          </Label>

          <line x1={120} y1={28} x2={120} y2={190} {...DASH} />
          <Label x={124} y={176}>
            Length
          </Label>

          <line x1={178} y1={40} x2={211} y2={85} {...DASH} />
          <Label x={150} y={60}>
            Sleeve
          </Label>
        </>
      ) : (
        <>
          <line x1={62} y1={44} x2={178} y2={44} {...DASH} />
          <Label x={26} y={38}>
            Shoulder
          </Label>
        </>
      )}
    </svg>
  );
}
