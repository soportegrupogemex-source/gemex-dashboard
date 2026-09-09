import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

const ROLES_GERENTE = ['Gerente Editor', 'Gerente Operador'];

// FIX: reporte nuevo — qué producto (unidad/tipología) se está enseñando
// más y cuáles están "frías" (nunca cotizadas), más quiénes son los
// agentes más activos cotizando. Se alimenta de cotizaciones_log, que se
// llena solo cuando el agente tiene un contacto asignado en el Cotizador
// y descarga o comparte el PDF (ver registrarLog en Cotizador.js) — abrir
// el cotizador a mirar precios no cuenta. Lo ve Super Admin (todo) y
// Gerente Editor/Operador (solo sus desarrollos a cargo — la RLS de
// cotizaciones_log ya lo restringe también a nivel de base).
export default function TendenciasProducto({ miRol, miAgente }) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState('productos');
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [unidadesConvertidas, setUnidadesConvertidas] = useState(new Set());
  const [desarrollos, setDesarrollos] = useState([]);
  const [agentesEquipoMap, setAgentesEquipoMap] = useState({});
  const [inventarioLibre, setInventarioLibre] = useState([]);
  const [filtroDesarrollo, setFiltroDesarrollo] = useState('');
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');
  const [showFiltros, setShowFiltros] = useState(false);

  // FIX: Gerente Editor/Operador solo ven sus desarrollos_cargo — mismo
  // patrón que Objetivos.js/Titulacion.js/Cobranza.js.
  const desarrollosPermitidos = ROLES_GERENTE.includes(miRol)
    ? desarrollos.filter(d => (miAgente?.desarrollos_cargo || []).includes(d.nombre))
    : desarrollos;
  const nombresPermitidos = desarrollosPermitidos.map(d => d.nombre);

  useEffect(() => { cargarDesarrollos(); cargarAgentesEquipo(); }, []);
  useEffect(() => { cargarLogs(); cargarConversiones(); }, [filtroDesarrollo, filtroFechaDesde, filtroFechaHasta, miAgente]);
  useEffect(() => { cargarInventarioLibre(); }, [filtroDesarrollo, miAgente]);

  const cargarDesarrollos = async () => {
    const { data } = await supabase.from('desarrollos').select('id, nombre').eq('activo', true).order('nombre');
    setDesarrollos(data || []);
  };

  // FIX: mapa correo -> equipo, para mostrar el badge (Gemex,
  // Inmobiliaria, Asesor externo, Desarrollador) en el ranking de
  // agentes — mismos colores que ya usa Agentes.js.
  const cargarAgentesEquipo = async () => {
    const { data } = await supabase.from('agentes').select('correo, equipo').limit(10000);
    const mapa = {};
    (data || []).forEach(a => { mapa[a.correo] = a.equipo || 'Gemex'; });
    setAgentesEquipoMap(mapa);
  };

  const cargarLogs = async () => {
    setLoading(true);
    let query = supabase.from('cotizaciones_log').select('*').order('created_at', { ascending: false });
    if (filtroDesarrollo) query = query.eq('desarrollo_nombre', filtroDesarrollo);
    if (filtroFechaDesde) query = query.gte('created_at', `${filtroFechaDesde}T00:00:00`);
    if (filtroFechaHasta) query = query.lte('created_at', `${filtroFechaHasta}T23:59:59`);
    const { data } = await query.limit(10000);
    setLogs(data || []);
    setLoading(false);
  };

  // FIX: permite borrar registros de prueba/al azar — elimina TODOS los
  // renglones de cotizaciones_log de esa unidad (no solo los del filtro
  // actual), ya que la intención es limpiar por completo el ruido.
  const [eliminando, setEliminando] = useState(null);
  const handleEliminarUnidad = async (unidadId, unidadNumero) => {
    if (!window.confirm(`¿Eliminar todos los registros de cotización de la unidad ${unidadNumero}? Esta acción no se puede deshacer.`)) return;
    setEliminando(unidadId);
    await supabase.from('cotizaciones_log').delete().eq('unidad_id', unidadId);
    setEliminando(null);
    cargarLogs();
  };

  // FIX: marca qué unidades ya tienen un Apartado o Vendida — así en
  // "Productos" se distingue lo que solo GENERA interés (se cotiza mucho)
  // de lo que además CONVIERTE de verdad.
  const cargarConversiones = async () => {
    if (ROLES_GERENTE.includes(miRol) && desarrollosPermitidos.length === 0) { setUnidadesConvertidas(new Set()); return; }
    let query = supabase.from('movimientos').select('unidad_id').in('tipo', ['Apartado', 'Vendida']);
    if (filtroDesarrollo) query = query.eq('desarrollo_nombre', filtroDesarrollo);
    else if (ROLES_GERENTE.includes(miRol)) query = query.in('desarrollo_nombre', nombresPermitidos);
    const { data } = await query.limit(10000);
    setUnidadesConvertidas(new Set((data || []).map(m => m.unidad_id).filter(Boolean)));
  };

  // FIX: para detectar unidades "frías" se necesita el inventario Libre
  // completo (o del desarrollo filtrado), para comparar contra lo que sí
  // aparece en el log.
  const cargarInventarioLibre = async () => {
    let query = supabase.from('inventario').select('id, numero, tipologia, nivel, precio_lista, desarrollo_id').eq('estatus', 'Libre');
    if (filtroDesarrollo) {
      const dev = desarrollos.find(d => d.nombre === filtroDesarrollo);
      if (dev) query = query.eq('desarrollo_id', dev.id);
      else { setInventarioLibre([]); return; }
    } else if (ROLES_GERENTE.includes(miRol)) {
      const ids = desarrollosPermitidos.map(d => d.id);
      if (ids.length === 0) { setInventarioLibre([]); return; }
      query = query.in('desarrollo_id', ids);
    }
    const { data } = await query.limit(5000);
    setInventarioLibre(data || []);
  };

  // ============ Productos calientes ============
  const rankingUnidades = (() => {
    const mapa = {};
    logs.forEach(r => {
      if (!r.unidad_id) return;
      if (!mapa[r.unidad_id]) mapa[r.unidad_id] = { unidad_id: r.unidad_id, unidad_numero: r.unidad_numero, tipologia: r.tipologia, nivel: r.nivel, precio_lista: r.precio_lista, desarrollo_nombre: r.desarrollo_nombre, count: 0, agentesUnicos: new Set() };
      mapa[r.unidad_id].count++;
      if (r.agente_correo) mapa[r.unidad_id].agentesUnicos.add(r.agente_correo);
    });
    // FIX: engagement real primero pondera agentes únicos (demanda de
    // mercado) más que el conteo bruto (que puede ser un solo agente
    // insistiendo con la misma unidad).
    return Object.values(mapa)
      .map(u => ({ ...u, agentesUnicos: u.agentesUnicos.size }))
      .sort((a, b) => (b.agentesUnicos * 2 + b.count) - (a.agentesUnicos * 2 + a.count));
  })();

  const rankingTipologias = (() => {
    const mapa = {};
    logs.forEach(r => {
      const key = `${r.desarrollo_nombre}__${r.tipologia || 'Sin tipología'}`;
      if (!mapa[key]) mapa[key] = { desarrollo_nombre: r.desarrollo_nombre, tipologia: r.tipologia || 'Sin tipología', count: 0, agentesUnicos: new Set() };
      mapa[key].count++;
      if (r.agente_correo) mapa[key].agentesUnicos.add(r.agente_correo);
    });
    return Object.values(mapa)
      .map(t => ({ ...t, agentesUnicos: t.agentesUnicos.size }))
      .sort((a, b) => (b.agentesUnicos * 2 + b.count) - (a.agentesUnicos * 2 + a.count));
  })();

  // FIX: unidades libres que NUNCA aparecen en el log filtrado — lo "frío"
  const idsCotizados = new Set(logs.map(r => r.unidad_id).filter(Boolean));
  const unidadesFrias = inventarioLibre.filter(u => !idsCotizados.has(u.id));

  // ============ Agentes más activos ============
  const rankingAgentes = (() => {
    const mapa = {};
    logs.forEach(r => {
      const key = r.agente_correo || 'Sin identificar';
      if (!mapa[key]) mapa[key] = { correo: key, nombre: r.agente_nombre || r.agente_correo || 'Sin identificar', equipo: agentesEquipoMap[r.agente_correo] || null, count: 0 };
      mapa[key].count++;
    });
    return Object.values(mapa).sort((a, b) => b.count - a.count);
  })();

  // FIX: mismos colores que el badge de equipo en Agentes.js
  // FIX: al hacer click en un agente del ranking, se expande la lista de
  // unidades que cotizó (a partir de los mismos logs ya cargados, sin
  // consultas adicionales).
  const [agenteExpandido, setAgenteExpandido] = useState(null);
  const unidadesPorAgente = (correo) => {
    const mapa = {};
    logs.filter(r => r.agente_correo === correo).forEach(r => {
      if (!r.unidad_id) return;
      if (!mapa[r.unidad_id]) mapa[r.unidad_id] = { unidad_numero: r.unidad_numero, tipologia: r.tipologia, desarrollo_nombre: r.desarrollo_nombre, count: 0 };
      mapa[r.unidad_id].count++;
    });
    return Object.values(mapa).sort((a, b) => b.count - a.count);
  };

  const equipoColor = (equipo) => {
    if (equipo === 'Gemex') return { bg: '#C0203A', color: '#fff' };
    if (equipo === 'Inmobiliaria') return { bg: '#C0203A', color: '#fff' };
    if (equipo === 'Asesor externo') return { bg: '#7A5900', color: '#fff' };
    if (equipo === 'Desarrollador') return { bg: '#3730A3', color: '#fff' };
    return null;
  };

  const limpiarFiltros = () => { setFiltroDesarrollo(''); setFiltroFechaDesde(''); setFiltroFechaHasta(''); };
  const hayFiltros = filtroDesarrollo || filtroFechaDesde || filtroFechaHasta;

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: isMobile ? '17px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Tendencias de Producto</h2>
        <div style={{ fontSize: '13px', color: '#888' }}>{logs.length} cotizaciones registradas en el período — qué se enseña más y qué está frío</div>
      </div>

      {/* Pestañas */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '1.25rem', borderBottom: '1px solid #e0e0e0' }}>
        {[['productos', 'Productos'], ['agentes', 'Agentes']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: tab === key ? '600' : '400', color: tab === key ? '#1a1a2e' : '#888', borderBottom: tab === key ? '2px solid #1a1a2e' : '2px solid transparent' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      {isMobile ? (
        <div style={{ marginBottom: '1.25rem' }}>
          <button onClick={() => setShowFiltros(f => !f)}
            style={{ padding: '10px 14px', border: '0.5px solid #ddd', borderRadius: '8px', background: showFiltros ? '#C0203A' : '#fff', color: showFiltros ? '#fff' : '#333', fontSize: '13px', cursor: 'pointer' }}>
            ⚙️ Filtros {hayFiltros ? '(activos)' : ''}
          </button>
          {showFiltros && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: '#f9f9f9', borderRadius: '8px', marginTop: '8px' }}>
              <select value={filtroDesarrollo} onChange={e => setFiltroDesarrollo(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }}>
                <option value=''>Todos los desarrollos</option>
                {desarrollosPermitidos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
              </select>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type='date' value={filtroFechaDesde} onChange={e => setFiltroFechaDesde(e.target.value)}
                  style={{ flex: 1, padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }} />
                <input type='date' value={filtroFechaHasta} onChange={e => setFiltroFechaHasta(e.target.value)}
                  style={{ flex: 1, padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }} />
              </div>
              {hayFiltros && (
                <button onClick={limpiarFiltros} style={{ padding: '8px', background: 'none', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', color: '#888' }}>
                  ✕ Limpiar filtros
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filtroDesarrollo} onChange={e => setFiltroDesarrollo(e.target.value)} style={filtroStyle}>
            <option value=''>Todos los desarrollos</option>
            {desarrollosPermitidos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
          </select>
          <span style={{ fontSize: '12px', color: '#888' }}>Desde:</span>
          <input type='date' value={filtroFechaDesde} onChange={e => setFiltroFechaDesde(e.target.value)} style={filtroStyle} />
          <span style={{ fontSize: '12px', color: '#888' }}>Hasta:</span>
          <input type='date' value={filtroFechaHasta} onChange={e => setFiltroFechaHasta(e.target.value)} style={filtroStyle} />
          {hayFiltros && (
            <button onClick={limpiarFiltros} style={{ padding: '6px 10px', background: 'none', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#888' }}>
              ✕ Limpiar
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>Cargando...</div>
      ) : tab === 'productos' ? (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
          {/* Calientes por unidad */}
          <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '0.5px solid #f0f0f0', fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>
              🔥 Unidades con más engagement <span style={{ fontSize: '11px', color: '#aaa', fontWeight: '400' }}>(agentes distintos + veces cotizada)</span>
            </div>
            {rankingUnidades.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>Sin datos en este período</div>
            ) : (
              <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                {rankingUnidades.slice(0, 30).map((u, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '0.5px solid #f5f5f5' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '500', color: '#1a1a2e' }}>#{u.unidad_numero} — {u.tipologia || '—'}</span>
                        {unidadesConvertidas.has(u.unidad_id) && (
                          <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '20px', background: '#EAF3DE', color: '#27500A', fontWeight: '600' }}>✓ Convertida</span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#888' }}>{u.desarrollo_nombre} · Nivel {u.nivel || '—'} · {fmt(u.precio_lista)}</div>
                      <div style={{ fontSize: '11px', color: '#8B5CF6', marginTop: '2px' }}>{u.agentesUnicos} agente{u.agentesUnicos !== 1 ? 's' : ''} distinto{u.agentesUnicos !== 1 ? 's' : ''}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: '#F97316' }}>{u.count}</div>
                      {miRol === 'Super Admin' && (
                        <button onClick={() => handleEliminarUnidad(u.unidad_id, u.unidad_numero)} disabled={eliminando === u.unidad_id}
                          title="Eliminar registros de esta unidad (limpiar prueba)"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: '15px' }}>
                          {eliminando === u.unidad_id ? '...' : '🗑'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Calientes por tipología */}
          <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '0.5px solid #f0f0f0', fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>
              Tipologías más cotizadas por proyecto
            </div>
            {rankingTipologias.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>Sin datos en este período</div>
            ) : (
              <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                {rankingTipologias.slice(0, 30).map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '0.5px solid #f5f5f5' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: '#1a1a2e' }}>{t.tipologia}</div>
                      <div style={{ fontSize: '11px', color: '#888' }}>{t.desarrollo_nombre}</div>
                      <div style={{ fontSize: '11px', color: '#8B5CF6', marginTop: '2px' }}>{t.agentesUnicos} agente{t.agentesUnicos !== 1 ? 's' : ''} distinto{t.agentesUnicos !== 1 ? 's' : ''}</div>
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#3B82F6' }}>{t.count}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Frías */}
          <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden', gridColumn: isMobile ? 'auto' : '1 / -1' }}>
            <div style={{ padding: '14px 16px', borderBottom: '0.5px solid #f0f0f0', fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>
              🧊 Unidades libres sin ninguna cotización en el período ({unidadesFrias.length})
            </div>
            {unidadesFrias.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>
                {filtroDesarrollo || filtroFechaDesde || filtroFechaHasta ? 'Todas las unidades libres tuvieron al menos una cotización' : 'Elige un desarrollo o rango de fechas para revisar'}
              </div>
            ) : (
              <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '0' }}>
                {unidadesFrias.map(u => (
                  <div key={u.id} style={{ padding: '10px 16px', borderBottom: '0.5px solid #f5f5f5', borderRight: '0.5px solid #f5f5f5' }}>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: '#1a1a2e' }}>#{u.numero} — {u.tipologia || '—'}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>Nivel {u.nivel || '—'} · {fmt(u.precio_lista)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '0.5px solid #f0f0f0', fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>
            Ranking de agentes por cotizaciones generadas
          </div>
          {rankingAgentes.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#aaa', fontSize: '13px' }}>Sin datos en este período</div>
          ) : (
            <div>
              {rankingAgentes.map((a, i) => {
                const max = rankingAgentes[0]?.count || 1;
                const colores = equipoColor(a.equipo);
                const expandido = agenteExpandido === a.correo;
                return (
                  <div key={i} style={{ borderBottom: '0.5px solid #f5f5f5' }}>
                    <div onClick={() => setAgenteExpandido(expandido ? null : a.correo)}
                      style={{ padding: '12px 16px', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', marginBottom: '6px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: '#aaa', fontSize: '11px' }}>{expandido ? '▾' : '▸'}</span>
                          <span style={{ color: '#1a1a2e', fontWeight: '500' }}>{i + 1}. {a.nombre}</span>
                          {colores && (
                            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', background: colores.bg, color: colores.color, fontWeight: '500', whiteSpace: 'nowrap' }}>
                              {a.equipo}
                            </span>
                          )}
                        </span>
                        <span style={{ fontWeight: '700', color: '#1a1a2e' }}>{a.count}</span>
                      </div>
                      <div style={{ height: '6px', background: '#f0f0f0', borderRadius: '3px' }}>
                        <div style={{ height: '100%', background: '#8B5CF6', borderRadius: '3px', width: `${(a.count / max) * 100}%` }} />
                      </div>
                    </div>
                    {expandido && (
                      <div style={{ padding: '0 16px 14px 34px' }}>
                        {unidadesPorAgente(a.correo).map((u, j) => (
                          <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f9f9f9', borderRadius: '6px', marginBottom: '4px', fontSize: '12px' }}>
                            <div>
                              <span style={{ color: '#1a1a2e', fontWeight: '500' }}>#{u.unidad_numero} — {u.tipologia || '—'}</span>
                              <span style={{ color: '#aaa', marginLeft: '6px' }}>{u.desarrollo_nombre}</span>
                            </div>
                            <span style={{ color: '#F97316', fontWeight: '600' }}>{u.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const filtroStyle = { padding: '7px 12px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', background: '#fff' };