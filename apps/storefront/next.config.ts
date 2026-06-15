import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Monorepo: the app's CSS imports shared tokens from `packages/design-tokens`,
  // which lives above this app. Point Turbopack at the repo root so `../` imports
  // that reach into sibling packages stay within the allowed project boundary.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
