import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emailTemplates, site } from "../config";
import { answerBlocks, faqSections } from "../faq";
import { buildFooterNav } from "../navigation";
import {
  POLICY_ORDER,
  fillTokens,
  isBlankValue,
  plainText,
  policies,
  policyVars,
  tokensIn,
  type PolicyBlock,
} from "../policies";

const SETTINGS = {
  legalName: "Kabuda Retail Pvt. Ltd.",
  email: "support@kabuda.in",
  phone: "+91 98765 43210",
  address: "12 MG Road, Bengaluru 560001",
};

/** Every string in a policy or the FAQ, so a check can look at all the text at once. */
function allText(): string[] {
  const out: string[] = [];

  const fromBlock = (block: PolicyBlock) => {
    if (block.type === "p") out.push(block.text);
    else if (block.type === "ul" || block.type === "ol") out.push(...block.items);
    else out.push(...block.items.flatMap((item) => [item.label, item.value]));
  };

  for (const policy of Object.values(policies)) {
    out.push(policy.title, policy.description);
    for (const section of policy.sections) {
      if (section.heading) out.push(section.heading);
      section.blocks.forEach(fromBlock);
    }
  }

  for (const section of faqSections) {
    out.push(section.heading);
    for (const item of section.items) out.push(item.question, item.answer);
  }

  return out;
}

describe("the policy pages", () => {
  it("are the seven that were supplied, in footer order", () => {
    expect(POLICY_ORDER.map((key) => policies[key].title)).toEqual([
      "Privacy Policy",
      "Terms & Conditions",
      "Return & Exchange Policy",
      "Refund & Cancellation Policy",
      "Shipping & Delivery Policy",
      "Grievance Redressal Policy",
      "Payment Policy",
    ]);
  });

  it("each have a route, because a page that is linked but missing is a 404 in the footer", () => {
    for (const key of POLICY_ORDER) {
      const path = policies[key].path;
      expect(path.startsWith("/")).toBe(true);
      expect(existsSync(join(process.cwd(), "src/app/(storefront)", path, "page.tsx"))).toBe(true);
    }
  });

  it("have distinct paths", () => {
    const paths = POLICY_ORDER.map((key) => policies[key].path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("have a description and at least one section", () => {
    for (const policy of Object.values(policies)) {
      expect(policy.description.length).toBeGreaterThan(40);
      expect(policy.sections.length).toBeGreaterThan(0);
    }
  });
});

describe("no placeholder is left in the text", () => {
  it("has no 'Insert ...' or bracketed blank, which would be shown to customers", () => {
    for (const text of allText()) {
      expect(text).not.toMatch(/\[Insert/i);
      expect(text).not.toMatch(/\bTODO\b|\bTBD\b|lorem ipsum/i);
    }
  });

  it("uses only tokens that policyVars can fill", () => {
    const known = Object.keys(policyVars(SETTINGS));

    for (const text of allText()) {
      for (const token of tokensIn(text)) {
        expect(known).toContain(token);
      }
    }
  });

  it("leaves no braces behind once filled", () => {
    const vars = policyVars(SETTINGS);
    for (const text of allText()) {
      expect(fillTokens(text, vars)).not.toMatch(/\{\{|\}\}/);
    }
  });
});

describe("the figures the policies state agree with each other and with the store", () => {
  const text = allText().join("\n");

  it("say 7 calendar days for returns and exchanges, never 48 hours or 30 days", () => {
    expect(text).toMatch(/7 calendar days/);
    // "48 hours" is legitimate in the grievance policy (complaints are acknowledged within 48\n    // hours); what must not appear is the old returns window.\n    expect(text).not.toMatch(/48 hours of delivery|48-hour return|30[- ]day|thirty/i);
  });

  it("is enforced as 7 days by default, so the promise and the rule cannot differ", () => {
    expect(site.returnWindowHours).toBe(7 * 24);
  });

  it("say refunds are initiated within 5–7 business days, and do not promise otherwise", () => {
    expect(text).toMatch(/5–7 business days/);
    expect(text).not.toMatch(/three working days/i);
  });

  it("say delivery is 3–7 business days after dispatch", () => {
    expect(text).toMatch(/3–7 business days/);
  });

  it("do not call returns free, because return shipping is deducted from refunds", () => {
    expect(text).not.toMatch(/free returns|returns are free|free of charge.*return/i);
  });

  it("say approved exchanges are free", () => {
    expect(text).toMatch(/Approved exchanges are free of cost/);
  });

  it("do not carry over the template's claims", () => {
    expect(text).not.toMatch(/carbon|London|GMT|monogram|repairs? (for life|free)|duties|import tax/i);
  });

  it("email templates shipped with the store make the same promises", () => {
    const delivered = emailTemplates.find((entry) => entry.key === "delivered")!;
    const cancelled = emailTemplates.find((entry) => entry.key === "order-cancelled")!;

    expect(delivered.body).not.toMatch(/Returns are free/i);
    expect(cancelled.body).not.toMatch(/three working days/i);
    expect(cancelled.body).toMatch(/5–7 business days/);
  });
});

describe("tokens", () => {
  it("fills from the store's settings", () => {
    expect(fillTokens("Write to {{supportEmail}} or call {{supportPhone}}", policyVars(SETTINGS))).toBe(
      "Write to support@kabuda.in or call +91 98765 43210",
    );
  });

  it("turns an unknown token into nothing rather than printing braces", () => {
    expect(fillTokens("a{{nope}}b", {})).toBe("ab");
  });

  it("lists the tokens a text uses", () => {
    expect(tokensIn("{{a}} and {{b_2}}")).toEqual(["a", "b_2"]);
  });

  it("gives the Grievance Officer the support email and business address when they have none", () => {
    const vars = policyVars(SETTINGS);

    expect(vars.officerEmail).toBe("support@kabuda.in");
    expect(vars.officerAddress).toBe("12 MG Road, Bengaluru 560001");
    expect(vars.officerDesignation).toBe("Grievance Officer");
  });

  /*
   * The officer's name and number are not known. They must come out empty, so the page can
   * leave the lines out, and never as a placeholder.
   */
  it("leaves the officer's name and number empty until they are provided", () => {
    const vars = policyVars(SETTINGS);

    expect(vars.officerName).toBe("");
    expect(vars.officerPhone).toBe("");
  });

  it("trims what the settings hold", () => {
    expect(policyVars({ ...SETTINGS, email: "  a@b.in " }).supportEmail).toBe("a@b.in");
  });
});

describe("isBlankValue", () => {
  it("treats empty and whitespace as blank, so the line is dropped", () => {
    expect(isBlankValue("")).toBe(true);
    expect(isBlankValue("   ")).toBe(true);
  });

  it("treats a link with nothing in it as blank", () => {
    expect(isBlankValue("[](mailto:)")).toBe(true);
  });

  it("does not treat a real value as blank", () => {
    expect(isBlankValue("Asha Rao")).toBe(false);
    expect(isBlankValue("[a@b.in](mailto:a@b.in)")).toBe(false);
  });

  it("makes an unfilled grievance block drop its lines", () => {
    const vars = policyVars({ ...SETTINGS, email: "", phone: "", address: "", legalName: "" });
    const details = policies.grievance.sections.find((section) => section.heading === "Customer Support Details")!;
    const block = details.blocks[0];

    expect(block.type).toBe("kv");
    if (block.type === "kv") {
      const shown = block.items.filter((item) => !isBlankValue(fillTokens(item.value, vars)));
      expect(shown).toEqual([]);
    }
  });
});

describe("plainText", () => {
  it("strips links and bold for structured data", () => {
    expect(plainText("See [our policy](/privacy) for **details**.")).toBe(
      "See our policy for details.",
    );
  });
});

describe("the FAQ", () => {
  const items = faqSections.flatMap((section) => section.items);

  it("has the six sections and all 71 questions that were supplied", () => {
    expect(faqSections.map((section) => section.heading)).toEqual([
      "Orders & Payment",
      "Shipping & Tracking",
      "Products & Sizing",
      "Returns, Exchange & Refund",
      "Miscellaneous",
      "Privacy & Policies",
    ]);
    expect(faqSections.map((section) => section.items.length)).toEqual([14, 14, 8, 21, 7, 7]);
    expect(items).toHaveLength(71);
  });

  it("has unique ids, which the accordion and the page anchors rely on", () => {
    const ids = [...items.map((item) => item.id), ...faqSections.map((section) => section.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no empty question or answer", () => {
    for (const item of items) {
      expect(item.question.trim().length).toBeGreaterThan(5);
      expect(item.answer.trim().length).toBeGreaterThan(20);
    }
  });

  it("no longer carries the previous FAQ", () => {
    const text = items.map((item) => `${item.question} ${item.answer}`).join("\n");

    // Questions and claims that were only in the old FAQ.
    expect(text).not.toMatch(/cashmere|raw denim|field jacket|hem trousers|boxwood|nominated-day/i);
    expect(text).not.toMatch(/Still Have Questions/i);
  });

  it("links only to pages that exist", () => {
    const routes = new Set([
      "/contact",
      "/account/orders",
      ...POLICY_ORDER.map((key) => policies[key].path),
    ]);

    for (const item of items) {
      for (const match of item.answer.matchAll(/\]\((\/[^)\s]*)\)/g)) {
        expect(routes).toContain(match[1]);
      }
    }
  });
});

describe("answerBlocks", () => {
  it("splits paragraphs on a blank line", () => {
    expect(answerBlocks("One.\n\nTwo.")).toEqual([
      { type: "p", text: "One." },
      { type: "p", text: "Two." },
    ]);
  });

  it("reads a run of '- ' lines as a list", () => {
    expect(answerBlocks("Reasons:\n\n- A.\n- B.\n\nDone.")).toEqual([
      { type: "p", text: "Reasons:" },
      { type: "ul", items: ["A.", "B."] },
      { type: "p", text: "Done." },
    ]);
  });

  it("keeps a paragraph that mixes text and dashes as text", () => {
    expect(answerBlocks("Intro\n- one")).toEqual([{ type: "p", text: "Intro - one" }]);
  });

  it("makes the exchange policy answer a list of its four reasons", () => {
    const exchange = faqSections
      .flatMap((section) => section.items)
      .find((item) => item.id === "returns-exchange-policy")!;
    const list = answerBlocks(exchange.answer).find((block) => block.type === "ul");

    expect(list && list.type === "ul" ? list.items : []).toHaveLength(4);
  });
});
describe("the footer", () => {
  const columns = buildFooterNav([]);
  const hrefs = columns.flatMap((column) => column.links.map((link) => link.href));

  it("links every policy, so none is findable only by guessing the address", () => {
    for (const key of POLICY_ORDER) {
      expect(hrefs).toContain(policies[key].path);
    }
  });

  it("no longer links the pages that were removed", () => {
    expect(hrefs).not.toContain("/shipping-returns");
    expect(hrefs).not.toContain("/accessibility");
    expect(hrefs).not.toContain("/faq#care");
  });

  it("still links the contact page, the FAQ and the size guide", () => {
    expect(hrefs).toEqual(expect.arrayContaining(["/contact", "/faq", "/size-guide"]));
  });
});
