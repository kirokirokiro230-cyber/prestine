import { PolicyPage, policyMetadata } from "@/components/layout/policy-page";

export const metadata = policyMetadata("shippingDelivery");

export default function Page() {
  return <PolicyPage policyKey="shippingDelivery" />;
}
