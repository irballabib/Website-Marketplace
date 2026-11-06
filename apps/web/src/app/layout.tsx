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
  title: 'Bale Store — Celana Cutbray',
  description: 'Marketplace celana cutbray: belanja online, ambil di toko, dan lacak pesanan.',
  keywords: ['bale store', 'celana cutbray', 'fashion', 'ecommerce', 'marketplace'],
  authors: [{ name: 'Bale Store' }],
  creator: 'Bale Store',
  publisher: 'Bale Store',
  robots: 'index, follow',
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    url: 'http://localhost:3000',
    title: 'Bale Store — Celana Cutbray',
    description: 'Marketplace celana cutbray: belanja online, ambil di toko, dan lacak pesanan.',
    siteName: 'Bale Store',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bale Store — Celana Cutbray',
    description: 'Marketplace celana cutbray: belanja online, ambil di toko, dan lacak pesanan.',
  },
  verification: {
    other: {
      'theme-color': '#F9F7F2',
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F9F7F2' },
    { media: '(prefers-color-scheme: dark)', color: '#1A1714' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
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
        <meta name="apple-mobile-web-app-title" content="Bale Store" />
      </head>
      <body className={`${openSans.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}