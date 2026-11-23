import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { usePuede } from './PermisosContext';
import { enviarPush } from './enviarPush';
import { traerTodo, useIsMobile, $, btn, inp } from './ObraTorres';

// Programa de obra — replica el Excel de cada torre (ARRAYANES 2 EDIF. TORRE L):
//  - Un frente (Torre L) se trabaja por ETAPA (Cimentación, Planta Baja...).
//  - Cada etapa tiene partidas en 5 categorías (hojas del Excel): mano de obra, materiales,
//    subcontratos, maquinaria e indirectos, con unidad, precio y cantidad (= presupuesto).
//  - La ejecución se captura por semana (unidades y, si cambió, el precio real).
//  - La etapa pasa de "cargando presupuesto" a "abierta" (se congela su tope) y luego "cerrada".
//    Con la etapa abierta no se puede pasar del tope: más presupuesto es una ampliación que
//    solo autoriza el Gerente de Construcción (reglas en la base de datos: scripts/programa_obra.sql).

const CATEGORIAS = [
  { id: 'mano_obra', label: 'Mano de obra' },
  { id: 'materiales', label: 'Materiales' },
  { id: 'subcontratos', label: 'Subcontratos' },
  { id: 'maquinaria', label: 'Maquinaria' },
  { id: 'indirectos', label: 'Indirectos' },
];
const ESTATUS = {
  presupuesto: { txt: 'Cargando presupuesto', color: '#B45309', fondo: '#FFF4E5' },
  abierta: { txt: 'Abierta', color: '#27500A', fondo: '#EAF3DE' },
  cerrada: { txt: 'Cerrada', color: '#475569', fondo: '#EEF2F6' },
};
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (s) => { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return `${d} ${MESES[m - 1]} ${String(y).slice(2)}`; };
const sumaDias = (s, n) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); const f = new Date(y, m - 1, d + n); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`; };
const trozos = (arr, n) => { const r = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; };
const pct = (a, b) => (Number(b) > 0 ? Math.round((Number(a) / Number(b)) * 1000) / 10 : 0);

async function correosDeRoles(roles) {
  const { data } = await supabase.from('agentes').select('correo').in('rol', roles).eq('activo', true);
  return (data || []).map(a => a.correo).filter(Boolean);
}

function Chip({ estatus }) {
  const s = ESTATUS[estatus] || ESTATUS.presupuesto;
  return <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, background: s.fondo, color: s.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.txt}</span>;
}

// Celda editable: guarda al salir del campo (o con Enter). Si la base rechaza el cambio, regresa al valor anterior.
function Celda({ valor, onGuardar, numero = false, disabled = false, ancho = 74, placeholder = '', alinear = 'right', title }) {
  const mostrar = (v) => (numero && v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? String(Math.round(Number(v) * 10000) / 10000) : (v ?? ''));
  const [t, setT] = useState(mostrar(valor));
  useEffect(() => { setT(mostrar(valor)); }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps
  const confirmar = async () => {
    const limpio = String(t).trim();
    if (numero) {
      const n = limpio === '' ? null : Number(limpio.replace(/,/g, ''));
      if (limpio !== '' && !Number.isFinite(n)) { setT(mostrar(valor)); return; }
      const antes = valor === null || valor === undefined || valor === '' ? null : Number(valor);
      if (n === antes || (n !== null && antes !== null && Math.abs(n - antes) < 0.00005)) return;
      const ok = await onGuardar(n);
      if (ok === false) setT(mostrar(valor));
    } else {
      if (limpio === String(valor ?? '')) return;
      const ok = await onGuardar(limpio);
      if (ok === false) setT(valor ?? '');
    }
  };
  return (
    <input value={t} disabled={disabled} placeholder={placeholder} title={title}
      inputMode={numero ? 'decimal' : undefined}
      onChange={e => setT(e.target.value)} onBlur={confirmar}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setT(mostrar(valor)); e.target.blur(); } }}
      style={{ ...inp, width: ancho, textAlign: alinear, padding: '4px 6px', background: disabled ? 'transparent' : '#FFFBEA', border: disabled ? '0.5px solid transparent' : '0.5px solid #E5DDB0' }} />
  );
}

// ---------------------------------------------------------------- Lista de frentes
function ModalFrente({ onCerrar, onCreado }) {
  const [desarrollos, setDesarrollos] = useState([]);
  const [f, setF] = useState({ nombre: '', desarrollo_id: '', etapa_desarrollo: '', lugar: '', viviendas: '' });
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { supabase.from('desarrollos').select('id, nombre, ciudad').order('nombre').then(({ data }) => setDesarrollos(data || [])); }, []);
  const guardar = async () => {
    if (!f.nombre.trim()) { alert('Escribe el nombre del frente (por ejemplo Torre M)'); return; }
    setGuardando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('prog_frentes').insert({
      nombre: f.nombre.trim(), desarrollo_id: f.desarrollo_id || null, etapa_desarrollo: f.etapa_desarrollo.trim() || null,
      lugar: f.lugar.trim() || null, viviendas: f.viviendas === '' ? null : Number(f.viviendas), creado_por: user?.email || null,
    }).select().single();
    setGuardando(false);
    if (error) { alert('No se pudo crear: ' + error.message); return; }
    onCreado(data);
  };
  const campo = (k, label, props = {}) => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>{label}</label>
      <input value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} {...props} style={{ ...inp, width: '100%', padding: '8px 10px' }} />
    </div>
  );
  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 420 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 }}>Nuevo frente</div>
        {campo('nombre', 'Nombre (Torre M, Manzana 3...)', { placeholder: 'Torre M' })}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Desarrollo</label>
          <select value={f.desarrollo_id} onChange={e => setF({ ...f, desarrollo_id: e.target.value })} style={{ ...inp, width: '100%', padding: '8px 10px' }}>
            <option value=''>Sin asignar</option>
            {desarrollos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        </div>
        {campo('etapa_desarrollo', 'Etapa del desarrollo', { placeholder: 'Etapa 2' })}
        {campo('lugar', 'Lugar', { placeholder: 'Tlaquepaque, Jalisco' })}
        {campo('viviendas', 'Viviendas', { type: 'number', min: 0 })}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onCerrar} style={btn}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} style={{ ...btn, background: '#1a1a2e', color: '#fff', border: 'none' }}>{guardando ? 'Creando...' : 'Crear frente'}</button>
        </div>
      </div>
    </div>
  );
}

function ListaFrentes({ onAbrir }) {
  const puede = usePuede();
  const [frentes, setFrentes] = useState(null);
  const [datos, setDatos] = useState({ etapas: [], partidas: [], ejec: [] });
  const [error, setError] = useState('');
  const [nuevo, setNuevo] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [fr, et, pa] = await Promise.all([
        supabase.from('prog_frentes').select('*, desarrollos(nombre)').order('created_at'),
        traerTodo(() => supabase.from('prog_etapas').select('id, frente_id, estatus').order('id')),
        traerTodo(() => supabase.from('prog_partidas').select('id, etapa_id, cantidad, precio').order('id')),
      ]);
      if (fr.error) throw fr.error;
      let ejec = [];
      for (const lote of trozos(pa.map(p => p.id), 120)) ejec = ejec.concat(await traerTodo(() => supabase.from('prog_ejecucion').select('partida_id, unidades, precio').in('partida_id', lote).order('id')));
      setFrentes(fr.data || []); setDatos({ etapas: et, partidas: pa, ejec });
    } catch (e) { setError(e.message || String(e)); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const resumenDe = (f) => {
    const et = datos.etapas.filter(e => e.frente_id === f.id);
    const ids = new Set(et.map(e => e.id));
    const ps = datos.partidas.filter(p => ids.has(p.etapa_id));
    const pm = new Map(ps.map(p => [p.id, p]));
    const pres = ps.reduce((s, p) => s + Number(p.cantidad) * Number(p.precio), 0);
    const ejc = datos.ejec.reduce((s, r) => { const p = pm.get(r.partida_id); return p ? s + Number(r.unidades) * Number(r.precio ?? p.precio) : s; }, 0);
    return { etapas: et.length, abiertas: et.filter(e => e.estatus === 'abierta').length, pres, ejc };
  };

  if (error) return <div style={{ color: '#C0392B', fontSize: 13 }}>No se pudo cargar el programa: {error}. Si es la primera vez, falta aplicar la estructura en la base de datos.</div>;
  if (!frentes) return <div style={{ color: '#888', fontSize: 13 }}>Cargando...</div>;
  return (
    <div>
      {puede('construccion.programa_cargar') && <div style={{ marginBottom: 14 }}><button onClick={() => setNuevo(true)} style={{ ...btn, background: '#1a1a2e', color: '#fff', border: 'none', padding: '8px 14px' }}>Nuevo frente</button></div>}
      {frentes.length === 0 && <div style={{ color: '#888', fontSize: 13 }}>Todavía no hay frentes. Crea el primero con "Nuevo frente".</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {frentes.map(f => {
          const r = resumenDe(f);
          return (
            <div key={f.id} onClick={() => onAbrir(f)} style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 10, padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e' }}>{f.nombre}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{[f.desarrollos?.nombre, f.etapa_desarrollo, f.viviendas ? `${f.viviendas} viviendas` : null, f.lugar].filter(Boolean).join(' · ')}</div>
              </div>
              <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: '#888' }}>{r.etapas} {r.etapas === 1 ? 'etapa' : 'etapas'} · {r.abiertas} {r.abiertas === 1 ? 'abierta' : 'abiertas'}</div>
                <div style={{ fontSize: 12 }}><span style={{ color: '#888' }}>Presupuesto</span> <strong>{$(r.pres)}</strong></div>
                <div style={{ fontSize: 12 }}><span style={{ color: '#888' }}>Ejecutado</span> <strong>{$(r.ejc)}</strong> <span style={{ color: '#888' }}>({pct(r.ejc, r.pres)}%)</span></div>
              </div>
            </div>
          );
        })}
      </div>
      {nuevo && <ModalFrente onCerrar={() => setNuevo(false)} onCreado={(f) => { setNuevo(false); onAbrir(f); }} />}
    </div>
  );
}

// ---------------------------------------------------------------- Detalle de un frente
function ModalAmpliacion({ etapa, ejecutado, onCerrar, onListo }) {
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const enviar = async () => {
    setGuardando(true);
    const { error } = await supabase.rpc('prog_solicitar_ampliacion', { p_etapa: etapa.id, p_monto: Number(monto), p_motivo: motivo });
    setGuardando(false);
    if (error) { alert(error.message); return; }
    onListo(Number(monto), motivo);
  };
  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 420 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>Solicitar más presupuesto</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>{etapa.nombre} · ejecutado {$(ejecutado)}. Lo autoriza el Gerente de Construcción.</div>
        <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Monto adicional</label>
        <input type="number" min="0" value={monto} onChange={e => setMonto(e.target.value)} style={{ ...inp, width: '100%', padding: '8px 10px', marginBottom: 10 }} />
        <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Motivo</label>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} style={{ ...inp, width: '100%', padding: '8px 10px', resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onCerrar} style={btn}>Cancelar</button>
          <button onClick={enviar} disabled={guardando || !(Number(monto) > 0) || !motivo.trim()} style={{ ...btn, background: '#1a1a2e', color: '#fff', border: 'none' }}>{guardando ? 'Enviando...' : 'Solicitar'}</button>
        </div>
      </div>
    </div>
  );
}

function DetalleFrente({ frente, onVolver }) {
  const isMobile = useIsMobile();
  const puede = usePuede();
  const puedeCargar = puede('construccion.programa_cargar');
  const puedeEjec = puede('construccion.programa_ejecucion');
  const puedeAbrir = puede('construccion.programa_abrir_etapa');
  const puedePedir = puede('construccion.programa_ampliar_solicitar');
  const puedeAutorizar = puede('construccion.programa_ampliar_autorizar');

  const [tab, setTab] = useState('resumen');
  const [etapas, setEtapas] = useState([]);
  const [semanas, setSemanas] = useState([]);
  const [partidas, setPartidas] = useState([]);
  const [ejec, setEjec] = useState([]);
  const [amp, setAmp] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [modalAmp, setModalAmp] = useState(null);
  const [cerradas, setCerradas] = useState({});
  const [nuevaEtapa, setNuevaEtapa] = useState('');
  const [nuevaSemana, setNuevaSemana] = useState({ etiqueta: '', fecha: '' });
  const emailRef = useRef('');
  useEffect(() => { supabase.auth.getUser().then(({ data }) => { emailRef.current = data?.user?.email || ''; }); }, []);

  const cargar = useCallback(async () => {
    try {
      const [et, se] = await Promise.all([
        supabase.from('prog_etapas').select('*').eq('frente_id', frente.id).order('orden').order('created_at'),
        supabase.from('prog_semanas').select('*').eq('frente_id', frente.id).order('orden'),
      ]);
      if (et.error) throw et.error; if (se.error) throw se.error;
      const ids = et.data.map(e => e.id);
      let ps = [], am = [], ej = [];
      if (ids.length) {
        ps = await traerTodo(() => supabase.from('prog_partidas').select('*').in('etapa_id', ids).order('orden').order('created_at'));
        const a = await supabase.from('prog_ampliaciones').select('*').in('etapa_id', ids).order('solicitada_en', { ascending: false });
        if (a.error) throw a.error; am = a.data || [];
        for (const lote of trozos(ps.map(p => p.id), 120)) ej = ej.concat(await traerTodo(() => supabase.from('prog_ejecucion').select('*').in('partida_id', lote).order('id')));
      }
      setEtapas(et.data); setSemanas(se.data); setPartidas(ps); setAmp(am); setEjec(ej); setError('');
    } catch (e) { setError(e.message || String(e)); } finally { setCargando(false); }
  }, [frente.id]);
  useEffect(() => { cargar(); }, [cargar]);

  // ---- cálculos
  const ejPor = useMemo(() => {
    const m = new Map();
    ejec.forEach(r => { if (!m.has(r.partida_id)) m.set(r.partida_id, new Map()); m.get(r.partida_id).set(r.semana_id, r); });
    return m;
  }, [ejec]);
  const valor = useCallback((p, sid) => { const r = ejPor.get(p.id)?.get(sid); return r ? Number(r.unidades || 0) * Number(r.precio ?? p.precio ?? 0) : 0; }, [ejPor]);
  const presP = (p) => Number(p.cantidad || 0) * Number(p.precio || 0);
  const ejecP = useCallback((p) => semanas.reduce((s, w) => s + valor(p, w.id), 0), [semanas, valor]);
  const porEtapa = useMemo(() => etapas.map(e => {
    const ps = partidas.filter(p => p.etapa_id === e.id);
    const ampliado = amp.filter(a => a.etapa_id === e.id && a.estatus === 'autorizada').reduce((s, a) => s + Number(a.monto), 0);
    return { ...e, ps, pres: ps.reduce((s, p) => s + presP(p), 0), ejc: ps.reduce((s, p) => s + ejecP(p), 0), ampliado, tope: e.estatus === 'presupuesto' ? null : Number(e.tope || 0) + ampliado };
  }), [etapas, partidas, amp, ejecP]);
  const total = useMemo(() => ({ pres: porEtapa.reduce((s, e) => s + e.pres, 0), ejc: porEtapa.reduce((s, e) => s + e.ejc, 0) }), [porEtapa]);

  // ---- acciones
  const avisar = (roles, title, body) => correosDeRoles(roles).then(correos => enviarPush({ correos, title, body, url: '/' }));
  const rpc = async (fn, args) => {
    const { data, error: er } = await supabase.rpc(fn, args);
    if (er) { alert(er.message); return null; }
    await cargar();
    return data;
  };
  const abrirEtapa = async (e) => {
    if (!window.confirm(`Abrir la etapa ${e.nombre} con un tope de ${$(e.pres)} (el presupuesto cargado).\n\nDespués no se podrá pasar de ese monto: más presupuesto solo con una ampliación que autoriza el Gerente de Construcción.`)) return;
    await rpc('prog_abrir_etapa', { p_etapa: e.id });
  };
  const cerrarEtapa = async (e) => { if (window.confirm(`¿Cerrar la etapa ${e.nombre}? Ya no se podrá modificar.`)) await rpc('prog_cerrar_etapa', { p_etapa: e.id }); };
  const reabrirEtapa = async (e) => { if (window.confirm(`¿Reabrir la etapa ${e.nombre}?`)) await rpc('prog_reabrir_etapa', { p_etapa: e.id }); };
  const resolver = async (a, autorizar) => {
    const nota = window.prompt(autorizar ? 'Nota (opcional):' : 'Motivo del rechazo (opcional):', '');
    if (nota === null) return;
    const r = await rpc('prog_resolver_ampliacion', { p_id: a.id, p_autorizar: autorizar, p_nota: nota });
    const e = etapas.find(x => x.id === a.etapa_id);
    if (r && a.solicitada_por) enviarPush({ correos: [a.solicitada_por], title: `Ampliación ${autorizar ? 'autorizada' : 'rechazada'}`, body: `${frente.nombre} · ${e?.nombre || ''} · ${$(a.monto)}`, url: '/' });
  };
  const agregarEtapa = async () => {
    const nombre = nuevaEtapa.trim().toUpperCase();
    if (!nombre) return;
    const { error: er } = await supabase.from('prog_etapas').insert({ frente_id: frente.id, nombre, orden: etapas.reduce((m, e) => Math.max(m, e.orden), 0) + 1 });
    if (er) { alert(er.message.includes('duplicate') ? 'Esa etapa ya existe' : er.message); return; }
    setNuevaEtapa(''); cargar();
  };
  const eliminarEtapa = async (e) => {
    if (!window.confirm(`¿Eliminar la etapa ${e.nombre} y todas sus partidas?`)) return;
    const { error: er } = await supabase.from('prog_etapas').delete().eq('id', e.id);
    if (er) alert(er.message); else cargar();
  };
  const agregarSemana = async () => {
    const ult = semanas[semanas.length - 1];
    const etiqueta = nuevaSemana.etiqueta.trim() || `Semana ${semanas.length + 1}`;
    const fecha = nuevaSemana.fecha || (ult?.fecha ? sumaDias(ult.fecha, 7) : (frente.fecha_arranque || null));
    const { error: er } = await supabase.from('prog_semanas').insert({ frente_id: frente.id, orden: semanas.reduce((m, s) => Math.max(m, Number(s.orden)), 0) + 1, etiqueta, fecha });
    if (er) { alert(er.message); return; }
    setNuevaSemana({ etiqueta: '', fecha: '' }); cargar();
  };
  const eliminarFrente = async () => {
    if (!window.confirm(`¿Eliminar el frente ${frente.nombre} con todo lo que tiene cargado? Solo se puede si ninguna etapa está abierta.`)) return;
    const { error: er } = await supabase.from('prog_frentes').delete().eq('id', frente.id);
    if (er) { alert(er.message); return; }
    onVolver();
  };
  const guardarPartida = async (p, campo, v) => {
    const { error: er } = await supabase.from('prog_partidas').update({ [campo]: campo === 'cantidad' || campo === 'precio' ? (v ?? 0) : v }).eq('id', p.id);
    if (er) { alert(er.message); return false; }
    setPartidas(prev => prev.map(x => (x.id === p.id ? { ...x, [campo]: campo === 'cantidad' || campo === 'precio' ? (v ?? 0) : v } : x)));
    return true;
  };
  const agregarPartida = async (e, cat) => {
    const previas = partidas.filter(p => p.etapa_id === e.id && p.categoria === cat);
    const { data, error: er } = await supabase.from('prog_partidas').insert({
      etapa_id: e.id, categoria: cat, grupo: previas.length ? previas[previas.length - 1].grupo : null, descripcion: 'Nueva partida', unidad: '', cantidad: 0, precio: 0,
      orden: partidas.filter(p => p.etapa_id === e.id).reduce((m, p) => Math.max(m, p.orden), 0) + 1, creado_por: emailRef.current || null,
    }).select().single();
    if (er) { alert(er.message); return; }
    setPartidas(prev => [...prev, data]);
  };
  const eliminarPartida = async (p) => {
    if (!window.confirm(`¿Eliminar "${p.descripcion}"?`)) return;
    const { error: er } = await supabase.from('prog_partidas').delete().eq('id', p.id);
    if (er) { alert(er.message); return; }
    setPartidas(prev => prev.filter(x => x.id !== p.id));
  };
  const guardarEj = async (p, sem, campo, v) => {
    const act = ejPor.get(p.id)?.get(sem.id);
    const fila = { partida_id: p.id, semana_id: sem.id, unidades: campo === 'unidades' ? (v ?? 0) : Number(act?.unidades || 0), precio: campo === 'precio' ? v : (act?.precio ?? null), actualizado_por: emailRef.current || null, updated_at: new Date().toISOString() };
    const { data, error: er } = await supabase.from('prog_ejecucion').upsert(fila, { onConflict: 'partida_id,semana_id' }).select().single();
    if (er) { alert(er.message); return false; }
    setEjec(prev => [...prev.filter(r => !(r.partida_id === p.id && r.semana_id === sem.id)), data]);
    return true;
  };

  if (cargando) return <div style={{ color: '#888', fontSize: 13 }}>Cargando...</div>;
  if (error) return <div style={{ color: '#C0392B', fontSize: 13 }}>{error}</div>;

  const th = { padding: '6px 8px', fontSize: 11, fontWeight: 600, color: '#555', background: '#f6f6f6', borderBottom: '0.5px solid #e0e0e0', whiteSpace: 'nowrap', textAlign: 'right' };
  const td = { padding: '3px 6px', fontSize: 12, borderBottom: '0.5px solid #f0f0f0', whiteSpace: 'nowrap', textAlign: 'right' };
  const sticky = { position: 'sticky', left: 0, background: '#fff', zIndex: 1, textAlign: 'left' };

  // ---------------- RESUMEN
  const pendientes = amp.filter(a => a.estatus === 'solicitada');
  const resumenTab = (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 16, maxWidth: 760 }}>
        {[['Presupuesto', $(total.pres)], ['Ejecutado', $(total.ejc)], ['Por ejecutar', $(total.pres - total.ejc)], ['Avance', `${pct(total.ejc, total.pres)}%`]].map(([l, v]) => (
          <div key={l} style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: '#888' }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>{v}</div>
          </div>
        ))}
      </div>

      {pendientes.length > 0 && (
        <div style={{ background: '#FFF4E5', border: '0.5px solid #F5D9A8', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#B45309', marginBottom: 6 }}>Ampliaciones de presupuesto por autorizar</div>
          {pendientes.map(a => {
            const e = etapas.find(x => x.id === a.etapa_id);
            return (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 0', borderTop: '0.5px solid #F5D9A8' }}>
                <div style={{ fontSize: 12, color: '#333' }}><strong>{e?.nombre}</strong> · {$(a.monto)} · {a.motivo}<div style={{ color: '#888', fontSize: 11 }}>Pidió {(a.solicitada_por || '').split('@')[0]} con {$(a.ejecutado_al_solicitar)} ejecutados</div></div>
                {puedeAutorizar
                  ? <div style={{ display: 'flex', gap: 6 }}><button onClick={() => resolver(a, true)} style={{ ...btn, background: '#10B981', color: '#fff', border: 'none' }}>Autorizar</button><button onClick={() => resolver(a, false)} style={btn}>Rechazar</button></div>
                  : <span style={{ fontSize: 11, color: '#B45309' }}>Pendiente del Gerente de Construcción</span>}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', marginBottom: 8 }}>Etapas</div>
      <div style={{ overflowX: 'auto', border: '0.5px solid #e0e0e0', borderRadius: 10, background: '#fff', marginBottom: 10 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left' }}>Etapa</th><th style={{ ...th, textAlign: 'left' }}>Estado</th><th style={th}>Presupuesto</th><th style={th}>Tope</th><th style={th}>Ejecutado</th><th style={th}>Disponible</th><th style={th}>Avance</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {porEtapa.map(e => {
              const base = e.tope ?? e.pres;
              const cerca = e.estatus === 'abierta' && e.tope > 0 && e.ejc / e.tope >= 0.9;
              return (
                <tr key={e.id}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{e.nombre}</td>
                  <td style={{ ...td, textAlign: 'left' }}><Chip estatus={e.estatus} />{cerca && <span style={{ marginLeft: 6, fontSize: 11, color: '#C0392B', fontWeight: 600 }}>Cerca del tope</span>}</td>
                  <td style={td}>{$(e.pres)}</td>
                  <td style={td}>{e.tope === null ? '—' : $(e.tope)}{e.ampliado > 0 && <div style={{ fontSize: 10, color: '#888' }}>incluye {$(e.ampliado)} de ampliación</div>}</td>
                  <td style={td}>{$(e.ejc)}</td>
                  <td style={td}>{$(base - e.ejc)}</td>
                  <td style={td}>{pct(e.ejc, base)}%</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {e.estatus === 'presupuesto' && puedeAbrir && <button onClick={() => abrirEtapa(e)} style={{ ...btn, background: '#1a1a2e', color: '#fff', border: 'none' }}>Abrir etapa</button>}
                      {e.estatus === 'presupuesto' && puedeCargar && e.ps.length === 0 && <button onClick={() => eliminarEtapa(e)} style={btn}>Eliminar</button>}
                      {e.estatus === 'abierta' && puedePedir && e.ejc > 0 && !pendientes.some(a => a.etapa_id === e.id) && <button onClick={() => setModalAmp(e)} style={btn}>Pedir más presupuesto</button>}
                      {e.estatus === 'abierta' && puedeAbrir && <button onClick={() => cerrarEtapa(e)} style={btn}>Cerrar</button>}
                      {e.estatus === 'cerrada' && puedeAutorizar && <button onClick={() => reabrirEtapa(e)} style={btn}>Reabrir</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {porEtapa.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: 'left', color: '#888', padding: 14 }}>Sin etapas. Agrega la primera abajo.</td></tr>}
          </tbody>
        </table>
      </div>
      {puedeCargar && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <input value={nuevaEtapa} onChange={e => setNuevaEtapa(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') agregarEtapa(); }} placeholder="Nueva etapa (PLANTA BAJA, NIVEL 1...)" style={{ ...inp, padding: '8px 10px', width: 280 }} />
          <button onClick={agregarEtapa} style={btn}>Agregar etapa</button>
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', marginBottom: 8 }}>Presupuesto y ejecución por categoría</div>
      <div style={{ overflowX: 'auto', border: '0.5px solid #e0e0e0', borderRadius: 10, background: '#fff', marginBottom: 10 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 560 + semanas.length * 100 }}>
          <thead><tr>
            <th style={{ ...th, ...sticky, background: '#f6f6f6', minWidth: 140 }}>Categoría</th><th style={th}>Presupuesto</th><th style={th}>%</th><th style={th}>Ejecutado</th>
            {semanas.map(s => <th key={s.id} style={th}>{s.etiqueta}<div style={{ fontWeight: 400, color: '#999' }}>{fechaCorta(s.fecha)}</div></th>)}
          </tr></thead>
          <tbody>
            {CATEGORIAS.map(c => {
              const ps = partidas.filter(p => p.categoria === c.id);
              const pres = ps.reduce((s, p) => s + presP(p), 0);
              return (
                <tr key={c.id}>
                  <td style={{ ...td, ...sticky }}>{c.label}</td>
                  <td style={td}>{$(pres)}</td><td style={td}>{pct(pres, total.pres)}%</td><td style={td}>{$(ps.reduce((s, p) => s + ejecP(p), 0))}</td>
                  {semanas.map(s => <td key={s.id} style={td}>{$(ps.reduce((a, p) => a + valor(p, s.id), 0))}</td>)}
                </tr>
              );
            })}
            <tr>
              <td style={{ ...td, ...sticky, fontWeight: 700 }}>Total</td>
              <td style={{ ...td, fontWeight: 700 }}>{$(total.pres)}</td><td style={td}>100%</td><td style={{ ...td, fontWeight: 700 }}>{$(total.ejc)}</td>
              {semanas.map(s => <td key={s.id} style={{ ...td, fontWeight: 700 }}>{$(partidas.reduce((a, p) => a + valor(p, s.id), 0))}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', margin: '16px 0 8px' }}>Semanas</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {semanas.length === 0 && <span style={{ fontSize: 12, color: '#888' }}>Todavía no hay semanas. Agrega la primera para empezar a capturar la ejecución.</span>}
        {semanas.map(s => <span key={s.id} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f1f1f1', color: '#555' }}>{s.etiqueta}{s.fecha ? ` · ${fechaCorta(s.fecha)}` : ''}</span>)}
      </div>
      {(puedeCargar || puedeEjec) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={nuevaSemana.etiqueta} onChange={e => setNuevaSemana({ ...nuevaSemana, etiqueta: e.target.value })} placeholder={`Semana ${semanas.length + 1}`} style={{ ...inp, padding: '8px 10px', width: 150 }} />
          <input type="date" value={nuevaSemana.fecha} onChange={e => setNuevaSemana({ ...nuevaSemana, fecha: e.target.value })} style={{ ...inp, padding: '7px 10px' }} />
          <button onClick={agregarSemana} style={btn}>Agregar semana</button>
        </div>
      )}
      {puedeCargar && <div style={{ marginTop: 28 }}><button onClick={eliminarFrente} style={{ ...btn, color: '#C0392B' }}>Eliminar frente</button></div>}
    </div>
  );

  // ---------------- HOJA DE UNA CATEGORÍA (como cada pestaña del Excel)
  const hojaCategoria = (cat) => {
    const conPrecioSemana = cat.id !== 'mano_obra';
    const colsSem = conPrecioSemana ? 3 : 2;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {porEtapa.length === 0 && <div style={{ color: '#888', fontSize: 13 }}>Primero agrega una etapa en Resumen.</div>}
        {porEtapa.map(e => {
          const ps = e.ps.filter(p => p.categoria === cat.id);
          const pres = ps.reduce((s, p) => s + presP(p), 0);
          const ejc = ps.reduce((s, p) => s + ejecP(p), 0);
          const editaPres = puedeCargar && e.estatus !== 'cerrada';
          const editaEj = puedeEjec && e.estatus === 'abierta';
          const plegada = cerradas[`${e.id}-${cat.id}`];
          let grupoPrev = '__';
          return (
            <div key={e.id} style={{ border: '0.5px solid #e0e0e0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
              <div onClick={() => setCerradas({ ...cerradas, [`${e.id}-${cat.id}`]: !plegada })} style={{ background: '#1a1a2e', color: '#fff', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{e.nombre}</span><Chip estatus={e.estatus} />
                </div>
                <div style={{ fontSize: 12, opacity: 0.9 }}>{cat.label}: presupuesto {$(pres)} · ejecutado {$(ejc)} · {ps.length} {ps.length === 1 ? 'partida' : 'partidas'}</div>
              </div>
              {!plegada && (
                <div>
                  {e.estatus === 'presupuesto' && <div style={{ fontSize: 11, color: '#B45309', background: '#FFF9EE', padding: '6px 14px' }}>Cargando presupuesto: la ejecución se captura cuando la etapa esté abierta.</div>}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', minWidth: 640 + semanas.length * (colsSem * 78) }}>
                      <thead>
                        <tr>
                          <th style={{ ...th, ...sticky, background: '#f6f6f6', minWidth: 230 }} rowSpan={2}>Descripción</th>
                          <th style={th} rowSpan={2}>Unidad</th><th style={th} rowSpan={2}>Precio</th><th style={th} rowSpan={2}>Cantidad</th><th style={th} rowSpan={2}>Presupuesto</th>
                          {semanas.map(s => <th key={s.id} style={{ ...th, textAlign: 'center', borderLeft: '0.5px solid #e0e0e0' }} colSpan={colsSem}>{s.etiqueta} <span style={{ fontWeight: 400, color: '#999' }}>{fechaCorta(s.fecha)}</span></th>)}
                          <th style={th} rowSpan={2}>Ejecutado</th>
                        </tr>
                        <tr>{semanas.map(s => (
                          <React.Fragment key={s.id}>
                            <th style={{ ...th, borderLeft: '0.5px solid #e0e0e0' }}>Unid.</th>{conPrecioSemana && <th style={th}>Precio</th>}<th style={th}>Valor</th>
                          </React.Fragment>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {ps.map(p => {
                          const filaGrupo = p.grupo && p.grupo !== grupoPrev ? <tr key={`g-${p.id}`}><td colSpan={6 + semanas.length * colsSem} style={{ ...td, textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#888', background: '#fafafa' }}>{p.grupo}</td></tr> : null;
                          grupoPrev = p.grupo || '__';
                          return (
                            <React.Fragment key={p.id}>
                              {filaGrupo}
                              <tr>
                                <td style={{ ...td, ...sticky }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Celda valor={p.descripcion} onGuardar={v => guardarPartida(p, 'descripcion', v)} disabled={!editaPres} ancho={190} alinear="left" />
                                    {editaPres && <button onClick={() => eliminarPartida(p)} title="Eliminar partida" style={{ border: 'none', background: 'none', color: '#bbb', cursor: 'pointer', fontSize: 11 }}>Quitar</button>}
                                  </div>
                                </td>
                                <td style={td}><Celda valor={p.unidad} onGuardar={v => guardarPartida(p, 'unidad', v)} disabled={!editaPres} ancho={60} alinear="left" /></td>
                                <td style={td}><Celda valor={p.precio} numero onGuardar={v => guardarPartida(p, 'precio', v)} disabled={!editaPres} ancho={80} /></td>
                                <td style={td}><Celda valor={p.cantidad} numero onGuardar={v => guardarPartida(p, 'cantidad', v)} disabled={!editaPres} ancho={80} /></td>
                                <td style={{ ...td, fontWeight: 600 }}>{$(presP(p))}</td>
                                {semanas.map(s => {
                                  const r = ejPor.get(p.id)?.get(s.id);
                                  return (
                                    <React.Fragment key={s.id}>
                                      <td style={{ ...td, borderLeft: '0.5px solid #f0f0f0' }}><Celda valor={r ? Number(r.unidades) || '' : ''} numero onGuardar={v => guardarEj(p, s, 'unidades', v)} disabled={!editaEj} ancho={62} /></td>
                                      {conPrecioSemana && <td style={td}><Celda valor={r?.precio ?? ''} numero placeholder={String(p.precio)} onGuardar={v => guardarEj(p, s, 'precio', v)} disabled={!editaEj} ancho={62} title="Precio real de esa semana (si es distinto al presupuestado)" /></td>}
                                      <td style={{ ...td, color: valor(p, s.id) ? '#1a1a2e' : '#ccc' }}>{valor(p, s.id) ? $(valor(p, s.id)) : '-'}</td>
                                    </React.Fragment>
                                  );
                                })}
                                <td style={{ ...td, fontWeight: 600 }}>{$(ejecP(p))}</td>
                              </tr>
                            </React.Fragment>
                          );
                        })}
                        {ps.length === 0 && <tr><td colSpan={6 + semanas.length * colsSem} style={{ ...td, textAlign: 'left', color: '#888', padding: 12 }}>Sin partidas en esta categoría.</td></tr>}
                        <tr>
                          <td style={{ ...td, ...sticky, fontWeight: 700 }}>Total</td><td style={td}></td><td style={td}></td><td style={td}></td><td style={{ ...td, fontWeight: 700 }}>{$(pres)}</td>
                          {semanas.map(s => (
                            <React.Fragment key={s.id}><td style={td}></td>{conPrecioSemana && <td style={td}></td>}<td style={{ ...td, fontWeight: 700 }}>{$(ps.reduce((a, p) => a + valor(p, s.id), 0))}</td></React.Fragment>
                          ))}
                          <td style={{ ...td, fontWeight: 700 }}>{$(ejc)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {editaPres && <div style={{ padding: '8px 14px' }}><button onClick={() => agregarPartida(e, cat.id)} style={btn}>Agregar partida</button></div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <button onClick={onVolver} style={{ ...btn, marginBottom: 12 }}>Volver a los frentes</button>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>{frente.nombre}</div>
        <div style={{ fontSize: 12, color: '#888' }}>{[frente.desarrollos?.nombre, frente.etapa_desarrollo, frente.viviendas ? `${frente.viviendas} viviendas` : null, frente.lugar].filter(Boolean).join(' · ')}</div>
      </div>
      <div style={{ display: 'flex', gap: 2, borderBottom: '0.5px solid #e0e0e0', marginBottom: 16, overflowX: 'auto' }}>
        {[{ id: 'resumen', label: 'Resumen' }, ...CATEGORIAS].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', fontWeight: tab === t.id ? 600 : 400, color: tab === t.id ? '#1a1a2e' : '#888', borderBottom: tab === t.id ? '2px solid #1a1a2e' : '2px solid transparent' }}>{t.label}</button>
        ))}
      </div>
      {tab === 'resumen' ? resumenTab : hojaCategoria(CATEGORIAS.find(c => c.id === tab))}
      {modalAmp && (
        <ModalAmpliacion etapa={modalAmp} ejecutado={modalAmp.ejc} onCerrar={() => setModalAmp(null)}
          onListo={(monto, motivo) => { avisar(['Gerente de Construcción', 'Super Admin'], 'Ampliación de presupuesto por autorizar', `${frente.nombre} · ${modalAmp.nombre} · ${$(monto)} · ${motivo}`); setModalAmp(null); cargar(); }} />
      )}
    </div>
  );
}

export default function Programa() {
  const isMobile = useIsMobile();
  const [frente, setFrente] = useState(null);
  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Programa</h2>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '1rem' }}>Programa de obra por torre y etapa: presupuesto por categoría y ejecución semanal</div>
      {frente ? <DetalleFrente key={frente.id} frente={frente} onVolver={() => setFrente(null)} /> : <ListaFrentes onAbrir={setFrente} />}
    </div>
  );
}
