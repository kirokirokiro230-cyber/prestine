import Link from "next/link";
import { Fragment } from "react";
import { answerBlocks } from "@/lib/faq";
import {
  fillTokens,
  isBlankValue,
  type PolicyBlock,
  type PolicySection,
  type PolicyVars,
} from "@/lib/policies";

/**
 * Rendering for the policy and FAQ text in `src/lib/policies.ts`.
 *
 * ## Why not just put markup in the text
 *
 * The text is data, and is checked by tests, so it is plain strings with two conventions
 * (`**bold**` and `[label](href)`) turned into elements here. Nothing is ever passed to
 * `dangerouslySetInnerHTML`, so the text cannot inject markup, and a link is honoured only
 * for a site path, `mailto:` or `https://` address: anything else (a `javascript:` URL typed
 * into the data by mistake) is shown as its label, unlinked.
 */

const INLINE = /\*\*(.+?)\*\*|\[([^\]]*)\]\(([^)\s]*)\)/g;

/** Whether a link target is one this renderer will make clickable. */
export function isSafeHref(href: string): boolean {
  return /^\/(?!\/)/.test(href) || /^mailto:[^\s]+$/i.test(href) || /^https:\/\/[^\s]+$/i.test(href);
}

export function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));

    const [, bold, label, href] = match;

    if (bold !== undefined) {
      nodes.push(<strong key={key++}>{bold}</strong>);
    } else if (label !== undefined && href !== undefined) {
      if (!label) {
        // An empty label is an empty token. Nothing to show.
      } else if (!isSafeHref(href)) {
        nodes.push(label);
      } else if (href.startsWith("/")) {
        nodes.push(
          <Link key={key++} href={href}>
            {label}
          </Link>,
        );
      } else {
        nodes.push(
          <a key={key++} href={href}>
            {label}
          </a>,
        );
      }
    }

    last = index + match[0].length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * One FAQ answer: paragraphs, and bulleted lists where the answer has them.
 * Rendered with the same inline rules as the policies.
 */
export function FaqAnswer({ answer }: { answer: string }) {
  return (
    <div className="flex flex-col gap-3">
      {answerBlocks(answer).map((block, index) =>
        block.type === "ul" ? (
          <ul key={index} className="flex list-disc flex-col gap-1.5 pl-5">
            {block.items.map((item) => (
              <li key={item}>{renderInline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={index}>{renderInline(block.text)}</p>
        ),
      )}
    </div>
  );
}

function Block({ block, vars }: { block: PolicyBlock; vars: PolicyVars }) {
  switch (block.type) {
    case "p":
      return <p>{renderInline(fillTokens(block.text, vars))}</p>;

    case "ul":
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>{renderInline(fillTokens(item, vars))}</li>
          ))}
        </ul>
      );

    case "ol":
      return (
        <ol>
          {block.items.map((item) => (
            <li key={item}>{renderInline(fillTokens(item, vars))}</li>
          ))}
        </ol>
      );

    case "kv": {
      // A line whose value is empty is left out, not printed as "Phone:" with nothing after
      // it. That is how a detail that has not been provided yet stays off a public page.
      const rows = block.items
        .map((item) => ({ label: item.label, value: fillTokens(item.value, vars) }))
        .filter((row) => !isBlankValue(row.value));

      if (rows.length === 0) return null;

      return (
        <dl className="flex flex-col gap-2.5">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
              <dt className="shrink-0 font-medium text-content sm:w-72">{row.label}</dt>
              <dd className="min-w-0 break-words">{renderInline(row.value)}</dd>
            </div>
          ))}
        </dl>
      );
    }
  }
}

/** The sections of one policy, ready to sit inside a `<Prose>`. */
export function PolicySections({
  sections,
  vars,
}: {
  sections: PolicySection[];
  vars: PolicyVars;
}) {
  return (
    <>
      {sections.map((section, index) => (
        <Fragment key={section.heading ?? `section-${index}`}>
          {section.heading ? <h2>{section.heading}</h2> : null}
          {section.blocks.map((block, blockIndex) => (
            <Block key={blockIndex} block={block} vars={vars} />
          ))}
        </Fragment>
      ))}
    </>
  );
}
