'use client';

import { useState } from 'react';
import { Button } from '@cutbray/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@cutbray/ui/card';
import { Input } from '@cutbray/ui/input';
import { Badge } from '@cutbray/ui/badge';
import { Separator } from '@cutbray/ui/separator';
import { Package, Barcode, CreditCard, WifiOff, Wifi, Settings, LogOut, Plus, Minus, X, ReceiptText, Calculator, Scanner, AlertCircle } from 'lucide-react';

const mockProducts = [
  { sku: 'CTB-30-BLK', name: 'Cutbray Classic Hitam', size: '30', color: 'Hitam', price: 199000, stock: 15 },
  { sku: 'CTB-32-BLK', name: 'Cutbray Classic Hitam', size: '32', color: 'Hitam', price: 199000, stock: 12 },
  { sku: 'CTB-34-BLK', name: 'Cutbray Classic Hitam', size: '34', color: 'Hitam', price: 199000, stock: 8 },
  { sku: 'CTB-30-NVY', name: 'Cutbray Classic Navy', size: '30', color: 'Navy', price: 199000, stock: 10 },
  { sku: 'CTB-32-NVY', name: 'Cutbray Classic Navy', size: '32', color: 'Navy', price: 199000, stock: 14 },
  { sku: 'CTB-30-CHM', name: 'Cutbray Chino Khaki', size: '30', color: 'Khaki', price: 229000, stock: 6 },
];

function formatRupiah(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
}

export default function POSPage() {
  const [cart, setCart] = useState<Array<{ product: typeof mockProducts[0]; qty: number }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const addToCart = (product: typeof mockProducts[0]) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.sku === product.sku);
      if (existing) {
        if (existing.qty >= product.stock) return prev;
        return prev.map(item => item.product.sku === product.sku ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { product, qty: 1 }];
    });
  };

  const updateQty = (sku: string, delta: number) => {
    setCart(prev => {
      const item = prev.find(i => i.product.sku === sku);
      if (!item) return prev;
      const newQty = item.qty + delta;
      if (newQty <= 0) return prev.filter(i => i.product.sku !== sku);
      if (newQty > item.product.stock) return prev;
      return prev.map(i => i.product.sku === sku ? { ...i, qty: newQty } : i);
    });
  };

  const removeItem = (sku: string) => {
    setCart(prev => prev.filter(i => i.product.sku !== sku));
  };

  const filteredProducts = mockProducts.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.color.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card px-4 py-3 flex items-center justify-between sticky top-0 z-50 touch-target">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <Package className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-lg">Cutbray POS</h1>
            <p className="text-xs text-muted-foreground">Toko Pusat - Kasir 1</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isOnline ? 'success' : 'destructive'} className="gap-1">
            {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnline ? 'Online' : 'Offline'}
          </Badge>
          <Button variant="ghost" size="icon" className="touch-target">
            <Settings className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="touch-target">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Shift Banner */}
      {!shiftOpen && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-yellow-800">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Shift belum dibuka</span>
          </div>
          <Button onClick={() => setShiftOpen(true)} size="sm">
            Buka Shift
          </Button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Product Grid */}
        <div className="w-full md:w-2/3 lg:w-3/5 flex flex-col min-w-0">
          {/* Search Bar */}
          <div className="p-4 border-b sticky top-[60px] bg-background/95 backdrop-blur z-40">
            <div className="relative max-w-md">
              <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Scan barcode atau cari produk..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10 touch-target"
                autoFocus
              />
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-4 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredProducts.map(product => (
              <Button
                key={product.sku}
                variant="outline"
                className="touch-target flex flex-col items-start gap-1 p-3 h-auto transition-all hover:shadow-md"
                onClick={() => addToCart(product)}
                disabled={product.stock === 0}
              >
                <div className="w-full">
                  <p className="font-medium text-sm truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.color} / Size {product.size}</p>
                </div>
                <div className="w-full flex items-center justify-between">
                  <span className="font-bold text-primary">{formatRupiah(product.price)}</span>
                  <Badge variant={product.stock < 5 ? 'warning' : 'secondary'} className="text-xs">
                    Stok: {product.stock}
                  </Badge>
                </div>
              </Button>
            ))}
            {filteredProducts.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                <Barcode className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Produk tidak ditemukan</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Cart & Payment */}
        <div className="w-full md:w-1/3 lg:w-2/5 border-l bg-card flex flex-col min-w-0 hidden md:block">
          {/* Cart Header */}
          <div className="p-4 border-b sticky top-[60px] bg-card z-30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-6 w-6 text-primary" />
              <CardTitle className="text-lg">Keranjang ({itemCount})</CardTitle>
            </div>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setCart([])}>
                <X className="h-4 w-4 mr-1" /> Kosongkan
              </Button>
            )}
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4">
                <ShoppingBag className="h-16 w-16 opacity-30" />
                <p className="text-center">Keranjang kosong</p>
                <p className="text-xs">Tekan produk di kiri untuk menambah</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item, index) => (
                  <div key={index} className="flex gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">{item.product.color} / Size {item.product.size}</p>
                      <p className="text-sm text-foreground">{formatRupiah(item.product.price)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" onClick={() => updateQty(item.product.sku, -1)}>
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="font-mono font-bold w-8 text-center">{item.qty}</span>
                      <Button variant="outline" size="icon" onClick={() => updateQty(item.product.sku, 1)} disabled={item.qty >= item.product.stock}>
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeItem(item.product.sku)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart Summary */}
          <div className="p-4 border-t bg-card">
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal ({itemCount} item)</span>
                <span className="font-medium">{formatRupiah(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Diskon</span>
                <span className="font-medium text-green-600">-Rp 0</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">{formatRupiah(subtotal)}</span>
              </div>
            </div>
            <Button className="w-full touch-target" size="lg" onClick={() => setShowPayment(true)} disabled={cart.length === 0}>
              <CreditCard className="h-5 w-5 mr-2" />
              Bayar: {formatRupiah(subtotal)}
            </Button>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Pembayaran</CardTitle>
              <p className="text-sm text-muted-foreground">Total: {formatRupiah(subtotal)}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 grid-cols-2">
                <Button variant="outline" className="h-20 flex flex-col gap-1" onClick={() => { setShowPayment(false); alert('Tunai diterima'); setCart([]); }}>
                  <Calculator className="h-8 w-8 mx-auto" />
                  Tunai
                </Button>
                <Button variant="outline" className="h-20 flex flex-col gap-1" onClick={() => { setShowPayment(false); alert('QRIS diproses'); setCart([]); }}>
                  <CreditCard className="h-8 w-8 mx-auto" />
                  QRIS
                </Button>
                <Button variant="outline" className="h-20 flex flex-col gap-1" onClick={() => { setShowPayment(false); alert('Transfer dikonfirmasi'); setCart([]); }}>
                  <Package className="h-8 w-8 mx-auto" />
                  Transfer
                </Button>
                <Button variant="outline" className="h-20 flex flex-col gap-1" onClick={() => { setShowPayment(false); alert('EDC diproses'); setCart([]); }}>
                  <Scanner className="h-8 w-8 mx-auto" />
                  EDC
                </Button>
              </div>
              <Button variant="ghost" className="w-full" onClick={() => setShowPayment(false)}>
                Batal
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}