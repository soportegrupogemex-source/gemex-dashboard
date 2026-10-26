import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cargarLogo } from './liquidacionPdf';

// Estimación a contratista en PDF: el avance acumulado del contrato, lo estimado antes y lo que toca en esta estimación.
const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fecha = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return `${d}-${MESES[m - 1]}-${y}`; };

export async function descargarEstimacionPdf({ est, contrato, contratista, frente, desarrollo, pagado }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const logo = await cargarLogo();
  if (logo) { const h = 34; doc.addImage(logo.data, 'JPEG', 40, 30, h * (logo.w / logo.h), h); }
  doc.setFont('helvetica', 'bold').setFontSize(15).text(`Estimación ${est.numero}`, W - 40, 44, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110).text(est.estatus === 'autorizada' ? 'AUTORIZADA' : 'PENDIENTE DE AUTORIZAR', W - 40, 58, { align: 'right' });
  doc.setTextColor(0);

  const filas = [
    ['Contratista', contratista], ['Contrato', `${contrato.concepto || 'Sin concepto'} (${contrato.tipo === 'monto_fijo' ? 'monto fijo' : 'precios unitarios'})`],
    ['Proyecto', `${desarrollo || ''} · ${frente}`], ['Fecha de la estimación', fecha(est.fecha)],
  ];
  autoTable(doc, { startY: 84, body: filas, theme: 'plain', styles: { fontSize: 10, cellPadding: 2 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 130 } } });

  const esFijo = contrato.tipo === 'monto_fijo';
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 14,
    head: [esFijo ? ['Partida', 'Etapa', 'Avance'] : ['Partida', 'Etapa', 'Avance', 'Importe devengado']],
    body: (est.detalle || []).map(d => esFijo ? [d.partida, d.etapa, `${Number(d.avance)}%`] : [d.partida, d.etapa, `${Number(d.avance)}%`, fmt(d.importe)]),
    styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [107, 21, 36] },
    columnStyles: esFijo ? { 2: { halign: 'right' } } : { 2: { halign: 'right' }, 3: { halign: 'right' } },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 14, theme: 'plain', styles: { fontSize: 10, cellPadding: 3 },
    tableWidth: 300, margin: { left: W - 40 - 300 }, columnStyles: { 1: { halign: 'right' } },
    body: [
      [`Avance acumulado del contrato`, `${Number(est.avance_pct)}%`],
      ['Devengado acumulado', fmt(est.devengado_acumulado)],
      ['Estimado en estimaciones anteriores', fmt(est.anterior)],
      [{ content: 'Importe de esta estimación', styles: { fontStyle: 'bold' } }, { content: fmt(est.importe), styles: { fontStyle: 'bold' } }],
      ['Pagado al contratista a la fecha', fmt(pagado)],
    ],
  });

  const y = Math.max(doc.lastAutoTable.finalY + 70, 660);
  doc.setFontSize(9).setDrawColor(150);
  [['Contratista', 40], ['Construcción', 230], [est.autorizada_por ? `Autorizó: ${est.autorizada_por}` : 'Autoriza', 420]].forEach(([t, x]) => { doc.line(x, y, x + 150, y); doc.text(t, x + 75, y + 12, { align: 'center' }); });
  doc.save(`Estimacion-${est.numero}-${String(contratista).replace(/[^A-Za-z0-9]+/g, '-')}.pdf`);
}
