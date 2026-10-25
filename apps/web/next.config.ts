import type { NextConfig } from "next";
import packageJson from "./package.json";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version
  },
  output: "export",
  images: {
    unoptimized: true
  },
  transpilePackages: ["@soqaro/shared"]
};

export default nextConfig;
