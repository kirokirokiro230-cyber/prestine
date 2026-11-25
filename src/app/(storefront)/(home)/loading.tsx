import { HomeSkeleton } from "@/components/ui/skeleton";

/** Shown while the home page's data (banners, arrivals, best sellers) resolves. */
export default function Loading() {
  return <HomeSkeleton />;
}
