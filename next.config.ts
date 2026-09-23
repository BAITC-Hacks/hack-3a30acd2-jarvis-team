import type { NextConfig } from "next";
const nextConfig: NextConfig = { poweredByHeader: false, serverExternalPackages: ["@prisma/client"], async headers() { return [{ source: "/(.*)", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "same-origin" }, { key: "X-Frame-Options", value: "DENY" }] }]; } };
export default nextConfig;
