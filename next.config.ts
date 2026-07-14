import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // An unrelated lockfile at C:\Users\Billions\package-lock.json makes Next
  // misdetect the workspace root — pin it explicitly to this repo.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
