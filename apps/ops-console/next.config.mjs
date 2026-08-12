/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mop/domain", "@mop/worker", "@mop/documents"],
  serverExternalPackages: ["pg"],
};

export default nextConfig;
