/** @type {import('next').NextConfig} */

import type { NextConfig } from "next";
const nextConfig = {
  experimental: {
    appDir: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    domains: ['p16-sign-sg.tiktokcdn.com'], // 添加 TikTok CDN 域名
    // 或者使用更严格的 remotePatterns
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'p16-sign-sg.tiktokcdn.com',
        port: '',
        pathname: '/aweme/**',
      },
    ],
  },
}

module.exports = nextConfig