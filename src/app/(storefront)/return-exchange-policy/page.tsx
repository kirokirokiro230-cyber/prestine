import { PolicyPage, policyMetadata } from "@/components/layout/policy-page";

export const metadata = policyMetadata("returnExchange");

export default function Page() {
  return <PolicyPage policyKey="returnExchange" />;
}
