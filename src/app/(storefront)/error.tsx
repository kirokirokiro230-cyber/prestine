"use client";

import { useEffect } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { site } from "@/lib/config";

/**
 * Route-level error boundary.
 *
 * Shows a recovery path rather than a stack trace. The digest is surfaced because
 * it is the one thing client care can use to find the incident in logs — the
 * message itself is deliberately not rendered, since it can contain internals.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with your error reporter (Sentry, Datadog) in production.
    console.error("Unhandled route error:", error);
  }, [error]);

  return (
    <div className="page-gutter mx-auto max-w-page py-10">
      <EmptyState
        icon={<WarningCircle size={24} aria-hidden />}
        title="Something went wrong on our side"
        description="This is our fault, not yours. Try again — and if it keeps happening, tell us and we will fix it."
      >
        <Button size="md" onClick={reset}>
          Try again
        </Button>
        <ButtonLink href="/" variant="outline" size="md">
          Back to home
        </ButtonLink>
      </EmptyState>

      <div className="mx-auto max-w-md text-center">
        {error.digest ? (
          <p data-numeric className="text-xs text-content-subtle">
            Reference: {error.digest}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-content-muted">
          Your bag is safe — nothing has been lost. Reach client care at{" "}
          <a href={`mailto:${site.email}`} className="link-underline">
            {site.email}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
