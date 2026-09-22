import type { Metadata } from "next";
import { CheckoutFlow } from "@/components/checkout/checkout-flow";
import { requireCustomer } from "@/server/customer-session";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Complete your PRESTINE order.",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  /*
   * Browsing and building a bag stay open to guests — the gate is here, at the one
   * step that has to attach an order to someone. An unauthenticated shopper is sent to
   * sign in and returned straight back to checkout; the bag is client-side in
   * localStorage, so it survives the round trip untouched.
   */
  const customer = await requireCustomer("/checkout");

  return (
    <CheckoutFlow
      account={{
        name: customer.name,
        email: customer.email ?? "",
        phone: customer.phone,
      }}
    />
  );
}
