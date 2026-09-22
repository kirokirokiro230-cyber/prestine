import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { AddressBook } from "@/components/account/address-book";

export const metadata: Metadata = {
  title: "Addresses",
  description: "Manage your delivery and billing addresses.",
  robots: { index: false, follow: false },
};

export default function AddressesPage() {
  return (
    <AccountShell
      title="Addresses"
      description="Saved addresses appear at checkout so you only type them once. The first in the list is used by default."
    >
      <AddressBook />
    </AccountShell>
  );
}
