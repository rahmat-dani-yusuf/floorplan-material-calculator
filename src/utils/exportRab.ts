import { formatRupiah } from './pricing';
import type { MultiFloorSummary, ProjectSummary } from '../types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildRabText(projectName: string, summary: ProjectSummary): string {
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const name = projectName || 'Proyek Baru';
  const lines: string[] = [];
  lines.push('RAB MATERIAL DINDING');
  lines.push('Proyek: ' + name);
  lines.push('Tanggal: ' + today);
  lines.push('Total luas netto: ' + summary.total_area_m2.toFixed(2) + ' mآ²');
  lines.push('');
  lines.push('--- Rincian per dinding ---');
  for (const cs of summary.perWall) {
    const wall = cs.wall;
    lines.push(
      (wall.name || 'Dinding') +
      ' | ' + wall.length_meters.toFixed(2) + ' أ— ' + wall.height_meters.toFixed(2) +
      ' m | ' + (wall.brick_type || '-') + ' | netto ' + (cs.quantities?.area_m2 || 0).toFixed(2) + ' mآ²',
    );
  }
  lines.push('');
  lines.push('--- Kebutuhan material ---');
  for (const item of summary.line_items) {
    lines.push(
      item.name + ' | ' + item.quantity + ' ' + item.unit +
      ' | @ ' + formatRupiah(item.unit_price) +
      ' | ' + formatRupiah(item.subtotal),
    );
  }
  lines.push('');
  lines.push('TOTAL: ' + formatRupiah(summary.grand_total));
  lines.push('Catatan: estimasi sudah termasuk waste 5%.');
  return lines.join('\n');
}

export function buildRabHtml(projectName: string, summary: ProjectSummary): string {
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const name = escapeHtml(projectName || 'Proyek Baru');
  const rowsPerWall = summary.perWall.map((cs) => {
    const w = cs.wall;
    return `<tr><td>${escapeHtml(w.name || 'Dinding')}</td><td>${w.length_meters.toFixed(2)} أ— ${w.height_meters.toFixed(2)} m</td><td>${escapeHtml(w.brick_type || '-')}</td><td>${(cs.quantities?.area_m2 || 0).toFixed(2)} mآ²</td></tr>`;
  }).join('');
  const rowsMaterial = summary.line_items.map((item) =>
    `<tr><td>${escapeHtml(item.name)}</td><td style="text-align:right">${item.quantity.toLocaleString('id-ID')}</td><td>${escapeHtml(item.unit)}</td><td style="text-align:right">${formatRupiah(item.unit_price)}</td><td style="text-align:right">${formatRupiah(item.subtotal)}</td></tr>`,
  ).join('');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: sans-serif; color: #111; padding: 24px; max-width: 720px; margin: auto; }
h1 { font-size: 22px; margin-bottom: 4px; }
.info { color: #555; font-size: 12px; margin-bottom: 16px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
th, td { padding: 6px 8px; border-bottom: 1px solid #ccc; text-align: left; }
th { background: #131b2e; color: #fff; }
.number { text-align: right; }
.total-row td { font-weight: 700; border-top: 2px solid #131b2e; }
.footer { margin-top: 16px; font-size: 11px; color: #777; } @media print { body { padding: 0; margin: 0; } @page { size: A4; margin: 12mm; } table { width: 100% !important; } th, td { border-bottom: 1px solid #999; page-break-inside: avoid; } }
</style>
</head>
<body>
<h1>RAB MATERIAL DINDING</h1>
<div class="info">Proyek: ${name} | Tanggal: ${today} | Luas netto: ${summary.total_area_m2.toFixed(2)} mآ²</div>
<h2 style="font-size:16px;margin-top:16px;">Rincian per dinding</h2>
<table>
<thead><tr><th>Dinding</th><th>Ukuran</th><th>Bata</th><th>Luas netto</th></tr></thead>
<tbody>${rowsPerWall}</tbody>
</table>
<h2 style="font-size:16px;margin-top:16px;">Kebutuhan material</h2>
<table>
<thead><tr><th>Item</th><th>Jumlah</th><th>Satuan</th><th>Harga satuan</th><th>Subtotal</th></tr></thead>
<tbody>${rowsMaterial}<tr class="total-row"><td colspan="4">TOTAL</td><td class="number">${formatRupiah(summary.grand_total)}</td></tr></tbody>
</table>
<div class="footer">Dibuat dengan aplikasi Kalkulator Material â€¢ Estimasi sudah termasuk waste 5%</div>
</body>
</html>`;
}

/** Teks RAB multi-lantai: ringkasan per lantai + grand total semua lantai. */
export function buildMultiFloorRabText(projectName: string, multi: MultiFloorSummary): string {
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const lines: string[] = [];
  lines.push('RAB MATERIAL DINDING (MULTI-LANTAI)');
  lines.push('Proyek: ' + (projectName || 'Proyek Baru'));
  lines.push('Tanggal: ' + today);
  lines.push('Total luas netto: ' + multi.total_area_m2.toFixed(2) + ' mآ²');
  lines.push('');
  for (const f of multi.perFloor) {
    lines.push(`--- ${f.floorName} (${f.wallCount} dinding, ${f.summary.total_area_m2.toFixed(2)} mآ²) ---`);
    lines.push(buildRabText(`${projectName} - ${f.floorName}`, f.summary));
    lines.push('');
  }
  lines.push('GRAND TOTAL SEMUA LANTAI: ' + formatRupiah(multi.grand_total));
  lines.push('Catatan: estimasi sudah termasuk waste 5%.');
  return lines.join('\n');
}

/** HTML RAB multi-lantai untuk PDF. */
export function buildMultiFloorRabHtml(projectName: string, multi: MultiFloorSummary): string {
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const name = escapeHtml(projectName || 'Proyek Baru');
  const sections = multi.perFloor.map((f) => {
    const rows = f.summary.line_items.map((item) =>
      `<tr><td>${escapeHtml(item.name)}</td><td style="text-align:right">${item.quantity.toLocaleString('id-ID')}</td><td>${escapeHtml(item.unit)}</td><td style="text-align:right">${formatRupiah(item.unit_price)}</td><td style="text-align:right">${formatRupiah(item.subtotal)}</td></tr>`,
    ).join('');
    return `<h2 style="font-size:16px;margin-top:16px;">${escapeHtml(f.floorName)} &mdash; ${f.summary.total_area_m2.toFixed(2)} mآ&sup2;</h2>
<table>
<thead><tr><th>Item</th><th>Jumlah</th><th>Satuan</th><th>Harga satuan</th><th>Subtotal</th></tr></thead>
<tbody>${rows}<tr class="total-row"><td colspan="4">TOTAL ${escapeHtml(f.floorName)}</td><td class="number">${formatRupiah(f.summary.grand_total)}</td></tr></tbody>
</table>`;
  }).join('');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>RAB - ${name}</title>
<style>
body { font-family: sans-serif; color: #111; padding: 24px; max-width: 720px; margin: auto; }
h1 { font-size: 22px; margin-bottom: 4px; }
.info { color: #555; font-size: 12px; margin-bottom: 16px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
th, td { padding: 6px 8px; border-bottom: 1px solid #ccc; text-align: left; }
th { background: #131b2e; color: #fff; }
.number { text-align: right; }
.total-row td { font-weight: 700; border-top: 2px solid #131b2e; }
.footer { margin-top: 16px; font-size: 11px; color: #777; } @media print { body { padding: 0; margin: 0; } @page { size: A4; margin: 12mm; } table { width: 100% !important; } th, td { border-bottom: 1px solid #999; page-break-inside: avoid; } }
</style>
</head>
<body>
<h1>RAB MATERIAL DINDING (MULTI-LANTAI)</h1>
<div class="info">Proyek: ${name} | Tanggal: ${today} | Luas netto: ${multi.total_area_m2.toFixed(2)} mآ&sup2; | Grand total: ${formatRupiah(multi.grand_total)}</div>
${sections}
<div class="footer">Dibuat dengan aplikasi Kalkulator Material &bull; Estimasi sudah termasuk waste 5%</div>
</body>
</html>`;
}

