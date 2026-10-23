import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Cutbray POS',
  description: 'Point of Sale untuk Cutbray - Offline First',
  keywords: ['pos', 'kasir', 'cutbray', 'offline', 'retail'],
  authors: [{ name: 'Cutbray Team' }],
  robots: 'noindex, nofollow',
};

export const viewport: Viewport = {
  themeColor: '#16a34a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Cutbray POS" />
        <meta name="theme-color" content="#16a34a" />
      </head>
      <body className={`${inter.variable} font-sans antialiased overscroll-none`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}