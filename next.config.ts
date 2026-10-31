import type { NextConfig } from "next";

// Сборка для GitHub Pages: GITHUB_PAGES=1 bunx next build
// (базовый путь = имя репозитория, статический экспорт в out/)
const isPages = process.env.GITHUB_PAGES === "1";

const nextConfig: NextConfig = {
  output: isPages ? "export" : "standalone",
  ...(isPages && {
    basePath: "/white-silence",
    images: { unoptimized: true },
    distDir: ".next-ghpages",
  }),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
