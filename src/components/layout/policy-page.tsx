import type { Metadata } from "next";
import { ContentPage, Prose } from "@/components/layout/content-page";
import { PolicySections } from "@/components/layout/policy-text";
import { storeSettings } from "@/lib/catalog";
import { policies, policyVars, type PolicyKey } from "@/lib/policies";

/**
 * One page per policy, all rendered the same way from `src/lib/policies.ts`.
 *
 * A route file is two lines: the metadata and the page, each taking the policy's key. That
 * keeps the seven pages identical in structure, so fixing the layout of one fixes all of
 * them, and keeps the wording out of the routes where nobody would think to look for it.
 */
export function policyMetadata(key: PolicyKey): Metadata {
  const policy = policies[key];

  return {
    title: policy.title,
    description: policy.description,
    alternates: { canonical: policy.path },
  };
}

export async function PolicyPage({ policyKey }: { policyKey: PolicyKey }) {
  const policy = policies[policyKey];
  const settings = await storeSettings();

  return (
    <ContentPage
      eyebrow="Policies"
      title={policy.title}
      breadcrumbs={[{ label: "Home", href: "/" }, { label: policy.title }]}
    >
      <Prose>
        <PolicySections sections={policy.sections} vars={policyVars(settings)} />
      </Prose>
    </ContentPage>
  );
}
