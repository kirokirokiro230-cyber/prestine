import type { MetricPoint } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Revenue over time.
 *
 * Hand-drawn SVG rather than a charting library: this is one series with an area
 * fill, and Chart.js or Recharts would add 60–90KB to a page that already has the
 * data server-rendered. It also means the chart is in the HTML — no client
 * JavaScript, no layout shift, and it prints.
 */
export function RevenueChart({
  series,
  formatMoney,
  className,
}: {
  series: MetricPoint[];
  formatMoney: (minorUnits: number) => string;
  className?: string;
}) {
  if (series.length === 0) return null;

  const width = 960;
  const height = 260;
  const padding = { top: 16, right: 8, bottom: 28, left: 8 };

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const peak = Math.max(...series.map((point) => point.revenue));
  // A flat-zero series still needs a scale, or every point lands on the baseline.
  const scaleMax = peak === 0 ? 1 : peak;

  const x = (index: number) =>
    padding.left + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);

  const y = (value: number) => padding.top + innerHeight - (value / scaleMax) * innerHeight;

  const linePath = series
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)} ${y(point.revenue).toFixed(2)}`)
    .join(" ");

  const areaPath = `${linePath} L${x(series.length - 1).toFixed(2)} ${(
    padding.top + innerHeight
  ).toFixed(2)} L${x(0).toFixed(2)} ${(padding.top + innerHeight).toFixed(2)} Z`;

  const total = series.reduce((sum, point) => sum + point.revenue, 0);
  const best = series.reduce((max, point) => (point.revenue > max.revenue ? point : max), series[0]);

  // Label roughly six dates rather than all thirty.
  const labelEvery = Math.max(1, Math.round(series.length / 6));

  return (
    <figure className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Revenue by day. Total ${formatMoney(total)} across ${series.length} days. Best day ${best.date} at ${formatMoney(best.revenue)}.`}
        className="h-56 w-full sm:h-64"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="admin-revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--sem-accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--sem-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines at quarters of the peak */}
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <line
            key={fraction}
            x1={padding.left}
            x2={width - padding.right}
            y1={y(scaleMax * fraction)}
            y2={y(scaleMax * fraction)}
            stroke="var(--sem-line)"
            strokeWidth="1"
            strokeDasharray={fraction === 0 ? undefined : "3 4"}
          />
        ))}

        <path d={areaPath} fill="url(#admin-revenue-fill)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--sem-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Marker on the best day, the one number a merchant looks for */}
        <circle
          cx={x(series.indexOf(best))}
          cy={y(best.revenue)}
          r="3.5"
          fill="var(--sem-surface)"
          stroke="var(--sem-accent)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />

        {series.map((point, index) =>
          index % labelEvery === 0 || index === series.length - 1 ? (
            <text
              key={point.date}
              x={x(index)}
              y={height - 8}
              textAnchor={index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"}
              className="fill-content-subtle"
              style={{ fontSize: "11px" }}
            >
              {point.date.slice(5)}
            </text>
          ) : null,
        )}
      </svg>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-content-muted">
        <span>
          Peak day{" "}
          <span data-numeric className="text-content">
            {formatMoney(best.revenue)}
          </span>{" "}
          on {best.date}
        </span>
        <span>
          Window total{" "}
          <span data-numeric className="text-content">
            {formatMoney(total)}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Horizontal bar list, used for category revenue and top products. Same reasoning
 * as the chart above — a list of divs is lighter and more accessible than a canvas.
 */
export function BarList({
  items,
  formatValue,
  emptyLabel = "No data yet.",
}: {
  items: Array<{ label: string; value: number; href?: string; meta?: string }>;
  formatValue: (value: number) => string;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-content-muted">{emptyLabel}</p>;
  }

  const peak = Math.max(...items.map((item) => item.value)) || 1;

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {item.href ? (
                <a href={item.href} className="link-underline hover:text-accent">
                  {item.label}
                </a>
              ) : (
                item.label
              )}
              {item.meta ? (
                <span className="ml-2 text-xs text-content-subtle">{item.meta}</span>
              ) : null}
            </span>
            <span data-numeric className="shrink-0 text-content">
              {formatValue(item.value)}
            </span>
          </div>
          <div aria-hidden className="mt-1.5 h-1 w-full overflow-hidden bg-surface-sunken">
            <div
              className="h-full bg-accent"
              style={{ width: `${Math.max(2, (item.value / peak) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
