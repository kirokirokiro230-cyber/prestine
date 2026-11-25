import { PolicyPage, policyMetadata } from "@/components/layout/policy-page";

export const metadata = policyMetadata("terms");

export default function Page() {
  return <PolicyPage policyKey="terms" />;
}
