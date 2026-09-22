import type { Metadata } from "next";
import { ContentPage, Prose } from "@/components/layout/content-page";
import { ButtonLink } from "@/components/ui/button";
import { site } from "@/lib/config";

export const metadata: Metadata = {
  title: "Accessibility",
  description:
    "How PRESTINE approaches accessibility, what we have built in, and how to tell us when we have got it wrong.",
  alternates: { canonical: "/accessibility" },
};

export default function AccessibilityPage() {
  return (
    <ContentPage
      eyebrow="Commitment"
      title="Accessibility"
      lede="We build this store to be usable with a keyboard, a screen reader, at 200% zoom and with motion switched off. Where we fall short, we want to hear about it."
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "Accessibility" }]}
      updated="1 July 2026"
    >
      <Prose>
        <h2>What we target</h2>
        <p>
          We build against the Web Content Accessibility Guidelines (WCAG) 2.2 at Level AA.
          Full conformance cannot be verified by automated tooling alone — it needs manual
          testing with assistive technology and review by accessibility specialists. We
          treat AA as the standard we hold ourselves to rather than a badge we claim.
        </p>

        <h2>What is built in</h2>
        <ul>
          <li>
            Every interactive element is reachable and operable with a keyboard, with a
            visible focus indicator that we never remove.
          </li>
          <li>
            A skip link to the main content is the first thing in the tab order on every
            page.
          </li>
          <li>
            Dialogs, drawers and the search panel trap focus while open, close on Escape, and
            return focus to whatever opened them.
          </li>
          <li>
            Body text meets a 4.5:1 contrast ratio and secondary text 3:1, in both light and
            dark themes — each theme is checked independently.
          </li>
          <li>
            Colour is never the only carrier of meaning. Sold-out sizes are struck through and
            labelled, errors carry an icon and text, badges are worded.
          </li>
          <li>
            All imagery has descriptive alternative text, and decorative graphics are hidden
            from assistive technology.
          </li>
          <li>
            Bag and saved-item changes are announced through polite live regions rather than
            appearing silently.
          </li>
          <li>
            Every animation respects <code>prefers-reduced-motion</code>; with it enabled,
            content appears without movement.
          </li>
          <li>
            Touch targets are at least 44&nbsp;×&nbsp;44px, including icon-only controls.
          </li>
          <li>
            Text reflows without loss of content or function up to 200% zoom, and the layout
            works from 320px upward.
          </li>
        </ul>

        <h2>Known gaps</h2>
        <p>
          The product gallery relies on a dialog for enlarged views rather than an in-place
          magnifier, which is a deliberate trade — hover magnifiers cannot be operated by
          keyboard or touch. We are also still improving the way filter result counts are
          announced when several filters change in quick succession.
        </p>

        <h2>Tell us when we get it wrong</h2>
        <p>
          If any part of this site blocks you, email{" "}
          <a href={`mailto:${site.email}`}>{site.email}</a> with the page and what happened.
          Accessibility reports go to the top of the queue, and we will give you a workaround
          in our first reply rather than only a promise to fix it.
        </p>
      </Prose>

      <div className="mt-10 border border-line bg-surface p-6">
        <h2 className="text-xl leading-tight">Prefer to order another way?</h2>
        <p className="mt-2.5 max-w-lg text-sm leading-relaxed text-content-muted">
          You can place any order over the phone with client care, including sizing advice,
          on {site.phone}, weekdays 9am–6pm GMT.
        </p>
        <ButtonLink href="/contact" size="md" className="mt-5">
          Contact client care
        </ButtonLink>
      </div>
    </ContentPage>
  );
}
