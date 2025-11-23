import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Silence monorepo root inference warning by pointing tracing to the workspace root.
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
