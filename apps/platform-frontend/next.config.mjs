/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  
  eslint: {
    // Allow production builds with ESLint errors (for CI/CD)
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Allow production builds with TypeScript errors (for CI/CD)
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true, // Required for static export
  },
  // Trailing slash for consistent routing
  trailingSlash: true,
}

export default nextConfig
