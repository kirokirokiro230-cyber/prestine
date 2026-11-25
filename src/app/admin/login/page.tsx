import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { safeInternalPath } from "@/lib/safe-redirect";
import { needsFirstAdmin } from "@/server/auth";
import { currentAdmin } from "@/server/session";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // No accounts yet: send them to one-time setup instead of an unusable form.
  if (await needsFirstAdmin()) redirect("/admin/setup");

  // Already signed in: skip the form.
  if (await currentAdmin()) redirect("/admin");

  const { next } = await searchParams;

  // Re-validated by the sign-in action too; this only keeps the hidden field honest.
  const target = safeInternalPath(next, "/admin");
  return <LoginForm next={target.startsWith("/admin") ? target : "/admin"} />;
}
