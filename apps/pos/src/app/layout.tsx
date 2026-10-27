import type { Metadata, Viewport } from 'next';
import { Open_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const openSans = Open_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Bale Store POS',
  description: 'Point of Sale Bale Store — offline first',
  keywords: ['pos', 'kasir', 'bale store', 'offline', 'retail'],
  authors: [{ name: 'Bale Store' }],
  robots: 'noindex, nofollow',
};

export const viewport: Viewport = {
  themeColor: '#03AC0E',
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
        <meta name="apple-mobile-web-app-title" content="Bale Store POS" />
        <meta name="theme-color" content="#03AC0E" />
      </head>
      <body className={`${openSans.variable} font-sans antialiased overscroll-none`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}