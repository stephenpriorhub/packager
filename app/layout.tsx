import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Packager — MTA Copy Package Generator",
  description:
    "Upload an unlaunched promo and generate the full copy package — lift notes, ads, emails, order form, editorial guide — one doc per component.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {children}
        {/* OxfordHub cross-app auth gate + top nav. Reveals <html> after auth. */}
        <Script
          src="https://oxfordhub.app/hub-nav.js"
          data-project-id="packager"
          strategy="afterInteractive"
          id="hub-nav"
        />
      </body>
    </html>
  );
}
