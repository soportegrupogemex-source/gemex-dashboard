import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import jsPDF from 'jspdf';

const fmt = (n) => `$${Number(n||0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
const COLORES_PLAN = ['#3B82F6', '#F59E0B', '#10B981', '#8B5CF6'];
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
// FIX: Mesa de Control entra a la misma lógica de "solo mis desarrollos"
// que Gerente Editor/Operador — pero además, más abajo, se filtra
// también por vendedor (él + su gente), no todo el desarrollo.
const ROLES_GERENTE = ['Gerente Editor', 'Gerente Operador', 'Mesa de Control'];

function parseFechaLocal(fechaStr) {
  if (!fechaStr) return null;
  // Solo fechas "puras" (YYYY-MM-DD) son día local; los timestamps UTC
  // (created_at) se convierten a hora local real.
  if (typeof fechaStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
    const [y, m, d] = fechaStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(fechaStr);
}

function fechaEfectiva(m) {
  return parseFechaLocal(m.fecha_firma) || parseFechaLocal(m.fecha_apartado) || parseFechaLocal(m.created_at);
}

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export default function DashboardDireccion({ miRol, miAgente }) {
  const isMobile = useIsMobile();
  const [movimientos, setMovimientos] = useState([]);
  const [desarrollos, setDesarrollos] = useState([]);
  const [objetivosData, setObjetivosData] = useState([]);
  const [inventario, setInventario] = useState({ libre: 0, total: 0 });
  const [apartados, setApartados] = useState({ count: 0, monto: 0 });
  const [desarrolloSel, setDesarrolloSel] = useState('');
  // FIX: filtro para ver solo ventas de equipo Gemex o solo de
  // externos (inmobiliarias y asesores independientes)
  const [filtroEquipoVendedor, setFiltroEquipoVendedor] = useState('');
  const [agentesEquipoMap, setAgentesEquipoMap] = useState({});
  // FIX: correos del equipo de un Mesa de Control (él + agentes_cargo),
  // resueltos junto con sus nombres — se usa para filtrar movsFiltrados
  // a "solo lo que él y su gente generan".
  const [equipoExternoCorreos, setEquipoExternoCorreos] = useState([]);
  const [equipoExternoNombres, setEquipoExternoNombres] = useState([]);
  const [periodo, setPeriodo] = useState('semana');
  const [graficaData, setGraficaData] = useState([]);
  const [anioSel, setAnioSel] = useState(new Date().getFullYear());
  const [showFiltros, setShowFiltros] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const mesActual = new Date().getMonth() + 1;

  const desarrollosPermitidos = ROLES_GERENTE.includes(miRol)
    ? desarrollos.filter(d => (miAgente?.desarrollos_cargo || []).includes(d.nombre))
    : desarrollos;
  const nombresPermitidos = desarrollosPermitidos.map(d => d.nombre);

  useEffect(() => { cargarMovimientosYDesarrollos(); cargarAgentesEquipo(); }, []);
  useEffect(() => { cargarInventario(); cargarApartados(); }, [desarrolloSel, desarrollos]);
  useEffect(() => { cargarObjetivos(); }, [anioSel]);
  useEffect(() => { procesarGrafica(); }, [movimientos, periodo, desarrolloSel, anioSel]);

  // FIX: resuelve correos + nombres del equipo de un Mesa de Control (él
  // mismo + sus agentes_cargo) — se usa para limitar el dashboard a "lo
  // que él y su gente generan", no todo el desarrollo.
  useEffect(() => {
    const cargarEquipoExterno = async () => {
      if (miRol !== 'Mesa de Control' || !miAgente?.correo) { setEquipoExternoCorreos([]); setEquipoExternoNombres([]); return; }
      const correos = [miAgente.correo, ...(miAgente.agentes_cargo || [])];
      setEquipoExternoCorreos(correos);
      const { data } = await supabase.from('agentes').select('nombre, apellidos, correo').in('correo', correos);
      setEquipoExternoNombres((data || []).map(a => `${a.nombre || ''} ${a.apellidos || ''}`.trim()).filter(Boolean));
    };
    cargarEquipoExterno();
  }, [miRol, miAgente]);

  useEffect(() => {
    if (miRol === 'Desarrollador' && miAgente?.desarrollos?.length > 0) {
      setDesarrolloSel(miAgente.desarrollos[0]);
    }
  }, [miRol, miAgente]);

  const cargarMovimientosYDesarrollos = async () => {
    const [movs, devs] = await Promise.all([
      supabase.from('movimientos').select('*').order('created_at', { ascending: true }),
      supabase.from('desarrollos').select('id, nombre').eq('activo', true).order('nombre'),
    ]);
    setMovimientos(movs.data || []);
    setDesarrollos(devs.data || []);
  };

  // FIX: para poder filtrar "solo externos" vs "solo Gemex", se
  // necesita saber a qué equipo pertenece cada vendedor — movimientos
  // solo guarda el nombre en texto, así que se cruza contra `agentes`.
  const cargarAgentesEquipo = async () => {
    const { data } = await supabase.from('agentes').select('nombre, apellidos, equipo').limit(10000);
    const mapa = {};
    (data || []).forEach(a => {
      const nombreCompleto = `${a.nombre || ''} ${a.apellidos || ''}`.trim();
      if (nombreCompleto) mapa[nombreCompleto] = a.equipo || 'Gemex';
    });
    setAgentesEquipoMap(mapa);
  };

  const cargarInventario = async () => {
    let baseQuery = supabase.from('inventario');
    let devId = null;
    if (desarrolloSel) {
      const dev = desarrollos.find(d => d.nombre === desarrolloSel);
      if (!dev) { setInventario({ libre: 0, total: 0 }); return; }
      devId = dev.id;
    }

    let totalQuery = baseQuery.select('*', { count: 'exact', head: true });
    let libreQuery = supabase.from('inventario').select('*', { count: 'exact', head: true }).eq('estatus', 'Libre');
    if (devId) {
      totalQuery = totalQuery.eq('desarrollo_id', devId);
      libreQuery = libreQuery.eq('desarrollo_id', devId);
    } else if (ROLES_GERENTE.includes(miRol)) {
      // FIX: si el Gerente no eligió un desarrollo específico ("Todos"),
      // que sume solo los que tiene a su cargo, no el inventario de toda
      // la empresa.
      const idsPermitidos = desarrollosPermitidos.map(d => d.id);
      if (idsPermitidos.length === 0) { setInventario({ libre: 0, total: 0 }); return; }
      totalQuery = totalQuery.in('desarrollo_id', idsPermitidos);
      libreQuery = libreQuery.in('desarrollo_id', idsPermitidos);
    }

    const [{ count: total }, { count: libre }] = await Promise.all([totalQuery, libreQuery]);
    setInventario({ libre: libre || 0, total: total || 0 });
  };

  const cargarObjetivos = async () => {
    const { data } = await supabase.from('objetivos').select('*').eq('año', anioSel);
    setObjetivosData(data || []);
  };

  // FIX: "Apartados activos" en el dashboard — se lee directo del estatus
  // actual de Inventario (que Movimientos.js ya mantiene al día), así que
  // cuando un apartado se convierte en Venta o se Cancela, la unidad deja
  // de tener estatus='Apartado' y desaparece de este conteo solo, sin
  // necesitar lógica aparte para "restar" el histórico.
  const cargarApartados = async () => {
    let query = supabase.from('inventario').select('id').eq('estatus', 'Apartado');
    let devId = null;
    if (desarrolloSel) {
      const dev = desarrollos.find(d => d.nombre === desarrolloSel);
      if (!dev) { setApartados({ count: 0, monto: 0 }); return; }
      devId = dev.id;
      query = query.eq('desarrollo_id', devId);
    } else if (ROLES_GERENTE.includes(miRol)) {
      const idsPermitidos = desarrollosPermitidos.map(d => d.id);
      if (idsPermitidos.length === 0) { setApartados({ count: 0, monto: 0 }); return; }
      query = query.in('desarrollo_id', idsPermitidos);
    }
    const { data: unidades } = await query;
    const ids = (unidades || []).map(u => u.id);
    if (ids.length === 0) { setApartados({ count: 0, monto: 0 }); return; }
    const { data: movs } = await supabase.from('movimientos').select('unidad_id, monto')
      .eq('tipo', 'Apartado').in('unidad_id', ids).order('created_at', { ascending: false });
    // FIX: si por alguna razón hay más de un movimiento "Apartado" para la
    // misma unidad (no debería, pero por si acaso), solo cuenta el más
    // reciente por unidad — order desc + Map se queda con el primero visto.
    const montoPorUnidad = new Map();
    (movs || []).forEach(m => { if (!montoPorUnidad.has(m.unidad_id)) montoPorUnidad.set(m.unidad_id, Number(m.monto || 0)); });
    const monto = [...montoPorUnidad.values()].reduce((s, v) => s + v, 0);
    setApartados({ count: ids.length, monto });
  };

  // FIX: los objetivos ahora respetan tanto el desarrollo seleccionado
  // (ya existía para la tabla mensual, pero faltaba aquí en el total del
  // año) como el filtro de desarrollos permitidos para Gerentes.
  const objetivosVisibles = objetivosData.filter(o =>
    (!desarrolloSel || o.desarrollo_nombre === desarrolloSel) &&
    (desarrolloSel || nombresPermitidos.includes(o.desarrollo_nombre) || nombresPermitidos.length === desarrollos.length)
  );

  const objetivos = {
    unidades: objetivosVisibles.reduce((s,o) => s + (o.meta_unidades||0), 0),
    monto: objetivosVisibles.reduce((s,o) => s + (o.meta_monto||0), 0),
  };
  // FIX: metas de Titulación/Cobranza — mismas columnas de objetivos,
  // filtradas igual que las de Ventas de arriba.
  const objetivosTitulacion = {
    unidades: objetivosVisibles.reduce((s,o) => s + (o.meta_titulacion_unidades||0), 0),
    monto: objetivosVisibles.reduce((s,o) => s + (o.meta_titulacion_monto||0), 0),
  };
  const objetivosCobranza = {
    unidades: objetivosVisibles.reduce((s,o) => s + (o.meta_cobranza_unidades||0), 0),
    monto: objetivosVisibles.reduce((s,o) => s + (o.meta_cobranza_monto||0), 0),
  };

  const aniosDisponibles = [...new Set(movimientos.map(m => fechaEfectiva(m)?.getFullYear()).filter(Boolean))].sort((a,b) => b-a);

  // FIX: cuando no hay un desarrollo específico seleccionado, se limita a
  // los desarrollos permitidos del rol (todos para Admin/Super Admin,
  // solo los suyos para Gerentes) en vez de mostrar la empresa completa.
  // FIX: para Mesa de Control, además se limita a movimientos de SU
  // EQUIPO (él + agentes_cargo) — cruzando por vendedor_correo (confiable)
  // y por nombre como respaldo para movimientos viejos sin ese campo.
  const movsFiltrados = movimientos.filter(m => {
    const f = fechaEfectiva(m);
    const anioMov = f ? f.getFullYear() : null;
    if (anioMov !== anioSel) return false;
    if (desarrolloSel && m.desarrollo_nombre !== desarrolloSel) return false;
    if (!desarrolloSel && !nombresPermitidos.includes(m.desarrollo_nombre)) return false;
    if (miRol === 'Mesa de Control') {
      const esDeMiEquipo = equipoExternoCorreos.includes(m.vendedor_correo) || equipoExternoNombres.includes(m.vendedor);
      if (!esDeMiEquipo) return false;
    }
    // FIX: filtro por equipo del vendedor (Gemex vs externos)
    if (filtroEquipoVendedor) {
      const equipoVendedor = agentesEquipoMap[m.vendedor] || 'Gemex';
      if (filtroEquipoVendedor === 'Gemex' && equipoVendedor !== 'Gemex') return false;
      if (filtroEquipoVendedor === 'Externos' && equipoVendedor === 'Gemex') return false;
    }
    return true;
  });

  const vendidas = movsFiltrados.filter(m => m.tipo === 'Vendida');
  const totalVendidas = vendidas.length;
  const totalMonto = vendidas.reduce((s,m) => s + Number(m.monto||0), 0);
  const pctU = objetivos.unidades > 0 ? Math.min(100, Math.round((totalVendidas/objetivos.unidades)*100)) : 0;
  const pctM = objetivos.monto > 0 ? Math.min(100, Math.round((totalMonto/objetivos.monto)*100)) : 0;

  const pctDisp = inventario.total > 0 ? Math.round((inventario.libre/inventario.total)*100) : 0;
  const ticketProm = totalVendidas > 0 ? totalMonto / totalVendidas : 0;

  // FIX: el Consolidado (tarjetas de arriba) ahora tambien se puede ver
  // por Semana/Mes además de por Año — reutiliza el mismo selector
  // `periodo` que ya manejaban las gráficas de abajo. "vendidas" /
  // "totalVendidas" / etc. de arriba se DEJAN intactas (siguen siendo
  // el total del año, las usan la tabla mensual y el PDF); estas de
  // aquí son variables nuevas y paralelas, solo para las tarjetas.
  const rangoConsolidado = (() => {
    const hoy = new Date(); hoy.setHours(23,59,59,999);
    if (periodo === 'semana') {
      const inicio = new Date(); inicio.setDate(inicio.getDate() - 6); inicio.setHours(0,0,0,0);
      return { inicio, fin: hoy };
    }
    if (periodo === 'mes') {
      // Mes calendario en curso (día 1 a hoy), no "últimos 30 días": esos
      // 30 días arrastraban ventas del mes anterior.
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      return { inicio, fin: hoy };
    }
    return { inicio: new Date(anioSel, 0, 1), fin: new Date(anioSel, 11, 31, 23, 59, 59, 999) };
  })();
  const movsPeriodo = movsFiltrados.filter(m => { const f = fechaEfectiva(m); return f && f >= rangoConsolidado.inicio && f <= rangoConsolidado.fin; });

  const vendidasP = movsPeriodo.filter(m => m.tipo === 'Vendida');
  const totalVendidasP = vendidasP.length;
  const totalMontoP = vendidasP.reduce((s,m) => s + Number(m.monto||0), 0);
  const ticketPromP = totalVendidasP > 0 ? totalMontoP / totalVendidasP : 0;

  const tituladasP = movsPeriodo.filter(m => m.tipo === 'Titulación');
  const totalTituladasP = tituladasP.length;
  const totalMontoTitulacionP = tituladasP.reduce((s,m) => s + Number(m.monto||0), 0);

  const cobradasP = movsPeriodo.filter(m => m.tipo === 'Cobranza');
  const totalCobradasP = cobradasP.length;
  const totalMontoCobranzaP = cobradasP.reduce((s,m) => s + Number(m.monto||0), 0);

  // FIX: la meta contra la que se compara también depende del periodo —
  // en Año se usa la meta del año completo (ya calculada arriba); en Mes
  // se usa solo la meta del mes en curso (más justo que comparar contra
  // el año entero); en Semana no existe un concepto de "meta semanal" en
  // Objetivos, así que se omite la comparación (barra en 0, sin "Meta:").
  const objetivosMesActual = objetivosData.filter(o => o.mes === mesActual &&
    (!desarrolloSel || o.desarrollo_nombre === desarrolloSel) &&
    (desarrolloSel || nombresPermitidos.includes(o.desarrollo_nombre) || nombresPermitidos.length === desarrollos.length));
  const sumMes = (col) => objetivosMesActual.reduce((s,o) => s + (o[col]||0), 0);
  const metaMesActual = {
    ventas: { unidades: sumMes('meta_unidades'), monto: sumMes('meta_monto') },
    titulacion: { unidades: sumMes('meta_titulacion_unidades'), monto: sumMes('meta_titulacion_monto') },
    cobranza: { unidades: sumMes('meta_cobranza_unidades'), monto: sumMes('meta_cobranza_monto') },
  };
  const metaSegunPeriodo = (metaAnual, metaMensual) =>
    periodo === 'año' ? metaAnual : periodo === 'mes' ? metaMensual : { unidades: 0, monto: 0 };

  const metaVentasP = metaSegunPeriodo(objetivos, metaMesActual.ventas);
  const metaTitulacionP = metaSegunPeriodo(objetivosTitulacion, metaMesActual.titulacion);
  const metaCobranzaP = metaSegunPeriodo(objetivosCobranza, metaMesActual.cobranza);

  const pct = (real, meta) => meta > 0 ? Math.min(100, Math.round((real/meta)*100)) : 0;
  const pctUP = pct(totalVendidasP, metaVentasP.unidades);
  const pctMP = pct(totalMontoP, metaVentasP.monto);
  const pctTitUP = pct(totalTituladasP, metaTitulacionP.unidades);
  const pctTitMP = pct(totalMontoTitulacionP, metaTitulacionP.monto);
  const pctCobUP = pct(totalCobradasP, metaCobranzaP.unidades);
  const pctCobMP = pct(totalMontoCobranzaP, metaCobranzaP.monto);

  const tablaObjetivosMes = MESES.map((nombreMes, i) => {
    const mesNum = i + 1;
    const objMes = objetivosData.filter(o =>
      o.mes === mesNum &&
      (!desarrolloSel || o.desarrollo_nombre === desarrolloSel) &&
      (desarrolloSel || nombresPermitidos.includes(o.desarrollo_nombre) || nombresPermitidos.length === desarrollos.length)
    );
    const metaU = objMes.reduce((s,o) => s + (o.meta_unidades||0), 0);
    const metaM = objMes.reduce((s,o) => s + (o.meta_monto||0), 0);
    const vendasMes = vendidas.filter(m => { const f = fechaEfectiva(m); return f && (f.getMonth() + 1) === mesNum; });
    const realU = vendasMes.length;
    const realM = vendasMes.reduce((s,m) => s + Number(m.monto||0), 0);
    const pctU = metaU > 0 ? Math.min(100, Math.round((realU/metaU)*100)) : realU > 0 ? 100 : 0;
    const pctM = metaM > 0 ? Math.min(100, Math.round((realM/metaM)*100)) : realM > 0 ? 100 : 0;
    return { mes: nombreMes, mesNum, metaU, metaM, realU, realM, pctU, pctM };
  });

  const mesCurrent = tablaObjetivosMes[mesActual - 1];

  const handleDescargarPDF = () => {
    setGenerandoPDF(true);
    try {
      const doc = new jsPDF('l', 'mm', 'letter');
      const titulo = desarrolloSel || 'Consolidado General';
      const fecha = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      doc.setFillColor(26, 26, 46);
      doc.rect(0, 0, pageW, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(`Reporte Objetivos vs Real — ${titulo}`, 10, 10);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Año: ${anioSel}   |   ${fecha}`, 10, 17);

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMEN DEL AÑO', 10, 30);
      doc.setFont('helvetica', 'normal');
      doc.text(`Unidades vendidas: ${totalVendidas} / Meta: ${objetivos.unidades} (${pctU}%)`, 10, 37);
      doc.text(`Monto vendido: ${fmt(totalMonto)} / Meta: ${fmt(objetivos.monto)} (${pctM}%)`, 10, 43);
      doc.text(`Ticket promedio: ${fmt(ticketProm)}`, 160, 37);
      doc.text(`Disponibilidad: ${inventario.libre} de ${inventario.total} libres (${pctDisp}%)`, 160, 43);

      const cols = [30, 22, 22, 18, 44, 44, 18];
      const headers = ['Mes', 'Meta Ud.', 'Real Ud.', '% Ud.', 'Meta Monto', 'Real Monto', '% Monto'];
      let y = 52;
      const rowH = 7;

      doc.setFillColor(26, 26, 46);
      doc.rect(10, y, pageW - 20, rowH, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      let x = 10;
      headers.forEach((h, i) => {
        doc.text(h, x + 2, y + 5);
        x += cols[i];
      });
      y += rowH;

      tablaObjetivosMes.forEach((fila, idx) => {
        const esMesActual = fila.mesNum === mesActual;
        if (esMesActual) {
          doc.setFillColor(240, 253, 244);
        } else if (idx % 2 === 0) {
          doc.setFillColor(248, 248, 248);
        } else {
          doc.setFillColor(255, 255, 255);
        }
        doc.rect(10, y, pageW - 20, rowH, 'F');

        x = 10;
        const cells = [
          fila.mes + (esMesActual ? ' <' : ''),
          String(fila.metaU || '—'),
          String(fila.realU || '—'),
          (fila.metaU > 0 || fila.realU > 0) ? `${fila.pctU}%` : '—',
          fila.metaM > 0 ? fmt(fila.metaM) : '—',
          fila.realM > 0 ? fmt(fila.realM) : '—',
          (fila.metaM > 0 || fila.realM > 0) ? `${fila.pctM}%` : '—',
        ];

        cells.forEach((cell, i) => {
          if ((i === 3 || i === 6) && cell !== '—') {
            const val = parseInt(cell);
            if (val >= 100) doc.setTextColor(16, 185, 129);
            else if (val >= 70) doc.setTextColor(245, 158, 11);
            else doc.setTextColor(239, 68, 68);
            doc.setFont('helvetica', 'bold');
          } else {
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
          }
          doc.setFontSize(8);
          doc.text(cell, x + 2, y + 5);
          x += cols[i];
        });

        doc.setDrawColor(230, 230, 230);
        doc.line(10, y + rowH, pageW - 10, y + rowH);
        y += rowH;
      });

      doc.setFillColor(210, 210, 210);
      doc.rect(10, y, pageW - 20, rowH, 'F');
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      x = 10;
      const totales = [
        `Total ${anioSel}`,
        String(objetivos.unidades),
        String(totalVendidas),
        `${pctU}%`,
        fmt(objetivos.monto),
        fmt(totalMonto),
        `${pctM}%`,
      ];
      totales.forEach((cell, i) => {
        doc.text(cell, x + 2, y + 5);
        x += cols[i];
      });

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text(`Gemex CRM — ${titulo} — ${anioSel}`, 10, pageH - 5);

      doc.save(`Reporte_${titulo.replace(/\s/g,'_')}_${anioSel}.pdf`);
    } catch (err) {
      console.error('Error PDF:', err);
      alert('Error al generar el PDF: ' + err.message);
    }
    setGenerandoPDF(false);
  };

  const procesarGrafica = () => {
    let labels = [];
    if (periodo === 'semana') {
      const ahora = new Date();
      labels = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(ahora); d.setDate(ahora.getDate() - 6 + i); d.setHours(0,0,0,0);
        const fin = new Date(d); fin.setHours(23,59,59,999);
        return { label: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()], inicio: d, fin };
      });
    } else if (periodo === 'mes') {
      const ahora = new Date();
      const diasDelMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
      labels = Array.from({ length: diasDelMes }, (_, i) => {
        const d = new Date(ahora.getFullYear(), ahora.getMonth(), i + 1);
        const fin = new Date(d); fin.setHours(23,59,59,999);
        return { label: `${d.getDate()}`, inicio: d, fin };
      });
    } else {
      labels = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(anioSel, i, 1);
        const fin = new Date(anioSel, i + 1, 0); fin.setHours(23,59,59,999);
        return { label: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][i], inicio: d, fin };
      });
    }
    const data = labels.map(({ label, inicio, fin }) => {
      const movs = movsFiltrados.filter(m => { const f = fechaEfectiva(m); return f && f >= inicio && f <= fin && m.tipo === 'Vendida'; });
      return { label, count: movs.length, monto: movs.reduce((s,m) => s + Number(m.monto||0), 0) };
    });
    setGraficaData(data);
  };

  const planesData = (() => {
    const planes = {};
    vendidas.forEach(m => { planes[m.plan_pago || 'Sin plan'] = (planes[m.plan_pago || 'Sin plan'] || 0) + 1; });
    return Object.entries(planes).map(([k,v]) => ({ nombre: k, count: v }));
  })();
  const totalPlanes = planesData.reduce((s,p) => s + p.count, 0);

  const vendedoresData = (() => {
    const vends = {};
    vendidas.forEach(m => { const v = m.vendedor || 'Sin asignar'; vends[v] = (vends[v] || 0) + Number(m.monto||0); });
    return Object.entries(vends).sort((a,b) => b[1]-a[1]).slice(0,8).map(([k,v]) => ({ nombre: k, monto: v }));
  })();
  const maxVendedor = vendedoresData[0]?.monto || 1;

  const acumU = graficaData.reduce((acc, d, i) => { acc.push((acc[i-1]||0) + d.count); return acc; }, []);
  const acumM = graficaData.reduce((acc, d, i) => { acc.push((acc[i-1]||0) + d.monto); return acc; }, []);
  const maxAcumU = Math.max(...acumU, 1);
  const maxAcumM = Math.max(...acumM, 1);
  const maxBarra = Math.max(...graficaData.map(d => d.count), 1);

  const lineaSVG = (datos, max, color, h=100) => {
    if (!datos.length) return null;
    const w = 400;
    const pts = datos.map((v,i) => `${(i/(datos.length-1))*w},${h-(v/max)*(h-8)}`).join(' ');
    return (
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id={`grad_${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.15"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#grad_${color.replace('#','')})`} />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
        {datos.map((v,i) => v > 0 && <circle key={i} cx={(i/(datos.length-1))*w} cy={h-(v/max)*(h-8)} r="3" fill={color} />)}
      </svg>
    );
  };

  const Dona = ({ data, total }) => {
    if (!total) return <div style={{ textAlign:'center', color:'#aaa', padding:'1rem' }}>Sin datos</div>;
    let offset = 0;
    const r = 60; const cx = 80; const cy = 80;
    return (
      <svg width="160" height="160" viewBox="0 0 160 160" style={{ flexShrink: 0 }}>
        {data.map((p, i) => {
          const angle = (p.count / total) * 360;
          const startAngle = offset; offset += angle;
          const toRad = a => (a - 90) * Math.PI / 180;
          const x1 = cx + r * Math.cos(toRad(startAngle));
          const y1 = cy + r * Math.sin(toRad(startAngle));
          const x2 = cx + r * Math.cos(toRad(startAngle + angle));
          const y2 = cy + r * Math.sin(toRad(startAngle + angle));
          return <path key={i} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${angle > 180 ? 1 : 0} 1 ${x2} ${y2} Z`} fill={COLORES_PLAN[i % COLORES_PLAN.length]} stroke="#fff" strokeWidth="2" />;
        })}
        <circle cx={cx} cy={cy} r="38" fill="#fff" />
        <text x={cx} y={cy-6} textAnchor="middle" fontSize="14" fontWeight="700" fill="#1a1a2e">{total}</text>
        <text x={cx} y={cy+10} textAnchor="middle" fontSize="9" fill="#888">ventas</text>
      </svg>
    );
  };

  const LABELS_P = { semana: 'Semana', mes: 'Mes', año: 'Año' };

  const Tarjeta = ({ label, valor, meta, pctLabel, pct, color, barColor }) => (
    <div style={{ background: '#fff', border: `2px solid ${color}`, borderRadius: '12px', padding: isMobile ? '12px' : '16px', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '10px', right: '10px', width: '8px', height: '8px', borderRadius: '50%', background: color }} />
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: '#1a1a2e' }}>{valor}</div>
      {meta && <div style={{ fontSize: '11px', color: '#888' }}>{meta}</div>}
      <div style={{ height: '4px', background: '#f0f0f0', borderRadius: '2px', margin: '8px 0 4px' }}>
        <div style={{ height: '100%', background: barColor || color, borderRadius: '2px', width: `${pct}%` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#888' }}>
        <span>{pctLabel}</span><span>{pct}%</span>
      </div>
    </div>
  );

  const colorPct = (pct) => pct >= 100 ? '#10B981' : pct >= 70 ? '#F59E0B' : '#EF4444';

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isMobile ? '8px' : '0' }}>
          <div>
            <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '2px' }}>
              {desarrolloSel || 'Consolidado General'}
            </h2>
            <div style={{ fontSize: '12px', color: '#888' }}>
              Dashboard de dirección{miRol === 'Mesa de Control' ? ' — tú y tu equipo' : ''}
            </div>
          </div>
          {isMobile ? (
            miRol !== 'Desarrollador' && (
              <button onClick={() => setShowFiltros(f => !f)}
                style={{ padding: '8px 14px', border: '0.5px solid #ddd', borderRadius: '8px', background: showFiltros ? '#C0203A' : '#fff', color: showFiltros ? '#fff' : '#333', fontSize: '13px', cursor: 'pointer' }}>
                ⚙️ Filtros
              </button>
            )
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#888' }}>Año:</span>
              <select value={anioSel} onChange={e => setAnioSel(parseInt(e.target.value))}
                style={{ padding: '8px 12px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', background: '#fff' }}>
                {(aniosDisponibles.length > 0 ? aniosDisponibles : [new Date().getFullYear()]).map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              {miRol !== 'Desarrollador' && (
                <select value={desarrolloSel} onChange={e => setDesarrolloSel(e.target.value)}
                  style={{ padding: '8px 14px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', background: '#fff', minWidth: '180px' }}>
                  <option value=''>Todos los proyectos</option>
                  {desarrollosPermitidos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
                </select>
              )}
              {miRol !== 'Desarrollador' && miRol !== 'Mesa de Control' && (
                <select value={filtroEquipoVendedor} onChange={e => setFiltroEquipoVendedor(e.target.value)}
                  style={{ padding: '8px 14px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', background: '#fff', minWidth: '160px' }}>
                  <option value=''>Todos los equipos</option>
                  <option value='Gemex'>Solo Gemex</option>
                  <option value='Externos'>Solo externos</option>
                </select>
              )}
              <button onClick={handleDescargarPDF} disabled={generandoPDF}
                style={{ padding: '8px 16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {generandoPDF ? 'Generando...' : '⬇ Descargar Reporte'}
              </button>
            </div>
          )}
        </div>

        {isMobile && showFiltros && miRol !== 'Desarrollador' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: '#f9f9f9', borderRadius: '8px', marginTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#888', whiteSpace: 'nowrap' }}>Año:</span>
              <select value={anioSel} onChange={e => setAnioSel(parseInt(e.target.value))}
                style={{ flex: 1, padding: '10px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '14px', background: '#fff' }}>
                {(aniosDisponibles.length > 0 ? aniosDisponibles : [new Date().getFullYear()]).map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <select value={desarrolloSel} onChange={e => setDesarrolloSel(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '14px', background: '#fff' }}>
              <option value=''>Todos los proyectos</option>
              {desarrollosPermitidos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
            </select>
            {miRol !== 'Mesa de Control' && (
              <select value={filtroEquipoVendedor} onChange={e => setFiltroEquipoVendedor(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '14px', background: '#fff' }}>
                <option value=''>Todos los equipos</option>
                <option value='Gemex'>Solo Gemex</option>
                <option value='Externos'>Solo externos</option>
              </select>
            )}
            <button onClick={handleDescargarPDF} disabled={generandoPDF}
              style={{ padding: '10px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
              {generandoPDF ? 'Generando...' : '⬇ Descargar Reporte PDF'}
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '12px', color: '#888', marginRight: '2px' }}>Consolidado:</span>
        {['semana','mes','año'].map(p => (
          <button key={p} onClick={() => setPeriodo(p)}
            style={{ padding: isMobile ? '8px 14px' : '4px 14px', borderRadius: '20px', border: '0.5px solid', fontSize: isMobile ? '13px' : '12px', cursor: 'pointer',
              background: periodo === p ? '#C0203A' : '#fff', color: periodo === p ? '#fff' : '#666', borderColor: periodo === p ? '#C0203A' : '#ddd' }}>
            {LABELS_P[p]}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: '10px', marginBottom: '1.5rem' }}>
        <Tarjeta label="Unidades Vendidas" valor={totalVendidasP}
          meta={metaVentasP.unidades > 0 ? `Meta: ${metaVentasP.unidades}` : null}
          pctLabel="Progreso" pct={pctUP} color="#10B981" />
        <Tarjeta label="Monto Vendido" valor={fmt(totalMontoP)}
          meta={metaVentasP.monto > 0 ? `Meta: ${fmt(metaVentasP.monto)}` : null}
          pctLabel="Progreso" pct={pctMP} color="#10B981" />
        <div style={{ background: '#fff', border: '2px solid #EC4899', borderRadius: '12px', padding: isMobile ? '12px' : '16px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '10px', right: '10px', width: '8px', height: '8px', borderRadius: '50%', background: '#EC4899' }} />
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Apartados Activos</div>
          <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: '#1a1a2e' }}>{apartados.count}</div>
          <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{fmt(apartados.monto)} en proceso</div>
        </div>
        <Tarjeta label="Disponibilidad" valor={inventario.libre}
          meta={`De ${inventario.total} totales`}
          pctLabel="Libres" pct={pctDisp} color="#e0e0e0" barColor="#3B82F6" />
        <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: isMobile ? '12px' : '16px' }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Ticket Promedio</div>
          <div style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#1a1a2e' }}>{fmt(ticketPromP)}</div>
          <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>Por unidad vendida</div>
        </div>
      </div>

      {/* FIX: Titulación y Cobranza — real (movimientos de esos tipos)
          vs meta (Objetivos), mismo patrón que las tarjetas de Ventas. */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '1.5rem' }}>
        <Tarjeta label="Unidades Tituladas" valor={totalTituladasP}
          meta={metaTitulacionP.unidades > 0 ? `Meta: ${metaTitulacionP.unidades}` : null}
          pctLabel="Progreso" pct={pctTitUP} color="#6366F1" />
        <Tarjeta label="Monto Titulado" valor={fmt(totalMontoTitulacionP)}
          meta={metaTitulacionP.monto > 0 ? `Meta: ${fmt(metaTitulacionP.monto)}` : null}
          pctLabel="Progreso" pct={pctTitMP} color="#6366F1" />
        <Tarjeta label="Unidades Cobradas" valor={totalCobradasP}
          meta={metaCobranzaP.unidades > 0 ? `Meta: ${metaCobranzaP.unidades}` : null}
          pctLabel="Progreso" pct={pctCobUP} color="#14B8A6" />
        <Tarjeta label="Monto Cobrado" valor={fmt(totalMontoCobranzaP)}
          meta={metaCobranzaP.monto > 0 ? `Meta: ${fmt(metaCobranzaP.monto)}` : null}
          pctLabel="Progreso" pct={pctCobMP} color="#14B8A6" />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '10px' }}>
          Objetivos vs Real — {MESES[mesActual - 1]} {anioSel}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px' }}>
          <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>Unidades — {MESES[mesActual-1]}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
              <div>
                <div style={{ fontSize: '22px', fontWeight: '700', color: '#1a1a2e' }}>{mesCurrent.realU}</div>
                <div style={{ fontSize: '10px', color: '#888' }}>Real</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '16px', fontWeight: '500', color: '#aaa' }}>{mesCurrent.metaU}</div>
                <div style={{ fontSize: '10px', color: '#aaa' }}>Meta</div>
              </div>
            </div>
            <div style={{ height: '6px', background: '#f0f0f0', borderRadius: '3px', marginBottom: '4px' }}>
              <div style={{ height: '100%', background: colorPct(mesCurrent.pctU), borderRadius: '3px', width: `${mesCurrent.pctU}%`, transition: 'width 0.5s' }} />
            </div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: colorPct(mesCurrent.pctU) }}>{mesCurrent.pctU}% cumplido</div>
          </div>
          <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>Monto — {MESES[mesActual-1]}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
              <div>
                <div style={{ fontSize: isMobile ? '14px' : '18px', fontWeight: '700', color: '#1a1a2e' }}>{fmt(mesCurrent.realM)}</div>
                <div style={{ fontSize: '10px', color: '#888' }}>Real</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#aaa' }}>{fmt(mesCurrent.metaM)}</div>
                <div style={{ fontSize: '10px', color: '#aaa' }}>Meta</div>
              </div>
            </div>
            <div style={{ height: '6px', background: '#f0f0f0', borderRadius: '3px', marginBottom: '4px' }}>
              <div style={{ height: '100%', background: colorPct(mesCurrent.pctM), borderRadius: '3px', width: `${mesCurrent.pctM}%`, transition: 'width 0.5s' }} />
            </div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: colorPct(mesCurrent.pctM) }}>{mesCurrent.pctM}% cumplido</div>
          </div>
          <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>Unidades Acumuladas {anioSel}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
              <div>
                <div style={{ fontSize: '22px', fontWeight: '700', color: '#1a1a2e' }}>{totalVendidas}</div>
                <div style={{ fontSize: '10px', color: '#888' }}>Real</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '16px', fontWeight: '500', color: '#aaa' }}>{objetivos.unidades}</div>
                <div style={{ fontSize: '10px', color: '#aaa' }}>Meta</div>
              </div>
            </div>
            <div style={{ height: '6px', background: '#f0f0f0', borderRadius: '3px', marginBottom: '4px' }}>
              <div style={{ height: '100%', background: colorPct(pctU), borderRadius: '3px', width: `${pctU}%`, transition: 'width 0.5s' }} />
            </div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: colorPct(pctU) }}>{pctU}% del año</div>
          </div>
          <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>Monto Acumulado {anioSel}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
              <div>
                <div style={{ fontSize: isMobile ? '14px' : '18px', fontWeight: '700', color: '#1a1a2e' }}>{fmt(totalMonto)}</div>
                <div style={{ fontSize: '10px', color: '#888' }}>Real</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: '500', color: '#aaa' }}>{fmt(objetivos.monto)}</div>
                <div style={{ fontSize: '10px', color: '#aaa' }}>Meta</div>
              </div>
            </div>
            <div style={{ height: '6px', background: '#f0f0f0', borderRadius: '3px', marginBottom: '4px' }}>
              <div style={{ height: '100%', background: colorPct(pctM), borderRadius: '3px', width: `${pctM}%`, transition: 'width 0.5s' }} />
            </div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: colorPct(pctM) }}>{pctM}% del año</div>
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', overflow: 'auto', marginBottom: '1.5rem' }}>
        <div style={{ padding: '16px 16px 8px', fontSize: '14px', fontWeight: '600', color: '#1a1a2e', borderBottom: '0.5px solid #f0f0f0' }}>
          Objetivos vs Real por Mes — {anioSel}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '700px' }}>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '0.5px solid #e0e0e0' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '600', color: '#555', width: '100px' }}>Mes</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '500', color: '#555' }}>Meta Ud.</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '500', color: '#555' }}>Real Ud.</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '500', color: '#555' }}>% Ud.</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '500', color: '#555' }}>Meta Monto</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '500', color: '#555' }}>Real Monto</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '500', color: '#555' }}>% Monto</th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '500', color: '#555', minWidth: '120px' }}>Progreso</th>
            </tr>
          </thead>
          <tbody>
            {tablaObjetivosMes.map((fila, i) => {
              const esMesActual = fila.mesNum === mesActual;
              const sinDatos = fila.metaU === 0 && fila.realU === 0;
              return (
                <tr key={i} style={{
                  borderBottom: '0.5px solid #f0f0f0',
                  background: esMesActual ? '#F0FDF4' : sinDatos ? '#fafafa' : '#fff',
                  opacity: sinDatos ? 0.5 : 1,
                }}>
                  <td style={{ padding: '10px 16px', fontWeight: esMesActual ? '700' : '500', color: esMesActual ? '#1a1a2e' : '#555' }}>
                    {fila.mes} {esMesActual && <span style={{ fontSize: '9px', background: '#10B981', color: '#fff', borderRadius: '4px', padding: '1px 5px', marginLeft: '4px' }}>HOY</span>}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: '#888' }}>{fila.metaU || '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '600', color: '#1a1a2e' }}>{fila.realU || '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {fila.metaU > 0 || fila.realU > 0 ? (
                      <span style={{ fontWeight: '700', color: colorPct(fila.pctU) }}>{fila.pctU}%</span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: '#888', fontSize: '11px' }}>{fila.metaM > 0 ? fmt(fila.metaM) : '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '600', color: '#1a1a2e', fontSize: '11px' }}>{fila.realM > 0 ? fmt(fila.realM) : '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {fila.metaM > 0 || fila.realM > 0 ? (
                      <span style={{ fontWeight: '700', color: colorPct(fila.pctM) }}>{fila.pctM}%</span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {(fila.metaU > 0 || fila.realU > 0) ? (
                      <div style={{ height: '6px', background: '#f0f0f0', borderRadius: '3px' }}>
                        <div style={{ height: '100%', background: colorPct(fila.pctU), borderRadius: '3px', width: `${fila.pctU}%` }} />
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            <tr style={{ borderTop: '2px solid #e0e0e0', background: '#f0f0f0', fontWeight: '700' }}>
              <td style={{ padding: '10px 16px', color: '#1a1a2e' }}>Total {anioSel}</td>
              <td style={{ padding: '10px 12px', textAlign: 'center', color: '#555' }}>{objetivos.unidades}</td>
              <td style={{ padding: '10px 12px', textAlign: 'center', color: '#1a1a2e' }}>{totalVendidas}</td>
              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                <span style={{ color: colorPct(pctU), fontWeight: '700' }}>{pctU}%</span>
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'center', color: '#555', fontSize: '11px' }}>{fmt(objetivos.monto)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'center', color: '#1a1a2e', fontSize: '11px' }}>{fmt(totalMonto)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                <span style={{ color: colorPct(pctM), fontWeight: '700' }}>{pctM}%</span>
              </td>
              <td style={{ padding: '10px 16px' }}>
                <div style={{ height: '6px', background: '#e0e0e0', borderRadius: '3px' }}>
                  <div style={{ height: '100%', background: colorPct(pctU), borderRadius: '3px', width: `${pctU}%` }} />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '1.5rem' }}>
        <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '1.25rem' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '4px' }}>Acumulado {LABELS_P[periodo]} — Monto</div>
          <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '8px' }}>0 → {fmt(acumM[acumM.length-1]||0)}</div>
          {lineaSVG(acumM, maxAcumM, '#3B82F6')}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#aaa', marginTop: '4px' }}>
            {graficaData.filter((_,i) => i % Math.ceil(graficaData.length/6) === 0).map((d,i) => <span key={i}>{d.label}</span>)}
          </div>
        </div>
        <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '1.25rem' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '4px' }}>Acumulado {LABELS_P[periodo]} — Unidades</div>
          <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '8px' }}>0 → {acumU[acumU.length-1]||0}</div>
          {lineaSVG(acumU, maxAcumU, '#10B981')}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#aaa', marginTop: '4px' }}>
            {graficaData.filter((_,i) => i % Math.ceil(graficaData.length/6) === 0).map((d,i) => <span key={i}>{d.label}</span>)}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '1.5rem' }}>
        <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '1.25rem' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '1rem' }}>Distribución por Plan de Pago</div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <Dona data={planesData} total={totalPlanes} />
            <div style={{ flex: 1 }}>
              {planesData.map((p,i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: COLORES_PLAN[i%COLORES_PLAN.length], flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: '12px', color: '#333' }}>{p.nombre}</div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#1a1a2e' }}>{p.count}</div>
                </div>
              ))}
              {!planesData.length && <div style={{ fontSize: '12px', color: '#aaa' }}>Sin datos</div>}
            </div>
          </div>
        </div>
        <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '1.25rem' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '1rem' }}>Ventas por Vendedor</div>
          {vendedoresData.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#aaa', textAlign: 'center', padding: '2rem' }}>Sin datos</div>
          ) : vendedoresData.map((v,i) => (
            <div key={i} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                <span style={{ color: '#333', flex: 1, marginRight: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nombre}</span>
                <span style={{ fontWeight: '600', color: '#1a1a2e', whiteSpace: 'nowrap' }}>{fmt(v.monto)}</span>
              </div>
              <div style={{ height: '6px', background: '#f0f0f0', borderRadius: '3px' }}>
                <div style={{ height: '100%', background: '#3B82F6', borderRadius: '3px', width: `${(v.monto/maxVendedor)*100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '1rem' }}>
          Unidades Vendidas por {LABELS_P[periodo]} {periodo === 'año' ? `(${anioSel})` : ''}
        </div>
        {graficaData.every(d => d.count === 0) ? (
          <div style={{ textAlign: 'center', color: '#aaa', padding: '2rem', fontSize: '13px' }}>Sin ventas en este período</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: isMobile ? '2px' : '4px', height: '140px', paddingBottom: '24px', overflowX: isMobile ? 'auto' : 'visible' }}>
            {graficaData.map((d,i) => (
              <div key={i} style={{ flex: 1, minWidth: isMobile ? '28px' : 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', position: 'relative' }}>
                {d.count > 0 && <div style={{ fontSize: '10px', color: '#C0203A', marginBottom: '2px', fontWeight: '600' }}>{d.count}</div>}
                <div style={{ width: '100%', background: '#8B5CF6', borderRadius: '4px 4px 0 0', height: `${(d.count/maxBarra)*110}px`, minHeight: d.count > 0 ? '4px' : '0' }} />
                <div style={{ fontSize: '9px', color: '#aaa', position: 'absolute', bottom: '-20px', whiteSpace: 'nowrap' }}>{d.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}