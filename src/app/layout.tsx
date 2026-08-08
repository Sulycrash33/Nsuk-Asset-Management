import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NSUK Asset Register",
  description:
    "Digital inventory and barcode tracking for every physical asset across Nasarawa State University, Keffi.",
  manifest: "/manifest.webmanifest",
  applicationName: "NSUK Assets",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "NSUK Assets" },
  icons: { icon: "/nsuk-logo.svg", apple: "/nsuk-logo.svg" },
};

export const viewport: Viewport = {
  themeColor: "#1A3C6E",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-nsuk-cream font-sans antialiased">{children}</body>
    </html>
  );
}
