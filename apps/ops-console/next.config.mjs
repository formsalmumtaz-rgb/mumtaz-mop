/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mop/domain"],
  serverExternalPackages: ["pg"],
};

export default nextConfig;
