import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cargarLogo } from './liquidacionPdf';
import { nombreFrente, TIPOS_FRENTE } from './ObraTorres';

// Reportes del Dashboard de obra: Excel (resumen + partidas atrasadas) y PDF ejecutivo.
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const dinero = (n) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
const hoyTxt = () => new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
const nombreArchivo = (ext) => `Dashboard-de-obra-${new Date().toISOString().slice(0, 10)}.${ext}`;

const filasResumen = (proyectos, verCostos) => proyectos.flatMap(p => p.frentes.map(f => {
  const base = {
    Proyecto: p.nombre, Frente: nombreFrente(f.t), Tipo: TIPOS_FRENTE[f.t.tipo] || f.t.tipo,
    'Avance real %': r1(f.r.real), 'Programado a hoy %': f.r.programado === null ? '' : r1(f.r.programado),
    'Desviación (pts)': f.desv === null ? '' : r1(f.desv),
    'Partidas terminadas': f.r.terminadas, 'Partidas totales': f.r.total, 'Partidas atrasadas': f.r.atrasadas,
    Plazo: f.semanaTxt, 'Término programado': f.terminaTxt.replace('Termina prog. ', ''),
  };
  if (verCostos) { base.Presupuesto = Math.round(f.presupuesto); base.Pagado = Math.round(f.pagado); }
  return base;
}));

const filasAtrasadas = (proyectos) => proyectos.flatMap(p => p.frentes.flatMap(f => f.todasAtrasadas.map(x => ({
  Proyecto: p.nombre, Frente: nombreFrente(f.t), Partida: x.p.descripcion, Ruta: x.ruta,
  'Avance %': r1(x.p.avance_pct), 'Programado %': r1(x.pp), 'Puntos abajo': r1(x.pp - Number(x.p.avance_pct)),
}))));

export function exportarExcel(proyectos, verCostos) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasResumen(proyectos, verCostos)), 'Resumen');
  const atr = filasAtrasadas(proyectos);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(atr.length ? atr : [{ Partida: 'Sin partidas atrasadas' }]), 'Partidas atrasadas');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }));
  const a = document.createElement('a'); a.href = url; a.download = nombreArchivo('xlsx'); a.click();
  URL.revokeObjectURL(url);
}

export async function exportarPdf(proyectos, rg, verCostos) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const logo = await cargarLogo();
  if (logo) { const h = 30; doc.addImage(logo.data, 'JPEG', 36, 26, h * (logo.w / logo.h), h); }
  doc.setFont('helvetica', 'bold').setFontSize(15).text('Dashboard de obra', W - 36, 42, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110).text(hoyTxt(), W - 36, 56, { align: 'right' });
  doc.setTextColor(0);
  if (rg) {
    const desv = rg.programado === null ? 'sin fecha de arranque' : `${r1(rg.realProgramadas - rg.programado) >= 0 ? '+' : ''}${r1(rg.realProgramadas - rg.programado)} pts`;
    doc.setFontSize(10).text(`Avance real ${r1(rg.real)}%  ·  Programado ${rg.programado === null ? '—' : r1(rg.programado) + '%'}  ·  Desviación ${desv}  ·  ${rg.terminadas} de ${rg.total} partidas terminadas  ·  ${rg.atrasadas} atrasadas`, 36, 84);
  }
  const cab = ['Proyecto', 'Frente', 'Avance real', 'Programado', 'Desviación', 'Terminadas', 'Atrasadas', 'Plazo'];
  if (verCostos) cab.push('Pagado / presupuesto');
  autoTable(doc, {
    startY: 96, head: [cab], styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [107, 21, 36] },
    body: proyectos.flatMap(p => p.frentes.map(f => {
      const fila = [p.nombre, nombreFrente(f.t), `${r1(f.r.real)}%`, f.r.programado === null ? '—' : `${r1(f.r.programado)}%`,
        f.desv === null ? '—' : `${r1(f.desv) >= 0 ? '+' : ''}${r1(f.desv)} pts`, `${f.r.terminadas}/${f.r.total}`, f.r.atrasadas, f.semanaTxt];
      if (verCostos) fila.push(`${dinero(f.pagado)} / ${dinero(f.presupuesto)}`);
      return fila;
    })),
  });
  const atr = filasAtrasadas(proyectos);
  if (atr.length) {
    doc.setFontSize(11).setFont('helvetica', 'bold').text(`Partidas atrasadas (${atr.length})`, 36, doc.lastAutoTable.finalY + 26);
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 32, styles: { fontSize: 7.5, cellPadding: 2.5 }, headStyles: { fillColor: [107, 21, 36] },
      head: [['Frente', 'Partida', 'Ruta', 'Avance', 'Programado', 'Abajo']],
      body: atr.slice(0, 150).map(x => [x.Frente, x.Partida, x.Ruta, `${x['Avance %']}%`, `${x['Programado %']}%`, `${x['Puntos abajo']} pts`]),
    });
    if (atr.length > 150) doc.setFontSize(8).text(`Se muestran 150 de ${atr.length}; el Excel trae la lista completa.`, 36, doc.lastAutoTable.finalY + 14);
  }
  doc.save(nombreArchivo('pdf'));
}
