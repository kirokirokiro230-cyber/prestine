import type { Metadata } from "next";
import { StaffManager } from "@/components/admin/staff-manager";
import { listAdmins } from "@/server/auth";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const admin = await requirePermission("staff:write");
  const staff = await listAdmins();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl leading-tight">Staff</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-content-muted">
          Accounts that can sign in to this panel. Passwords are hashed with scrypt and
          cannot be read back — resetting means setting a new one.
        </p>
      </header>

      <StaffManager
        staff={staff.map((entry) => ({
          id: entry.id,
          name: entry.name,
          email: entry.email,
          role: entry.role,
          createdAt: entry.createdAt,
          lastLoginAt: entry.lastLoginAt,
          disabled: entry.disabled,
          isSelf: entry.id === admin.id,
        }))}
      />
    </div>
  );
}
