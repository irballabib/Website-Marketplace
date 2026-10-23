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
  title: 'Cutbray Marketplace',
  description: 'Omnichannel platform for Cutbray pants brand',
  keywords: ['pants', 'cutbray', 'fashion', 'ecommerce', 'pos'],
  authors: [{ name: 'Cutbray Team' }],
  creator: 'Cutbray',
  publisher: 'Cutbray',
  robots: 'index, follow',
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    url: 'http://localhost:3000',
    title: 'Cutbray Marketplace',
    description: 'Omnichannel platform for Cutbray pants brand',
    siteName: 'Cutbray',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cutbray Marketplace',
    description: 'Omnichannel platform for Cutbray pants brand',
  },
  verification: {
    other: {
      'theme-color': '#16a34a',
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
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
        <meta name="apple-mobile-web-app-title" content="Cutbray" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}