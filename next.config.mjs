// Static export for GitHub Pages: STATIC_EXPORT=1 NEXT_PUBLIC_STATIC=1 NEXT_PUBLIC_BASE_PATH=/<repo> next build
// (see .github/workflows/pages.yml). Normal `next dev` keeps the API routes and the /annotate editor.
const staticExport = process.env.STATIC_EXPORT === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets the dev server be opened via the loopback IP too (useful when `localhost` is intercepted, e.g. by a VPN client).
  allowedDevOrigins: ["127.0.0.1"],
  ...(staticExport && {
    output: "export",
    distDir: ".next-static", // keep separate from the dev server's .next
    basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
    trailingSlash: true,
  }),
};

export default nextConfig;
