# Floorplan App — Kalkulator Material Dinding

Aplikasi mobile (Expo SDK 57 + TypeScript) untuk menghitung kebutuhan material dinding berdasarkan denah 2D. Pengguna bisa menggambar dinding, menambahkan ruangan, menempatkan bukaan (pintu/jendela), serta menyimpan dan mengekspor RAB.

## Fitur
- Denah 2D interaktif dengan titik sudut dan tata letak ruangan
- Penghitungan material otomatis (bata, semen, pasir, cat) dengan faktor 1,05
- Manajemen proyek dan ekspor RAB teks/PDF
- Login lokal (tanpa server, kata sandi hanya divalidasi di layar)
- Dukungan dedupe dinding berimpit (hitung sekali)

## Rumus Perhitungan Material
- **Bata**: `luas_netto × 70 × 1,05` (koefisien 70 bata/m²) — agar mudah diganti per jenis bata
- **Semen**: `(luas_netto × 11,5 / 40) × 1,05` sak 40 kg
- **Pasir**: `luas_netto × 0,045 × 1,05` m³
- **Cat dasar**: `luas_netto × 2 / 10` liter
- **Cat penutup**: `luas_netto × 2 × 2 / 12` liter
- Faktor 1,05 sesuai standar waste.

Catatan: rumus di `src/utils/calculator.ts` tidak berubah; hanya masukan luas/panjang dinding yang dihitung ulang di lapisan atas (`pricing.ts`) saat dedupe aktif.

## Menjalankan
```bash
npm install
npx expo start
```

Untuk pemeriksaan tipe:
```bash
npx tsc --noEmit
```

## Struktur Folder Singkat
- `src/types.ts`: model data (Point, Wall, Opening, Room, Project)
- `src/utils/geometry.ts`: logika murni titik, jarak, snap, moveEnd
- `src/utils/openings.ts`: posisi bukaan sepanjang dinding
- `src/utils/overlap.ts`: deteksi dinding berimpit
- `src/utils/rooms.ts`: analisis graf dan wajah ruangan
- `src/store/`: Zustand + persist (wallStore, authStore, priceStore, projectStore)
- `src/components/PlanCanvas.tsx`: kanvas denah 2D (SVG + PanResponder)
- `src/screens/EditorScreen.tsx`, `ResultScreen.tsx`, `LoginScreen.tsx`
- `src/utils/exportRab.ts`: ekspor teks dan HTML untuk PDF

## Batasan
- Login hanya lokal, tidak terhubung ke server
- Harga bawaan adalah perkiraan; pengguna bisa menyesuaikan di Pengaturan Harga
- Mortar ratio belum memengaruhi rumus material
