/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disabled for some dnd/canvas interactions if needed
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**', // Allow external images from tools (YouTube, Spotify, etc.)
      },
      {
        protocol: 'http',
        hostname: 'localhost', // Allow local uploads
      }
    ],
  },
  // Ensure we can use the API proxy in dev if needed, though we set CORS on backend
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.NEXT_PUBLIC_API_URL 
          ? `${process.env.NEXT_PUBLIC_API_URL}/:path*` 
          : 'http://127.0.0.1:5000/api/:path*',
      },
      {
        source: '/uploads/:path*',
        destination: 'http://127.0.0.1:5000/uploads/:path*',
      }
    ];
  },
};

export default nextConfig;