import type { Metadata, Viewport } from 'next';
import { Chakra_Petch, Noto_Sans_Thai } from 'next/font/google';
import './globals.css';

// เนื้อหา: Noto Sans Thai (อ่านง่าย) · ตัวเลข/หัวข้อ: Chakra Petch (เหลี่ยม ๆ แนวสายลับ)
const sans = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  variable: '--font-noto-thai',
  display: 'swap',
});

const display = Chakra_Petch({
  subsets: ['thai', 'latin'],
  weight: ['500', '600', '700'],
  variable: '--font-chakra',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Spy Party',
  description: 'เกมจับสายลับกับเพื่อนบน LINE',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#020617',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="th" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-dvh bg-slate-950 font-sans text-slate-50 antialiased">{children}</body>
    </html>
  );
}
