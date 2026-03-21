import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@tetherto/wdk-wallet-spark",
    "@buildonspark/spark-sdk",
    "@buildonspark/bare",
    "sodium-native",
  ],
};

export default nextConfig;
