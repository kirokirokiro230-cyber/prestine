"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin route error", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center py-12">
      <div className="admin-surface w-full p-7 text-center sm:p-10">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-danger-100 text-danger-700 dark:bg-danger-700/25 dark:text-danger-100">
          <WarningCircle size={24} weight="fill" aria-hidden />
        </span>
        <p className="mt-5 text-2xs font-bold uppercase tracking-[0.14em] text-content-subtle">
          Admin workspace
        </p>
        <h1 className="mt-2">Something went wrong</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-content-muted">
          The operation could not be completed. Your data has not been changed unless a success message was already shown.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>
            <ArrowClockwise size={15} aria-hidden />
            Try again
          </Button>
          <Link
            href="/admin"
            className="inline-flex h-12 items-center justify-center rounded-full border border-line-strong px-6 text-2xs font-semibold uppercase tracking-[0.13em] text-content transition-colors hover:bg-surface-sunken"
          >
            Dashboard
          </Link>
        </div>
        {error.digest ? (
          <p data-numeric className="mt-6 text-xs text-content-subtle">
            Reference: {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
