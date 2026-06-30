/** @type {import('next').NextConfig} */
const nextConfig = {
  // The ingestion / transcription scripts and a couple of parsing libraries are
  // Node-only. They never run inside the Next.js runtime (they run via
  // `npm run ingest` locally), but we make sure Next doesn't try to bundle them.
  serverExternalPackages: ["unpdf", "mammoth"],
};

export default nextConfig;
