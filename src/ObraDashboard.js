import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from './supabase';
import { usePuede } from './PermisosContext';
import {
  resumen, progPct, Barra, Tarjeta, traerTodo, useIsMobile, parse, hoyISO, fechaCorta, pct1, $,
  indexar, hojasDe, etapasDe, rutaDe, TIPOS_FRENTE, nombreFrente, TOLERANCIA, fechaDe, curvaS,
} from './ObraTorres';

// Dashboard de obra — una sola hoja con el avance real contra el programado de cada proyecto.
// Solo aparecen los proyectos que tienen al menos un frente con programa capturado
// (un desarrollo de pura comercialización no trae obra y no aparece).
const SERIE_REAL = '#2a78d6';
const SERIE_PROG = '#eb6834';
const VERDE = '#10B981';
const ROJO = '#C0392B';
const sel = { padding: '6px 8px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' };

const colorDesv = (d) => (d === null ? '#888' : d >= -TOLERANCIA ? VERDE : ROJO);
const textoDesv = (d) => (d === null ? '—' : `${d >= 0 ? '+' : ''}${Math.round(d * 10) / 10} pts`);

function Chip({ children, color = '#555', fondo = '#f3f3f5' }) {
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: fondo, color, whiteSpace: 'nowrap' }}>{children}</span>;
}

function EstadoChip({ f }) {
  if (f.r.programado === null) return <Chip color="#856404" fondo="#FFF8E1">Sin fecha de arranque</Chip>;
  if (f.r.atrasadas > 0 && f.desv < -TOLERANCIA) return <Chip color={ROJO} fondo="#FDECEC">Atrasado</Chip>;
  if (f.r.real >= 100) return <Chip color="#27500A" fondo="#EAF3DE">Terminado</Chip>;
  return <Chip color="#27500A" fondo="#EAF3DE">En tiempo</Chip>;
}


// Curva S: avance real contra programado semana a semana. Dos series en un solo eje (0-100%),
// leyenda siempre, etiquetas directas al final de cada línea, tooltip al pasar y vista de tabla.
function CurvaS({ curva }) {
  const [hover, setHover] = useState(null);
  const [tabla, setTabla] = useState(false);
  const W = 680, H = 230, ML = 38, MR = 74, MT = 14, MB = 26;
  const xMax = Math.max(curva.maxSem, curva.proy ? Math.min(curva.proy.semFin, curva.maxSem * 1.6) : 0);
  const X = (w) => ML + (w / xMax) * (W - ML - MR);
  const Y = (v) => MT + (1 - v / 100) * (H - MT - MB);
  const pts = (arr) => arr.map(([w, v]) => `${X(w).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const prog = curva.filas.map(f => [f.w, f.prog]);
  const real = curva.filas.filter(f => f.real !== null && f.w <= curva.xHoy).map(f => [f.w, f.real]);
  if (curva.realHoy !== null && curva.xHoy >= 0) real.push([Math.min(curva.xHoy, curva.maxSem), curva.realHoy]);
  const ultimo = real[real.length - 1];
  const paso = Math.max(1, Math.ceil(curva.maxSem / 8));
  const ticks = []; for (let w = 0; w <= xMax; w += paso) ticks.push(w);
  const sobre = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(curva.maxSem, Math.round(((x - ML) / (W - ML - MR)) * xMax))));
  };
  const hf = hover !== null ? curva.filas[hover] : null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>Curva S · avance acumulado</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#555' }}><span style={{ width: 16, height: 2, background: SERIE_REAL, display: 'inline-block' }} />Avance real</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#555' }}><span style={{ width: 16, borderTop: `2px dashed ${SERIE_PROG}`, display: 'inline-block' }} />Programado</span>
        <button onClick={() => setTabla(t => !t)} style={{ ...sel, padding: '2px 8px', background: '#fff', cursor: 'pointer', color: '#555', marginLeft: 'auto' }}>{tabla ? 'Ver gráfica' : 'Ver tabla'}</button>
      </div>
      {curva.proy ? (
        <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>
          Al ritmo actual terminaría el <b>{fechaCorta(curva.proy.fecha)} {parse(curva.proy.fecha).getFullYear()}</b>
          {Math.abs(curva.proy.difSem) < 0.5 ? ', en la fecha programada' : curva.proy.difSem > 0 ? `, unas ${Math.round(curva.proy.difSem)} semanas después de lo programado` : `, unas ${Math.round(-curva.proy.difSem)} semanas antes de lo programado`}.
        </div>
      ) : <div style={{ fontSize: 11, color: '#aaa', marginBottom: 6 }}>{curva.realHoy > 0 ? '' : 'Sin avance registrado todavía: la proyección aparece en cuanto haya avance.'}</div>}
      {tabla ? (
        <div style={{ maxHeight: 240, overflow: 'auto', border: '0.5px solid #eee', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr style={{ background: '#f7f7f9', textAlign: 'right' }}><th style={{ textAlign: 'left', padding: '4px 8px' }}>Semana</th><th style={{ padding: '4px 8px' }}>Fin de semana</th><th style={{ padding: '4px 8px' }}>Programado</th><th style={{ padding: '4px 8px' }}>Real</th></tr></thead>
            <tbody>{curva.filas.map(f => (
              <tr key={f.w} style={{ borderTop: '0.5px solid #f3f3f3', textAlign: 'right' }}>
                <td style={{ textAlign: 'left', padding: '3px 8px' }}>{f.w === 0 ? 'Arranque' : `S${f.w}`}</td><td style={{ padding: '3px 8px' }}>{f.fecha ? fechaCorta(f.fecha) : '—'}</td>
                <td style={{ padding: '3px 8px' }}>{pct1(f.prog)}</td><td style={{ padding: '3px 8px' }}>{f.real === null ? '—' : pct1(f.real)}</td>
              </tr>))}</tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Curva S de avance real contra programado">
            {[0, 25, 50, 75, 100].map(v => (
              <g key={v}><line x1={ML} x2={W - MR} y1={Y(v)} y2={Y(v)} stroke="#ececef" strokeWidth="1" />
                <text x={ML - 6} y={Y(v) + 3} textAnchor="end" fontSize="10" fill="#888">{v}%</text></g>
            ))}
            {ticks.map(w => <text key={w} x={X(w)} y={H - 8} textAnchor="middle" fontSize="10" fill="#888">{w === 0 ? '0' : `S${w}`}</text>)}
            {curva.xHoy >= 0 && curva.xHoy <= curva.maxSem && (
              <g><line x1={X(curva.xHoy)} x2={X(curva.xHoy)} y1={MT} y2={H - MB} stroke="#c9c9cf" strokeWidth="1" />
                <text x={X(curva.xHoy)} y={MT - 3} textAnchor="middle" fontSize="9" fill="#888">hoy</text></g>
            )}
            <polyline points={pts(prog)} fill="none" stroke={SERIE_PROG} strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
            {curva.proy && ultimo && <polyline points={pts([ultimo, [Math.min(curva.proy.semFin, xMax), 100]])} fill="none" stroke={SERIE_REAL} strokeOpacity="0.45" strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" />}
            {real.length > 1 && <polyline points={pts(real)} fill="none" stroke={SERIE_REAL} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
            {ultimo && <circle cx={X(ultimo[0])} cy={Y(ultimo[1])} r="4.5" fill={SERIE_REAL} stroke="#fff" strokeWidth="2" />}
            <text x={W - MR + 6} y={Y(prog[prog.length - 1][1]) + 3} fontSize="10" fill="#555">Programado</text>
            {ultimo && <text x={Math.min(X(ultimo[0]) + 8, W - 40)} y={Y(ultimo[1]) - 8} fontSize="10" fill="#555">{pct1(ultimo[1])}</text>}
            {hf && <g><line x1={X(hf.w)} x2={X(hf.w)} y1={MT} y2={H - MB} stroke="#9a9aa2" strokeWidth="1" />
              <circle cx={X(hf.w)} cy={Y(hf.prog)} r="4" fill={SERIE_PROG} stroke="#fff" strokeWidth="2" />
              {hf.real !== null && <circle cx={X(hf.w)} cy={Y(hf.real)} r="4" fill={SERIE_REAL} stroke="#fff" strokeWidth="2" />}</g>}
            <rect x={ML} y={MT} width={W - ML - MR} height={H - MT - MB} fill="transparent" onMouseMove={sobre} onMouseLeave={() => setHover(null)} />
          </svg>
          {hf && (
            <div style={{ position: 'absolute', top: 6, left: `${Math.min(80, (X(hf.w) / W) * 100 + 2)}%`, background: '#fff', border: '0.5px solid #ddd', borderRadius: 8, padding: '6px 10px', fontSize: 11, pointerEvents: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{hf.w === 0 ? 'Arranque' : `Semana ${hf.w} · ${fechaCorta(hf.fecha)}`}</div>
              <div style={{ color: '#555' }}>Programado: <b>{pct1(hf.prog)}</b></div>
              <div style={{ color: '#555' }}>Real: <b>{hf.real === null ? '—' : pct1(hf.real)}</b></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilaFrente({ f, verCostos, abierto, onAlternar, isMobile }) {
  const { t, r, desv } = f;
  return (
    <div style={{ borderTop: '0.5px solid #eee' }}>
      <div onClick={onAlternar} style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: '12px 14px', cursor: 'pointer' }}>
        <span style={{ fontSize: 10, transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
        <div style={{ flex: isMobile ? '1 1 60%' : '0 0 210px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>{nombreFrente(t)}</div>
          <div style={{ fontSize: 11, color: '#888' }}>
            {TIPOS_FRENTE[t.tipo] || t.tipo}{t.tipo === 'tren' && t.num_viviendas ? ` · ${t.num_viviendas} viviendas` : ''}
          </div>
        </div>
        <div style={{ flex: '1 1 180px', minWidth: 160 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <b>{pct1(r.real)}</b>
            <span style={{ color: '#888' }}>{r.programado === null ? 'sin programado' : `prog. ${pct1(r.programado)}`}</span>
          </div>
          <Barra real={r.real} prog={r.programado} />
        </div>
        <div style={{ flex: '0 0 90px', textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colorDesv(desv) }}>{textoDesv(desv)}</div>
          <div style={{ fontSize: 10, color: '#aaa' }}>desviación</div>
        </div>
        <div style={{ flex: '0 0 110px', textAlign: 'right', fontSize: 12 }}>
          <div><b>{r.terminadas}</b><span style={{ color: '#888' }}> / {r.total} terminadas</span></div>
          <div style={{ fontSize: 10, color: r.atrasadas > 0 ? ROJO : '#aaa' }}>{r.atrasadas} atrasadas</div>
        </div>
        <div style={{ flex: '0 0 130px', textAlign: 'right', fontSize: 11, color: '#555' }}>
          {f.semanaTxt}
          {f.terminaTxt && <div style={{ color: '#aaa', fontSize: 10 }}>{f.terminaTxt}</div>}
        </div>
        <EstadoChip f={f} />
        {verCostos && (
          <div style={{ flex: '0 0 150px', textAlign: 'right', fontSize: 11 }}>
            <div style={{ color: '#555' }}>Pagado {f.presupuesto > 0 ? pct1((f.pagado / f.presupuesto) * 100) : '—'}</div>
            <div style={{ color: '#aaa', fontSize: 10 }}>{$(f.pagado)} de {$(f.presupuesto)}</div>
          </div>
        )}
      </div>
      {abierto && (
        <div style={{ padding: '4px 14px 16px 40px' }}>
          {f.curva && <CurvaS curva={f.curva} />}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', minWidth: 280 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>Avance por etapa</div>
            {f.etapas.map(e => (
              <div key={e.nombre} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ flex: '0 0 150px', fontSize: 12, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.nombre}>{e.nombre}</div>
                <div style={{ flex: 1 }}><Barra real={e.r.real} prog={e.r.programado} alto={6} /></div>
                <div style={{ flex: '0 0 52px', fontSize: 12, textAlign: 'right' }}><b>{pct1(e.r.real)}</b></div>
                <div style={{ flex: '0 0 74px', fontSize: 10, color: e.r.atrasadas > 0 ? ROJO : '#aaa', textAlign: 'right' }}>{e.r.atrasadas > 0 ? `${e.r.atrasadas} atrasadas` : `${e.r.terminadas}/${e.r.total} term.`}</div>
              </div>
            ))}
          </div>
          <div style={{ flex: '1 1 320px', minWidth: 280 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>Partidas más atrasadas</div>
            {f.atrasadas.length === 0 ? <div style={{ fontSize: 12, color: '#888' }}>Ninguna partida atrasada.</div> : f.atrasadas.map(x => (
              <div key={x.p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 0', borderBottom: '0.5px solid #f3f3f3' }}>
                <div style={{ flex: 1, fontSize: 12, color: '#333', minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.ruta}>{x.p.descripcion}</div>
                  <div style={{ fontSize: 10, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.ruta}</div>
                </div>
                <div style={{ fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <b>{pct1(x.p.avance_pct)}</b> <span style={{ color: '#888' }}>de {pct1(x.pp)}</span>
                  <div style={{ fontSize: 10, color: ROJO }}>{Math.round((x.pp - Number(x.p.avance_pct)) * 10) / 10} pts abajo</div>
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ObraDashboard() {
  const puede = usePuede();
  const verCostos = puede('construccion.editar_costos_obra') || puede('construccion.registrar_pagos_obra');
  const isMobile = useIsMobile();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [datos, setDatos] = useState({ torres: [], partidas: [], programa: [], contratos: [], pagos: [], avances: [] });
  const [filtro, setFiltro] = useState('');
  const [abiertos, setAbiertos] = useState({});

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const [torres, partidas, programa, contratos, pagos, avances] = await Promise.all([
        traerTodo(() => supabase.from('obra_torres').select('*, desarrollos(id, nombre)').eq('es_plantilla', false).order('created_at')),
        traerTodo(() => supabase.from('obra_partidas').select('id, torre_id, parent_id, etapa, etapa_orden, orden, descripcion, avance_pct, cantidad, precio_unitario, terminada_en, contrato_id').order('id')),
        traerTodo(() => supabase.from('obra_programa').select('partida_id, semana, dia').order('partida_id').order('semana').order('dia')),
        verCostos ? traerTodo(() => supabase.from('obra_contratos').select('id, torre_id, tipo, monto_fijo').order('id')) : Promise.resolve([]),
        verCostos ? traerTodo(() => supabase.from('obra_pagos').select('contrato_id, monto').order('id')) : Promise.resolve([]),
        traerTodo(() => supabase.from('obra_avance').select('partida_id, fecha, pct, created_at').order('partida_id').order('fecha').order('created_at')),
      ]);
      setDatos({ torres, partidas, programa, contratos, pagos, avances });
    } catch (e) { setError(e.message || String(e)); }
    setCargando(false);
  }, [verCostos]);
  useEffect(() => { cargar(); }, [cargar]);

  const hoy = hoyISO();
  const { proyectos, sinPrograma, global } = useMemo(() => {
    const { torres, partidas, programa, contratos, pagos, avances } = datos;
    const hist = new Map();
    avances.forEach(a => { if (!hist.has(a.partida_id)) hist.set(a.partida_id, []); hist.get(a.partida_id).push({ fecha: a.fecha, pct: a.pct }); });
    const progMap = new Map();
    programa.forEach(x => { if (!progMap.has(x.partida_id)) progMap.set(x.partida_id, []); progMap.get(x.partida_id).push({ semana: x.semana, dia: x.dia }); });
    const porTorre = new Map();
    partidas.forEach(p => { if (!porTorre.has(p.torre_id)) porTorre.set(p.torre_id, []); porTorre.get(p.torre_id).push(p); });
    const contratoTorre = new Map(contratos.map(c => [c.id, c]));
    const pagadoPorContrato = new Map();
    pagos.forEach(g => pagadoPorContrato.set(g.contrato_id, (pagadoPorContrato.get(g.contrato_id) || 0) + Number(g.monto || 0)));

    const frentes = [];
    let sin = 0;
    torres.forEach(t => {
      const ps = porTorre.get(t.id) || [];
      const hijos = indexar(ps);
      const hojas = ps.filter(p => !hijos.has(p.id));
      if (!hojas.some(p => (progMap.get(p.id) || []).length > 0)) { sin++; return; } // sin programa: no hay obra que seguir
      const arr = t.fecha_arranque || null;
      const r = resumen(hojas, progMap, arr);
      const desv = r.programado === null ? null : r.realProgramadas - r.programado;
      const porId = new Map(ps.map(p => [p.id, p]));
      let maxSem = 0, maxDia = 0;
      hojas.forEach(p => (progMap.get(p.id) || []).forEach(x => { if (x.semana > maxSem || (x.semana === maxSem && x.dia > maxDia)) { maxSem = x.semana; maxDia = x.dia; } }));
      let semanaTxt = `${maxSem} semanas de programa`, terminaTxt = '';
      if (arr) {
        const sem = Math.floor((parse(hoy) - parse(arr)) / 86400000 / 7) + 1;
        semanaTxt = sem < 1 ? `Arranca ${fechaCorta(arr)}` : sem > maxSem ? `Plazo cumplido (${maxSem} sem.)` : `Semana ${sem} de ${maxSem}`;
        terminaTxt = `Termina prog. ${fechaCorta(fechaDe(arr, maxSem, maxDia))}`;
      }
      const etapas = etapasDe(ps).map(e => ({ nombre: e.nombre, r: resumen(e.raices.flatMap(x => hojasDe(x, hijos)), progMap, arr) }));
      const atrasadas = hojas.map(p => ({ p, pp: progPct(p.id, progMap, arr, hoy) }))
        .filter(x => x.pp !== null && Number(x.p.avance_pct) < x.pp - TOLERANCIA)
        .sort((a, b) => (b.pp - Number(b.p.avance_pct)) - (a.pp - Number(a.p.avance_pct))).slice(0, 8)
        .map(x => ({ ...x, ruta: rutaDe(x.p, porId) }));
      const susContratos = contratos.filter(c => c.torre_id === t.id);
      const fijos = susContratos.filter(c => c.tipo === 'monto_fijo');
      const presupuesto = fijos.reduce((s, c) => s + Number(c.monto_fijo || 0), 0) +
        hojas.filter(p => contratoTorre.get(p.contrato_id)?.tipo !== 'monto_fijo').reduce((s, p) => s + (Number(p.cantidad) || 0) * (Number(p.precio_unitario) || 0), 0);
      const pagado = susContratos.reduce((s, c) => s + (pagadoPorContrato.get(c.id) || 0), 0);
      const curva = arr ? curvaS(hojas, progMap, hist, arr, hoy) : null;
      frentes.push({ t, hojas, r, desv, etapas, atrasadas, semanaTxt, terminaTxt, presupuesto, pagado, arr, curva });
    });

    const grupos = new Map();
    frentes.forEach(f => {
      const id = f.t.desarrollo_id || 'sin';
      if (!grupos.has(id)) grupos.set(id, { id, nombre: f.t.desarrollos?.nombre || 'Sin desarrollo', frentes: [] });
      grupos.get(id).frentes.push(f);
    });
    const proyectos = [...grupos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(g => {
      const hojas = g.frentes.flatMap(f => f.hojas);
      const arrPorTorre = new Map(g.frentes.map(f => [f.t.id, f.arr]));
      const r = resumen(hojas, progMap, (p) => arrPorTorre.get(p.torre_id));
      return { ...g, hojas, r, desv: r.programado === null ? null : r.realProgramadas - r.programado,
        presupuesto: g.frentes.reduce((s, f) => s + f.presupuesto, 0), pagado: g.frentes.reduce((s, f) => s + f.pagado, 0) };
    });
    return { proyectos, sinPrograma: sin, global: { progMap, frentes } };
  }, [datos, hoy]);

  const visibles = proyectos.filter(p => !filtro || p.id === filtro);
  const todas = visibles.flatMap(p => p.hojas);
  const arrPorTorre = new Map(visibles.flatMap(p => p.frentes).map(f => [f.t.id, f.arr]));
  const rg = todas.length ? resumen(todas, global.progMap, (p) => arrPorTorre.get(p.torre_id)) : null;
  const desvG = rg && rg.programado !== null ? rg.realProgramadas - rg.programado : null;
  const nFrentes = visibles.reduce((s, p) => s + p.frentes.length, 0);
  const presupG = visibles.reduce((s, p) => s + p.presupuesto, 0);
  const pagadoG = visibles.reduce((s, p) => s + p.pagado, 0);

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Dashboard de obra</h2>
          <div style={{ fontSize: '12px', color: '#888' }}>Avance real contra programado de cada proyecto con obra. Solo aparecen los proyectos que ya tienen programa capturado.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={filtro} onChange={e => setFiltro(e.target.value)} style={sel}>
            <option value="">Todos los proyectos</option>
            {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button onClick={cargar} style={{ ...sel, background: '#fff', cursor: 'pointer', color: '#555' }}>Actualizar</button>
        </div>
      </div>

      {error && <div style={{ padding: '10px 14px', background: '#FDECEC', color: ROJO, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>No se pudo cargar el dashboard: {error}</div>}
      {cargando ? <div style={{ color: '#888', fontSize: 13 }}>Cargando...</div> : proyectos.length === 0 ? (
        <div style={{ color: '#888', fontSize: 13 }}>Todavía no hay proyectos con programa de obra. Captura el programa en Construcción → Programa.</div>
      ) : (<>
        {rg && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : `repeat(${verCostos ? 6 : 5}, 1fr)`, gap: 10, marginBottom: 18 }}>
            <Tarjeta titulo="Frentes en obra" valor={nFrentes} sub={`${visibles.length} ${visibles.length === 1 ? 'proyecto' : 'proyectos'}`} />
            <Tarjeta titulo="Avance real" valor={pct1(rg.real)} sub={`${rg.terminadas} de ${rg.total} partidas terminadas`} />
            <Tarjeta titulo="Programado a hoy" valor={rg.programado === null ? '—' : pct1(rg.programado)} sub={rg.programado === null ? 'falta fecha de arranque' : 'según el programa'} />
            <Tarjeta titulo="Desviación" valor={textoDesv(desvG)} color={desvG === null ? '#1a1a2e' : colorDesv(desvG)} sub="avance real vs programado" />
            <Tarjeta titulo="Partidas atrasadas" valor={rg.atrasadas} color={rg.atrasadas > 0 ? ROJO : VERDE} sub={rg.usaPresupuesto ? 'ponderado por presupuesto' : 'ponderado por días programados'} />
            {verCostos && <Tarjeta titulo="Pagado a contratistas" valor={$(pagadoG)} sub={presupG > 0 ? `${pct1((pagadoG / presupG) * 100)} de ${$(presupG)}` : 'sin presupuesto capturado'} />}
          </div>
        )}

        {visibles.map(p => (
          <div key={p.id} style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', background: '#f7f7f9' }}>
              <div style={{ flex: '0 0 210px' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>{p.nombre}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{p.frentes.length} {p.frentes.length === 1 ? 'frente' : 'frentes'} · {p.r.total} partidas</div>
              </div>
              <div style={{ flex: '1 1 220px', minWidth: 200 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <b>Avance real {pct1(p.r.real)}</b>
                  <span style={{ color: '#888' }}>{p.r.programado === null ? 'sin programado' : `programado ${pct1(p.r.programado)}`}</span>
                </div>
                <Barra real={p.r.real} prog={p.r.programado} alto={10} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: colorDesv(p.desv) }}>{textoDesv(p.desv)}</div>
                <div style={{ fontSize: 10, color: '#aaa' }}>desviación</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12 }}>
                <div><b>{p.r.terminadas}</b><span style={{ color: '#888' }}> / {p.r.total} terminadas</span></div>
                <div style={{ fontSize: 10, color: p.r.atrasadas > 0 ? ROJO : '#aaa' }}>{p.r.atrasadas} atrasadas</div>
              </div>
            </div>
            {p.frentes.map(f => (
              <FilaFrente key={f.t.id} f={f} verCostos={verCostos} isMobile={isMobile} abierto={!!abiertos[f.t.id]}
                onAlternar={() => setAbiertos(a => ({ ...a, [f.t.id]: !a[f.t.id] }))} />
            ))}
          </div>
        ))}
        {sinPrograma > 0 && <div style={{ fontSize: 11, color: '#aaa' }}>{sinPrograma} {sinPrograma === 1 ? 'frente' : 'frentes'} sin programa capturado no se muestra{sinPrograma === 1 ? '' : 'n'}.</div>}
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>La línea roja de cada barra marca el avance programado a hoy. Una partida se considera atrasada si va más de {TOLERANCIA} puntos por debajo de lo programado.</div>
      </>)}
    </div>
  );
}
