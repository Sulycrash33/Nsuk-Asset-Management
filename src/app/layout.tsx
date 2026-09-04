import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/service-worker";

// Inter carries the whole interface; JetBrains Mono is reserved for asset codes
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
    default: "NSUK Asset Management System",
    template: "%s · NSUK Asset Management System",
  },
  description:
    "Digital inventory and QR label tracking for every physical asset across Nasarawa State University, Keffi.",
  manifest: "/manifest.webmanifest",
  applicationName: "NSUK Assets",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "NSUK Assets" },
  icons: { icon: "/nsuk-crest.png", apple: "/nsuk-crest.png" },
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
      <body className="min-h-dvh bg-nsuk-cream font-sans antialiased">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
