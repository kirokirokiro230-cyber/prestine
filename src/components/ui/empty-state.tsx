import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Primary and optional secondary actions. */
  children?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, children, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-20 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-6 grid size-14 place-items-center rounded-full bg-surface-sunken text-content-muted">
          {icon}
        </div>
      ) : null}
      <h2 className="text-2xl leading-tight">{title}</h2>
      {description ? (
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-content-muted">{description}</p>
      ) : null}
      {children ? (
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">{children}</div>
      ) : null}
    </div>
  );
}
