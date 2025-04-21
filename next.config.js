/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['images.stockx.com', 'stockx-assets.imgix.net'],
  },
}

module.exports = nextConfig