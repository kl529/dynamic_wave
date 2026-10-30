/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'standalone',
  // next/image를 쓰지 않는다. 이미지 최적화 엔드포인트(/_next/image)를 꺼서 14.x에 남은 관련 취약점 노출을 없앤다.
  images: { unoptimized: true },
}

module.exports = nextConfig
