/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mop/domain", "@mop/worker"],
  serverExternalPackages: ["pg"],
};

export default nextConfig;
