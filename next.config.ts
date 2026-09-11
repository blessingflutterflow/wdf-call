import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin (used by the admin claim-approval routes) pulls in
  // jwks-rsa -> jose, which ships dual ESM/CJS in a way Turbopack's bundler
  // chokes on ("ERR_REQUIRE_ESM"). Excluding it from bundling loads it as a
  // plain native Node module at runtime instead, which sidesteps the issue.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
