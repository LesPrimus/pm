import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a plain HTML/CSS/JS site into out/, served by FastAPI at /.
  output: "export",
  images: { unoptimized: true },
  // Pin the workspace root, so a stray lockfile above the repo cannot change it.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
