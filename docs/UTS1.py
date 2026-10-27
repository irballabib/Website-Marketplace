class Barang:
    def __init__(self, nama_barang, kode_barang, harga, stok_awal=0):
        self.nama_barang = nama_barang
        self.kode_barang = kode_barang
        self.harga = harga
        
        # Validasi stok awal agar tidak negatif (mengikuti pola Rekening)
        if stok_awal >= 0:
            self.__stok = stok_awal
        else:
            self.__stok = 0
            print("Stok awal tidak boleh negatif. Stok diatur ke 0.")

    # Getter untuk mengakses stok private
    def get_stok(self):
        return self.__stok

    # Method untuk menampilkan informasi barang
    def tampilkan_info(self):
        print("INFORMASI BARANG")
        print("Nama Barang  : ",self.nama_barang)
        print("Kode Barang  : ",self.kode_barang)
        print("Stok         : ",self.__stok, "unit")

    def barang_masuk(self, jumlah):
        if jumlah <= 0:
            print("Jumlah barang masuk harus lebih besar dari 0.")
        else:
            self.__stok += jumlah
            print("[Berhasil] Penambahan stok ",jumlah, "unit diterima.")
            print("Stok sekarang: ",self.__stok, "unit.")


    def barang_keluar(self, jumlah):
        if jumlah <= 0:
            print("Jumlah barang keluar harus lebih besar dari 0.")
        elif jumlah > self.__stok:
            print("Stok tidak mencukupi untuk pengeluaran barang.")
        else:
            self.__stok -= jumlah
            print("[Berhasil] Pengurangan stok ",jumlah, "unit berhasil.")
            print("Sisa stok: ",self.__stok, "unit.")

if __name__ == "__main__":
    barang1 = Barang("Mouse Wireless", "BRG001", 125000, 20)
    print("\n1. TAMPILKAN INFORMASI AWAL")
    barang1.tampilkan_info()
    print("================================")

    print("\n--- 2. TRANSAKSI BARANG MASUK (+10) ---")
    barang1.barang_masuk(10)
    print("================================")

    print("\n--- 3. PENGUJIAN AKSES ATRIBUT PRIVATE LANGSUNG ---")
    barang1.__stok = -5000
    print("Stok privat tidak berubah:", barang1.get_stok(), "unit")
    barang1.tampilkan_info()
    print("================================")

    print("\n--- 4. TRANSAKSI BARANG KELUAR (-5) ---")
    barang1.barang_keluar(5)
    print("================================")

    print("\n--- 5. PENGUJIAN VALIDASI (Uji Coba Gagal) ---")
    barang1.barang_masuk(0)
    print("================================")
    barang1.barang_keluar(100)
    print("================================")

    print("\n--- 6. TAMPILKAN STOK AKHIR ---")
    print(
        "Stok akhir untuk {} ({}): {} unit".format(
            barang1.nama_barang, barang1.kode_barang, barang1.get_stok()
        )
    )