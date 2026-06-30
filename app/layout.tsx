import type { Metadata, Viewport } from "next";
import { UNIT } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: `${UNIT} — Study Assistant`,
  description: `An AI study tutor for ${UNIT}. Ask questions, get cited answers, and practice with quizzes.`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
