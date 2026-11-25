import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/content-page";
import { FaqAnswer } from "@/components/layout/policy-text";
import { Accordion } from "@/components/ui/accordion";
import { answerBlocks, faqSections } from "@/lib/faq";
import { jsonLdScript } from "@/lib/json-ld";
import { plainText } from "@/lib/policies";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Answers about orders and payment, shipping and tracking, products and sizing, returns, exchanges and refunds, and privacy at KABUDA.",
  alternates: { canonical: "/faq" },
};

/**
 * FAQ structured data, with the real answers.
 *
 * The answers are plain sentences, so they go into the markup as they are, which is what
 * earns the expandable Q&A treatment in search results. Links and bold are stripped (the
 * schema wants text), and list items are read as sentences.
 */
function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqSections.flatMap((section) =>
      section.items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answerBlocks(item.answer)
            .map((block) =>
              block.type === "ul" ? block.items.map(plainText).join(" ") : plainText(block.text),
            )
            .join(" "),
        },
      })),
    ),
  };
}

export default function FaqPage() {
  return (
    <>
      {/* Our own text, but escaped by the same helper as every other JSON-LD block. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd()) }}
      />

      <ContentPage
        eyebrow="Support"
        title="Frequently Asked Questions"
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "FAQ" }]}
      >
        <div className="flex flex-col gap-12">
          {faqSections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-28">
              <h2 className="mb-5 text-2xl leading-tight">{section.heading}</h2>
              <Accordion
                items={section.items.map((item) => ({
                  id: item.id,
                  title: item.question,
                  content: <FaqAnswer answer={item.answer} />,
                }))}
              />
            </section>
          ))}
        </div>
      </ContentPage>
    </>
  );
}
