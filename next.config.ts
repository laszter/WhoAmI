import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // dev ผ่าน tunnel: ALLOWED_DEV_ORIGINS=*.ngrok-free.app,*.trycloudflare.com (ไม่งั้น Next dev บล็อก /_next/*)
  // ห้ามใส่ output: 'standalone' (ใช้ร่วมกับ custom server.ts ไม่ได้)
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  // จาก create-next-app 16.4: Tailwind v4 ผ่าน Turbopack loader (โปรเจกต์นี้ไม่มี postcss.config) — ห้ามลบ
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
