import { PolicyPage, policyMetadata } from "@/components/layout/policy-page";

export const metadata = policyMetadata("refundCancellation");

export default function Page() {
  return <PolicyPage policyKey="refundCancellation" />;
}
