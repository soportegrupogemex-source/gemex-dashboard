import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cargarLogo } from './liquidacionPdf';

// Requisición de pago de obra en PDF, con el formato de la hoja oficial (Hoja3 de "REQUI GEMEX EN BLANCO").
const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fecha = (s) => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return `${d}-${MESES[m - 1]}-${y}`; };
const FORMA = { cheque: 'CHEQUE', transferencia: 'TRANSFERENCIA', efectivo: 'EFECTIVO' };

export async function descargarRequisicionPdf({ req, lineas, torres, desarrollo, autorizo }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const logo = await cargarLogo();
  if (logo) { const h = 32; doc.addImage(logo.data, 'JPEG', 40, 28, h * (logo.w / logo.h), h); }
  doc.setFont('helvetica', 'bold').setFontSize(15).text('REQUISICIÓN DE PAGO', W / 2, 48, { align: 'center' });
  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.text(`FOLIO ${req.folio}`, W - 40, 36, { align: 'right' });
  doc.text(`SEMANA ${req.semana ?? ''}`, W - 40, 48, { align: 'right' });
  doc.text(`PERIODO ${req.periodo || ''}`, W - 40, 60, { align: 'right' });

  const par = (a, b) => [{ content: a, styles: { fontStyle: 'bold' } }, b || ''];
  autoTable(doc, {
    startY: 78, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 82 }, 1: { cellWidth: 150 }, 2: { cellWidth: 82 }, 3: { cellWidth: 'auto' } },
    body: [
      [...par('CATEGORÍA', (req.categoria === 'indirectos' ? 'INDIRECTOS' : 'EDIFICACIÓN') + (req.etapa ? ` · ${req.etapa.toUpperCase()}` : '')), ...par('FISCAL', req.fiscal ? 'SÍ' : 'NO')],
      [...par('UBICACIÓN', (req.ubicacion || '').toUpperCase()), ...par('Nº FACTURA', req.factura || 'PENDIENTE')],
      [...par('PROYECTO', (desarrollo || '').toUpperCase()), ...par('CONCEPTO', (req.concepto || '').toUpperCase())],
      [...par('TORRES', torres || ''), ...par('FORMA DE PAGO', FORMA[req.forma_pago] || '')],
    ],
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 82 }, 1: { cellWidth: 150 }, 2: { cellWidth: 82 }, 3: { cellWidth: 'auto' } },
    body: [
      [...par('RAZÓN SOCIAL', (req.razon_social || '').toUpperCase()), ...par('SOLICITA', (req.solicitante || '').split('@')[0].toUpperCase())],
      [...par('FECHA', fecha(req.fecha)), ...par('MONTO SOLICITADO', fmt(req.total))],
    ],
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10, theme: 'grid', styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
    head: [['PARTIDA', 'REFERENCIA', 'CONCEPTO', 'CANTIDAD', 'UNIDAD', 'P.U.', 'IMPORTE']],
    body: lineas.map(l => [l.partida || '', l.referencia || '', l.concepto || '', Number(l.cantidad), l.unidad || '', fmt(l.precio_unitario), fmt(l.importe)]),
    columnStyles: { 3: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6, theme: 'plain', styles: { fontSize: 9, cellPadding: 2 }, tableWidth: 220, margin: { left: W - 40 - 220 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
    body: [['SUBTOTAL', fmt(req.subtotal)], ['IVA', req.fiscal ? fmt(req.iva) : ''], ['TOTAL', fmt(req.total)]],
  });
  let y = doc.lastAutoTable.finalY + 14;
  doc.setFont('helvetica', 'bold').setFontSize(9).text('OBSERVACIONES:', 40, y);
  doc.setFont('helvetica', 'normal').text(doc.splitTextToSize(req.observaciones || '', W - 80), 40, y + 12);
  if (req.estatus === 'pagada') doc.text(`Pagada el ${fecha(req.fecha_pago)}`, 40, y + 40);
  y = Math.max(y + 90, 640);
  doc.setFont('helvetica', 'bold').text('AUTORIZADO', W / 2, y, { align: 'center' });
  doc.setDrawColor(120).line(W / 2 - 100, y + 52, W / 2 + 100, y + 52);
  doc.setFont('helvetica', 'normal').text((autorizo || '').toUpperCase(), W / 2, y + 64, { align: 'center' });
  doc.text('DIRECCIÓN ADMINISTRATIVA', W / 2, y + 76, { align: 'center' });
  doc.save(`Requisicion-${req.folio}-${String(req.razon_social || '').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 30)}.pdf`);
}
