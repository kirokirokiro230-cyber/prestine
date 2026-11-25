import { PolicyPage, policyMetadata } from "@/components/layout/policy-page";

export const metadata = policyMetadata("privacy");

export default function Page() {
  return <PolicyPage policyKey="privacy" />;
}
