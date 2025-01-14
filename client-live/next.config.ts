/** @type {import('next').NextConfig} */

import type { NextConfig } from "next";
const nextConfig = {
  experimental: {
    appDir: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
}

module.exports = nextConfig