import type { MetadataRoute } from "next";
import { UNIT } from "@/lib/config";

// Next serves this at /manifest.webmanifest and auto-links it in <head>.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${UNIT} — Study Assistant`,
    short_name: "Study Tutor",
    description: `Your AI study tutor for ${UNIT}: ask questions, get cited answers, and practice with quizzes.`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f9fafb",
    theme_color: "#4f46e5",
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
