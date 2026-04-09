/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/api/**": ["./prisma/dev.db"],
      "/**": ["./prisma/dev.db"],
    },
  },
};

module.exports = nextConfig;
