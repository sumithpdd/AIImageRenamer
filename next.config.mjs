/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow serving local images from file system
  images: {
    unoptimized: true,
  },
  // Increase body size limit for image uploads
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
