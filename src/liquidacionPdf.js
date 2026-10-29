import jsPDF from 'jspdf';
import { CLAVE_TITULADOR, CLAVE_TESORERO } from './AjustesAdministracion';

// Liquidación final en PDF (formato de Tesorería). La usan Cobranza (al
// descargarla o al marcar la unidad como cotejada) y Titulación (para ver en
// vivo el estado de cuenta antes de que Cobranza coteje).
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// A qué crédito corresponde cada "Financiera" según el tipo de compra.
const ETIQUETAS_CREDITO = {
  Infonavit: { f1: 'Crédito Infonavit', f2: 'Crédito bancario' },
  Fovissste: { f1: 'Crédito Fovissste', f2: 'Crédito bancario' },
  Cofinavit: { f1: 'Crédito Infonavit', f2: 'Crédito bancario' },
  Bancario: { f1: 'Crédito bancario', f2: 'Otro crédito' },
};
export const etiquetasCredito = (tipo) => ETIQUETAS_CREDITO[tipo] || { f1: 'Financiera 1', f2: 'Financiera 2' };

const MESES_ABREV = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (d = new Date()) => `${String(d.getDate()).padStart(2, '0')}-${MESES_ABREV[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
const fmtN = (n) => Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "C203" -> edificio "C", departamento "203". Sin letra (ej. "103") el edificio queda vacío.
const partirUnidad = (numero) => {
  const m = String(numero || '').trim().match(/^([A-Za-zÁÉÍÓÚÑ]+)[\s-]*(\d.*)$/);
  return m ? { edificio: m[1].toUpperCase(), departamento: m[2] } : { edificio: '', departamento: String(numero || '') };
};

export const cargarLogo = () => new Promise(resolve => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    resolve({ data: c.toDataURL('image/jpeg', 0.92), w: img.naturalWidth, h: img.naturalHeight });
  };
  img.onerror = () => resolve(null);
  img.src = process.env.PUBLIC_URL + '/logo-gemex.jpg';
});

// Nombres que firman (Administración → Ajustes de administración), en mayúsculas.
export const cargarFirmantes = async (supabase) => {
  const { data } = await supabase.from('configuracion').select('clave, valor').in('clave', [CLAVE_TITULADOR, CLAVE_TESORERO]);
  const valorDe = (clave) => ((data || []).find(c => c.clave === clave)?.valor || '').trim().toUpperCase();
  return { titulacion: valorDe(CLAVE_TITULADOR), tesorero: valorDe(CLAVE_TESORERO) };
};

// d: { cliente, tipoCompra, unidadNumero, desarrolloNombre, valorVenta, pagado, pagos: [{ fecha, monto }], f1, f2, cuotas, firmantes, preliminar }
// preliminar = true marca el documento como estado de cuenta en proceso (aún sin cotejo de Cobranza).
export const construirLiquidacionPdf = async (d) => {
  const valorVenta = Number(d.valorVenta) || 0;
  const pagado = r2(d.pagado);
  const f1 = r2(d.f1);
  const f2 = r2(d.f2);
  const cuotas = r2(d.cuotas);
  const cliente = (d.cliente || 'Sin comprador registrado').replace(/\s+/g, ' ').trim().toUpperCase();
  const { edificio, departamento } = partirUnidad(d.unidadNumero);
  const et = etiquetasCredito(d.tipoCompra);
  // Tesorería captura TODO lo que cae en la cuenta (también los depósitos del crédito) como pagos, así que
  // `pagado` ya incluye lo recibido de las financieras: f1/f2 solo se desglosan, no se vuelven a sumar.
  const totalPagos = pagado;
  const saldoNeto = r2(valorVenta - pagado);
  const enganche = r2(pagado - f1 - f2);
  const firmantes = d.firmantes || { titulacion: '', tesorero: '' };

  const doc = new jsPDF('p', 'mm', 'letter');
  const L = 22;          // margen izquierdo de etiquetas
  const V = 100;         // columna de valores de texto
  const R = 150;         // borde derecho de los importes
  const linea = (y, x1 = L, x2 = R, grosor = 0.3) => { doc.setLineWidth(grosor); doc.line(x1, y, x2, y); };
  const fila = (y, etiqueta, valor, negrita = false) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.text(etiqueta, L, y);
    doc.text(valor, R, y, { align: 'right' });
  };

  const logo = await cargarLogo();
  if (logo) {
    const h = 24; const w = h * (logo.w / logo.h);
    doc.addImage(logo.data, 'JPEG', L, 14, w, h);
  }

  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('LIQUIDACIÓN FINAL', 62, 52);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal'); doc.text('FECHA', 138, 52);
  doc.setFont('helvetica', 'bold'); doc.text(fechaCorta(), 165, 52);
  if (d.preliminar) {
    doc.setFontSize(8); doc.setTextColor(192, 32, 58);
    doc.text('ESTADO DE CUENTA EN PROCESO — PENDIENTE DE COTEJO POR COBRANZA', 62, 57);
    doc.setTextColor(0, 0, 0);
  }

  doc.setFontSize(10);
  let y = 66;
  const dato = (etiqueta, valor, negrita = true) => {
    doc.setFont('helvetica', 'normal'); doc.text(etiqueta, L, y);
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    const lineas = doc.splitTextToSize(String(valor || ''), 95);
    doc.text(lineas, V, y);
    y += 6 * Math.max(lineas.length, 1) + 1;
  };
  dato('DESARROLLO', (d.desarrolloNombre || '').toUpperCase(), false);
  dato('TIPO DE CRÉDITO', (d.tipoCompra || '').toUpperCase());
  dato('EDIFICIO', edificio);
  dato('DEPARTAMENTO', departamento);
  y += 5;
  dato('NOMBRE DEL CLIENTE', cliente);

  y += 8;
  fila(y, 'PRECIO DE LISTA', fmtN(valorVenta)); y += 6;
  fila(y, 'DESCUENTO', fmtN(0)); y += 3;
  linea(y, L, R, 0.5); y += 5;
  fila(y, 'VALOR DE VENTA NETO', fmtN(valorVenta), true); y += 2;
  linea(y, L, R, 0.3); y += 1; linea(y, L, R, 0.3);

  y += 11;
  fila(y, 'ENGANCHE (+)', fmtN(enganche)); y += 6;
  // Debajo de cada crédito: lo autorizado vs. lo recibido en bancos (solo si hay algo que aclarar).
  const notaFinanciera = (autorizado, recibido) => {
    const a = r2(autorizado);
    if (!(a > 0)) return;
    doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
    if (d.preliminar && r2(recibido) === 0) {
      doc.setTextColor(120, 120, 120);
      doc.text(`Autorizado ${fmtN(a)} — por recibir en bancos`, L + 4, y + 4);
    } else if (r2(a - recibido) !== 0) {
      doc.setTextColor(192, 32, 58);
      doc.text(`Autorizado ${fmtN(a)} · recibido ${fmtN(recibido)} · diferencia ${fmtN(r2(a - recibido))}`, L + 4, y + 4);
    } else { doc.setFontSize(10); doc.setFont('helvetica', 'normal'); return; }
    doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    y += 4;
  };
  fila(y, et.f1.toUpperCase(), fmtN(f1)); notaFinanciera(d.f1Autorizado, f1); y += 6;
  fila(y, et.f2.toUpperCase(), fmtN(f2)); notaFinanciera(d.f2Autorizado, f2); y += 3;
  linea(y, L, R, 0.5); y += 5;
  fila(y, 'TOTAL PAGOS', fmtN(totalPagos), true); y += 2;
  linea(y, L, R, 0.3); y += 1; linea(y, L, R, 0.3);

  y += 14;
  doc.setFontSize(10);
  fila(y, 'DIFERENCIA A PAGAR', fmtN(saldoNeto), true);
  linea(y - 5, R - 38, R, 0.4); linea(y + 2, R - 38, R, 0.4);

  if (cuotas > 0) {
    y += 17;
    doc.setFont('helvetica', 'normal'); doc.text('PAGO DE CUOTAS CONDOMINALES / DOS MESES', L, y);
    doc.setFont('helvetica', 'bold');
    doc.rect(R - 38, y - 5, 38, 8);
    doc.text(fmtN(cuotas), R - 2, y, { align: 'right' });
  }
  const yDetalle = y + 12;

  // Firmas
  const yFirma = 232;
  const firmas = [
    { x: 20, nombre: firmantes.titulacion, rol: 'TITULACIÓN' },
    { x: 82, nombre: firmantes.tesorero, rol: 'TESORERO' },
    { x: 144, nombre: cliente, rol: 'CLIENTE' },
  ];
  firmas.forEach(f => {
    linea(yFirma, f.x, f.x + 56, 0.3);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.text(doc.splitTextToSize(f.nombre || '', 56), f.x + 28, yFirma + 5, { align: 'center' });
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.text(f.rol, f.x + 28, yFirma + 13, { align: 'center' });
  });

  // Detalle de pagos (enganche y depósitos) en dos columnas. Si no cabe arriba de las firmas,
  // pasa completo a una segunda hoja para no encimarse.
  const pagos = (d.pagos || []).filter(p => Number(p.monto)).sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));
  if (pagos.length > 0) {
    const filaH = 4.6;
    const yTope = yFirma - 8;
    const cupo = (yIni) => Math.max(Math.floor((yTope - yIni - 7) / filaH), 0) * 2;
    let yIni = yDetalle;
    if (pagos.length > cupo(yIni)) { doc.addPage(); yIni = 22; }
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
    doc.text('DETALLE DE PAGOS (ENGANCHE Y DEPÓSITOS)', L, yIni);
    linea(yIni + 2, L, R, 0.3);
    doc.setFontSize(8);
    const porCol = Math.ceil(pagos.length / 2);
    const anchoCol = 60;
    pagos.forEach((p, i) => {
      const col = Math.floor(i / porCol);
      const x0 = L + col * (anchoCol + 8);
      const yy = yIni + 8 + (i % porCol) * filaH;
      const f = String(p.fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
      doc.setFont('helvetica', 'normal');
      doc.text(f ? fechaCorta(new Date(Number(f[1]), Number(f[2]) - 1, Number(f[3]))) : '', x0, yy);
      doc.text(fmtN(p.monto), x0 + anchoCol, yy, { align: 'right' });
    });
    doc.setFontSize(10);
  }

  return { doc, cliente };
};
