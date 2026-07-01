import type { Metadata, Viewport } from "next";
import { UNIT } from "@/lib/config";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: `${UNIT} — Study Assistant`,
  description: `An AI study tutor for ${UNIT}. Ask questions, get cited answers, and practice with quizzes.`,
  applicationName: "Study Tutor",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Study Tutor",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Do NOT disable zoom (maximumScale) — users must be able to pinch-zoom (WCAG 1.4.4).
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-full">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
