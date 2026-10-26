import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from './supabase';
import { usePuede } from './PermisosContext';
import { fmtDinero, InputDinero } from './dinero';

// Obra por torre — catálogo de partidas de mano de obra, programa semanal y avance real (%).
//  - Cada torre (Los Arrayanes, Torre L…) tiene una fecha de arranque (lunes de la semana 1);
//    el programa guarda semana + día y las fechas se calculan desde ahí.
//  - Construcción captura el % acumulado de cada partida; al llegar a 100% queda terminada
//    (lo hace un trigger en la base de datos).
//  - Avance de la torre / etapa: ponderado por presupuesto si todas las partidas con cantidad
//    ya tienen precio; si no, por días programados.
const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const TOLERANCIA = 5; // puntos de % para considerar una partida atrasada
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const hoyISO = () => iso(new Date());
const lunesDe = (s) => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const sumaDias = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const fechaDe = (arranque, semana, dia) => sumaDias(arranque, (semana - 1) * 7 + (dia - 1));
const fechaCorta = (s) => { const d = parse(s); return `${d.getDate()} ${MESES[d.getMonth()]}`; };
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const $ = (n) => fmtDinero(n, { centavos: true });
const fmtN = (n, dec = 2) => Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: dec });
const pct1 = (n) => `${Math.round((Number(n) || 0) * 10) / 10}%`;

// Pagina las consultas (PostgREST devuelve máximo 1000 filas por llamada).
async function traerTodo(construir) {
  const todo = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await construir().range(desde, desde + 999);
    if (error) throw error;
    todo.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return todo;
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

const btn = { padding: '6px 12px', border: '0.5px solid #ddd', borderRadius: '6px', background: '#fff', color: '#555', fontSize: '12px', cursor: 'pointer' };
const inp = { padding: '6px 8px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' };

// Métricas de un conjunto de partidas. prog = Map(partida_id -> [{semana, dia}])
function resumen(partidas, prog, arranque) {
  const hoy = hoyISO();
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
    if (arranque && dias.length > 0) {
      const transcurridos = dias.filter(x => fechaDe(arranque, x.semana, x.dia) <= hoy).length;
      const pp = (transcurridos / dias.length) * 100;
      wConProg += w; wProg += w * pp; wRealProg += w * Number(p.avance_pct || 0);
      if (Number(p.avance_pct) < pp - TOLERANCIA) atrasadas++;
    }
  });
  return {
    total: partidas.length, terminadas, atrasadas,
    real: wTot ? wReal / wTot : 0,
    programado: arranque && wConProg ? wProg / wConProg : null,
    realProgramadas: wConProg ? wRealProg / wConProg : null,
    usaPresupuesto,
  };
}

function Barra({ real, prog, alto = 8 }) {
  return (
    <div style={{ position: 'relative', height: alto, background: '#eee', borderRadius: alto, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, real || 0)}%`, height: '100%', background: (real || 0) >= 100 ? '#10B981' : '#3B82F6' }} />
      {prog !== null && prog !== undefined && <div title={`Programado ${pct1(prog)}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${Math.min(100, prog)}%`, width: 2, background: '#C0203A' }} />}
    </div>
  );
}

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
  const [abierta, setAbierta] = useState(null); // torre abierta
  const [agregando, setAgregando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const [t, p, d] = await Promise.all([
        traerTodo(() => supabase.from('obra_torres').select('*, desarrollos(nombre)').order('created_at')),
        traerTodo(() => supabase.from('obra_partidas').select('id, torre_id, avance_pct, cantidad, precio_unitario, terminada_en').order('id')),
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

  return (
    <div>
      {error && <div style={{ padding: '10px 14px', background: '#FDECEC', color: '#C0392B', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>No se pudo cargar la obra: {error}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div />
        {puedeEditar && <button onClick={() => setAgregando(true)} style={{ ...btn, background: '#C0203A', color: '#fff', border: 'none' }}>+ Agregar torre</button>}
      </div>
      {cargando ? <div style={{ color: '#888', fontSize: 13 }}>Cargando...</div> : torres.length === 0 ? (
        <div style={{ color: '#888', fontSize: 13 }}>Aún no hay torres con obra capturada.{puedeEditar ? ' Agrega una con el botón de arriba.' : ''}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {torres.map(t => {
            const ps = partidas.filter(p => p.torre_id === t.id);
            const r = resumen(ps, new Map(), null);
            return (
              <div key={t.id} onClick={() => setAbierta(t.id)} style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, padding: 14, cursor: 'pointer' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>Torre {t.torre}</div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>{t.desarrollos?.nombre || ''}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: '#555' }}>Avance real</span><b>{pct1(r.real)}</b>
                </div>
                <Barra real={r.real} prog={null} />
                <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
                  {r.total} partidas · {r.terminadas} terminadas · {t.fecha_arranque ? `arranque ${fechaCorta(t.fecha_arranque)} ${parse(t.fecha_arranque).getFullYear()}` : 'sin fecha de arranque'}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {agregando && <AgregarTorre desarrollos={desarrollos} existentes={torres} onCerrar={() => setAgregando(false)} onCreada={() => { setAgregando(false); cargar(); }} />}
    </div>
  );
}

function AgregarTorre({ desarrollos, existentes, onCerrar, onCreada }) {
  const [desarrolloId, setDesarrolloId] = useState('');
  const [torre, setTorre] = useState('');
  const [sugeridas, setSugeridas] = useState([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!desarrolloId) { setSugeridas([]); return; }
    (async () => {
      const { data } = await supabase.from('inventario').select('numero').eq('desarrollo_id', desarrolloId).limit(2000);
      const letras = [...new Set((data || []).map(u => (String(u.numero || '').match(/^([A-Za-z]+)/)?.[1] || '').toUpperCase()).filter(Boolean))].sort();
      setSugeridas(letras);
    })();
  }, [desarrolloId]);

  const crear = async () => {
    const nombre = torre.trim().toUpperCase();
    if (!desarrolloId || !nombre) return;
    if (existentes.some(t => t.desarrollo_id === desarrolloId && t.torre === nombre)) { alert('Esa torre ya existe en ese desarrollo.'); return; }
    setGuardando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('obra_torres').insert({ desarrollo_id: desarrolloId, torre: nombre, creado_por: user?.email || null });
    setGuardando(false);
    if (error) { alert('No se pudo crear: ' + error.message); return; }
    onCreada();
  };

  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: '1.25rem', width: '100%', maxWidth: 380 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Agregar torre a obra</div>
        <label style={{ fontSize: 12, color: '#555' }}>Desarrollo</label>
        <select value={desarrolloId} onChange={e => setDesarrolloId(e.target.value)} style={{ ...inp, width: '100%', marginBottom: 10 }}>
          <option value="">Selecciona...</option>
          {desarrollos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
        <label style={{ fontSize: 12, color: '#555' }}>Torre (letra o nombre)</label>
        <input value={torre} onChange={e => setTorre(e.target.value)} placeholder="Ej. L" style={{ ...inp, width: '100%', marginBottom: 6 }} />
        {sugeridas.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
            {sugeridas.map(l => <button key={l} onClick={() => setTorre(l)} style={{ ...btn, padding: '3px 9px', background: torre.toUpperCase() === l ? '#1a1a2e' : '#fff', color: torre.toUpperCase() === l ? '#fff' : '#555' }}>{l}</button>)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={onCerrar} style={{ ...btn, flex: 1 }}>Cancelar</button>
          <button onClick={crear} disabled={guardando || !desarrolloId || !torre.trim()} style={{ ...btn, flex: 1, background: '#C0203A', color: '#fff', border: 'none' }}>{guardando ? 'Creando...' : 'Crear'}</button>
        </div>
      </div>
    </div>
  );
}

function DetalleTorre({ torre, puedeCapturar, puedeEditar, permisosCostos, isMobile, onCerrar, onTorreActualizada }) {
  const [tab, setTab] = useState('hoy');
  const [partidas, setPartidas] = useState([]);
  const [programa, setPrograma] = useState([]); // [{partida_id, semana, dia}]
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [arranque, setArranque] = useState(torre.fecha_arranque || '');
  const [filtroEtapa, setFiltroEtapa] = useState('');
  const [contratistas, setContratistas] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [tope, setTope] = useState(torre.presupuesto_tope ?? null);

  const cargarCostos = useCallback(async () => {
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
  }, [torre.id]);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const p = await traerTodo(() => supabase.from('obra_partidas').select('*').eq('torre_id', torre.id).order('etapa_orden').order('orden'));
      const ids = p.map(x => x.id);
      let prog = [];
      for (let i = 0; i < ids.length; i += 120) {
        prog = prog.concat(await traerTodo(() => supabase.from('obra_programa').select('partida_id, semana, dia').in('partida_id', ids.slice(i, i + 120))));
      }
      setPartidas(p); setPrograma(prog);
    } catch (e) { setError(e.message || String(e)); }
    setCargando(false);
    cargarCostos();
  }, [torre.id, cargarCostos]);
  useEffect(() => { cargar(); }, [cargar]);

  const progMap = useMemo(() => {
    const m = new Map();
    programa.forEach(x => { if (!m.has(x.partida_id)) m.set(x.partida_id, []); m.get(x.partida_id).push({ semana: x.semana, dia: x.dia }); });
    return m;
  }, [programa]);
  const etapas = useMemo(() => {
    const m = new Map();
    partidas.forEach(p => { if (!m.has(p.etapa)) m.set(p.etapa, { nombre: p.etapa, orden: p.etapa_orden, partidas: [] }); m.get(p.etapa).partidas.push(p); });
    return [...m.values()].sort((a, b) => a.orden - b.orden);
  }, [partidas]);
  const arr = arranque || null;
  const total = useMemo(() => resumen(partidas, progMap, arr), [partidas, progMap, arr]);
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

  const tabs = [['hoy', 'Hoy'], ['avance', 'Avance'], ['programa', 'Programa'], ['catalogo', 'Catálogo'], ['costos', 'Costos']];

  return (
    <div>
      <button onClick={onCerrar} style={{ ...btn, marginBottom: 12 }}>← Todas las torres</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>Torre {torre.torre}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{torre.desarrollos?.nombre}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: '#555' }}>Fecha de arranque (semana 1)</label>
          <input type="date" disabled={!puedeEditar} value={arranque} onChange={e => guardarArranque(e.target.value)} style={inp} />
          {arr && <span style={{ fontSize: 11, color: '#888' }}>lunes {fechaCorta(arr)} · hoy: semana {semanaHoy > 0 ? semanaHoy : 'previa al arranque'}</span>}
        </div>
      </div>
      {!arr && <div style={{ padding: '10px 14px', background: '#FFF8E1', color: '#856404', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
        Captura la fecha de arranque (semana 1) para que el programa se convierta en fechas y se pueda comparar con el avance real.{!puedeEditar ? ' (Pídesela a quien tenga permiso para editar la obra.)' : ''}
      </div>}
      {error && <div style={{ padding: '10px 14px', background: '#FDECEC', color: '#C0392B', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        <Tarjeta titulo="Avance real" valor={pct1(total.real)} sub={`${total.terminadas} de ${total.total} partidas terminadas`} />
        <Tarjeta titulo="Programado a hoy" valor={total.programado === null ? '—' : pct1(total.programado)} sub={arr ? 'según el programa' : 'falta fecha de arranque'} />
        <Tarjeta titulo="Desviación" valor={total.programado === null ? '—' : `${(total.realProgramadas - total.programado) >= 0 ? '+' : ''}${Math.round((total.realProgramadas - total.programado) * 10) / 10} pts`}
          color={total.programado === null ? '#1a1a2e' : (total.realProgramadas - total.programado) >= -TOLERANCIA ? '#10B981' : '#C0392B'} sub="avance real vs programado" />
        <Tarjeta titulo="Partidas atrasadas" valor={total.atrasadas} color={total.atrasadas > 0 ? '#C0392B' : '#10B981'} sub={total.usaPresupuesto ? 'ponderado por presupuesto' : 'ponderado por días programados'} />
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid #e0e0e0', overflowX: 'auto' }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', fontWeight: tab === k ? 600 : 400, color: tab === k ? '#1a1a2e' : '#888', borderBottom: tab === k ? '2px solid #1a1a2e' : '2px solid transparent' }}>{l}</button>
        ))}
      </div>

      {cargando ? <div style={{ color: '#888', fontSize: 13 }}>Cargando...</div> : (<>
        {tab === 'hoy' && <TabHoy partidas={partidas} progMap={progMap} arr={arr} hoy={hoy} puedeCapturar={puedeCapturar} onRegistrar={registrarAvance} />}
        {tab === 'avance' && <TabAvance etapas={etapas} progMap={progMap} arr={arr} hoy={hoy} puedeCapturar={puedeCapturar} onRegistrar={registrarAvance} isMobile={isMobile} />}
        {tab === 'programa' && <TabPrograma etapas={etapas} progMap={progMap} arr={arr} hoy={hoy} puedeEditar={puedeEditar} filtroEtapa={filtroEtapa} setFiltroEtapa={setFiltroEtapa}
          onCambio={(partidaId, semana, dia, activo) => setPrograma(prev => activo ? [...prev, { partida_id: partidaId, semana, dia }] : prev.filter(x => !(x.partida_id === partidaId && x.semana === semana && x.dia === dia)))} />}
        {tab === 'catalogo' && <TabCatalogo torre={torre} etapas={etapas} puedeEditar={puedeEditar} puedeCostos={permisosCostos.costos} contratos={contratos} contratistas={contratistas} onCambio={cargar} />}
        {tab === 'costos' && <TabCostos torre={torre} partidas={partidas} progMap={progMap} contratistas={contratistas} contratos={contratos} pagos={pagos} tope={tope} permisos={permisosCostos} isMobile={isMobile} onCambio={cargar} />}
      </>)}
    </div>
  );
}

function Tarjeta({ titulo, valor, sub, color = '#1a1a2e' }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: '#888' }}>{titulo}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{valor}</div>
      {sub && <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// % programado de una partida a hoy (null si no tiene programa o falta fecha de arranque)
const progPct = (partidaId, progMap, arr, hoy) => {
  const dias = progMap.get(partidaId) || [];
  if (!arr || dias.length === 0) return null;
  return (dias.filter(x => fechaDe(arr, x.semana, x.dia) <= hoy).length / dias.length) * 100;
};
const rangoFechas = (dias, arr) => {
  if (!arr || dias.length === 0) return '';
  const fs = dias.map(x => fechaDe(arr, x.semana, x.dia)).sort();
  return fs[0] === fs[fs.length - 1] ? fechaCorta(fs[0]) : `${fechaCorta(fs[0])} – ${fechaCorta(fs[fs.length - 1])}`;
};

function FilaAvance({ p, progMap, arr, hoy, puedeCapturar, onRegistrar, mostrarEtapa = false }) {
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
            {mostrarEtapa && `${p.etapa} · `}{p.cantidad !== null && p.cantidad !== undefined ? `${fmtN(p.cantidad)} ${p.unidad || ''}` : (p.unidad || 'sin cantidad')}
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

function TabHoy({ partidas, progMap, arr, hoy, puedeCapturar, onRegistrar }) {
  if (!arr) return <div style={{ color: '#888', fontSize: 13 }}>Captura la fecha de arranque para ver las partidas del día.</div>;
  const abiertas = partidas.filter(p => !p.terminada_en && Number(p.avance_pct) < 100);
  const conInfo = abiertas.map(p => {
    const dias = progMap.get(p.id) || [];
    const fechas = dias.map(x => fechaDe(arr, x.semana, x.dia));
    return { p, hoyProg: fechas.includes(hoy), enCurso: fechas.length > 0 && fechas[0] !== undefined && Math.min(...fechas.map(f => +parse(f))) <= +parse(hoy) && +parse(hoy) <= Math.max(...fechas.map(f => +parse(f))), pp: progPct(p.id, progMap, arr, hoy) };
  });
  const atrasadas = conInfo.filter(x => x.pp !== null && Number(x.p.avance_pct) < x.pp - TOLERANCIA && !x.hoyProg);
  const deHoy = conInfo.filter(x => x.hoyProg || (x.enCurso && !atrasadas.includes(x)));
  const grupo = (titulo, lista, color) => lista.length > 0 && (
    <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, marginBottom: 14, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', background: '#f7f7f9', fontSize: 13, fontWeight: 700, color }}>{titulo} ({lista.length})</div>
      {lista.map(x => <FilaAvance key={x.p.id} p={x.p} progMap={progMap} arr={arr} hoy={hoy} puedeCapturar={puedeCapturar} onRegistrar={onRegistrar} mostrarEtapa />)}
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

function TabAvance({ etapas, progMap, arr, hoy, puedeCapturar, onRegistrar }) {
  const [abiertas, setAbiertas] = useState({});
  return (
    <div>
      {etapas.map(et => {
        const r = resumen(et.partidas, progMap, arr);
        const abierto = !!abiertas[et.nombre];
        return (
          <div key={et.nombre} style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
            <div onClick={() => setAbiertas(a => ({ ...a, [et.nombre]: !a[et.nombre] }))} style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', minWidth: 130 }}>{et.nombre}</div>
              <div style={{ flex: '1 1 160px', maxWidth: 260 }}><Barra real={r.real} prog={r.programado} /></div>
              <div style={{ fontSize: 12, color: '#555' }}><b>{pct1(r.real)}</b>{r.programado !== null && <span style={{ color: '#888' }}> · prog. {pct1(r.programado)}</span>}</div>
              <div style={{ fontSize: 11, color: '#888' }}>{r.terminadas}/{r.total} terminadas{r.atrasadas > 0 && <span style={{ color: '#C0392B' }}> · {r.atrasadas} atrasadas</span>}</div>
            </div>
            {abierto && et.partidas.map(p => <FilaAvance key={p.id} p={p} progMap={progMap} arr={arr} hoy={hoy} puedeCapturar={puedeCapturar} onRegistrar={onRegistrar} />)}
          </div>
        );
      })}
      {etapas.length === 0 && <div style={{ color: '#888', fontSize: 13 }}>Esta torre aún no tiene partidas. Agrégalas en la pestaña Catálogo.</div>}
    </div>
  );
}

function TabPrograma({ etapas, progMap, arr, hoy, puedeEditar, filtroEtapa, setFiltroEtapa, onCambio }) {
  const todas = etapas.flatMap(e => e.partidas);
  let maxSemana = 4;
  todas.forEach(p => (progMap.get(p.id) || []).forEach(x => { if (x.semana > maxSemana) maxSemana = x.semana; }));
  maxSemana += 1;
  const semanas = Array.from({ length: maxSemana }, (_, i) => i + 1);
  const visibles = etapas.filter(e => !filtroEtapa || e.nombre === filtroEtapa);
  const hoyPos = arr ? (() => { const dd = Math.floor((parse(hoy) - parse(arr)) / 86400000); return dd >= 0 ? { semana: Math.floor(dd / 7) + 1, dia: (dd % 7) + 1 } : null; })() : null;

  const alternar = async (p, semana, dia, activo) => {
    if (!puedeEditar) return;
    if (activo) {
      const { error } = await supabase.from('obra_programa').delete().eq('partida_id', p.id).eq('semana', semana).eq('dia', dia);
      if (error) { alert('No se pudo quitar el día: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('obra_programa').insert({ partida_id: p.id, semana, dia });
      if (error) { alert('No se pudo agregar el día: ' + error.message); return; }
    }
    onCambio(p.id, semana, dia, !activo);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filtroEtapa} onChange={e => setFiltroEtapa(e.target.value)} style={inp}>
          <option value="">Todas las etapas</option>
          {etapas.map(e => <option key={e.nombre} value={e.nombre}>{e.nombre}</option>)}
        </select>
        <span style={{ fontSize: 11, color: '#888' }}>Cada cuadro es un día (L a D). {puedeEditar ? 'Haz clic para programar o quitar un día.' : ''} Rojo: hoy.</span>
      </div>
      <div style={{ overflow: 'auto', maxHeight: '70vh', border: '0.5px solid #e0e0e0', borderRadius: 12, background: '#fff' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 3, background: '#f7f7f9', textAlign: 'left', padding: '8px 10px', minWidth: 230, borderBottom: '1px solid #e0e0e0' }}>Partida</th>
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
                <tr><td colSpan={semanas.length + 1} style={{ position: 'sticky', left: 0, background: '#1a1a2e', color: '#fff', padding: '6px 10px', fontWeight: 700 }}>{et.nombre}</td></tr>
                {et.partidas.map(p => {
                  const dias = progMap.get(p.id) || [];
                  const set = new Set(dias.map(x => `${x.semana}-${x.dia}`));
                  return (
                    <tr key={p.id}>
                      <td style={{ position: 'sticky', left: 0, background: '#fff', padding: '5px 10px', borderBottom: '0.5px solid #f0f0f0', whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', color: p.terminada_en ? '#27500A' : '#1a1a2e' }} title={p.descripcion}>
                        {p.terminada_en ? '✓ ' : ''}{p.descripcion}
                      </td>
                      {semanas.map(s => (
                        <td key={s} style={{ padding: '4px 6px', borderBottom: '0.5px solid #f0f0f0', borderLeft: '1px solid #f3f3f3' }}>
                          <div style={{ display: 'flex', gap: 2 }}>
                            {DIAS.map((l, i) => {
                              const activo = set.has(`${s}-${i + 1}`);
                              const esHoy = hoyPos && hoyPos.semana === s && hoyPos.dia === i + 1;
                              const pasado = arr && fechaDe(arr, s, i + 1) < hoy;
                              return (
                                <div key={i} onClick={() => alternar(p, s, i + 1, activo)} title={`${arr ? fechaCorta(fechaDe(arr, s, i + 1)) : `Semana ${s}`} (${l})`}
                                  style={{ width: 10, height: 14, borderRadius: 2, cursor: puedeEditar ? 'pointer' : 'default',
                                    background: activo ? (pasado ? '#1a1a2e' : '#3B82F6') : (esHoy ? '#FDE2E2' : '#f1f1f4'),
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
    </div>
  );
}

function TabCatalogo({ torre, etapas, puedeEditar, puedeCostos, contratos, contratistas, onCambio }) {
  const [nueva, setNueva] = useState({ etapa: '', descripcion: '', unidad: '', cantidad: '' });
  const [etapaNueva, setEtapaNueva] = useState('');

  const nombreContrato = (id) => { const c = contratos.find(x => x.id === id); if (!c) return ''; return (contratistas.find(x => x.id === c.contratista_id)?.nombre || 'Contratista') + (c.concepto ? ` · ${c.concepto}` : ''); };
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
    if (!window.confirm(`¿Eliminar la partida "${p.descripcion}"? Se borra también su programa y su historial de avance.`)) return;
    const { error } = await supabase.from('obra_partidas').delete().eq('id', p.id);
    if (error) { alert('No se pudo eliminar: ' + error.message); return; }
    onCambio();
  };
  const agregar = async () => {
    const etapaNombre = (nueva.etapa === '__nueva' ? etapaNueva : nueva.etapa).trim();
    if (!etapaNombre || !nueva.descripcion.trim()) { alert('Indica la etapa y la descripción de la partida.'); return; }
    const existente = etapas.find(e => e.nombre === etapaNombre);
    const etapaOrden = existente ? existente.orden : (Math.max(0, ...etapas.map(e => e.orden)) + 1);
    const orden = existente ? Math.max(0, ...existente.partidas.map(p => p.orden)) + 1 : 1;
    const { error } = await supabase.from('obra_partidas').insert({
      torre_id: torre.id, etapa: etapaNombre, etapa_orden: etapaOrden, orden, descripcion: nueva.descripcion.trim(),
      unidad: nueva.unidad.trim().toUpperCase() || null, cantidad: num(nueva.cantidad),
    });
    if (error) { alert('No se pudo agregar: ' + error.message); return; }
    setNueva({ etapa: nueva.etapa, descripcion: '', unidad: '', cantidad: '' });
    setEtapaNueva('');
    onCambio();
  };

  return (
    <div>
      {puedeEditar && (
        <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Agregar partida</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={nueva.etapa} onChange={e => setNueva(n => ({ ...n, etapa: e.target.value }))} style={inp}>
              <option value="">Etapa...</option>
              {etapas.map(e => <option key={e.nombre} value={e.nombre}>{e.nombre}</option>)}
              <option value="__nueva">+ Etapa nueva</option>
            </select>
            {nueva.etapa === '__nueva' && <input placeholder="Nombre de la etapa" value={etapaNueva} onChange={e => setEtapaNueva(e.target.value)} style={inp} />}
            <input placeholder="Descripción" value={nueva.descripcion} onChange={e => setNueva(n => ({ ...n, descripcion: e.target.value }))} style={{ ...inp, flex: '1 1 200px' }} />
            <input placeholder="Unidad" value={nueva.unidad} onChange={e => setNueva(n => ({ ...n, unidad: e.target.value }))} style={{ ...inp, width: 70 }} />
            <input placeholder="Cantidad" type="number" value={nueva.cantidad} onChange={e => setNueva(n => ({ ...n, cantidad: e.target.value }))} style={{ ...inp, width: 90 }} />
            <button onClick={agregar} style={{ ...btn, background: '#1a1a2e', color: '#fff', border: 'none' }}>Agregar</button>
          </div>
        </div>
      )}
      {etapas.map(et => (
        <div key={et.nombre} style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', background: '#f7f7f9', fontSize: 13, fontWeight: 700 }}>{et.nombre} <span style={{ fontWeight: 400, color: '#888' }}>· {et.partidas.length} partidas</span></div>
          {et.partidas.map(p => (
            <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 12px', borderBottom: '0.5px solid #f3f3f3', flexWrap: 'wrap' }}>
              <input defaultValue={p.descripcion} disabled={!puedeEditar} onBlur={e => guardarCampo(p, 'descripcion', e.target.value)} style={{ ...inp, flex: '1 1 240px', border: puedeEditar ? inp.border : 'none' }} />
              <input defaultValue={p.unidad || ''} disabled={!puedeEditar} onBlur={e => guardarCampo(p, 'unidad', e.target.value.toUpperCase())} style={{ ...inp, width: 70 }} />
              <input type="number" defaultValue={p.cantidad ?? ''} disabled={!puedeEditar} onBlur={e => guardarCampo(p, 'cantidad', e.target.value)} style={{ ...inp, width: 100, textAlign: 'right' }} />
              <PrecioCelda p={p} disabled={!puedeCostos} onGuardar={guardarCampo} />
              <span style={{ width: 110, fontSize: 11, color: '#555', textAlign: 'right' }} title="Presupuesto = cantidad × precio unitario">{p.cantidad > 0 && p.precio_unitario > 0 ? $(p.cantidad * p.precio_unitario) : ''}</span>
              {p.contrato_id && <span style={{ fontSize: 10, color: '#3B82F6', background: '#EFF6FF', padding: '2px 8px', borderRadius: 20 }} title="Contrato">{nombreContrato(p.contrato_id)}</span>}
              {p.solo_programa && <span style={{ fontSize: 10, color: '#856404', background: '#FFF8E1', padding: '2px 8px', borderRadius: 20 }} title="Está en el programa del Excel pero no en el catálogo de cantidades">sin cantidad en catálogo</span>}
              {puedeEditar && <button onClick={() => eliminar(p)} style={{ ...btn, color: '#C0392B', padding: '4px 8px' }}>Eliminar</button>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Página completa: título + lista de torres / detalle de la torre abierta.
export default function ObraTorres() {
  const isMobile = useIsMobile();
  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Obra por torre</h2>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '1rem' }}>Catálogo de partidas, programa semanal y avance real de la mano de obra</div>
      <ListaObra />
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
