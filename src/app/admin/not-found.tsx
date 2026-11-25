import Link from "next/link";
import { ArrowLeft, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { ButtonLink } from "@/components/ui/button";

export default function AdminNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center py-12">
      <div className="admin-surface w-full p-7 text-center sm:p-10">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <MagnifyingGlass size={23} aria-hidden />
        </span>
        <p className="mt-5 text-2xs font-bold uppercase tracking-[0.14em] text-content-subtle">
          Not found
        </p>
        <h1 className="mt-2">This admin page does not exist</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-content-muted">
          The record may have been removed, or the link may be out of date.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <ButtonLink href="/admin">
            <ArrowLeft size={15} aria-hidden />
            Dashboard
          </ButtonLink>
          <ButtonLink href="/admin/activity" variant="outline">
            View activity
          </ButtonLink>
        </div>
        <p className="mt-6 text-xs text-content-subtle">
          Looking for the shop? <Link href="/" className="font-medium text-accent hover:underline">Open storefront</Link>
        </p>
      </div>
    </div>
  );
}
