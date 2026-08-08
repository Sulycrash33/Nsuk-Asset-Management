import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Inter carries the whole interface; JetBrains Mono is reserved for barcodes
// and serial numbers, where a person has to read or retype the exact string.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "NSUK Asset Register",
    template: "%s · NSUK Asset Register",
  },
  description:
    "Digital inventory and barcode tracking for every physical asset across Nasarawa State University, Keffi.",
  manifest: "/manifest.webmanifest",
  applicationName: "NSUK Assets",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "NSUK Assets" },
  icons: { icon: "/nsuk-logo.svg", apple: "/nsuk-logo.svg" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#1A3C6E",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh bg-nsuk-cream font-sans antialiased">{children}</body>
    </html>
  );
}
