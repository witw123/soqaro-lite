import type { NextConfig } from "next";
import packageJson from "./package.json";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_NETEASE_ENABLED: "true",
    NEXT_PUBLIC_QQMUSIC_ENABLED: "true"
  },
  output: "export",
  images: {
    unoptimized: true
  },
  transpilePackages: ["@soqaro/shared"]
};

export default nextConfig;
