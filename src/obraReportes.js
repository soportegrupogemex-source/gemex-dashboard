import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cargarLogo } from './liquidacionPdf';

// Reportes del Dashboard de obra (ligado al Programa): Excel (frentes, etapas, categorías, partidas que rebasan) y PDF ejecutivo.
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const dinero = (n) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
const hoyTxt = () => new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
const nombreArchivo = (ext) => `Dashboard-de-obra-${new Date().toISOString().slice(0, 10)}.${ext}`;
const pct = (a, b) => (Number(b) > 0 ? r1((Number(a) / Number(b)) * 100) : 0);
const ESTATUS = { presupuesto: 'Por abrir', abierta: 'Abierta', cerrada: 'Cerrada' };

const filasFrentes = (proyectos) => proyectos.flatMap(p => p.frentes.map(f => ({
  Proyecto: p.nombre, Frente: f.f.nombre,
  Presupuesto: Math.round(f.pres), Ejecutado: Math.round(f.ejc), 'Avance %': r1(f.avance),
  Pagado: Math.round(f.pagado), 'Por pagar': Math.round(f.porPagar),
  'Etapas abiertas': f.etapas.filter(e => e.estatus === 'abierta').length, 'Etapas totales': f.etapas.length,
  Avisos: f.avisos.join(' | '),
})));
const filasEtapas = (proyectos) => proyectos.flatMap(p => p.frentes.flatMap(f => f.etapas.map(e => ({
  Proyecto: p.nombre, Frente: f.f.nombre, Etapa: e.nombre, Estatus: ESTATUS[e.estatus] || e.estatus,
  Presupuesto: Math.round(e.pres), 'Tope vigente': e.topeTotal === null ? '' : Math.round(e.topeTotal), Ampliado: Math.round(e.ampliado),
  Ejecutado: Math.round(e.ejc), 'Avance %': r1(e.avance), Pagado: Math.round(e.pagado),
}))));
const filasCategorias = (proyectos) => proyectos.flatMap(p => p.frentes.flatMap(f => f.cats.map(c => ({
  Proyecto: p.nombre, Frente: f.f.nombre, Categoría: c.label, Presupuesto: Math.round(c.pres), Ejecutado: Math.round(c.ejc), 'Avance %': pct(c.ejc, c.pres), Pagado: Math.round(c.pagado),
}))));
const filasRebasan = (proyectos) => proyectos.flatMap(p => p.frentes.flatMap(f => f.rebasan.map(x => ({
  Proyecto: p.nombre, Frente: f.f.nombre, Etapa: x.etapa, Partida: x.descripcion, Presupuesto: Math.round(x.pres), Ejecutado: Math.round(x.ejc), Exceso: Math.round(x.ejc - x.pres),
}))));

export function exportarExcel(proyectos) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasFrentes(proyectos)), 'Frentes');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasEtapas(proyectos)), 'Etapas');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasCategorias(proyectos)), 'Categorías');
  const reb = filasRebasan(proyectos);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reb.length ? reb : [{ Partida: 'Ninguna partida ejecutó más que su presupuesto' }]), 'Partidas que rebasan');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }));
  const a = document.createElement('a'); a.href = url; a.download = nombreArchivo('xlsx'); a.click();
  URL.revokeObjectURL(url);
}

export async function exportarPdf(proyectos, rg) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const logo = await cargarLogo();
  if (logo) { const h = 30; doc.addImage(logo.data, 'JPEG', 36, 26, h * (logo.w / logo.h), h); }
  doc.setFont('helvetica', 'bold').setFontSize(15).text('Dashboard de obra', W - 36, 42, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110).text(hoyTxt(), W - 36, 56, { align: 'right' });
  doc.setTextColor(0);
  if (rg) doc.setFontSize(10).text(`Presupuesto ${dinero(rg.pres)}  ·  Ejecutado ${dinero(rg.ejc)} (${r1(rg.avance)}%)  ·  Pagado ${dinero(rg.pagado)}  ·  Por pagar ${dinero(rg.porPagar)}  ·  ${rg.nFrentes} ${rg.nFrentes === 1 ? 'frente' : 'frentes'}`, 36, 84);
  autoTable(doc, {
    startY: 96, styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [107, 21, 36] },
    head: [['Proyecto', 'Frente', 'Presupuesto', 'Ejecutado', 'Avance', 'Pagado', 'Por pagar', 'Etapas abiertas', 'Avisos']],
    body: proyectos.flatMap(p => p.frentes.map(f => [p.nombre, f.f.nombre, dinero(f.pres), dinero(f.ejc), `${r1(f.avance)}%`, dinero(f.pagado), dinero(f.porPagar),
      `${f.etapas.filter(e => e.estatus === 'abierta').length} de ${f.etapas.length}`, f.avisos.length])),
  });
  const et = filasEtapas(proyectos);
  if (et.length) {
    doc.setFontSize(11).setFont('helvetica', 'bold').text('Etapas', 36, doc.lastAutoTable.finalY + 26);
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 32, styles: { fontSize: 7.5, cellPadding: 2.5 }, headStyles: { fillColor: [107, 21, 36] },
      head: [['Frente', 'Etapa', 'Estatus', 'Presupuesto', 'Tope vigente', 'Ejecutado', 'Avance', 'Pagado']],
      body: et.map(x => [x.Frente, x.Etapa, x.Estatus, dinero(x.Presupuesto), x['Tope vigente'] === '' ? '—' : dinero(x['Tope vigente']), dinero(x.Ejecutado), `${x['Avance %']}%`, dinero(x.Pagado)]),
    });
  }
  const reb = filasRebasan(proyectos);
  if (reb.length) {
    doc.setFontSize(11).setFont('helvetica', 'bold').text(`Partidas que ejecutaron más que su presupuesto (${reb.length})`, 36, doc.lastAutoTable.finalY + 26);
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 32, styles: { fontSize: 7.5, cellPadding: 2.5 }, headStyles: { fillColor: [107, 21, 36] },
      head: [['Frente', 'Etapa', 'Partida', 'Presupuesto', 'Ejecutado', 'Exceso']],
      body: reb.slice(0, 150).map(x => [x.Frente, x.Etapa, x.Partida, dinero(x.Presupuesto), dinero(x.Ejecutado), dinero(x.Exceso)]),
    });
    if (reb.length > 150) doc.setFontSize(8).text(`Se muestran 150 de ${reb.length}; el Excel trae la lista completa.`, 36, doc.lastAutoTable.finalY + 14);
  }
  doc.save(nombreArchivo('pdf'));
}
