import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from './supabase';
import { traerTodo, useIsMobile, $, pct1, Tarjeta } from './ObraTorres';
import { exportarExcel, exportarPdf } from './obraReportes';

// Dashboard de obra — ligado al Programa (prog_*): presupuesto, ejecución semanal, pagado por requisiciones
// y avisos (topes, partidas que rebasan, autorizaciones pendientes) de cada frente de cada proyecto.
// El avance es en dinero: ejecutado (unidades x precio) entre el presupuesto cargado (cantidad x precio + lo autorizado de más).
const CATEGORIAS = [
  { id: 'mano_obra', label: 'Mano de obra' },
  { id: 'materiales', label: 'Materiales' },
  { id: 'subcontratos', label: 'Subcontratos' },
  { id: 'maquinaria', label: 'Maquinaria' },
  { id: 'indirectos', label: 'Indirectos' },
];
const ESTATUS = {
  presupuesto: { txt: 'Por abrir', color: '#B45309', fondo: '#FFF4E5' },
  abierta: { txt: 'Abierta', color: '#27500A', fondo: '#EAF3DE' },
  cerrada: { txt: 'Cerrada', color: '#475569', fondo: '#EEF2F6' },
};
const SERIE = '#2a78d6';
const ROJO = '#C0392B';
const AMBAR = '#B45309';
const sel = { padding: '6px 8px', border: '0.5px solid #ddd', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (s) => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return `${d} ${MESES[m - 1]} ${String(y).slice(2)}`; };
const trozos = (arr, n) => { const r = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; };
const pct = (a, b) => (Number(b) > 0 ? (Number(a) / Number(b)) * 100 : 0);

function Chip({ children, color = '#555', fondo = '#f3f3f5' }) {
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: fondo, color, whiteSpace: 'nowrap', fontWeight: 600 }}>{children}</span>;
}
const ChipEstatus = ({ estatus }) => { const s = ESTATUS[estatus] || ESTATUS.presupuesto; return <Chip color={s.color} fondo={s.fondo}>{s.txt}</Chip>; };

// Barra de avance: relleno = ejecutado / presupuesto; la marca roja es el tope (si lo hay) y la franja gris claro lo pagado.
function BarraAvance({ valor, alto = 8 }) {
  const v = Math.max(0, Math.min(100, valor || 0));
  return (
    <div style={{ position: 'relative', height: alto, background: '#eee', borderRadius: alto, overflow: 'hidden' }}>
      <div style={{ width: `${v}%`, height: '100%', background: (valor || 0) > 100 ? ROJO : (valor || 0) >= 100 ? '#10B981' : '#3B82F6' }} />
    </div>
  );
}

// Ejecución acumulada semana a semana como % del presupuesto del frente. Una sola serie; tooltip al pasar y vista de tabla.
function CurvaEjecucion({ curva }) {
  const [hover, setHover] = useState(null);
  const [tabla, setTabla] = useState(false);
  const W = 680, H = 210, ML = 38, MR = 56, MT = 14, MB = 26;
  const n = curva.length;
  const yMax = Math.max(100, ...curva.map(c => c.pct));
  const X = (i) => ML + (n <= 1 ? 0 : (i / (n - 1)) * (W - ML - MR));
  const Y = (v) => MT + (1 - v / yMax) * (H - MT - MB);
  const puntos = curva.map((c, i) => `${X(i).toFixed(1)},${Y(c.pct).toFixed(1)}`).join(' ');
  const sobre = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((x - ML) / (W - ML - MR)) * (n - 1)))));
  };
  const hc = hover !== null ? curva[hover] : null;
  const paso = Math.max(1, Math.ceil(n / 8));
  const ultimo = curva[n - 1];
  const ticks = [0, 25, 50, 75, 100].filter(v => v <= yMax);
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>Ejecución acumulada por semana</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#555' }}><span style={{ width: 16, height: 2, background: SERIE, display: 'inline-block' }} />Ejecutado / presupuesto</span>
        <button onClick={() => setTabla(t => !t)} style={{ ...sel, padding: '2px 8px', background: '#fff', cursor: 'pointer', color: '#555', marginLeft: 'auto' }}>{tabla ? 'Ver gráfica' : 'Ver tabla'}</button>
      </div>
      {tabla ? (
        <div style={{ maxHeight: 240, overflow: 'auto', border: '0.5px solid #eee', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr style={{ background: '#f7f7f9', textAlign: 'right' }}><th style={{ textAlign: 'left', padding: '4px 8px' }}>Semana</th><th style={{ padding: '4px 8px' }}>Fecha</th><th style={{ padding: '4px 8px' }}>Ejecutado en la semana</th><th style={{ padding: '4px 8px' }}>Acumulado</th><th style={{ padding: '4px 8px' }}>% del presupuesto</th></tr></thead>
            <tbody>{curva.map((c, i) => (
              <tr key={i} style={{ borderTop: '0.5px solid #f3f3f3', textAlign: 'right' }}>
                <td style={{ textAlign: 'left', padding: '3px 8px' }}>{c.etiqueta}</td><td style={{ padding: '3px 8px' }}>{c.fecha ? fechaCorta(c.fecha) : '—'}</td>
                <td style={{ padding: '3px 8px' }}>{$(c.semana)}</td><td style={{ padding: '3px 8px' }}>{$(c.acum)}</td><td style={{ padding: '3px 8px' }}>{pct1(c.pct)}</td>
              </tr>))}</tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Ejecución acumulada contra el presupuesto del frente">
            {ticks.map(v => (
              <g key={v}><line x1={ML} x2={W - MR} y1={Y(v)} y2={Y(v)} stroke={v === 100 ? '#c9c9cf' : '#ececef'} strokeWidth="1" strokeDasharray={v === 100 ? '4 3' : undefined} />
                <text x={ML - 6} y={Y(v) + 3} textAnchor="end" fontSize="10" fill="#888">{v}%</text></g>
            ))}
            {curva.map((c, i) => (i % paso === 0 ? <text key={i} x={X(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#888">{c.corta}</text> : null))}
            <text x={W - MR + 6} y={Y(100) + 3} fontSize="10" fill="#888">Presupuesto</text>
            {n > 1 && <polyline points={puntos} fill="none" stroke={SERIE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
            <circle cx={X(n - 1)} cy={Y(ultimo.pct)} r="4.5" fill={SERIE} stroke="#fff" strokeWidth="2" />
            <text x={Math.min(X(n - 1) + 8, W - 40)} y={Y(ultimo.pct) - 8} fontSize="10" fill="#555">{pct1(ultimo.pct)}</text>
            {hc && <g><line x1={X(hover)} x2={X(hover)} y1={MT} y2={H - MB} stroke="#9a9aa2" strokeWidth="1" /><circle cx={X(hover)} cy={Y(hc.pct)} r="4" fill={SERIE} stroke="#fff" strokeWidth="2" /></g>}
            <rect x={ML} y={MT} width={W - ML - MR} height={H - MT - MB} fill="transparent" onMouseMove={sobre} onMouseLeave={() => setHover(null)} />
          </svg>
          {hc && (
            <div style={{ position: 'absolute', top: 6, left: `${Math.min(75, (X(hover) / W) * 100 + 2)}%`, background: '#fff', border: '0.5px solid #ddd', borderRadius: 8, padding: '6px 10px', fontSize: 11, pointerEvents: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{hc.etiqueta}{hc.fecha ? ` · ${fechaCorta(hc.fecha)}` : ''}</div>
              <div style={{ color: '#555' }}>En la semana: <b>{$(hc.semana)}</b></div>
              <div style={{ color: '#555' }}>Acumulado: <b>{$(hc.acum)}</b> ({pct1(hc.pct)})</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilaFrente({ f, abierto, onAlternar, isMobile }) {
  const sinPres = f.pres <= 0;
  return (
    <div style={{ borderTop: '0.5px solid #eee' }}>
      <div onClick={onAlternar} style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: '12px 14px', cursor: 'pointer' }}>
        <span style={{ fontSize: 10, transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
        <div style={{ flex: isMobile ? '1 1 60%' : '0 0 210px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>{f.f.nombre}</div>
          <div style={{ fontSize: 11, color: '#888' }}>{[f.f.etapa_desarrollo, f.f.viviendas ? `${f.f.viviendas} viviendas` : null].filter(Boolean).join(' · ') || 'Frente'}</div>
        </div>
        <div style={{ flex: '1 1 180px', minWidth: 160 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <b>{sinPres ? '—' : pct1(f.avance)}</b>
            <span style={{ color: '#888' }}>{$(f.ejc)} de {$(f.pres)}</span>
          </div>
          <BarraAvance valor={f.avance} />
        </div>
        <div style={{ flex: '0 0 130px', textAlign: 'right', fontSize: 12 }}>
          <div><b>{f.etapas.filter(e => e.estatus === 'abierta').length}</b><span style={{ color: '#888' }}> abiertas</span></div>
          <div style={{ fontSize: 10, color: '#aaa' }}>{f.etapas.length} {f.etapas.length === 1 ? 'etapa' : 'etapas'} · {f.etapas.filter(e => e.estatus === 'cerrada').length} cerradas</div>
        </div>
        <div style={{ flex: '0 0 150px', textAlign: 'right', fontSize: 11 }}>
          <div style={{ color: '#555' }}>Pagado {sinPres ? '—' : pct1(pct(f.pagado, f.pres))}</div>
          <div style={{ color: '#aaa', fontSize: 10 }}>{$(f.pagado)}{f.porPagar > 0 ? ` · por pagar ${$(f.porPagar)}` : ''}</div>
        </div>
        {f.avisos.length > 0 ? <Chip color={AMBAR} fondo="#FFF4E5">{f.avisos.length} {f.avisos.length === 1 ? 'aviso' : 'avisos'}</Chip> : <Chip color="#27500A" fondo="#EAF3DE">Sin avisos</Chip>}
      </div>
      {abierto && (
        <div style={{ padding: '4px 14px 16px 40px' }}>
          {f.avisos.length > 0 && (
            <div style={{ background: '#FFF8EC', border: '0.5px solid #F2DDB5', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
              {f.avisos.map((a, i) => <div key={i} style={{ fontSize: 12, color: '#6b4a0d', padding: '2px 0' }}>{a}</div>)}
            </div>
          )}
          {f.curva.length > 0 ? <CurvaEjecucion curva={f.curva} /> : <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Todavía no hay ejecución capturada: la curva aparece en cuanto Construcción capture la primera semana en Programa.</div>}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 340px', minWidth: 280 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>Avance por etapa</div>
              {f.etapas.length === 0 && <div style={{ fontSize: 12, color: '#888' }}>Sin etapas.</div>}
              {f.etapas.map(e => (
                <div key={e.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <div style={{ flex: 1, fontSize: 12, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.nombre}>{e.nombre}</div>
                    <ChipEstatus estatus={e.estatus} />
                    <div style={{ flex: '0 0 48px', fontSize: 12, textAlign: 'right' }}><b>{e.pres > 0 ? pct1(e.avance) : '—'}</b></div>
                  </div>
                  <BarraAvance valor={e.avance} alto={6} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#aaa', marginTop: 2, gap: 8, flexWrap: 'wrap' }}>
                    <span>{$(e.ejc)} de {$(e.pres)}{e.ampliado > 0 ? ` (incluye ${$(e.ampliado)} ampliado)` : ''}</span>
                    <span>Pagado {$(e.pagado)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ flex: '1 1 340px', minWidth: 280 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>Por categoría</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead><tr style={{ color: '#888', textAlign: 'right' }}><th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 500 }}>Categoría</th><th style={{ padding: '3px 6px', fontWeight: 500 }}>Presupuesto</th><th style={{ padding: '3px 6px', fontWeight: 500 }}>Ejecutado</th><th style={{ padding: '3px 6px', fontWeight: 500 }}>%</th><th style={{ padding: '3px 6px', fontWeight: 500 }}>Pagado</th></tr></thead>
                  <tbody>
                    {f.cats.map(c => (
                      <tr key={c.id} style={{ borderTop: '0.5px solid #f3f3f3', textAlign: 'right' }}>
                        <td style={{ textAlign: 'left', padding: '4px 6px', color: '#333' }}>{c.label}</td>
                        <td style={{ padding: '4px 6px' }}>{$(c.pres)}</td><td style={{ padding: '4px 6px' }}>{$(c.ejc)}</td>
                        <td style={{ padding: '4px 6px' }}>{c.pres > 0 ? pct1(pct(c.ejc, c.pres)) : '—'}</td><td style={{ padding: '4px 6px' }}>{$(c.pagado)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '1px solid #ddd', textAlign: 'right', fontWeight: 700 }}>
                      <td style={{ textAlign: 'left', padding: '4px 6px' }}>Total</td><td style={{ padding: '4px 6px' }}>{$(f.pres)}</td><td style={{ padding: '4px 6px' }}>{$(f.ejc)}</td>
                      <td style={{ padding: '4px 6px' }}>{f.pres > 0 ? pct1(f.avance) : '—'}</td><td style={{ padding: '4px 6px' }}>{$(f.pagado)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {f.rebasan.length > 0 && (<>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e', margin: '14px 0 6px' }}>Partidas que ya ejecutaron más que su presupuesto</div>
                {f.rebasan.slice(0, 8).map(x => (
                  <div key={x.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 0', borderBottom: '0.5px solid #f3f3f3' }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#333' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.descripcion}>{x.descripcion}</div>
                      <div style={{ fontSize: 10, color: '#aaa' }}>{x.etapa}</div>
                    </div>
                    <div style={{ fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }}><b>{$(x.ejc)}</b> <span style={{ color: '#888' }}>de {$(x.pres)}</span><div style={{ fontSize: 10, color: ROJO }}>+{$(x.ejc - x.pres)}</div></div>
                  </div>
                ))}
              </>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ObraDashboard() {
  const isMobile = useIsMobile();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [datos, setDatos] = useState({ frentes: [], etapas: [], semanas: [], partidas: [], ejec: [], ampl: [], cargos: [], pedidos: [] });
  const [filtro, setFiltro] = useState('');
  const [abiertos, setAbiertos] = useState({});

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const [fr, etapas, semanas, partidas, ampl, pedidos] = await Promise.all([
        supabase.from('prog_frentes').select('*, desarrollos(id, nombre)').order('created_at'),
        traerTodo(() => supabase.from('prog_etapas').select('id, frente_id, nombre, orden, estatus, tope').order('id')),
        traerTodo(() => supabase.from('prog_semanas').select('id, frente_id, orden, etiqueta, fecha').order('id')),
        traerTodo(() => supabase.from('prog_partidas').select('id, etapa_id, categoria, descripcion, cantidad, precio, ampliado').order('id')),
        traerTodo(() => supabase.from('prog_ampliaciones').select('etapa_id, monto, estatus').order('id')),
        traerTodo(() => supabase.from('req_materiales').select('id, etapa_id, estatus').in('estatus', ['solicitada', 'en_compra']).order('id')),
      ]);
      if (fr.error) throw fr.error;
      let ejec = [], cargos = [];
      for (const lote of trozos(partidas.map(p => p.id), 120)) {
        ejec = ejec.concat(await traerTodo(() => supabase.from('prog_ejecucion').select('partida_id, semana_id, unidades, precio').in('partida_id', lote).order('id')));
        cargos = cargos.concat(await traerTodo(() => supabase.from('obra_requisicion_cargos').select('requisicion_id, prog_partida_id, monto, obra_requisiciones!inner(estatus, rebasa)').in('prog_partida_id', lote).order('id')));
      }
      setDatos({ frentes: fr.data || [], etapas, semanas, partidas, ejec, ampl, cargos, pedidos });
    } catch (e) { setError(e.message || String(e)); }
    setCargando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const proyectos = useMemo(() => {
    const { frentes, etapas, semanas, partidas, ejec, ampl, cargos, pedidos } = datos;
    const presP = (p) => Number(p.cantidad || 0) * Number(p.precio || 0) + Number(p.ampliado || 0);
    const partMap = new Map(partidas.map(p => [p.id, p]));
    const etMap = new Map(etapas.map(e => [e.id, e]));
    const ejcPart = new Map(), semFrente = new Map();
    ejec.forEach(r => {
      const p = partMap.get(r.partida_id); if (!p) return;
      const v = Number(r.unidades || 0) * Number(r.precio ?? p.precio ?? 0);
      ejcPart.set(p.id, (ejcPart.get(p.id) || 0) + v);
      const fid = etMap.get(p.etapa_id)?.frente_id; if (!fid) return;
      if (!semFrente.has(fid)) semFrente.set(fid, new Map());
      semFrente.get(fid).set(r.semana_id, (semFrente.get(fid).get(r.semana_id) || 0) + v);
    });
    const pagoPart = new Map(), autorizarFrente = new Map();
    cargos.forEach(k => {
      const est = k.obra_requisiciones?.estatus;
      const v = pagoPart.get(k.prog_partida_id) || { pagado: 0, porPagar: 0 };
      if (est === 'pagada') v.pagado += Number(k.monto || 0); else if (est === 'solicitada' || est === 'autorizada') v.porPagar += Number(k.monto || 0);
      pagoPart.set(k.prog_partida_id, v);
      if (est === 'solicitada' && k.obra_requisiciones?.rebasa) {
        const fid = etMap.get(partMap.get(k.prog_partida_id)?.etapa_id)?.frente_id;
        if (fid) { if (!autorizarFrente.has(fid)) autorizarFrente.set(fid, new Set()); autorizarFrente.get(fid).add(k.requisicion_id); }
      }
    });

    const lista = frentes.map(fr => {
      const ets = etapas.filter(e => e.frente_id === fr.id).sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, 'es'));
      const etIds = new Set(ets.map(e => e.id));
      const ps = partidas.filter(p => etIds.has(p.etapa_id));
      const etapasCalc = ets.map(e => {
        const pe = ps.filter(p => p.etapa_id === e.id);
        const ampliado = ampl.filter(a => a.etapa_id === e.id && a.estatus === 'autorizada').reduce((s, a) => s + Number(a.monto || 0), 0);
        const pres = pe.reduce((s, p) => s + presP(p), 0);
        const ejc = pe.reduce((s, p) => s + (ejcPart.get(p.id) || 0), 0);
        return { ...e, pres, ejc, avance: pct(ejc, pres), pagado: pe.reduce((s, p) => s + (pagoPart.get(p.id)?.pagado || 0), 0), ampliado,
          topeTotal: e.estatus === 'presupuesto' ? null : Number(e.tope || 0) + ampliado };
      });
      const cats = CATEGORIAS.map(c => {
        const pc = ps.filter(p => p.categoria === c.id);
        return { ...c, pres: pc.reduce((s, p) => s + presP(p), 0), ejc: pc.reduce((s, p) => s + (ejcPart.get(p.id) || 0), 0), pagado: pc.reduce((s, p) => s + (pagoPart.get(p.id)?.pagado || 0), 0) };
      });
      const pres = ps.reduce((s, p) => s + presP(p), 0);
      const ejc = ps.reduce((s, p) => s + (ejcPart.get(p.id) || 0), 0);
      const pagado = ps.reduce((s, p) => s + (pagoPart.get(p.id)?.pagado || 0), 0);
      const porPagar = ps.reduce((s, p) => s + (pagoPart.get(p.id)?.porPagar || 0), 0);
      const rebasan = ps.filter(p => (ejcPart.get(p.id) || 0) > presP(p) + 0.005)
        .map(p => ({ id: p.id, descripcion: p.descripcion, etapa: etMap.get(p.etapa_id)?.nombre, pres: presP(p), ejc: ejcPart.get(p.id) || 0 }))
        .sort((a, b) => (b.ejc - b.pres) - (a.ejc - a.pres));
      // curva: semanas en orden, hasta la última con ejecución
      const sems = semanas.filter(s => s.frente_id === fr.id).sort((a, b) => Number(a.orden) - Number(b.orden));
      const porSem = semFrente.get(fr.id) || new Map();
      let ultima = -1; sems.forEach((s, i) => { if ((porSem.get(s.id) || 0) !== 0) ultima = i; });
      let acum = 0;
      const curva = sems.slice(0, ultima + 1).map(s => { const v = porSem.get(s.id) || 0; acum += v; return { etiqueta: s.etiqueta, corta: String(s.etiqueta).length > 6 ? String(s.etiqueta).slice(0, 6) : s.etiqueta, fecha: s.fecha, semana: v, acum, pct: pct(acum, pres) }; });
      // avisos
      const avisos = [];
      etapasCalc.filter(e => e.estatus === 'abierta' && e.topeTotal > 0 && e.ejc / e.topeTotal >= 0.9).forEach(e => avisos.push(`${e.nombre}: ya usó ${pct1(pct(e.ejc, e.topeTotal))} de su tope (${$(e.ejc)} de ${$(e.topeTotal)}).`));
      if (rebasan.length) avisos.push(`${rebasan.length} ${rebasan.length === 1 ? 'partida ejecutó' : 'partidas ejecutaron'} más que su presupuesto.`);
      const nAut = autorizarFrente.get(fr.id)?.size || 0;
      if (nAut) avisos.push(`${nAut} ${nAut === 1 ? 'requisición espera' : 'requisiciones esperan'} autorización por rebasar el presupuesto.`);
      const nAmp = ampl.filter(a => a.estatus === 'solicitada' && etIds.has(a.etapa_id)).length;
      if (nAmp) avisos.push(`${nAmp} ${nAmp === 1 ? 'ampliación espera' : 'ampliaciones esperan'} al Gerente de Construcción.`);
      const nPed = pedidos.filter(p => etIds.has(p.etapa_id)).length;
      if (nPed) avisos.push(`${nPed} ${nPed === 1 ? 'pedido de materiales abierto' : 'pedidos de materiales abiertos'}.`);
      if (ejc > 0 && pagado > ejc * 1.0001) avisos.push(`Lo pagado (${$(pagado)}) supera lo ejecutado (${$(ejc)}).`);
      return { f: fr, etapas: etapasCalc, cats, pres, ejc, avance: pct(ejc, pres), pagado, porPagar, rebasan, curva, avisos, nAut, nAmp, nPed };
    });

    const grupos = new Map();
    lista.forEach(f => {
      const id = f.f.desarrollo_id || 'sin';
      if (!grupos.has(id)) grupos.set(id, { id, nombre: f.f.desarrollos?.nombre || 'Sin desarrollo', frentes: [] });
      grupos.get(id).frentes.push(f);
    });
    return [...grupos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(g => {
      const s = (k) => g.frentes.reduce((t, f) => t + f[k], 0);
      return { ...g, pres: s('pres'), ejc: s('ejc'), pagado: s('pagado'), porPagar: s('porPagar'), avance: pct(s('ejc'), s('pres')), nAut: s('nAut'), nAmp: s('nAmp'), nPed: s('nPed') };
    });
  }, [datos]);

  const visibles = proyectos.filter(p => !filtro || p.id === filtro);
  const tot = (k) => visibles.reduce((s, p) => s + p[k], 0);
  const pres = tot('pres'), ejc = tot('ejc'), pagado = tot('pagado'), porPagar = tot('porPagar');
  const nFrentes = visibles.reduce((s, p) => s + p.frentes.length, 0);
  const nEtapasAbiertas = visibles.reduce((s, p) => s + p.frentes.reduce((t, f) => t + f.etapas.filter(e => e.estatus === 'abierta').length, 0), 0);
  const pendientes = tot('nAut') + tot('nAmp') + tot('nPed');
  const resumenG = { pres, ejc, pagado, porPagar, avance: pct(ejc, pres), nFrentes };

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Dashboard de obra</h2>
          <div style={{ fontSize: '12px', color: '#888' }}>Ligado al Programa: presupuesto, ejecución semanal y pagos por requisición de cada frente. El avance es el ejecutado entre el presupuesto cargado.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={filtro} onChange={e => setFiltro(e.target.value)} style={sel}>
            <option value="">Todos los proyectos</option>
            {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button onClick={cargar} style={{ ...sel, background: '#fff', cursor: 'pointer', color: '#555' }}>Actualizar</button>
          {visibles.length > 0 && (<>
            <button onClick={() => exportarExcel(visibles)} style={{ ...sel, background: '#fff', cursor: 'pointer', color: '#555' }}>Excel</button>
            <button onClick={() => exportarPdf(visibles, resumenG)} style={{ ...sel, background: '#fff', cursor: 'pointer', color: '#555' }}>PDF</button>
          </>)}
        </div>
      </div>

      {error && <div style={{ padding: '10px 14px', background: '#FDECEC', color: ROJO, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>No se pudo cargar el dashboard: {error}</div>}
      {cargando ? <div style={{ color: '#888', fontSize: 13 }}>Cargando...</div> : proyectos.length === 0 ? (
        <div style={{ color: '#888', fontSize: 13 }}>Todavía no hay frentes en el Programa. Crea el primero en Construcción → Programa.</div>
      ) : (<>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(6, 1fr)', gap: 10, marginBottom: 18 }}>
          <Tarjeta titulo="Frentes" valor={nFrentes} sub={`${nEtapasAbiertas} ${nEtapasAbiertas === 1 ? 'etapa abierta' : 'etapas abiertas'} · ${visibles.length} ${visibles.length === 1 ? 'proyecto' : 'proyectos'}`} />
          <Tarjeta titulo="Presupuesto cargado" valor={$(pres)} sub="incluye lo autorizado de más" />
          <Tarjeta titulo="Ejecutado" valor={$(ejc)} sub={pres > 0 ? `${pct1(pct(ejc, pres))} del presupuesto` : 'sin presupuesto cargado'} />
          <Tarjeta titulo="Pagado" valor={$(pagado)} sub={pres > 0 ? `${pct1(pct(pagado, pres))} del presupuesto` : 'sin presupuesto cargado'} />
          <Tarjeta titulo="Por pagar" valor={$(porPagar)} sub="requisiciones por autorizar o pagar" />
          <Tarjeta titulo="Pendientes" valor={pendientes} color={pendientes > 0 ? AMBAR : '#1a1a2e'} sub="autorizaciones, ampliaciones y pedidos abiertos" />
        </div>

        {visibles.map(p => (
          <div key={p.id} style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', background: '#f7f7f9' }}>
              <div style={{ flex: '0 0 210px' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>{p.nombre}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{p.frentes.length} {p.frentes.length === 1 ? 'frente' : 'frentes'}</div>
              </div>
              <div style={{ flex: '1 1 220px', minWidth: 200 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <b>Avance {p.pres > 0 ? pct1(p.avance) : '—'}</b>
                  <span style={{ color: '#888' }}>{$(p.ejc)} de {$(p.pres)}</span>
                </div>
                <BarraAvance valor={p.avance} alto={10} />
              </div>
              <div style={{ textAlign: 'right', fontSize: 12 }}>
                <div><b>{$(p.pagado)}</b><span style={{ color: '#888' }}> pagado</span></div>
                <div style={{ fontSize: 10, color: '#aaa' }}>{p.porPagar > 0 ? `por pagar ${$(p.porPagar)}` : 'sin pagos pendientes'}</div>
              </div>
            </div>
            {p.frentes.map(f => (
              <FilaFrente key={f.f.id} f={f} isMobile={isMobile} abierto={!!abiertos[f.f.id]}
                onAlternar={() => setAbiertos(a => ({ ...a, [f.f.id]: !a[f.f.id] }))} />
            ))}
          </div>
        ))}
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>Los datos salen del Programa (Construcción → Programa) y de las requisiciones de pago ligadas a sus partidas. El Programa no tiene una fecha programada por partida, por eso no se compara contra un calendario: se mide contra el presupuesto cargado y su tope.</div>
      </>)}
    </div>
  );
}
