import type { Metadata } from "next";
import { BannerManager } from "@/components/admin/banner-manager";
import { listBanners, listBannerStates } from "@/server/repositories/banners";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = {
  title: "Banners",
  robots: { index: false, follow: false },
};

export default async function BannersPage() {
  await requireAdmin();

  const [banners, states] = await Promise.all([listBanners(), listBannerStates()]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl leading-tight">Home page banners</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-content-muted">
          The sliding hero at the top of the home page. Reorder with the arrows, and use
          the dates to queue a sale banner in advance rather than remembering to publish
          it on the day.
        </p>
      </header>

      <BannerManager banners={banners} states={states} />
    </div>
  );
}
