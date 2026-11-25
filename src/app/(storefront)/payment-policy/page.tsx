import { PolicyPage, policyMetadata } from "@/components/layout/policy-page";

export const metadata = policyMetadata("payment");

export default function Page() {
  return <PolicyPage policyKey="payment" />;
}
