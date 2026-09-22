import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { introInitScript } from "@/components/brand/brand-intro";
import { BaseProviders } from "@/components/providers";
import { themeInitScript } from "@/components/providers/theme-provider";
import { storeSettings } from "@/lib/catalog";
import "./globals.css";

/**
 * Storefront metadata and chrome are backed by live database settings. Rendering this
 * tree at request time avoids fanning those reads out across every route during a
 * production build, while ensuring merchant changes remain visible immediately.
 */
export const dynamic = "force-dynamic";

/**
 * Root layout.
 *
 * Deliberately minimal: `<html>`, fonts, the theme script and the two providers both
 * halves of the app need. It does **not** render the shop's header, footer or drawers.
 *
 * That chrome lives in `(storefront)/layout.tsx` instead, because `/admin` nests
 * inside this layout too — anything rendered here would appear above the admin panel,
 * which is exactly the bug this structure prevents. The `(storefront)` group is
 * stripped from URLs, so `/shop` is still `/shop`.
 */
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * Metadata is generated rather than static because the store name, description and
 * public URL are all editable in the admin panel.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await storeSettings();

  return {
    metadataBase: new URL(settings.url),
    title: {
      default: `${settings.name} — ${settings.tagline}`,
      template: `%s · ${settings.name}`,
    },
    description: settings.description,
    applicationName: settings.name,
    keywords: [
      "premium clothing",
      "cashmere knitwear",
      "tailored outerwear",
      "selvedge denim",
      "sustainable fashion",
      "wardrobe essentials",
    ],
    authors: [{ name: settings.legalName }],
    openGraph: {
      type: "website",
      siteName: settings.name,
      title: `${settings.name} — ${settings.tagline}`,
      description: settings.description,
      url: settings.url,
      locale: settings.locale.replace("-", "_"),
    },
    twitter: {
      card: "summary_large_image",
      title: `${settings.name} — ${settings.tagline}`,
      description: settings.description,
    },
    robots: { index: true, follow: true },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Do not cap zoom — pinch-zoom is an accessibility requirement.
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0c0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${cormorant.variable} ${inter.variable}`}
    >
      <head>
        {/* Applies the stored theme before first paint to avoid a white flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/*
          Marks the document when the opening animation has already played this
          session, so returning views never paint it. It has to run here, in the head,
          because deciding after hydration means either a flash of a panel that is
          then removed or a panel that appears on top of a page already being read.
          The storefront renders the panel; this only sets an attribute, so it is inert
          for /admin.
        */}
        <script dangerouslySetInnerHTML={{ __html: introInitScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <BaseProviders>{children}</BaseProviders>
      </body>
    </html>
  );
}
