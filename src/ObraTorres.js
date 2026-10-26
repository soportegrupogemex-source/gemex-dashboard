import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from './supabase';
import { usePuede } from './PermisosContext';
import { fmtDinero, InputDinero } from './dinero';

// Programa de obra — frentes (torres, trenes de viviendas…), partidas y subpartidas, catálogo de partidas de mano de obra, programa semanal y avance real (%).
//  - Cada torre (Los Arrayanes, Torre L…) tiene una fecha de arranque (lunes de la semana 1);
//    el programa guarda semana + día y las fechas se calculan desde ahí.
//  - Construcción captura el % acumulado de cada partida; al llegar a 100% queda terminada
//    (lo hace un trigger en la base de datos).
//  - Avance de la torre / etapa: ponderado por presupuesto si todas las partidas con cantidad
//    ya tienen precio; si no, por días programados.
const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const TOLERANCIA = 5; // puntos de % para considerar una partida atrasada
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parse = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const hoyISO = () => iso(new Date());
const lunesDe = (s) => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const sumaDias = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const fechaDe = (arranque, semana, dia) => sumaDias(arranque, (semana - 1) * 7 + (dia - 1));
export const fechaCorta = (s) => { const d = parse(s); return `${d.getDate()} ${MESES[d.getMonth()]}`; };
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
export const $ = (n) => fmtDinero(n, { centavos: true });
const fmtN = (n, dec = 2) => Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: dec });
export const pct1 = (n) => `${Math.round((Number(n) || 0) * 10) / 10}%`;

// Pagina las consultas (PostgREST devuelve máximo 1000 filas por llamada).
export async function traerTodo(construir) {
  const todo = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await construir().range(desde, desde + 999);
    if (error) throw error;
    todo.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return todo;
}


export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

const btn = { padding: '6px 12px', border: '0.5px solid #ddd', borderRadius: '6px', background: '#fff', color: '#555', fontSize: '12px', cursor: 'pointer' };
const inp = { padding: '6px 8px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' };

// Métricas de un conjunto de partidas. prog = Map(partida_id -> [{semana, dia}])
export function resumen(partidas, prog, arranque) {
  const hoy = hoyISO();
  const arrDe = (p) => (typeof arranque === 'function' ? arranque(p) : arranque);
  const usaPresupuesto = partidas.some(p => Number(p.precio_unitario) > 0) &&
    partidas.every(p => !(Number(p.cantidad) > 0) || Number(p.precio_unitario) > 0);
  const peso = (p) => {
    const dias = (prog.get(p.id) || []).length;
    return usaPresupuesto ? (Number(p.cantidad) || 0) * (Number(p.precio_unitario) || 0) : Math.max(dias, 1);
  };
  let wTot = 0, wReal = 0, wProg = 0, wRealProg = 0, wConProg = 0, terminadas = 0, atrasadas = 0;
  partidas.forEach(p => {
    const w = peso(p);
    wTot += w; wReal += w * Number(p.avance_pct || 0);
    if (p.terminada_en || Number(p.avance_pct) >= 100) terminadas++;
    const dias = prog.get(p.id) || [];
    const arr = arrDe(p);
    if (arr && dias.length > 0) {
      const transcurridos = dias.filter(x => fechaDe(arr, x.semana, x.dia) <= hoy).length;
      const pp = (transcurridos / dias.length) * 100;
      wConProg += w; wProg += w * pp; wRealProg += w * Number(p.avance_pct || 0);
      if (Number(p.avance_pct) < pp - TOLERANCIA) atrasadas++;
    }
  });
  return {
    total: partidas.length, terminadas, atrasadas,
    real: wTot ? wReal / wTot : 0,
    programado: wConProg ? wProg / wConProg : null,
    realProgramadas: wConProg ? wRealProg / wConProg : null,
    usaPresupuesto,
  };
}
export function Barra({ real, prog, alto = 8 }) {
  return (
    <div style={{ position: 'relative', height: alto, background: '#eee', borderRadius: alto, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, real || 0)}%`, height: '100%', background: (real || 0) >= 100 ? '#10B981' : '#3B82F6' }} />
      {prog !== null && prog !== undefined && <div title={`Programado ${pct1(prog)}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${Math.min(100, prog)}%`, width: 2, background: '#C0203A' }} />}
    </div>
  );
}
export function Tarjeta({ titulo, valor, sub, color = '#1a1a2e' }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: '#888' }}>{titulo}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{valor}</div>
      {sub && <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// % programado de una partida a hoy (null si no tiene programa o falta fecha de arranque)
export const progPct = (partidaId, progMap, arr, hoy) => {
  const dias = progMap.get(partidaId) || [];
  if (!arr || dias.length === 0) return null;
  return (dias.filter(x => fechaDe(arr, x.semana, x.dia) <= hoy).length / dias.length) * 100;
};
const rangoFechas = (dias, arr) => {
  if (!arr || dias.length === 0) return '';
  const fs = dias.map(x => fechaDe(arr, x.semana, x.dia)).sort();
  return fs[0] === fs[fs.length - 1] ? fechaCorta(fs[0]) : `${fechaCorta(fs[0])} – ${fechaCorta(fs[fs.length - 1])}`;
};
function FilaAvance({ p, progMap, arr, hoy, puedeCapturar, onRegistrar, ruta = '' }) {
  const [valor, setValor] = useState(String(Number(p.avance_pct || 0)));
  const [guardando, setGuardando] = useState(false);
  const [historial, setHistorial] = useState(null);
  useEffect(() => { setValor(String(Number(p.avance_pct || 0))); }, [p.avance_pct]);
  const pp = progPct(p.id, progMap, arr, hoy);
  const dias = progMap.get(p.id) || [];
  const atrasada = pp !== null && Number(p.avance_pct) < pp - TOLERANCIA;
  const cambiado = Number(valor) !== Number(p.avance_pct || 0);

  const guardar = async (v = valor) => {
    if (guardando) return;
    setGuardando(true);
    await onRegistrar(p, v);
    setGuardando(false);
  };
  const verHistorial = async () => {
    const { data } = await supabase.from('obra_avance').select('*').eq('partida_id', p.id).order('created_at', { ascending: false }).limit(30);
    setHistorial(data || []);
  };

  return (
    <div style={{ padding: '10px 12px', borderBottom: '0.5px solid #f0f0f0', background: atrasada ? '#FFF7F7' : '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ minWidth: 200, flex: '1 1 220px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>
            {p.descripcion}
            {p.terminada_en && <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#EAF3DE', color: '#27500A' }}>✓ Terminada {fechaCorta(p.terminada_en)}</span>}
            {atrasada && !p.terminada_en && <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#FDECEC', color: '#C0392B' }}>Atrasada</span>}
          </div>
          <div style={{ fontSize: 11, color: '#888' }}>
            {ruta ? `${ruta} · ` : ''}{p.cantidad !== null && p.cantidad !== undefined ? `${fmtN(p.cantidad)} ${p.unidad || ''}` : (p.unidad || 'sin cantidad')}
            {p.cantidad > 0 && ` · ejecutado ${fmtN((Number(p.avance_pct) / 100) * p.cantidad)} ${p.unidad || ''}`}
            {dias.length > 0 && ` · programada ${rangoFechas(dias, arr) || `${dias.length} día(s)`}`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 110 }}><Barra real={Number(p.avance_pct)} prog={pp} /></div>
          <div style={{ width: 62, fontSize: 11, color: '#888', textAlign: 'right' }}>{pp === null ? '' : `prog. ${Math.round(pp)}%`}</div>
          {puedeCapturar ? (<>
            <input type="number" min="0" max="100" step="5" value={valor} onChange={e => setValor(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && cambiado) guardar(); }}
              style={{ ...inp, width: 64, textAlign: 'right' }} />
            <span style={{ fontSize: 12, color: '#888' }}>%</span>
            <button onClick={() => guardar()} disabled={!cambiado || guardando} style={{ ...btn, background: cambiado ? '#1a1a2e' : '#fff', color: cambiado ? '#fff' : '#bbb' }}>{guardando ? '...' : 'Guardar'}</button>
            {!p.terminada_en && <button onClick={() => guardar('100')} disabled={guardando} style={{ ...btn, color: '#27500A', borderColor: '#27500A' }} title="Marcar al 100%">100%</button>}
          </>) : <b style={{ fontSize: 13, width: 50, textAlign: 'right' }}>{pct1(p.avance_pct)}</b>}
          <button onClick={verHistorial} style={{ ...btn, padding: '6px 8px' }} title="Historial de avances">⏱</button>
        </div>
      </div>
      {historial && (
        <div style={{ marginTop: 8, background: '#f9f9f9', borderRadius: 8, padding: 10, fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><b>Historial de avance</b><button onClick={() => setHistorial(null)} style={{ ...btn, padding: '2px 8px' }}>Cerrar</button></div>
          {historial.length === 0 ? <div style={{ color: '#888' }}>Sin movimientos todavía.</div> : historial.map(h => (
            <div key={h.id} style={{ display: 'flex', gap: 10, color: '#555', padding: '2px 0' }}>
              <span style={{ width: 70 }}>{fechaCorta(h.fecha)}</span><span>{pct1(h.pct_anterior)} → <b>{pct1(h.pct)}</b></span><span style={{ color: '#aaa' }}>{h.capturado_por || ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function PrecioCelda({ p, disabled, onGuardar }) {
  const [v, setV] = useState(p.precio_unitario ?? '');
  useEffect(() => { setV(p.precio_unitario ?? ''); }, [p.precio_unitario]);
  return <InputDinero disabled={disabled} value={v} placeholder="Precio unit." onChange={e => setV(e.target.value)}
    onBlur={() => onGuardar(p, 'precio_unitario', v)} style={{ ...inp, width: 110, textAlign: 'right' }} />;
}
function Modal({ titulo, onCerrar, children, ancho = 460 }) {
  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: '1.25rem', width: '100%', maxWidth: ancho, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{titulo}</div>
        {children}
      </div>
    </div>
  );
}
const lbl = { fontSize: 12, color: '#555', display: 'block', marginBottom: 3 };

// ------------------------------------------------------------------ Costos
function TabCostos({ torre, partidas, progMap, contratistas, contratos, pagos, tope, permisos, isMobile, onCambio }) {
  const [modalContrato, setModalContrato] = useState(false);
  const [asignando, setAsignando] = useState(null);
  const [pagando, setPagando] = useState(null);
  const [abiertos, setAbiertos] = useState({});
  const [topeTxt, setTopeTxt] = useState(tope === null ? '' : String(tope));
  useEffect(() => { setTopeTxt(tope === null ? '' : String(tope)); }, [tope]);

  const presPartida = (p) => (Number(p.cantidad) || 0) * (Number(p.precio_unitario) || 0);
  const contratoDe = (id) => contratos.find(c => c.id === id);
  const nombreContratista = (c) => contratistas.find(x => x.id === c.contratista_id)?.nombre || 'Contratista';
  const esFijo = (c) => c?.tipo === 'monto_fijo';

  const datos = useMemo(() => {
    const porContrato = contratos.map(c => {
      const ps = partidas.filter(p => p.contrato_id === c.id);
      const total = esFijo(c) ? Number(c.monto_fijo || 0) : ps.reduce((t, p) => t + presPartida(p), 0);
      const avance = ps.length ? resumen(ps, progMap, null).real : 0;
      const devengado = esFijo(c) ? total * avance / 100 : ps.reduce((t, p) => t + presPartida(p) * Number(p.avance_pct || 0) / 100, 0);
      const pgs = pagos.filter(x => x.contrato_id === c.id);
      const pagado = pgs.reduce((t, x) => t + Number(x.monto || 0), 0);
      return { c, ps, total, avance, devengado, pagado, pagos: pgs };
    });
    const libres = partidas.filter(p => !p.contrato_id);
    const presLibres = libres.reduce((t, p) => t + presPartida(p), 0);
    const devLibres = libres.reduce((t, p) => t + presPartida(p) * Number(p.avance_pct || 0) / 100, 0);
    const presupuesto = porContrato.reduce((t, x) => t + x.total, 0) + presLibres;
    const devengado = porContrato.reduce((t, x) => t + x.devengado, 0) + devLibres;
    const pagado = porContrato.reduce((t, x) => t + x.pagado, 0);
    return { porContrato, libres, presLibres, presupuesto, devengado, pagado };
  }, [partidas, contratos, pagos, progMap]); // eslint-disable-line

  const fijarTope = async (valor) => {
    const v = valor === '' || valor === null ? null : Number(valor);
    const { error } = await supabase.from('obra_torres').update({ presupuesto_tope: v }).eq('id', torre.id);
    if (error) { alert('No se pudo fijar el tope: ' + error.message); setTopeTxt(tope === null ? '' : String(tope)); return; }
    onCambio();
  };
  const verComprobante = async (path) => {
    const { data } = await supabase.storage.from('obra').createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };
  const eliminarPago = async (pg) => {
    if (!window.confirm(`¿Eliminar el pago de ${$(pg.monto)} del ${fechaCorta(pg.fecha)}?`)) return;
    const { error } = await supabase.from('obra_pagos').delete().eq('id', pg.id);
    if (error) { alert('No se pudo eliminar: ' + error.message); return; }
    if (pg.comprobante_path) await supabase.storage.from('obra').remove([pg.comprobante_path]);
    onCambio();
  };
  const eliminarContrato = async (c) => {
    if (!window.confirm('¿Eliminar este contrato? Sus partidas quedan sin contratista y se borran sus pagos registrados.')) return;
    const { error } = await supabase.from('obra_contratos').delete().eq('id', c.id);
    if (error) { alert('No se pudo eliminar: ' + error.message); return; }
    onCambio();
  };

  const disponible = tope === null ? null : tope - datos.presupuesto;
  const tarjetas = [
    ['Presupuesto cargado', $(datos.presupuesto), tope === null ? 'sin tope fijado' : `tope ${$(tope)}`, '#1a1a2e'],
    ['Disponible del tope', disponible === null ? '—' : $(disponible), disponible === null ? 'fija un tope para controlarlo' : 'lo que aún se puede cargar', disponible !== null && disponible < 0 ? '#C0392B' : '#1a1a2e'],
    ['Devengado (por avance)', $(datos.devengado), 'avance real × presupuesto', '#1a1a2e'],
    ['Pagado', $(datos.pagado), `${pagos.length} pagos`, '#1a1a2e'],
    ['Por pagar del devengado', $(datos.devengado - datos.pagado), datos.pagado > datos.devengado ? 'pagado por encima del avance (anticipo)' : 'avance sin pagar', datos.pagado > datos.devengado ? '#B45309' : '#1a1a2e'],
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: 10, marginBottom: 14 }}>
        {tarjetas.map(([t, v, sub, color]) => <Tarjeta key={t} titulo={t} valor={v} sub={sub} color={color} />)}
      </div>

      <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, padding: 12, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Tope de presupuesto autorizado</div>
        <InputDinero disabled={!permisos.tope} value={topeTxt} placeholder="Sin tope" onChange={e => setTopeTxt(e.target.value)} style={{ ...inp, width: 150, textAlign: 'right' }} />
        {permisos.tope && <button onClick={() => fijarTope(topeTxt)} style={{ ...btn, background: '#1a1a2e', color: '#fff', border: 'none' }}>Fijar tope</button>}
        {permisos.tope && tope !== null && <button onClick={() => fijarTope(null)} style={btn}>Quitar tope</button>}
        <div style={{ fontSize: 11, color: '#888', flex: '1 1 260px' }}>
          Construcción no puede cargar precios ni contratos que hagan que el presupuesto de la torre rebase este tope.{!permisos.tope ? ' Solo quien tenga permiso lo fija.' : ''}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Contratos por contratista</div>
        {permisos.costos && <button onClick={() => setModalContrato(true)} style={{ ...btn, background: '#C0203A', color: '#fff', border: 'none' }}>+ Contrato</button>}
      </div>
      {datos.porContrato.length === 0 && <div style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>Aún no hay contratos. Las partidas se presupuestan con su precio unitario (pestaña Catálogo); un contrato las agrupa con un contratista para controlar lo que se le paga.</div>}
      {datos.porContrato.map(({ c, ps, total, avance, devengado, pagado, pagos: pgs }) => {
        const abierto = !!abiertos[c.id];
        return (
          <div key={c.id} style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
            <div onClick={() => setAbiertos(a => ({ ...a, [c.id]: !a[c.id] }))} style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
              <div style={{ minWidth: 180, flex: '1 1 200px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>{nombreContratista(c)}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{c.concepto || 'Sin concepto'} · {esFijo(c) ? 'monto fijo' : 'precios unitarios'} · {ps.length} partidas{c.estatus === 'cerrado' ? ' · cerrado' : ''}</div>
              </div>
              <div style={{ fontSize: 12, textAlign: 'right' }}><div style={{ color: '#888' }}>Contrato</div><b>{$(total)}</b></div>
              <div style={{ fontSize: 12, textAlign: 'right' }}><div style={{ color: '#888' }}>Avance</div><b>{pct1(avance)}</b></div>
              <div style={{ fontSize: 12, textAlign: 'right' }}><div style={{ color: '#888' }}>Devengado</div><b>{$(devengado)}</b></div>
              <div style={{ fontSize: 12, textAlign: 'right' }}><div style={{ color: '#888' }}>Pagado</div><b>{$(pagado)}</b></div>
              <div style={{ fontSize: 12, textAlign: 'right' }}><div style={{ color: '#888' }}>Saldo del contrato</div><b style={{ color: total - pagado > 0 ? '#1a1a2e' : '#10B981' }}>{$(total - pagado)}</b></div>
            </div>
            {abierto && (
              <div style={{ padding: '0 14px 14px', borderTop: '0.5px solid #f0f0f0' }}>
                <div style={{ display: 'flex', gap: 8, margin: '10px 0', flexWrap: 'wrap' }}>
                  {permisos.pagos && <button onClick={() => setPagando(c)} style={{ ...btn, background: '#1a1a2e', color: '#fff', border: 'none' }}>+ Registrar pago</button>}
                  {permisos.costos && <button onClick={() => setAsignando(c)} style={btn}>Asignar partidas</button>}
                  {permisos.costos && <button onClick={() => eliminarContrato(c)} style={{ ...btn, color: '#C0392B' }}>Eliminar contrato</button>}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Pagos</div>
                {pgs.length === 0 ? <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Sin pagos registrados.</div> : pgs.map(pg => (
                  <div key={pg.id} style={{ display: 'flex', gap: 12, fontSize: 12, padding: '4px 0', borderBottom: '0.5px solid #f5f5f5', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ width: 70 }}>{fechaCorta(pg.fecha)}</span><b style={{ width: 110 }}>{$(pg.monto)}</b><span style={{ flex: 1, color: '#555' }}>{pg.concepto || ''}</span>
                    <span style={{ color: '#aaa' }}>{pg.registrado_por || ''}</span>
                    {pg.comprobante_path && <button onClick={() => verComprobante(pg.comprobante_path)} style={{ ...btn, padding: '2px 8px', color: '#3B82F6' }}>📎 Comprobante</button>}
                    {permisos.pagos && <button onClick={() => eliminarPago(pg)} style={{ ...btn, padding: '2px 8px', color: '#C0392B' }}>Eliminar</button>}
                  </div>
                ))}
                <div style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 4px' }}>Partidas del contrato</div>
                {ps.length === 0 ? <div style={{ fontSize: 12, color: '#888' }}>Sin partidas asignadas.</div> : ps.map(p => (
                  <div key={p.id} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '3px 0', color: '#555' }}>
                    <span style={{ flex: 1 }}>{p.descripcion} <span style={{ color: '#aaa' }}>· {p.etapa}</span></span>
                    <span style={{ width: 60, textAlign: 'right' }}>{pct1(p.avance_pct)}</span>
                    {!esFijo(c) && <span style={{ width: 110, textAlign: 'right' }}>{$(presPartida(p))}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div style={{ background: '#fff', border: '0.5px dashed #ccc', borderRadius: 12, padding: '10px 14px', fontSize: 12, color: '#555' }}>
        <b>Sin contratista:</b> {datos.libres.length} partidas · presupuesto {$(datos.presLibres)} (por precio unitario).
      </div>

      {modalContrato && <ModalContrato torre={torre} contratistas={contratistas} onCerrar={() => setModalContrato(false)} onCreado={() => { setModalContrato(false); onCambio(); }} />}
      {asignando && <ModalAsignar contrato={asignando} partidas={partidas} onCerrar={() => setAsignando(null)} onGuardado={() => { setAsignando(null); onCambio(); }} />}
      {pagando && <ModalPago contrato={pagando} total={datos.porContrato.find(x => x.c.id === pagando.id)?.total || 0} pagado={datos.porContrato.find(x => x.c.id === pagando.id)?.pagado || 0}
        onCerrar={() => setPagando(null)} onGuardado={() => { setPagando(null); onCambio(); }} />}
    </div>
  );
}
function ModalContrato({ torre, contratistas, onCerrar, onCreado }) {
  const [contratistaId, setContratistaId] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [concepto, setConcepto] = useState('');
  const [tipo, setTipo] = useState('precio_unitario');
  const [monto, setMonto] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!contratistaId || (contratistaId === '__nuevo' && !nuevoNombre.trim())) { alert('Elige un contratista o escribe el nombre del nuevo.'); return; }
    if (tipo === 'monto_fijo' && !(Number(monto) > 0)) { alert('Captura el monto del contrato.'); return; }
    setGuardando(true);
    try {
      let cid = contratistaId;
      if (contratistaId === '__nuevo') {
        const { data, error } = await supabase.from('obra_contratistas').insert({ nombre: nuevoNombre.trim(), telefono: telefono.trim() || null }).select().single();
        if (error) throw error;
        cid = data.id;
      }
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('obra_contratos').insert({
        torre_id: torre.id, contratista_id: cid, concepto: concepto.trim() || null, tipo,
        monto_fijo: tipo === 'monto_fijo' ? Number(monto) : null, creado_por: user?.email || null,
      });
      if (error) throw error;
      onCreado();
    } catch (e) { alert('No se pudo crear el contrato: ' + (e.message || e)); }
    setGuardando(false);
  };

  return (
    <Modal titulo="Nuevo contrato" onCerrar={onCerrar}>
      <label style={lbl}>Contratista</label>
      <select value={contratistaId} onChange={e => setContratistaId(e.target.value)} style={{ ...inp, width: '100%', marginBottom: 8 }}>
        <option value="">Selecciona...</option>
        {contratistas.filter(c => c.activo).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        <option value="__nuevo">+ Contratista nuevo</option>
      </select>
      {contratistaId === '__nuevo' && (<>
        <input placeholder="Nombre del contratista" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} style={{ ...inp, width: '100%', marginBottom: 6 }} />
        <input placeholder="Teléfono (opcional)" value={telefono} onChange={e => setTelefono(e.target.value)} style={{ ...inp, width: '100%', marginBottom: 8 }} />
      </>)}
      <label style={lbl}>Concepto (qué hace en la obra)</label>
      <input value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Ej. Albañilería de niveles 1 y 2" style={{ ...inp, width: '100%', marginBottom: 8 }} />
      <label style={lbl}>Forma de pago</label>
      <div style={{ display: 'flex', gap: 14, marginBottom: 8, fontSize: 13 }}>
        <label><input type="radio" checked={tipo === 'precio_unitario'} onChange={() => setTipo('precio_unitario')} /> Por precios unitarios</label>
        <label><input type="radio" checked={tipo === 'monto_fijo'} onChange={() => setTipo('monto_fijo')} /> Monto fijo</label>
      </div>
      {tipo === 'monto_fijo' && (<>
        <label style={lbl}>Monto del contrato</label>
        <InputDinero value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" style={{ ...inp, width: '100%', marginBottom: 8, textAlign: 'right' }} />
      </>)}
      <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
        {tipo === 'precio_unitario' ? 'El monto del contrato es la suma de cantidad × precio unitario de las partidas que le asignes.' : 'El monto fijo reemplaza el presupuesto de las partidas que le asignes.'} Después asigna las partidas.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCerrar} style={{ ...btn, flex: 1 }}>Cancelar</button>
        <button onClick={guardar} disabled={guardando} style={{ ...btn, flex: 1, background: '#C0203A', color: '#fff', border: 'none' }}>{guardando ? 'Guardando...' : 'Crear contrato'}</button>
      </div>
    </Modal>
  );
}
function ModalAsignar({ contrato, partidas, onCerrar, onGuardado }) {
  const [sel, setSel] = useState(() => new Set(partidas.filter(p => p.contrato_id === contrato.id).map(p => p.id)));
  const [filtro, setFiltro] = useState('');
  const [guardando, setGuardando] = useState(false);
  const disponibles = partidas.filter(p => (!p.contrato_id || p.contrato_id === contrato.id) && (!filtro || p.etapa === filtro));
  const etapas = [...new Set(partidas.map(p => p.etapa))];
  const alternar = (id) => setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const guardar = async () => {
    setGuardando(true);
    const antes = new Set(partidas.filter(p => p.contrato_id === contrato.id).map(p => p.id));
    const agregar = [...sel].filter(id => !antes.has(id));
    const quitar = [...antes].filter(id => !sel.has(id));
    try {
      for (let i = 0; i < agregar.length; i += 50) {
        const { error } = await supabase.from('obra_partidas').update({ contrato_id: contrato.id }).in('id', agregar.slice(i, i + 50));
        if (error) throw error;
      }
      for (let i = 0; i < quitar.length; i += 50) {
        const { error } = await supabase.from('obra_partidas').update({ contrato_id: null }).in('id', quitar.slice(i, i + 50));
        if (error) throw error;
      }
      onGuardado();
    } catch (e) { alert('No se pudo guardar: ' + (e.message || e)); setGuardando(false); }
  };

  return (
    <Modal titulo="Asignar partidas al contrato" onCerrar={onCerrar} ancho={620}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={filtro} onChange={e => setFiltro(e.target.value)} style={inp}>
          <option value="">Todas las etapas</option>
          {etapas.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <span style={{ fontSize: 11, color: '#888' }}>{sel.size} seleccionadas · solo se muestran partidas libres o de este contrato</span>
      </div>
      <div style={{ maxHeight: '50vh', overflowY: 'auto', border: '0.5px solid #eee', borderRadius: 8 }}>
        {disponibles.map(p => (
          <label key={p.id} style={{ display: 'flex', gap: 8, padding: '6px 10px', borderBottom: '0.5px solid #f5f5f5', fontSize: 12, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={sel.has(p.id)} onChange={() => alternar(p.id)} />
            <span style={{ flex: 1 }}>{p.descripcion} <span style={{ color: '#aaa' }}>· {p.etapa}</span></span>
            <span style={{ color: '#888' }}>{p.cantidad > 0 ? `${fmtN(p.cantidad)} ${p.unidad || ''}` : ''}</span>
            {p.cantidad > 0 && p.precio_unitario > 0 && <span style={{ width: 100, textAlign: 'right' }}>{$(p.cantidad * p.precio_unitario)}</span>}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onCerrar} style={{ ...btn, flex: 1 }}>Cancelar</button>
        <button onClick={guardar} disabled={guardando} style={{ ...btn, flex: 1, background: '#1a1a2e', color: '#fff', border: 'none' }}>{guardando ? 'Guardando...' : 'Guardar asignación'}</button>
      </div>
    </Modal>
  );
}
function ModalPago({ contrato, total, pagado, onCerrar, onGuardado }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const disponible = total - pagado;

  const guardar = async () => {
    const m = Number(monto);
    if (!(m > 0)) { alert('Captura el monto del pago.'); return; }
    if (m > disponible + 0.001) { alert(`El pago (${$(m)}) excede lo que falta por pagar del contrato (${$(disponible)}).`); return; }
    setGuardando(true);
    let path = null;
    try {
      if (archivo) {
        const limpio = archivo.name.replace(/[^\w.\-]+/g, '_');
        path = `${contrato.id}/${Date.now()}_${limpio}`;
        const { error: eu } = await supabase.storage.from('obra').upload(path, archivo);
        if (eu) throw eu;
      }
      const { error } = await supabase.from('obra_pagos').insert({ contrato_id: contrato.id, fecha, monto: m, concepto: concepto.trim() || null, comprobante_path: path });
      if (error) { if (path) await supabase.storage.from('obra').remove([path]); throw error; }
      onGuardado();
    } catch (e) { alert('No se pudo registrar el pago: ' + (e.message || e)); setGuardando(false); }
  };

  return (
    <Modal titulo="Registrar pago" onCerrar={onCerrar}>
      <div style={{ fontSize: 12, color: '#555', marginBottom: 10 }}>Contrato {$(total)} · pagado {$(pagado)} · <b>por pagar {$(disponible)}</b></div>
      <label style={lbl}>Fecha</label>
      <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ ...inp, width: '100%', marginBottom: 8 }} />
      <label style={lbl}>Monto</label>
      <InputDinero value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" style={{ ...inp, width: '100%', marginBottom: 8, textAlign: 'right' }} />
      <label style={lbl}>Concepto</label>
      <input value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Ej. Estimación 3" style={{ ...inp, width: '100%', marginBottom: 8 }} />
      <label style={lbl}>Comprobante (opcional)</label>
      <input type="file" onChange={e => setArchivo(e.target.files?.[0] || null)} style={{ fontSize: 12, marginBottom: 12 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCerrar} style={{ ...btn, flex: 1 }}>Cancelar</button>
        <button onClick={guardar} disabled={guardando} style={{ ...btn, flex: 1, background: '#1a1a2e', color: '#fff', border: 'none' }}>{guardando ? 'Guardando...' : 'Registrar pago'}</button>
      </div>
    </Modal>
  );
}


// ------------------------------------------------------------ Árbol de partidas
// Una partida puede tener subpartidas (a cualquier profundidad). Solo las hojas llevan
// cantidad, precio, avance y programa; las padres suman a sus hijas.
export const indexar = (partidas) => {
  const hijos = new Map();
  partidas.forEach(p => { if (p.parent_id) { if (!hijos.has(p.parent_id)) hijos.set(p.parent_id, []); hijos.get(p.parent_id).push(p); } });
  hijos.forEach(l => l.sort((a, b) => a.orden - b.orden));
  return hijos;
};
export const hojasDe = (p, hijos) => { const h = hijos.get(p.id); return h ? h.flatMap(x => hojasDe(x, hijos)) : [p]; };
export const etapasDe = (partidas) => {
  const m = new Map();
  partidas.filter(p => !p.parent_id).forEach(p => {
    if (!m.has(p.etapa)) m.set(p.etapa, { nombre: p.etapa, orden: p.etapa_orden, raices: [] });
    m.get(p.etapa).raices.push(p);
  });
  const lista = [...m.values()].sort((a, b) => a.orden - b.orden);
  lista.forEach(e => e.raices.sort((a, b) => a.orden - b.orden));
  return lista;
};
const aplanar = (nodos, hijos, cerrados, depth = 0, out = []) => {
  nodos.forEach(p => {
    const h = hijos.get(p.id);
    out.push({ p, depth, hoja: !h });
    if (h && !cerrados.has(p.id)) aplanar(h, hijos, cerrados, depth + 1, out);
  });
  return out;
};
export const rutaDe = (p, porId) => {
  const partes = [p.etapa];
  const cadena = [];
  for (let x = p.parent_id ? porId.get(p.parent_id) : null; x; x = x.parent_id ? porId.get(x.parent_id) : null) cadena.unshift(x.descripcion);
  return [...partes, ...cadena].join(' › ');
};
export const TIPOS_FRENTE = { torre: 'Torre', tren: 'Tren de viviendas', otro: 'Otro frente' };
export const nombreFrente = (t) => t.nombre || `Torre ${t.torre}`;

// ------------------------------------------------------------------ Lista
function ListaObra() {
  const puede = usePuede();
  const puedeCapturar = puede('construccion.capturar_avance_obra');
  const puedeEditar = puede('construccion.editar_obra');
  const permisosCostos = { costos: puede('construccion.editar_costos_obra'), pagos: puede('construccion.registrar_pagos_obra'), tope: puede('construccion.fijar_tope_obra') };
  const isMobile = useIsMobile();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [torres, setTorres] = useState([]);
  const [partidas, setPartidas] = useState([]);
  const [desarrollos, setDesarrollos] = useState([]);
  const [abierta, setAbierta] = useState(null);
  const [agregando, setAgregando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const [t, p, d] = await Promise.all([
        traerTodo(() => supabase.from('obra_torres').select('*, desarrollos(nombre)').order('created_at')),
        traerTodo(() => supabase.from('obra_partidas').select('id, torre_id, parent_id, avance_pct, cantidad, precio_unitario, terminada_en').order('id')),
        supabase.from('desarrollos').select('id, nombre').eq('activo', true).order('nombre'),
      ]);
      setTorres(t); setPartidas(p); setDesarrollos(d.data || []);
    } catch (e) { setError(e.message || String(e)); }
    setCargando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  if (abierta) {
    const torre = torres.find(t => t.id === abierta);
    if (torre) return <DetalleTorre torre={torre} puedeCapturar={puedeCapturar} puedeEditar={puedeEditar} permisosCostos={permisosCostos} isMobile={isMobile}
      onCerrar={() => { setAbierta(null); cargar(); }} onTorreActualizada={(t) => setTorres(prev => prev.map(x => x.id === t.id ? { ...x, ...t } : x))} />;
  }

  const frentes = torres.filter(t => !t.es_plantilla);
  const plantillas = torres.filter(t => t.es_plantilla);
  const tarjeta = (t) => {
    const ps = partidas.filter(p => p.torre_id === t.id);
    const hijos = indexar(ps);
    const hojas = ps.filter(p => !hijos.has(p.id));
    const r = resumen(hojas, new Map(), null);
    return (
      <div key={t.id} onClick={() => setAbierta(t.id)} style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, padding: 14, cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{nombreFrente(t)}</div>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#F3F0FF', color: '#6D28D9', whiteSpace: 'nowrap' }}>{t.es_plantilla ? 'Plantilla · ' : ''}{TIPOS_FRENTE[t.tipo] || t.tipo}</span>
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>{t.desarrollos?.nombre || (t.es_plantilla ? 'Cantidades por vivienda' : '')}{t.tipo === 'tren' && t.num_viviendas ? ` · ${t.num_viviendas} viviendas` : ''}</div>
        {!t.es_plantilla && (<>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span style={{ color: '#555' }}>Avance real</span><b>{pct1(r.real)}</b></div>
          <Barra real={r.real} prog={null} />
        </>)}
        <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
          {r.total} partidas{!t.es_plantilla && ` · ${r.terminadas} terminadas · ${t.fecha_arranque ? `arranque ${fechaCorta(t.fecha_arranque)} ${parse(t.fecha_arranque).getFullYear()}` : 'sin fecha de arranque'}`}
        </div>
      </div>
    );
  };
  const grid = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 };

  return (
    <div>
      {error && <div style={{ padding: '10px 14px', background: '#FDECEC', color: '#C0392B', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>No se pudo cargar la obra: {error}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Frentes de obra</div>
        {puedeEditar && <button onClick={() => setAgregando(true)} style={{ ...btn, background: '#C0203A', color: '#fff', border: 'none' }}>+ Agregar frente</button>}
      </div>
      {cargando ? <div style={{ color: '#888', fontSize: 13 }}>Cargando...</div> : frentes.length === 0 ? (
        <div style={{ color: '#888', fontSize: 13 }}>Aún no hay frentes de obra (torres, trenes de viviendas…).{puedeEditar ? ' Agrega uno con el botón de arriba.' : ''}</div>
      ) : <div style={grid}>{frentes.map(tarjeta)}</div>}
      {!cargando && plantillas.length > 0 && (<>
        <div style={{ fontSize: 14, fontWeight: 700, margin: '22px 0 4px' }}>Plantillas</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Procesos reutilizables: al crear un frente desde una plantilla se copian partidas, subpartidas y programa (en un tren, las cantidades se multiplican por el número de viviendas).</div>
        <div style={grid}>{plantillas.map(tarjeta)}</div>
      </>)}
      {agregando && <AgregarFrente desarrollos={desarrollos} existentes={torres} plantillas={plantillas} onCerrar={() => setAgregando(false)} onCreado={() => { setAgregando(false); cargar(); }} />}
    </div>
  );
}

function AgregarFrente({ desarrollos, existentes, plantillas, onCerrar, onCreado }) {
  const [tipo, setTipo] = useState('torre');
  const [esPlantilla, setEsPlantilla] = useState(false);
  const [desarrolloId, setDesarrolloId] = useState('');
  const [nombre, setNombre] = useState('');
  const [plantillaId, setPlantillaId] = useState('');
  const [arranque, setArranque] = useState('');
  const [unidades, setUnidades] = useState([]);
  const [ocupadas, setOcupadas] = useState(new Set());
  const [sel, setSel] = useState(new Set());
  const [sugeridas, setSugeridas] = useState([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!desarrolloId) { setUnidades([]); setSugeridas([]); return; }
    (async () => {
      const [{ data: inv }, ocu] = await Promise.all([
        supabase.from('inventario').select('id, numero, tipologia').eq('desarrollo_id', desarrolloId).order('numero').limit(2000),
        traerTodo(() => supabase.from('obra_torre_unidades').select('unidad_id').order('unidad_id')),
      ]);
      const lista = inv || [];
      setUnidades(lista); setOcupadas(new Set(ocu.map(x => x.unidad_id))); setSel(new Set());
      setSugeridas([...new Set(lista.map(u => (String(u.numero || '').match(/^([A-Za-z]+)/)?.[1] || '').toUpperCase()).filter(Boolean))].sort());
    })();
  }, [desarrolloId]);

  const libres = unidades.filter(u => !ocupadas.has(u.id));
  const alternar = (id) => setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const plantillasDelTipo = plantillas.filter(p => p.tipo === tipo);

  const crear = async () => {
    const nom = nombre.trim();
    if (!nom) { alert('Escribe el nombre del frente.'); return; }
    if (!esPlantilla && !desarrolloId) { alert('Elige el desarrollo.'); return; }
    if (tipo === 'tren' && !esPlantilla && sel.size === 0) { alert('Selecciona las viviendas que componen el tren.'); return; }
    if (existentes.some(t => t.desarrollo_id === (esPlantilla ? null : desarrolloId) && (t.nombre || t.torre) === nom && t.es_plantilla === esPlantilla)) { alert('Ya existe un frente con ese nombre.'); return; }
    setGuardando(true);
    try {
      if (plantillaId && !esPlantilla) {
        const { error } = await supabase.rpc('obra_crear_desde_plantilla', {
          p_plantilla: plantillaId, p_desarrollo: desarrolloId, p_nombre: nom, p_tipo: tipo,
          p_unidades: tipo === 'tren' ? [...sel] : [], p_arranque: arranque ? lunesDe(arranque) : null,
        });
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase.from('obra_torres').insert({
          desarrollo_id: esPlantilla ? null : desarrolloId, torre: nom, nombre: nom, tipo, es_plantilla: esPlantilla,
          num_viviendas: tipo === 'tren' && !esPlantilla ? sel.size : null, fecha_arranque: arranque && !esPlantilla ? lunesDe(arranque) : null, creado_por: user?.email || null,
        }).select().single();
        if (error) throw error;
        if (tipo === 'tren' && !esPlantilla && sel.size > 0) {
          const { error: e2 } = await supabase.from('obra_torre_unidades').insert([...sel].map(u => ({ torre_id: data.id, unidad_id: u })));
          if (e2) throw e2;
        }
      }
      onCreado();
    } catch (e) { alert('No se pudo crear: ' + (e.message || e)); setGuardando(false); }
  };

  return (
    <Modal titulo="Agregar frente de obra" onCerrar={onCerrar} ancho={560}>
      <label style={lbl}>Tipo de frente</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {Object.entries(TIPOS_FRENTE).map(([k, l]) => (
          <button key={k} onClick={() => { setTipo(k); setPlantillaId(''); setSel(new Set()); }} style={{ ...btn, background: tipo === k ? '#1a1a2e' : '#fff', color: tipo === k ? '#fff' : '#555' }}>{l}</button>
        ))}
      </div>
      <label style={{ ...lbl, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
        <input type="checkbox" checked={esPlantilla} onChange={e => { setEsPlantilla(e.target.checked); setPlantillaId(''); }} /> Crear como <b>plantilla</b> (proceso reutilizable, sin desarrollo)
      </label>
      {!esPlantilla && (<>
        <label style={lbl}>Desarrollo</label>
        <select value={desarrolloId} onChange={e => setDesarrolloId(e.target.value)} style={{ ...inp, width: '100%', marginBottom: 10 }}>
          <option value="">Selecciona...</option>
          {desarrollos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
      </>)}
      <label style={lbl}>Nombre</label>
      <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder={tipo === 'torre' ? 'Ej. Torre L' : tipo === 'tren' ? 'Ej. Tren 1 (A1–A8)' : 'Ej. Amenidades'} style={{ ...inp, width: '100%', marginBottom: 6 }} />
      {tipo === 'torre' && sugeridas.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          {sugeridas.map(l => <button key={l} onClick={() => setNombre(`Torre ${l}`)} style={{ ...btn, padding: '3px 9px' }}>Torre {l}</button>)}
        </div>
      )}
      {!esPlantilla && (<>
        <label style={{ ...lbl, marginTop: 4 }}>Fecha de arranque (opcional; se ajusta al lunes)</label>
        <input type="date" value={arranque} onChange={e => setArranque(e.target.value)} style={{ ...inp, marginBottom: 10 }} />
      </>)}
      {!esPlantilla && (
        <>
          <label style={lbl}>Crear desde</label>
          <select value={plantillaId} onChange={e => setPlantillaId(e.target.value)} style={{ ...inp, width: '100%', marginBottom: 10 }}>
            <option value="">Frente vacío (capturar partidas a mano)</option>
            {plantillasDelTipo.map(p => <option key={p.id} value={p.id}>Plantilla: {nombreFrente(p)}</option>)}
          </select>
        </>
      )}
      {tipo === 'tren' && !esPlantilla && desarrolloId && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <label style={{ ...lbl, marginBottom: 0 }}>Viviendas del tren ({sel.size} seleccionadas)</label>
            <button onClick={() => setSel(new Set(libres.map(u => u.id)))} style={{ ...btn, padding: '2px 8px' }}>Todas las libres</button>
          </div>
          <div style={{ maxHeight: 170, overflowY: 'auto', border: '0.5px solid #eee', borderRadius: 8, padding: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {unidades.map(u => {
              const ocu = ocupadas.has(u.id);
              return (
                <label key={u.id} title={ocu ? 'Ya pertenece a otro tren' : (u.tipologia || '')} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: ocu ? 'not-allowed' : 'pointer', opacity: ocu ? 0.4 : 1, background: sel.has(u.id) ? '#1a1a2e' : '#f3f3f5', color: sel.has(u.id) ? '#fff' : '#333' }}>
                  <input type="checkbox" disabled={ocu} checked={sel.has(u.id)} onChange={() => alternar(u.id)} style={{ display: 'none' }} />{u.numero}
                </label>
              );
            })}
          </div>
        </div>
      )}
      {plantillaId && tipo === 'tren' && <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Las cantidades de la plantilla (por vivienda) se multiplican por {sel.size || 'el número de'} viviendas; ajústalas después si cambian los m² o materiales.</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={onCerrar} style={{ ...btn, flex: 1 }}>Cancelar</button>
        <button onClick={crear} disabled={guardando} style={{ ...btn, flex: 1, background: '#C0203A', color: '#fff', border: 'none' }}>{guardando ? 'Creando...' : 'Crear'}</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Detalle
function DetalleTorre({ torre, puedeCapturar, puedeEditar, permisosCostos, isMobile, onCerrar, onTorreActualizada }) {
  const [tab, setTab] = useState(torre.es_plantilla ? 'catalogo' : 'hoy');
  const [partidas, setPartidas] = useState([]);
  const [programa, setPrograma] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [arranque, setArranque] = useState(torre.fecha_arranque || '');
  const [filtroEtapa, setFiltroEtapa] = useState('');
  const [contratistas, setContratistas] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [tope, setTope] = useState(torre.presupuesto_tope ?? null);
  const [viviendas, setViviendas] = useState([]);

  const cargarCostos = useCallback(async () => {
    if (torre.es_plantilla) return;
    try {
      const [ct, cs, t] = await Promise.all([
        traerTodo(() => supabase.from('obra_contratistas').select('*').order('nombre')),
        traerTodo(() => supabase.from('obra_contratos').select('*').eq('torre_id', torre.id).order('created_at')),
        supabase.from('obra_torres').select('presupuesto_tope').eq('id', torre.id).single(),
      ]);
      setContratistas(ct); setContratos(cs); setTope(t.data?.presupuesto_tope ?? null);
      const ids = cs.map(c => c.id);
      let pg = [];
      for (let i = 0; i < ids.length; i += 120) pg = pg.concat(await traerTodo(() => supabase.from('obra_pagos').select('*').in('contrato_id', ids.slice(i, i + 120)).order('fecha')));
      setPagos(pg);
    } catch (e) { setError(e.message || String(e)); }
  }, [torre.id, torre.es_plantilla]);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const p = await traerTodo(() => supabase.from('obra_partidas').select('*').eq('torre_id', torre.id).order('etapa_orden').order('orden'));
      const ids = p.map(x => x.id);
      let prog = [];
      for (let i = 0; i < ids.length; i += 120) prog = prog.concat(await traerTodo(() => supabase.from('obra_programa').select('partida_id, semana, dia').in('partida_id', ids.slice(i, i + 120))));
      setPartidas(p); setPrograma(prog);
      if (torre.tipo === 'tren' && !torre.es_plantilla) {
        const { data } = await supabase.from('obra_torre_unidades').select('inventario(numero)').eq('torre_id', torre.id);
        setViviendas((data || []).map(x => x.inventario?.numero).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true })));
      }
    } catch (e) { setError(e.message || String(e)); }
    setCargando(false);
    cargarCostos();
  }, [torre.id, torre.tipo, torre.es_plantilla, cargarCostos]);
  useEffect(() => { cargar(); }, [cargar]);

  const progMap = useMemo(() => {
    const m = new Map();
    programa.forEach(x => { if (!m.has(x.partida_id)) m.set(x.partida_id, []); m.get(x.partida_id).push({ semana: x.semana, dia: x.dia }); });
    return m;
  }, [programa]);
  const hijos = useMemo(() => indexar(partidas), [partidas]);
  const hojas = useMemo(() => partidas.filter(p => !hijos.has(p.id)), [partidas, hijos]);
  const porId = useMemo(() => new Map(partidas.map(p => [p.id, p])), [partidas]);
  const etapas = useMemo(() => etapasDe(partidas), [partidas]);
  const arr = arranque || null;
  const total = useMemo(() => resumen(hojas, progMap, arr), [hojas, progMap, arr]);
  const hoy = hoyISO();
  const semanaHoy = arr ? Math.floor((parse(hoy) - parse(arr)) / 86400000 / 7) + 1 : null;

  const guardarArranque = async (valor) => {
    if (!puedeEditar) return;
    const lunes = valor ? lunesDe(valor) : null;
    const { error: e } = await supabase.from('obra_torres').update({ fecha_arranque: lunes }).eq('id', torre.id);
    if (e) { alert('No se pudo guardar la fecha: ' + e.message); return; }
    setArranque(lunes || '');
    onTorreActualizada({ id: torre.id, fecha_arranque: lunes });
  };

  const registrarAvance = async (partida, pct, nota = null) => {
    const v = Math.max(0, Math.min(100, Number(pct)));
    if (Number.isNaN(v)) return false;
    const { data, error: e } = await supabase.rpc('obra_registrar_avance', { p_partida: partida.id, p_pct: v, p_fecha: hoy, p_nota: nota });
    if (e) { alert('No se pudo registrar el avance: ' + e.message); return false; }
    setPartidas(prev => prev.map(x => x.id === partida.id ? { ...x, ...data } : x));
    return true;
  };

  const guardarPlantilla = async () => {
    const nombre = window.prompt('Nombre de la plantilla (por ejemplo "Casa MIA" o "Torre estándar"):', `Plantilla ${nombreFrente(torre)}`);
    if (!nombre || !nombre.trim()) return;
    const { error: e } = await supabase.rpc('obra_guardar_plantilla', { p_origen: torre.id, p_nombre: nombre.trim() });
    if (e) { alert('No se pudo guardar la plantilla: ' + e.message); return; }
    alert('Plantilla guardada. Aparece en la lista de frentes, sección Plantillas, y al crear un frente nuevo.');
  };
  const eliminarFrente = async () => {
    if (pagos.length > 0) { alert('Este frente tiene pagos registrados; no se puede eliminar.'); return; }
    if (!window.confirm(`¿Eliminar "${nombreFrente(torre)}" con todas sus partidas, programa y avance? No se puede deshacer.`)) return;
    const { error: e } = await supabase.from('obra_torres').delete().eq('id', torre.id);
    if (e) { alert('No se pudo eliminar: ' + e.message); return; }
    onCerrar();
  };

  const tabs = torre.es_plantilla ? [['catalogo', 'Catálogo'], ['programa', 'Programa']] : [['hoy', 'Hoy'], ['avance', 'Avance'], ['programa', 'Programa'], ['catalogo', 'Catálogo'], ['costos', 'Costos']];

  return (
    <div>
      <button onClick={onCerrar} style={{ ...btn, marginBottom: 12 }}>← Todos los frentes</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>{nombreFrente(torre)} <span style={{ fontSize: 11, fontWeight: 400, padding: '2px 8px', borderRadius: 20, background: '#F3F0FF', color: '#6D28D9' }}>{torre.es_plantilla ? 'Plantilla · ' : ''}{TIPOS_FRENTE[torre.tipo] || torre.tipo}</span></div>
          <div style={{ fontSize: 12, color: '#888' }}>{torre.desarrollos?.nombre || ''}{viviendas.length > 0 ? ` · ${viviendas.length} viviendas: ${viviendas.join(', ')}` : ''}</div>
          {torre.es_plantilla && <div style={{ fontSize: 11, color: '#888' }}>Las cantidades de esta plantilla son por vivienda (en un tren se multiplican por el número de viviendas).</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {!torre.es_plantilla && (<>
            <label style={{ fontSize: 12, color: '#555' }}>Fecha de arranque (semana 1)</label>
            <input type="date" disabled={!puedeEditar} value={arranque} onChange={e => guardarArranque(e.target.value)} style={inp} />
            {arr && <span style={{ fontSize: 11, color: '#888' }}>lunes {fechaCorta(arr)} · hoy: semana {semanaHoy > 0 ? semanaHoy : 'previa al arranque'}</span>}
          </>)}
          {puedeEditar && !torre.es_plantilla && <button onClick={guardarPlantilla} style={btn}>Guardar como plantilla</button>}
          {puedeEditar && <button onClick={eliminarFrente} style={{ ...btn, color: '#C0392B' }}>Eliminar</button>}
        </div>
      </div>
      {!torre.es_plantilla && !arr && <div style={{ padding: '10px 14px', background: '#FFF8E1', color: '#856404', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
        Captura la fecha de arranque (semana 1) para que el programa se convierta en fechas y se pueda comparar con el avance real.{!puedeEditar ? ' (Pídesela a quien tenga permiso para editar la obra.)' : ''}
      </div>}
      {error && <div style={{ padding: '10px 14px', background: '#FDECEC', color: '#C0392B', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {!torre.es_plantilla && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
          <Tarjeta titulo="Avance real" valor={pct1(total.real)} sub={`${total.terminadas} de ${total.total} partidas terminadas`} />
          <Tarjeta titulo="Programado a hoy" valor={total.programado === null ? '—' : pct1(total.programado)} sub={arr ? 'según el programa' : 'falta fecha de arranque'} />
          <Tarjeta titulo="Desviación" valor={total.programado === null ? '—' : `${(total.realProgramadas - total.programado) >= 0 ? '+' : ''}${Math.round((total.realProgramadas - total.programado) * 10) / 10} pts`}
            color={total.programado === null ? '#1a1a2e' : (total.realProgramadas - total.programado) >= -TOLERANCIA ? '#10B981' : '#C0392B'} sub="avance real vs programado" />
          <Tarjeta titulo="Partidas atrasadas" valor={total.atrasadas} color={total.atrasadas > 0 ? '#C0392B' : '#10B981'} sub={total.usaPresupuesto ? 'ponderado por presupuesto' : 'ponderado por días programados'} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid #e0e0e0', overflowX: 'auto' }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', fontWeight: tab === k ? 600 : 400, color: tab === k ? '#1a1a2e' : '#888', borderBottom: tab === k ? '2px solid #1a1a2e' : '2px solid transparent' }}>{l}</button>
        ))}
      </div>

      {cargando ? <div style={{ color: '#888', fontSize: 13 }}>Cargando...</div> : (<>
        {tab === 'hoy' && <TabHoy hojas={hojas} porId={porId} progMap={progMap} arr={arr} hoy={hoy} puedeCapturar={puedeCapturar} onRegistrar={registrarAvance} />}
        {tab === 'avance' && <TabAvance etapas={etapas} hijos={hijos} porId={porId} progMap={progMap} arr={arr} hoy={hoy} puedeCapturar={puedeCapturar} onRegistrar={registrarAvance} />}
        {tab === 'programa' && <TabPrograma torre={torre} etapas={etapas} hijos={hijos} progMap={progMap} arr={arr} hoy={hoy} puedeEditar={puedeEditar} filtroEtapa={filtroEtapa} setFiltroEtapa={setFiltroEtapa}
          partidas={partidas} onCambio={cargar} />}
        {tab === 'catalogo' && <TabCatalogo torre={torre} partidas={partidas} etapas={etapas} hijos={hijos} progMap={progMap} puedeEditar={puedeEditar} puedeCostos={permisosCostos.costos} contratos={contratos} contratistas={contratistas} onCambio={cargar} />}
        {tab === 'costos' && <TabCostos torre={torre} partidas={hojas} progMap={progMap} contratistas={contratistas} contratos={contratos} pagos={pagos} tope={tope} permisos={permisosCostos} isMobile={isMobile} onCambio={cargar} />}
      </>)}
    </div>
  );
}

// ------------------------------------------------------------------- Hoy
function TabHoy({ hojas, porId, progMap, arr, hoy, puedeCapturar, onRegistrar }) {
  if (!arr) return <div style={{ color: '#888', fontSize: 13 }}>Captura la fecha de arranque para ver las partidas del día.</div>;
  const abiertas = hojas.filter(p => !p.terminada_en && Number(p.avance_pct) < 100);
  const conInfo = abiertas.map(p => {
    const dias = progMap.get(p.id) || [];
    const fechas = dias.map(x => +parse(fechaDe(arr, x.semana, x.dia)));
    return { p, hoyProg: dias.some(x => fechaDe(arr, x.semana, x.dia) === hoy), enCurso: fechas.length > 0 && Math.min(...fechas) <= +parse(hoy) && +parse(hoy) <= Math.max(...fechas), pp: progPct(p.id, progMap, arr, hoy) };
  });
  const atrasadas = conInfo.filter(x => x.pp !== null && Number(x.p.avance_pct) < x.pp - TOLERANCIA && !x.hoyProg);
  const deHoy = conInfo.filter(x => x.hoyProg || (x.enCurso && !atrasadas.includes(x)));
  const grupo = (titulo, lista, color) => lista.length > 0 && (
    <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, marginBottom: 14, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', background: '#f7f7f9', fontSize: 13, fontWeight: 700, color }}>{titulo} ({lista.length})</div>
      {lista.map(x => <FilaAvance key={x.p.id} p={x.p} progMap={progMap} arr={arr} hoy={hoy} puedeCapturar={puedeCapturar} onRegistrar={onRegistrar} ruta={rutaDe(x.p, porId)} />)}
    </div>
  );
  return (
    <div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Hoy {fechaCorta(hoy)}. Captura el % acumulado de cada partida; al llegar a 100% queda terminada.</div>
      {grupo('Atrasadas', atrasadas, '#C0392B')}
      {grupo('Programadas para hoy y en curso', deHoy, '#1a1a2e')}
      {atrasadas.length === 0 && deHoy.length === 0 && <div style={{ color: '#888', fontSize: 13 }}>No hay partidas programadas para hoy ni atrasadas.</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Avance
function TabAvance({ etapas, hijos, porId, progMap, arr, hoy, puedeCapturar, onRegistrar }) {
  const [abiertos, setAbiertos] = useState({});
  const alternar = (k) => setAbiertos(a => ({ ...a, [k]: !a[k] }));
  const cabecera = (clave, titulo, hs, depth, grande) => {
    const r = resumen(hs, progMap, arr);
    const abierto = !!abiertos[clave];
    return (
      <div onClick={() => alternar(clave)} style={{ padding: grande ? '12px 14px' : '8px 12px', paddingLeft: 14 + depth * 18, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: grande ? '#fff' : '#fafafc', borderTop: grande ? 'none' : '0.5px solid #f0f0f0' }}>
        <span style={{ fontSize: 10, transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
        <div style={{ fontSize: grande ? 14 : 13, fontWeight: 700, color: '#1a1a2e', minWidth: 130 }}>{titulo}</div>
        <div style={{ flex: '1 1 140px', maxWidth: 240 }}><Barra real={r.real} prog={r.programado} /></div>
        <div style={{ fontSize: 12, color: '#555' }}><b>{pct1(r.real)}</b>{r.programado !== null && <span style={{ color: '#888' }}> · prog. {pct1(r.programado)}</span>}</div>
        <div style={{ fontSize: 11, color: '#888' }}>{r.terminadas}/{r.total} terminadas{r.atrasadas > 0 && <span style={{ color: '#C0392B' }}> · {r.atrasadas} atrasadas</span>}</div>
      </div>
    );
  };
  const nodo = (p, depth) => {
    const h = hijos.get(p.id);
    if (!h) return <div key={p.id} style={{ paddingLeft: depth * 18 }}><FilaAvance p={p} progMap={progMap} arr={arr} hoy={hoy} puedeCapturar={puedeCapturar} onRegistrar={onRegistrar} /></div>;
    return (
      <div key={p.id}>
        {cabecera(p.id, p.descripcion, hojasDe(p, hijos), depth, false)}
        {abiertos[p.id] && h.map(x => nodo(x, depth + 1))}
      </div>
    );
  };
  return (
    <div>
      {etapas.map(et => (
        <div key={et.nombre} style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
          {cabecera(`et:${et.nombre}`, et.nombre, et.raices.flatMap(r => hojasDe(r, hijos)), 0, true)}
          {abiertos[`et:${et.nombre}`] && et.raices.map(r => nodo(r, 0))}
        </div>
      ))}
      {etapas.length === 0 && <div style={{ color: '#888', fontSize: 13 }}>Este frente aún no tiene partidas. Agrégalas en la pestaña Catálogo o Programa.</div>}
    </div>
  );
}

// -------------------------------------------------------------- Programa
function TabPrograma({ torre, etapas, hijos, progMap, arr, hoy, puedeEditar, filtroEtapa, setFiltroEtapa, partidas, onCambio }) {
  const [cerrados, setCerrados] = useState(new Set());
  const [rango, setRango] = useState(null);
  const [nueva, setNueva] = useState(null); // { padre, etapa }
  const [local, setLocal] = useState(null);
  const progMapVista = local || progMap;
  useEffect(() => { setLocal(null); }, [progMap]);

  let maxSemana = 4;
  partidas.forEach(p => (progMapVista.get(p.id) || []).forEach(x => { if (x.semana > maxSemana) maxSemana = x.semana; }));
  maxSemana += 1;
  const semanas = Array.from({ length: maxSemana }, (_, i) => i + 1);
  const visibles = etapas.filter(e => !filtroEtapa || e.nombre === filtroEtapa);
  const hoyPos = arr ? (() => { const dd = Math.floor((parse(hoy) - parse(arr)) / 86400000); return dd >= 0 ? { semana: Math.floor(dd / 7) + 1, dia: (dd % 7) + 1 } : null; })() : null;
  const alternarCierre = (id) => setCerrados(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const alternarDia = async (p, semana, dia, activo) => {
    if (!puedeEditar) return;
    const error = activo
      ? (await supabase.from('obra_programa').delete().eq('partida_id', p.id).eq('semana', semana).eq('dia', dia)).error
      : (await supabase.from('obra_programa').insert({ partida_id: p.id, semana, dia })).error;
    if (error) { alert('No se pudo cambiar el día: ' + error.message); return; }
    const nuevo = new Map(progMapVista);
    const lista = (nuevo.get(p.id) || []).filter(x => !(x.semana === semana && x.dia === dia));
    if (!activo) lista.push({ semana, dia });
    nuevo.set(p.id, lista);
    setLocal(nuevo);
  };

  const diasDe = (p) => {
    const hs = hojasDe(p, hijos);
    const set = new Set();
    hs.forEach(h => (progMapVista.get(h.id) || []).forEach(x => set.add(`${x.semana}-${x.dia}`)));
    return set;
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filtroEtapa} onChange={e => setFiltroEtapa(e.target.value)} style={inp}>
          <option value="">Todas las etapas</option>
          {etapas.map(e => <option key={e.nombre} value={e.nombre}>{e.nombre}</option>)}
        </select>
        {puedeEditar && <button onClick={() => setNueva({ padre: null, etapa: filtroEtapa || '' })} style={{ ...btn, background: '#1a1a2e', color: '#fff', border: 'none' }}>+ Partida</button>}
        <span style={{ fontSize: 11, color: '#888' }}>Cada cuadro es un día (L a D). {puedeEditar ? 'Clic para programar o quitar un día, o 📅 para programar un rango.' : ''} Las partidas con subpartidas muestran el conjunto de sus hijas.</span>
      </div>
      <div style={{ overflow: 'auto', maxHeight: '70vh', border: '0.5px solid #e0e0e0', borderRadius: 12, background: '#fff' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 3, background: '#f7f7f9', textAlign: 'left', padding: '8px 10px', minWidth: 300, borderBottom: '1px solid #e0e0e0' }}>Partida</th>
              {semanas.map(s => (
                <th key={s} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f7f7f9', padding: '4px 6px', borderBottom: '1px solid #e0e0e0', borderLeft: '1px solid #eee', minWidth: 92 }}>
                  <div style={{ fontWeight: 700, color: '#1a1a2e' }}>S{s}</div>
                  {arr && <div style={{ fontWeight: 400, color: '#999', fontSize: 10 }}>{fechaCorta(fechaDe(arr, s, 1))}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map(et => (
              <React.Fragment key={et.nombre}>
                <tr><td colSpan={semanas.length + 1} style={{ position: 'sticky', left: 0, background: '#1a1a2e', color: '#fff', padding: '6px 10px', fontWeight: 700 }}>
                  {et.nombre}
                  {puedeEditar && <button onClick={() => setNueva({ padre: null, etapa: et.nombre })} style={{ ...btn, marginLeft: 12, padding: '1px 8px', fontSize: 10 }}>+ partida</button>}
                </td></tr>
                {aplanar(et.raices, hijos, cerrados).map(({ p, depth, hoja }) => {
                  const set = hoja ? new Set((progMapVista.get(p.id) || []).map(x => `${x.semana}-${x.dia}`)) : diasDe(p);
                  return (
                    <tr key={p.id}>
                      <td style={{ position: 'sticky', left: 0, background: hoja ? '#fff' : '#fafafc', padding: '4px 10px', paddingLeft: 10 + depth * 16, borderBottom: '0.5px solid #f0f0f0', whiteSpace: 'nowrap', color: p.terminada_en ? '#27500A' : '#1a1a2e', fontWeight: hoja ? 400 : 700 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: 270 }}>
                          {!hoja ? <span onClick={() => alternarCierre(p.id)} style={{ cursor: 'pointer', fontSize: 9, display: 'inline-block', width: 10, transform: cerrados.has(p.id) ? 'none' : 'rotate(90deg)' }}>▶</span> : <span style={{ width: 10 }} />}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.descripcion}>{hoja && p.terminada_en ? '✓ ' : ''}{p.descripcion}</span>
                          {puedeEditar && <button onClick={() => setNueva({ padre: p, etapa: p.etapa })} title="Agregar subpartida" style={{ ...btn, padding: '0 6px', fontSize: 10, marginLeft: 4 }}>+</button>}
                          {puedeEditar && hoja && <button onClick={() => setRango(p)} title="Programar un rango de días" style={{ ...btn, padding: '0 5px', fontSize: 10 }}>📅</button>}
                        </span>
                      </td>
                      {semanas.map(s => (
                        <td key={s} style={{ padding: '4px 6px', borderBottom: '0.5px solid #f0f0f0', borderLeft: '1px solid #f3f3f3' }}>
                          <div style={{ display: 'flex', gap: 2 }}>
                            {DIAS.map((l, i) => {
                              const activo = set.has(`${s}-${i + 1}`);
                              const esHoy = hoyPos && hoyPos.semana === s && hoyPos.dia === i + 1;
                              const pasado = arr && fechaDe(arr, s, i + 1) < hoy;
                              return (
                                <div key={i} onClick={hoja ? () => alternarDia(p, s, i + 1, activo) : undefined} title={`${arr ? fechaCorta(fechaDe(arr, s, i + 1)) : `Semana ${s}`} (${l})`}
                                  style={{ width: 10, height: 14, borderRadius: 2, cursor: puedeEditar && hoja ? 'pointer' : 'default',
                                    background: activo ? (hoja ? (pasado ? '#1a1a2e' : '#3B82F6') : '#A5B4CF') : (esHoy ? '#FDE2E2' : '#f1f1f4'),
                                    outline: esHoy ? '1.5px solid #C0392B' : 'none' }} />
                              );
                            })}
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {rango && <ModalRango p={rango} arr={arr} onCerrar={() => setRango(null)} onGuardado={() => { setRango(null); onCambio(); }} />}
      {nueva && <ModalPartida torre={torre} partidas={partidas} hijos={hijos} etapas={etapas} padre={nueva.padre} etapaInicial={nueva.etapa} progMap={progMap}
        onCerrar={() => setNueva(null)} onCreada={() => { setNueva(null); onCambio(); }} />}
    </div>
  );
}

function ModalRango({ p, arr, onCerrar, onGuardado }) {
  const actual = [];
  const [s1, setS1] = useState(1); const [d1, setD1] = useState(1);
  const [s2, setS2] = useState(1); const [d2, setD2] = useState(5);
  const [sinDomingo, setSinDomingo] = useState(true);
  const [guardando, setGuardando] = useState(false);
  void actual;
  const dias = [];
  const ini = (Number(s1) - 1) * 7 + (Number(d1) - 1), fin = (Number(s2) - 1) * 7 + (Number(d2) - 1);
  for (let i = ini; i <= fin && i - ini < 700; i++) { const dia = (i % 7) + 1; if (sinDomingo && dia === 7) continue; dias.push({ semana: Math.floor(i / 7) + 1, dia }); }

  const guardar = async () => {
    if (fin < ini) { alert('El final no puede ser antes del inicio.'); return; }
    setGuardando(true);
    const { error: e1 } = await supabase.from('obra_programa').delete().eq('partida_id', p.id);
    if (e1) { alert('No se pudo guardar: ' + e1.message); setGuardando(false); return; }
    if (dias.length > 0) {
      const { error: e2 } = await supabase.from('obra_programa').insert(dias.map(d => ({ partida_id: p.id, ...d })));
      if (e2) { alert('No se pudo guardar: ' + e2.message); setGuardando(false); return; }
    }
    onGuardado();
  };
  const sel = (v, set, max = 60) => <input type="number" min="1" max={max} value={v} onChange={e => set(e.target.value)} style={{ ...inp, width: 70 }} />;
  const selDia = (v, set) => <select value={v} onChange={e => set(Number(e.target.value))} style={inp}>{DIAS.map((l, i) => <option key={i} value={i + 1}>{['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][i]}</option>)}</select>;
  return (
    <Modal titulo={`Programar: ${p.descripcion}`} onCerrar={onCerrar}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Reemplaza todos los días programados de esta partida por el rango que elijas.</div>
      <label style={lbl}>Desde</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>Semana {sel(s1, setS1)} {selDia(d1, setD1)}{arr && Number(s1) > 0 && <span style={{ fontSize: 11, color: '#888' }}>{fechaCorta(fechaDe(arr, Number(s1), d1))}</span>}</div>
      <label style={lbl}>Hasta</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>Semana {sel(s2, setS2)} {selDia(d2, setD2)}{arr && Number(s2) > 0 && <span style={{ fontSize: 11, color: '#888' }}>{fechaCorta(fechaDe(arr, Number(s2), d2))}</span>}</div>
      <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}><input type="checkbox" checked={sinDomingo} onChange={e => setSinDomingo(e.target.checked)} /> No programar domingos</label>
      <div style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>{dias.length} días programados.</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCerrar} style={{ ...btn, flex: 1 }}>Cancelar</button>
        <button onClick={guardar} disabled={guardando || fin < ini} style={{ ...btn, flex: 1, background: '#1a1a2e', color: '#fff', border: 'none' }}>{guardando ? 'Guardando...' : 'Guardar programa'}</button>
      </div>
    </Modal>
  );
}

// Agrega una partida (sin padre: elige etapa) o una subpartida (con padre).
function ModalPartida({ torre, partidas, hijos, etapas, padre, etapaInicial, progMap, onCerrar, onCreada }) {
  const [etapa, setEtapa] = useState(padre ? padre.etapa : (etapaInicial || (etapas[0]?.nombre || '__nueva')));
  const [etapaNueva, setEtapaNueva] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [unidad, setUnidad] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [guardando, setGuardando] = useState(false);
  const esPrimeraHija = !!padre && !hijos.has(padre.id);

  const crear = async () => {
    const nombreEtapa = padre ? padre.etapa : (etapa === '__nueva' ? etapaNueva.trim() : etapa);
    if (!nombreEtapa || !descripcion.trim()) { alert('Indica la etapa y la descripción.'); return; }
    const existente = etapas.find(e => e.nombre === nombreEtapa);
    const etapaOrden = padre ? padre.etapa_orden : (existente ? existente.orden : (Math.max(0, ...etapas.map(e => e.orden)) + 1));
    const hermanos = padre ? (hijos.get(padre.id) || []) : (existente ? existente.raices : []);
    const orden = Math.max(0, ...hermanos.map(h => h.orden)) + 1;
    setGuardando(true);
    // La primera subpartida de una partida con avance o programa los hereda, para no perder lo capturado.
    const hereda = esPrimeraHija;
    const { data, error } = await supabase.from('obra_partidas').insert({
      torre_id: torre.id, parent_id: padre ? padre.id : null, etapa: nombreEtapa, etapa_orden: etapaOrden, orden,
      descripcion: descripcion.trim(), unidad: unidad.trim().toUpperCase() || (hereda ? padre.unidad : null),
      cantidad: num(cantidad) ?? (hereda ? padre.cantidad : null), avance_pct: hereda ? Number(padre.avance_pct || 0) : 0,
    }).select().single();
    if (error) { alert('No se pudo agregar: ' + error.message); setGuardando(false); return; }
    if (hereda) {
      const dias = (progMap.get(padre.id) || []).map(d => ({ partida_id: data.id, semana: d.semana, dia: d.dia }));
      if (dias.length > 0) await supabase.from('obra_programa').insert(dias);
    }
    onCreada();
  };

  return (
    <Modal titulo={padre ? `Subpartida de "${padre.descripcion}"` : 'Nueva partida'} onCerrar={onCerrar}>
      {!padre && (<>
        <label style={lbl}>Etapa</label>
        <select value={etapa} onChange={e => setEtapa(e.target.value)} style={{ ...inp, width: '100%', marginBottom: 6 }}>
          {etapas.map(e => <option key={e.nombre} value={e.nombre}>{e.nombre}</option>)}
          <option value="__nueva">+ Etapa nueva</option>
        </select>
        {etapa === '__nueva' && <input placeholder="Nombre de la etapa" value={etapaNueva} onChange={e => setEtapaNueva(e.target.value)} style={{ ...inp, width: '100%', marginBottom: 8 }} />}
      </>)}
      <label style={lbl}>Descripción</label>
      <input value={descripcion} onChange={e => setDescripcion(e.target.value)} autoFocus style={{ ...inp, width: '100%', marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}><label style={lbl}>Unidad</label><input value={unidad} onChange={e => setUnidad(e.target.value)} placeholder="M2, KG, PZA…" style={{ ...inp, width: '100%' }} /></div>
        <div style={{ flex: 1 }}><label style={lbl}>Cantidad</label><input type="number" value={cantidad} onChange={e => setCantidad(e.target.value)} style={{ ...inp, width: '100%' }} /></div>
      </div>
      {esPrimeraHija && <div style={{ fontSize: 11, color: '#856404', background: '#FFF8E1', padding: '8px 10px', borderRadius: 8, marginBottom: 10 }}>
        "{padre.descripcion}" pasará a ser la suma de sus subpartidas. Esta primera subpartida hereda su avance ({pct1(padre.avance_pct)}) y su programa; si no escribes cantidad, hereda también la cantidad.
      </div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCerrar} style={{ ...btn, flex: 1 }}>Cancelar</button>
        <button onClick={crear} disabled={guardando} style={{ ...btn, flex: 1, background: '#1a1a2e', color: '#fff', border: 'none' }}>{guardando ? 'Guardando...' : 'Agregar'}</button>
      </div>
    </Modal>
  );
}

// Divide una partida hoja en subpartidas (por ejemplo, dos contratistas de muros).
function ModalDividir({ torre, p, hijos, progMap, puedeCostos, onCerrar, onCreada }) {
  const [n, setN] = useState(2);
  const [partes, setPartes] = useState(() => [0, 1].map(i => ({ nombre: `Parte ${i + 1}`, cantidad: p.cantidad ? String(Math.round((p.cantidad / 2) * 100) / 100) : '' })));
  const [guardando, setGuardando] = useState(false);
  const cambiarN = (v) => {
    const k = Math.max(2, Math.min(8, Number(v) || 2)); setN(k);
    setPartes(Array.from({ length: k }, (_, i) => ({ nombre: partes[i]?.nombre || `Parte ${i + 1}`, cantidad: p.cantidad ? (i < k - 1 ? String(Math.round((p.cantidad / k) * 100) / 100) : String(Math.round((p.cantidad - Math.round((p.cantidad / k) * 100) / 100 * (k - 1)) * 100) / 100)) : '' })));
  };
  const suma = partes.reduce((t, x) => t + (Number(x.cantidad) || 0), 0);
  const descuadre = p.cantidad ? Math.abs(suma - Number(p.cantidad)) > 0.011 : false;

  const crear = async () => {
    if (partes.some(x => !x.nombre.trim())) { alert('Cada parte necesita un nombre (por ejemplo el contratista).'); return; }
    if (descuadre && !window.confirm(`Las cantidades suman ${fmtN(suma)} y la partida tiene ${fmtN(p.cantidad)}. ¿Dividir de todos modos?`)) return;
    setGuardando(true);
    const filas = partes.map((x, i) => ({
      torre_id: torre.id, parent_id: p.id, etapa: p.etapa, etapa_orden: p.etapa_orden, orden: i + 1,
      descripcion: `${p.descripcion} – ${x.nombre.trim()}`, unidad: p.unidad, cantidad: num(x.cantidad),
      precio_unitario: puedeCostos ? p.precio_unitario : null, avance_pct: Number(p.avance_pct || 0),
    }));
    const { data, error } = await supabase.from('obra_partidas').insert(filas).select();
    if (error) { alert('No se pudo dividir: ' + error.message); setGuardando(false); return; }
    const dias = (progMap.get(p.id) || []);
    if (dias.length > 0) await supabase.from('obra_programa').insert(data.flatMap(h => dias.map(d => ({ partida_id: h.id, semana: d.semana, dia: d.dia }))));
    onCreada();
  };

  return (
    <Modal titulo={`Dividir: ${p.descripcion}`} onCerrar={onCerrar} ancho={520}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Crea una subpartida por cada parte (por ejemplo, un contratista cada una). Cada subpartida lleva su propio avance, contrato y costo, y hereda el programa, el precio y el avance actual.</div>
      <label style={lbl}>Número de partes</label>
      <input type="number" min="2" max="8" value={n} onChange={e => cambiarN(e.target.value)} style={{ ...inp, width: 80, marginBottom: 10 }} />
      {partes.map((x, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <input value={x.nombre} onChange={e => setPartes(ps => ps.map((y, j) => j === i ? { ...y, nombre: e.target.value } : y))} placeholder="Nombre / contratista" style={{ ...inp, flex: 1 }} />
          <input type="number" value={x.cantidad} onChange={e => setPartes(ps => ps.map((y, j) => j === i ? { ...y, cantidad: e.target.value } : y))} placeholder="Cantidad" style={{ ...inp, width: 110, textAlign: 'right' }} />
          <span style={{ width: 40, fontSize: 11, color: '#888', alignSelf: 'center' }}>{p.unidad || ''}</span>
        </div>
      ))}
      {p.cantidad > 0 && <div style={{ fontSize: 12, color: descuadre ? '#C0392B' : '#27500A', marginBottom: 10 }}>Suma {fmtN(suma)} de {fmtN(p.cantidad)} {p.unidad || ''}{descuadre ? ' — no coincide' : ' ✓'}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCerrar} style={{ ...btn, flex: 1 }}>Cancelar</button>
        <button onClick={crear} disabled={guardando} style={{ ...btn, flex: 1, background: '#1a1a2e', color: '#fff', border: 'none' }}>{guardando ? 'Dividiendo...' : 'Dividir'}</button>
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------- Catálogo
function TabCatalogo({ torre, partidas, etapas, hijos, progMap, puedeEditar, puedeCostos, contratos, contratistas, onCambio }) {
  const [cerrados, setCerrados] = useState(new Set());
  const [nueva, setNueva] = useState(null);
  const [dividiendo, setDividiendo] = useState(null);
  const nombreContrato = (id) => { const c = contratos.find(x => x.id === id); if (!c) return ''; return (contratistas.find(x => x.id === c.contratista_id)?.nombre || 'Contratista') + (c.concepto ? ` · ${c.concepto}` : ''); };
  const alternarCierre = (id) => setCerrados(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const guardarCampo = async (p, campo, valor) => {
    if (campo === 'precio_unitario' ? !puedeCostos : !puedeEditar) return;
    const v = (campo === 'cantidad' || campo === 'precio_unitario') ? num(valor) : (String(valor).trim() || null);
    if (campo === 'descripcion' && !v) return;
    if (v === p[campo] || (v === null && p[campo] === null)) return;
    const { error } = await supabase.from('obra_partidas').update({ [campo]: v }).eq('id', p.id);
    if (error) alert('No se pudo guardar: ' + error.message);
    onCambio();
  };
  const eliminar = async (p) => {
    if (!puedeEditar) return;
    const n = hojasDe(p, hijos).length;
    if (!window.confirm(`¿Eliminar "${p.descripcion}"${hijos.has(p.id) ? ` y sus ${n} subpartidas` : ''}? Se borra también su programa y su historial de avance.`)) return;
    const { error } = await supabase.from('obra_partidas').delete().eq('id', p.id);
    if (error) { alert('No se pudo eliminar: ' + error.message); return; }
    onCambio();
  };
  const mover = async (p, dir) => {
    const hermanos = (p.parent_id ? hijos.get(p.parent_id) : etapas.find(e => e.nombre === p.etapa)?.raices) || [];
    const i = hermanos.findIndex(x => x.id === p.id), j = i + dir;
    if (j < 0 || j >= hermanos.length) return;
    const otro = hermanos[j];
    await supabase.from('obra_partidas').update({ orden: otro.orden }).eq('id', p.id);
    await supabase.from('obra_partidas').update({ orden: p.orden }).eq('id', otro.id);
    onCambio();
  };

  return (
    <div>
      {puedeEditar && <div style={{ marginBottom: 12 }}><button onClick={() => setNueva({ padre: null, etapa: '' })} style={{ ...btn, background: '#1a1a2e', color: '#fff', border: 'none' }}>+ Partida</button>
        <span style={{ fontSize: 11, color: '#888', marginLeft: 10 }}>Usa "+ sub" en una fila para crear subpartidas (a cualquier nivel) y "Dividir" para repartir una partida entre varios contratistas.</span></div>}
      {etapas.map(et => (
        <div key={et.nombre} style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', background: '#f7f7f9', fontSize: 13, fontWeight: 700, display: 'flex', gap: 10, alignItems: 'center' }}>
            {et.nombre} <span style={{ fontWeight: 400, color: '#888' }}>· {et.raices.flatMap(r => hojasDe(r, hijos)).length} partidas</span>
            {puedeEditar && <button onClick={() => setNueva({ padre: null, etapa: et.nombre })} style={{ ...btn, padding: '2px 8px', fontSize: 11 }}>+ partida</button>}
          </div>
          {aplanar(et.raices, hijos, cerrados).map(({ p, depth, hoja }) => {
            const hs = hoja ? [p] : hojasDe(p, hijos);
            const pres = hs.reduce((t, x) => t + (Number(x.cantidad) || 0) * (Number(x.precio_unitario) || 0), 0);
            return (
              <div key={p.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '5px 12px', paddingLeft: 12 + depth * 20, borderBottom: '0.5px solid #f3f3f3', flexWrap: 'wrap', background: hoja ? '#fff' : '#fafafc' }}>
                {!hoja ? <span onClick={() => alternarCierre(p.id)} style={{ cursor: 'pointer', fontSize: 9, width: 10, display: 'inline-block', transform: cerrados.has(p.id) ? 'none' : 'rotate(90deg)' }}>▶</span> : <span style={{ width: 10 }} />}
                <input defaultValue={p.descripcion} disabled={!puedeEditar} onBlur={e => guardarCampo(p, 'descripcion', e.target.value)} style={{ ...inp, flex: '1 1 220px', fontWeight: hoja ? 400 : 700, border: puedeEditar ? inp.border : 'none' }} />
                {hoja ? (<>
                  <input defaultValue={p.unidad || ''} disabled={!puedeEditar} onBlur={e => guardarCampo(p, 'unidad', e.target.value.toUpperCase())} style={{ ...inp, width: 64 }} />
                  <input type="number" defaultValue={p.cantidad ?? ''} disabled={!puedeEditar} onBlur={e => guardarCampo(p, 'cantidad', e.target.value)} style={{ ...inp, width: 96, textAlign: 'right' }} />
                  <PrecioCelda p={p} disabled={!puedeCostos} onGuardar={guardarCampo} />
                </>) : <span style={{ fontSize: 11, color: '#888', width: 270, textAlign: 'right' }}>suma de {hs.length} subpartidas</span>}
                <span style={{ width: 110, fontSize: 11, color: '#555', textAlign: 'right' }} title="Presupuesto = cantidad × precio unitario">{pres > 0 ? $(pres) : ''}</span>
                {hoja && p.contrato_id && <span style={{ fontSize: 10, color: '#3B82F6', background: '#EFF6FF', padding: '2px 8px', borderRadius: 20 }} title="Contrato">{nombreContrato(p.contrato_id)}</span>}
                {hoja && p.solo_programa && <span style={{ fontSize: 10, color: '#856404', background: '#FFF8E1', padding: '2px 8px', borderRadius: 20 }} title="Está en el programa del Excel pero no en el catálogo de cantidades">sin cantidad</span>}
                {puedeEditar && (<>
                  <button onClick={() => mover(p, -1)} title="Subir" style={{ ...btn, padding: '2px 6px' }}>↑</button>
                  <button onClick={() => mover(p, 1)} title="Bajar" style={{ ...btn, padding: '2px 6px' }}>↓</button>
                  <button onClick={() => setNueva({ padre: p, etapa: p.etapa })} style={{ ...btn, padding: '2px 8px' }}>+ sub</button>
                  {hoja && <button onClick={() => setDividiendo(p)} style={{ ...btn, padding: '2px 8px' }}>Dividir</button>}
                  <button onClick={() => eliminar(p)} style={{ ...btn, color: '#C0392B', padding: '2px 8px' }}>Eliminar</button>
                </>)}
              </div>
            );
          })}
        </div>
      ))}
      {etapas.length === 0 && <div style={{ color: '#888', fontSize: 13 }}>Aún no hay partidas.{puedeEditar ? ' Agrega la primera con "+ Partida".' : ''}</div>}
      {nueva && <ModalPartida torre={torre} partidas={partidas} hijos={hijos} etapas={etapas} padre={nueva.padre} etapaInicial={nueva.etapa} progMap={progMap}
        onCerrar={() => setNueva(null)} onCreada={() => { setNueva(null); onCambio(); }} />}
      {dividiendo && <ModalDividir torre={torre} p={dividiendo} hijos={hijos} progMap={progMap} puedeCostos={puedeCostos} onCerrar={() => setDividiendo(null)} onCreada={() => { setDividiendo(null); onCambio(); }} />}
    </div>
  );
}

// Página completa: título + lista de frentes / detalle del frente abierto.
export default function ObraTorres() {
  const isMobile = useIsMobile();
  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Programa</h2>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '1rem' }}>Programa de obra: partidas y subpartidas, calendario semanal, avance real y costos de la mano de obra</div>
      <ListaObra />
    </div>
  );
}
