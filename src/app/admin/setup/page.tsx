import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SetupForm } from "@/components/admin/setup-form";
import { needsFirstAdmin } from "@/server/auth";

export const metadata: Metadata = {
  title: "Create owner account",
  robots: { index: false, follow: false },
};

/**
 * One-time setup.
 *
 * Reachable only while no admin exists. The action behind it enforces the same
 * condition, so this cannot be used to add an owner later even if the URL is
 * bookmarked.
 */
export default async function SetupPage() {
  if (!(await needsFirstAdmin())) redirect("/admin/login");
  return <SetupForm />;
}
