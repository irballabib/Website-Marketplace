import Link from 'next/link';
import { Button } from '@cutbray/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@cutbray/ui/card';
import { Badge } from '@cutbray/ui/badge';
import { Package, ShoppingBag, CreditCard, Factory, FileText, BarChart } from 'lucide-react';

export default function HomePage() {
  const features = [
    { icon: Package, title: 'Katalog Produk', desc: 'Celana cutbray berbagai warna & ukuran', href: '/catalog' },
    { icon: ShoppingBag, title: 'POS Kasir', desc: 'Transaksi offline-first, sinkron otomatis', href: '/pos' },
    { icon: CreditCard, title: 'Booking & DP', desc: 'Pre-order batch, custom size, fitting slot', href: '/booking' },
    { icon: Factory, title: 'Produksi', desc: 'BOM, Work Order, pelacakan bahan baku', href: '/production' },
    { icon: FileText, title: 'Akuntansi', desc: 'Jurnal double-entry, neraca, laba rugi', href: '/accounting' },
    { icon: BarChart, title: 'Laporan', desc: 'Penjualan per kanal, stok, keuangan', href: '/reports' },
  ];

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Package className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">Cutbray</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/catalog" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Katalog
            </Link>
            <Link href="/booking" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Booking
            </Link>
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Masuk</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register" className="text-primary-foreground hover:text-primary-foreground">
                Daftar
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="container mx-auto px-4 py-20 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="secondary" className="mb-4">
            Platform Omnichannel Brand Celana Cutbray
          </Badge>
          <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Jual, Produksi, & Catat Keuangan
            <br />
            <span className="text-primary">Dalam Satu Platform</span>
          </h1>
          <p className="mb-8 text-lg text-muted-foreground max-w-2xl mx-auto">
            Toko online, POS kasir offline, booking pre-order dengan DP, manajemen produksi (BOM, work order),
            dan akuntansi SAK EMKM — terintegrasi dalam satu database.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/catalog">Mulai Belanja</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link href="/admin">Panel Admin</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <Card key={index} className="transition-shadow hover:shadow-lg">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">{feature.desc}</p>
                <Button asChild variant="ghost" size="sm" className="w-full justify-start">
                  <Link href={feature.href}>Lihat detail →</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/30 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mb-4 text-2xl font-bold">Siap Memulai?</h2>
          <p className="mb-6 text-muted-foreground max-w-xl mx-auto">
            Hubungi kami untuk demo atau mulai gunakan versi development di localhost.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild variant="outline">
              <Link href="https://github.com" target="_blank" rel="noopener noreferrer">
                Lihat Source Code
              </Link>
            </Button>
            <Button asChild>
              <Link href="/docs">Baca Dokumentasi</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Cutbray Marketplace. Dibangun dengan Next.js 15, NestJS, & PostgreSQL.</p>
        </div>
      </footer>
    </main>
  );
}