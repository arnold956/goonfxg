/** @type {import('next').NextConfig} */
const nextConfig = {
  // GitHub Pages requires a fully static Next.js export.
  output: 'export',
  trailingSlash: true,
  transpilePackages: ['@deriv/core'],
};

module.exports = nextConfig;
