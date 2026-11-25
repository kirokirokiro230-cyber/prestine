import { PolicyPage, policyMetadata } from "@/components/layout/policy-page";

export const metadata = policyMetadata("grievance");

export default function Page() {
  return <PolicyPage policyKey="grievance" />;
}
