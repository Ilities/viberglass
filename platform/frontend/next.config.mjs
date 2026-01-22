/** @type {import('next').NextConfig} */
const nextConfig = {
  // Amplify hosting supports Next.js SSR with Lambda@Edge
  // No output: 'export' needed - Amplify handles SSR automatically
  eslint: {
    // Allow production builds with ESLint errors (for CI/CD)
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Allow production builds with TypeScript errors (for CI/CD)
    ignoreBuildErrors: true,
  },
  // Enable image optimization for SSR (Amplify Lambda@Edge supports this)
  images: {
    // For Amplify, we can use the default loader
    // No unoptimized needed
  },
  // Trailing slash for consistent routing
  trailingSlash: true,
}

export default nextConfig
