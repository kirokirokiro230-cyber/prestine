import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/account/reset-password-form";
import { currentCustomer } from "@/server/customer-session";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  if (await currentCustomer()) redirect("/account");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="font-display text-2xl tracking-[0.3em] text-content">
            <span className="-mr-[0.3em] pr-[0.3em]">PRESTINE</span>
          </Link>
        </div>

        <div className="border border-line bg-surface p-6">
          <div className="mb-5">
            <h1 className="font-display text-2xl leading-tight">Reset your password</h1>
          </div>

          <ResetPasswordForm />
        </div>

        <p className="mt-6 text-center text-xs text-content-subtle">
          <Link href="/" className="link-underline">
            Return to the store
          </Link>
        </p>
      </div>
    </div>
  );
}
