import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { enviarPush } from './enviarPush';
import { usePuede } from './PermisosContext';

// Marketing — leads de Meta que marketing envía por API (función
// `recibir-lead`), asignados al asesor de guardia del desarrollo.
//  - Leads: bandeja (cada quien ve lo suyo; gerentes lo de sus desarrollos;
//    Admin/Super Admin todo).
//  - Guardias: calendario semanal por desarrollo (mañana / tarde / día completo).
//    Lo editan Gerentes (sus desarrollos), Admin y Super Admin.
//  - API y Ajustes: solo Admin / Super Admin.
const ROLES_ADMIN = ['Super Admin', 'Admin', 'Sub Admin'];
const ROLES_GERENTE = ['Gerente Editor', 'Gerente Operador'];
const ROLES_GUARDIA = ['Agente', 'Asesor Premium', 'Gerente Editor', 'Gerente Operador'];
const TURNOS = [{ k: 'manana', l: 'Mañana' }, { k: 'tarde', l: 'Tarde' }, { k: 'completo', l: 'Día completo' }];
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const ESTATUS = { sin_asignar: { l: 'Sin asignar', bg: '#FDECEC', c: '#C0392B' }, asignado: { l: 'Asignado', bg: '#FFF3CD', c: '#856404' }, atendido: { l: 'Atendido', bg: '#EAF3DE', c: '#27500A' } };
const CLAVES_CFG = ['leads_minutos_reasignacion', 'leads_manana_inicio', 'leads_manana_fin', 'leads_tarde_inicio', 'leads_tarde_fin'];
const CFG_DEFAULT = { leads_minutos_reasignacion: '15', leads_manana_inicio: '09:00', leads_manana_fin: '14:00', leads_tarde_inicio: '14:00', leads_tarde_fin: '19:00' };
const ENDPOINT = `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/recibir-lead`;

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const lunesDe = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; };
const sumaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const hace = (f) => {
  if (!f) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(f).getTime()) / 60000));
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.floor(min / 60)} h`;
  return `hace ${Math.floor(min / 1440)} d`;
};
const sha256hex = async (txt) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
};

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

const inputStyle = { padding: '8px 12px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', background: '#fff', boxSizing: 'border-box' };
const btnStyle = { padding: '6px 12px', border: '0.5px solid #ddd', borderRadius: '6px', background: '#fff', color: '#555', fontSize: '12px', cursor: 'pointer' };

export default function Marketing({ miRol, miAgente }) {
  const isMobile = useIsMobile();
  const esAdmin = ROLES_ADMIN.includes(miRol);
  const esGerente = ROLES_GERENTE.includes(miRol);
  const misDesarrollos = miAgente?.desarrollos_cargo || [];
  const [tab, setTab] = useState('leads');
  const [desarrollos, setDesarrollos] = useState([]);
  const [agentes, setAgentes] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: des } = await supabase.from('desarrollos').select('id, nombre').eq('activo', true).order('nombre');
      setDesarrollos(des || []);
      const { data: ag } = await supabase.from('agentes').select('correo, nombre, apellidos, rol').eq('activo', true).order('nombre');
      setAgentes((ag || []).filter(a => ROLES_GUARDIA.includes(a.rol)));
    })();
  }, []);

  const nombreAg = (a) => `${a.nombre || ''} ${a.apellidos || ''}`.trim();
  const desarrollosVisibles = esGerente ? desarrollos.filter(d => misDesarrollos.includes(d.nombre)) : desarrollos;
  const puede = usePuede();
  const verApi = puede('marketing.gestionar_api');
  const verAjustes = puede('marketing.ajustes');
  const tabs = [['leads', 'Leads'], ['guardias', 'Guardias'], ...(verApi ? [['api', 'API']] : []), ...(verAjustes ? [['ajustes', 'Ajustes']] : [])];

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Marketing</h2>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '1rem' }}>Leads de Meta asignados al asesor de guardia</div>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '1.25rem', borderBottom: '1px solid #e0e0e0' }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: tab === k ? '600' : '400', color: tab === k ? '#1a1a2e' : '#888', borderBottom: tab === k ? '2px solid #1a1a2e' : '2px solid transparent' }}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'leads' && <LeadsTab {...{ miRol, miAgente, esAdmin, esGerente, misDesarrollos, desarrollos: desarrollosVisibles, agentes, nombreAg, isMobile }} />}
      {tab === 'guardias' && <GuardiasTab {...{ miAgente, esAdmin, esGerente, desarrollos: desarrollosVisibles, agentes, nombreAg, isMobile }} />}
      {tab === 'api' && verApi && <ApiTab miAgente={miAgente} />}
      {tab === 'ajustes' && verAjustes && <AjustesTab />}
    </div>
  );
}

// ---------------------------------------------------------------- Leads
function LeadsTab({ miAgente, esAdmin, esGerente, misDesarrollos, desarrollos, agentes, nombreAg, isMobile }) {
  const puede = usePuede();
  const [leads, setLeads] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstatus, setFiltroEstatus] = useState('');
  const [filtroDesarrollo, setFiltroDesarrollo] = useState('');

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(500);
    setLeads(data || []);
    setCargando(false);
  };

  const alcance = (l) => {
    if (esAdmin) return true;
    if (esGerente) return misDesarrollos.includes(l.desarrollo_nombre) || l.asesor_correo === miAgente?.correo;
    return l.asesor_correo === miAgente?.correo;
  };
  const visibles = leads.filter(l => alcance(l) &&
    (!filtroEstatus || l.estatus === filtroEstatus) &&
    (!filtroDesarrollo || l.desarrollo_nombre === filtroDesarrollo));

  const puedeGestionar = (l) => puede('marketing.marcar_atendido') && (esAdmin || esGerente || l.asesor_correo === miAgente?.correo);
  const puedeReasignar = puede('marketing.reasignar_leads');

  const marcarAtendido = async (l) => {
    const { data, error } = await supabase.from('leads').update({
      estatus: 'atendido', atendido_en: new Date().toISOString(), atendido_por: miAgente?.correo || null,
    }).eq('id', l.id).select().single();
    if (error) { alert('No se pudo guardar: ' + error.message); return; }
    setLeads(prev => prev.map(x => x.id === l.id ? data : x));
  };

  const reasignar = async (l, correo) => {
    if (!puede('marketing.reasignar_leads')) return;
    const ag = agentes.find(a => a.correo === correo);
    if (!ag) return;
    if (!window.confirm(`¿Reasignar este lead a ${nombreAg(ag)}?`)) return;
    const nombre = nombreAg(ag);
    const ahora = new Date().toISOString();
    const previos = [...new Set([...(l.asesores_previos || []), ...(l.asesor_correo ? [l.asesor_correo] : [])])];
    const { data, error } = await supabase.from('leads').update({
      asesor_correo: correo, asesor_nombre: nombre, asignado_en: ahora, estatus: 'asignado',
      atendido_en: null, atendido_por: null, reasignaciones: (l.reasignaciones || 0) + 1, asesores_previos: previos,
    }).eq('id', l.id).select().single();
    if (error) { alert('No se pudo reasignar: ' + error.message); return; }
    if (l.contacto_id) {
      await supabase.from('contactos').update({ asesor_ventas: nombre, asesor_correo: correo, creado_por: correo }).eq('id', l.contacto_id);
    }
    if (l.negocio_id) {
      await supabase.from('negocios').update({ asesor_ventas: nombre, asesor_correo: correo, creado_por: correo }).eq('id', l.negocio_id);
    }
    enviarPush({ correos: [correo], title: 'Nuevo lead', body: `${l.nombres || ''} ${l.apellidos || ''} — ${l.desarrollo_nombre || ''}`.trim(), url: '/' });
    setLeads(prev => prev.map(x => x.id === l.id ? data : x));
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <select value={filtroEstatus} onChange={e => setFiltroEstatus(e.target.value)} style={inputStyle}>
          <option value=''>Todos los estatus</option>
          {Object.entries(ESTATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
        </select>
        <select value={filtroDesarrollo} onChange={e => setFiltroDesarrollo(e.target.value)} style={inputStyle}>
          <option value=''>Todos los desarrollos</option>
          {desarrollos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
        </select>
        <button onClick={cargar} style={btnStyle}>↻ Actualizar</button>
      </div>
      {cargando ? (
        <div style={{ color: '#888', fontSize: '13px' }}>Cargando...</div>
      ) : visibles.length === 0 ? (
        <div style={{ color: '#888', fontSize: '13px' }}>No hay leads con ese filtro.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {visibles.map(l => {
            const est = ESTATUS[l.estatus] || ESTATUS.sin_asignar;
            const tel = (l.telefono || '').replace(/\D/g, '');
            return (
              <div key={l.id} style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ minWidth: '220px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>{`${l.nombres || ''} ${l.apellidos || ''}`.trim() || 'Sin nombre'}</div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                    {l.telefono && <a href={`tel:${tel}`} style={{ color: '#3B82F6', textDecoration: 'none', marginRight: '10px' }}>📞 {l.telefono}</a>}
                    {tel && <a href={`https://wa.me/52${tel.slice(-10)}`} target="_blank" rel="noreferrer" style={{ color: '#2E7D4F', textDecoration: 'none', marginRight: '10px' }}>WhatsApp</a>}
                    {l.correo && <span>{l.correo}</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>
                    {[l.desarrollo_nombre, l.formulario, l.campana].filter(Boolean).join(' · ') || '—'} · {hace(l.created_at)}
                  </div>
                  {l.error_proceso && <div style={{ fontSize: '11px', color: '#C0392B', marginTop: '2px' }}>⚠ {l.error_proceso}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '12px', color: '#555', textAlign: 'right' }}>
                    {l.asesor_nombre ? <>{l.asesor_nombre}<div style={{ fontSize: '11px', color: '#aaa' }}>{l.estatus === 'atendido' ? `atendido ${hace(l.atendido_en)}` : `asignado ${hace(l.asignado_en)}`}{l.reasignaciones > 0 ? ` · ${l.reasignaciones} reasig.` : ''}</div></> : <span style={{ color: '#C0392B' }}>Sin asesor</span>}
                  </div>
                  <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: est.bg, color: est.c, fontWeight: '600' }}>{est.l}</span>
                  {l.estatus === 'asignado' && puedeGestionar(l) && (
                    <button onClick={() => marcarAtendido(l)} style={{ ...btnStyle, color: '#27500A', borderColor: '#27500A' }}>✓ Atendido</button>
                  )}
                  {puedeReasignar && (
                    <select value="" onChange={e => reasignar(l, e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12px', width: isMobile ? '100%' : '150px' }}>
                      <option value="">Reasignar a...</option>
                      {agentes.filter(a => a.correo !== l.asesor_correo).map(a => <option key={a.correo} value={a.correo}>{nombreAg(a)}</option>)}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- Guardias
function GuardiasTab({ miAgente, esAdmin, esGerente, desarrollos, agentes, nombreAg, isMobile }) {
  const puede = usePuede();
  const [desarrollo, setDesarrollo] = useState('');
  const [semana, setSemana] = useState(lunesDe(new Date()));
  const [guardias, setGuardias] = useState([]);
  const [cfg, setCfg] = useState(CFG_DEFAULT);
  const puedeEditar = puede('marketing.editar_guardias');

  useEffect(() => { if (!desarrollo && desarrollos.length > 0) setDesarrollo(desarrollos[0].nombre); }, [desarrollos]); // eslint-disable-line
  useEffect(() => { if (desarrollo) cargar(); }, [desarrollo, semana]); // eslint-disable-line
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('configuracion').select('clave, valor').in('clave', CLAVES_CFG);
      const m = { ...CFG_DEFAULT };
      (data || []).forEach(r => { if (r.valor) m[r.clave] = r.valor; });
      setCfg(m);
    })();
  }, []);

  const cargar = async () => {
    const { data } = await supabase.from('guardias').select('*')
      .eq('desarrollo_nombre', desarrollo).gte('fecha', iso(semana)).lte('fecha', iso(sumaDias(semana, 6)));
    setGuardias(data || []);
  };

  const agregar = async (fecha, turno, correo) => {
    const ag = agentes.find(a => a.correo === correo);
    if (!ag) return;
    const { data, error } = await supabase.from('guardias').insert({
      desarrollo_nombre: desarrollo, fecha, turno, asesor_correo: correo, asesor_nombre: nombreAg(ag), creado_por: miAgente?.correo || null,
    }).select().single();
    if (error) { alert(error.code === '23505' ? 'Ese asesor ya está en esa guardia.' : 'No se pudo guardar: ' + error.message); return; }
    setGuardias(prev => [...prev, data]);
  };

  const quitar = async (g) => {
    const { error } = await supabase.from('guardias').delete().eq('id', g.id);
    if (error) { alert('No se pudo quitar: ' + error.message); return; }
    setGuardias(prev => prev.filter(x => x.id !== g.id));
  };

  const copiarSemanaAnterior = async () => {
    const ini = sumaDias(semana, -7);
    const { data: previas } = await supabase.from('guardias').select('*')
      .eq('desarrollo_nombre', desarrollo).gte('fecha', iso(ini)).lte('fecha', iso(sumaDias(ini, 6)));
    if (!previas || previas.length === 0) { alert('La semana anterior no tiene guardias en este desarrollo.'); return; }
    const filas = previas.map(g => {
      const f = new Date(`${g.fecha}T00:00:00`);
      return { desarrollo_nombre: desarrollo, fecha: iso(sumaDias(f, 7)), turno: g.turno, asesor_correo: g.asesor_correo, asesor_nombre: g.asesor_nombre, creado_por: miAgente?.correo || null };
    });
    const { error } = await supabase.from('guardias').upsert(filas, { onConflict: 'desarrollo_nombre,fecha,turno,asesor_correo', ignoreDuplicates: true });
    if (error) { alert('No se pudo copiar: ' + error.message); return; }
    cargar();
  };

  if (desarrollos.length === 0) return <div style={{ color: '#888', fontSize: '13px' }}>No tienes desarrollos asignados.</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
        <select value={desarrollo} onChange={e => setDesarrollo(e.target.value)} style={inputStyle}>
          {desarrollos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
        </select>
        <button onClick={() => setSemana(sumaDias(semana, -7))} style={btnStyle}>←</button>
        <span style={{ fontSize: '13px', color: '#1a1a2e', fontWeight: '500' }}>
          {semana.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} – {sumaDias(semana, 6).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
        <button onClick={() => setSemana(sumaDias(semana, 7))} style={btnStyle}>→</button>
        <button onClick={() => setSemana(lunesDe(new Date()))} style={btnStyle}>Hoy</button>
        {puedeEditar && <button onClick={copiarSemanaAnterior} style={btnStyle}>Copiar semana anterior</button>}
      </div>
      <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '12px' }}>
        Mañana {cfg.leads_manana_inicio}–{cfg.leads_manana_fin} · Tarde {cfg.leads_tarde_inicio}–{cfg.leads_tarde_fin}. "Día completo" cubre ambos turnos. Un lead fuera de horario va al primer turno que sigue. Entre varios asesores en el mismo turno, el lead va a quien lleva menos leads ese día.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: '#fff', border: '0.5px solid #e0e0e0' }}>
          <thead>
            <tr style={{ background: '#f9f9f9', color: '#555' }}>
              <th style={{ padding: '10px', textAlign: 'left', width: '90px' }}>Día</th>
              {TURNOS.map(t => <th key={t.k} style={{ padding: '10px', textAlign: 'left' }}>{t.l}</th>)}
            </tr>
          </thead>
          <tbody>
            {DIAS.map((dia, i) => {
              const fecha = iso(sumaDias(semana, i));
              const esHoy = fecha === iso(new Date());
              return (
                <tr key={fecha} style={{ borderTop: '0.5px solid #eee', background: esHoy ? '#F0FDF4' : '#fff' }}>
                  <td style={{ padding: '10px', fontWeight: '600', color: '#1a1a2e', verticalAlign: 'top' }}>{dia} {sumaDias(semana, i).getDate()}</td>
                  {TURNOS.map(t => {
                    const celdas = guardias.filter(g => g.fecha === fecha && g.turno === t.k);
                    return (
                      <td key={t.k} style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: celdas.length ? '4px' : 0 }}>
                          {celdas.map(g => (
                            <span key={g.id} style={{ fontSize: '12px', background: '#F3F0FF', color: '#5B21B6', borderRadius: '20px', padding: '3px 10px', display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                              {g.asesor_nombre || g.asesor_correo}
                              {puedeEditar && <button onClick={() => quitar(g)} style={{ border: 'none', background: 'none', color: '#8B5CF6', cursor: 'pointer', padding: 0, fontSize: '12px' }}>✕</button>}
                            </span>
                          ))}
                        </div>
                        {puedeEditar && (
                          <select value="" onChange={e => agregar(fecha, t.k, e.target.value)} style={{ ...inputStyle, padding: '4px 6px', fontSize: '12px', width: isMobile ? '110px' : '150px' }}>
                            <option value="">+ Agregar</option>
                            {agentes.filter(a => !celdas.some(g => g.asesor_correo === a.correo)).map(a => <option key={a.correo} value={a.correo}>{nombreAg(a)}</option>)}
                          </select>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ API
function ApiTab({ miAgente }) {
  const [llaves, setLlaves] = useState([]);
  const [nombre, setNombre] = useState('');
  const [nueva, setNueva] = useState(null);
  const [creando, setCreando] = useState(false);

  useEffect(() => { cargar(); }, []);
  const cargar = async () => {
    const { data } = await supabase.from('lead_api_keys').select('id, nombre, prefijo, activo, ultimo_uso, created_at').order('created_at', { ascending: false });
    setLlaves(data || []);
  };

  const crear = async () => {
    if (!nombre.trim()) { alert('Ponle un nombre a la llave (ej. "Marketing Meta").'); return; }
    setCreando(true);
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const key = 'gmx_' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    const { error } = await supabase.from('lead_api_keys').insert({ nombre: nombre.trim(), key_hash: await sha256hex(key), prefijo: key.slice(0, 8), creado_por: miAgente?.correo || null });
    setCreando(false);
    if (error) { alert('No se pudo crear: ' + error.message); return; }
    setNueva(key); setNombre(''); cargar();
  };

  const alternar = async (l) => {
    await supabase.from('lead_api_keys').update({ activo: !l.activo }).eq('id', l.id);
    cargar();
  };
  const eliminar = async (l) => {
    if (!window.confirm(`¿Eliminar la llave "${l.nombre}"? La integración que la use dejará de funcionar.`)) return;
    await supabase.from('lead_api_keys').delete().eq('id', l.id);
    cargar();
  };

  const ejemplo = `{
  "nombre": "María",
  "apellidos": "López",
  "telefono": "3312345678",
  "correo": "maria@correo.com",
  "desarrollo": "Los Arrayanes",
  "formulario": "Formulario Arrayanes Octubre",
  "campana": "Campaña Octubre",
  "anuncio": "Video recorrido",
  "meta_lead_id": "1234567890"
}`;
  const curl = `curl -X POST "${ENDPOINT}" \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: TU_LLAVE" \\\n  -d '${ejemplo.replace(/\n\s*/g, ' ')}'`;
  const caja = { background: '#f6f6f6', border: '0.5px solid #e0e0e0', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#333' };

  return (
    <div style={{ maxWidth: '760px' }}>
      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e', marginBottom: '6px' }}>Dirección (endpoint)</div>
      <div style={{ ...caja, marginBottom: '16px' }}>POST {ENDPOINT}</div>

      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e', marginBottom: '6px' }}>Llaves de API</div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder='Nombre (ej. Marketing Meta)' style={{ ...inputStyle, minWidth: '240px' }} />
        <button onClick={crear} disabled={creando} style={{ ...btnStyle, background: '#C0203A', color: '#fff', borderColor: '#C0203A' }}>{creando ? 'Creando...' : '+ Crear llave'}</button>
      </div>
      {nueva && (
        <div style={{ background: '#FFF8E1', border: '0.5px solid #F59E0B', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: '#856404', marginBottom: '6px' }}>Copia esta llave ahora: <strong>no se vuelve a mostrar</strong>. Si se pierde, crea otra.</div>
          <div style={caja}>{nueva}</div>
          <button onClick={() => { navigator.clipboard?.writeText(nueva); }} style={{ ...btnStyle, marginTop: '8px' }}>Copiar</button>
          <button onClick={() => setNueva(null)} style={{ ...btnStyle, marginTop: '8px', marginLeft: '6px' }}>Listo</button>
        </div>
      )}
      <div style={{ marginBottom: '20px' }}>
        {llaves.length === 0 ? <div style={{ fontSize: '12px', color: '#888' }}>Todavía no hay llaves.</div> : llaves.map(l => (
          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '0.5px solid #f0f0f0', fontSize: '13px', flexWrap: 'wrap' }}>
            <div>
              <strong>{l.nombre}</strong> <span style={{ color: '#aaa', fontFamily: 'monospace' }}>{l.prefijo}…</span>
              <div style={{ fontSize: '11px', color: '#aaa' }}>{l.ultimo_uso ? `Último uso ${hace(l.ultimo_uso)}` : 'Sin uso todavía'}</div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => alternar(l)} style={btnStyle}>{l.activo ? 'Desactivar' : 'Activar'}</button>
              <button onClick={() => eliminar(l)} style={{ ...btnStyle, color: '#C0392B' }}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e', marginBottom: '6px' }}>Qué se le pasa a marketing</div>
      <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
        Una llamada POST con JSON y el encabezado <code>x-api-key</code>. Se requiere teléfono o correo; el desarrollo debe llamarse como en el CRM para asignar al asesor de guardia. Si Meta/Zapier manda <code>full_name</code>, <code>phone_number</code>, <code>email</code>, <code>form_name</code>, <code>campaign_name</code>, <code>ad_name</code> o <code>leadgen_id</code>, también se entienden. Mandar dos veces el mismo <code>meta_lead_id</code> no duplica el lead.
      </div>
      <div style={{ ...caja, marginBottom: '10px' }}>{ejemplo}</div>
      <div style={caja}>{curl}</div>
    </div>
  );
}

// -------------------------------------------------------------- Ajustes
function AjustesTab() {
  const [cfg, setCfg] = useState(CFG_DEFAULT);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('configuracion').select('clave, valor').in('clave', CLAVES_CFG);
      const m = { ...CFG_DEFAULT };
      (data || []).forEach(r => { if (r.valor) m[r.clave] = r.valor; });
      setCfg(m);
    })();
  }, []);

  const guardar = async () => {
    setGuardando(true); setMsg('');
    const min = parseInt(cfg.leads_minutos_reasignacion, 10);
    if (!(min >= 1)) { setGuardando(false); alert('El tiempo debe ser de al menos 1 minuto.'); return; }
    const filas = CLAVES_CFG.map(clave => ({ clave, valor: clave === 'leads_minutos_reasignacion' ? String(min) : cfg[clave] }));
    const { error } = await supabase.from('configuracion').upsert(filas, { onConflict: 'clave' });
    setGuardando(false);
    if (error) { alert('No se pudo guardar: ' + error.message); return; }
    setMsg('✓ Guardado');
  };

  const campo = (k, label, type = 'time') => (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>{label}</label>
      <input type={type} value={cfg[k]} onChange={e => { setCfg(c => ({ ...c, [k]: e.target.value })); setMsg(''); }} style={{ ...inputStyle, width: '100%' }} />
    </div>
  );

  return (
    <div style={{ maxWidth: '420px', background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '1.25rem' }}>
      {campo('leads_minutos_reasignacion', 'Minutos para atender un lead antes de pasarlo al siguiente asesor', 'number')}
      <div style={{ fontSize: '11px', color: '#aaa', margin: '-6px 0 14px' }}>La reasignación automática usa este tiempo.</div>
      {campo('leads_manana_inicio', 'Turno mañana — inicio')}
      {campo('leads_manana_fin', 'Turno mañana — fin')}
      {campo('leads_tarde_inicio', 'Turno tarde — inicio')}
      {campo('leads_tarde_fin', 'Turno tarde — fin')}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={guardar} disabled={guardando} style={{ padding: '10px 20px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>{guardando ? 'Guardando...' : 'Guardar'}</button>
        {msg && <span style={{ fontSize: '12px', color: '#27500A' }}>{msg}</span>}
      </div>
    </div>
  );
}
