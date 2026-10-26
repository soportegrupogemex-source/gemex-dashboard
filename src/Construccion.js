import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { usePuede } from './PermisosContext';
import { resumen, traerTodo, indexar, nombreFrente } from './ObraTorres';

// FIX: módulo de Construcción — reporta el Paso 1 del proceso de
// Titulación (Avance de obra, DTU, Lista para avalúo) para TODAS las
// unidades (vendidas o no: el avance de obra es del edificio, no de la
// venta). Guarda en la misma tabla titulacion_seguimiento que usa
// Titulacion.js, así el Paso 1 queda disponible ahí en cuanto se marca.
// FIX: DTU se habilita solo con Avance de obra >= 90% — no depende de
// si la unidad ya está vendida ni de su tipo de compra, ya que el
// avance es del edificio y muchas unidades llegan a ese % sin vender.
// (Antes también exigía tipo de compra Infonavit/Fovissste, pero eso
// dejaba a las unidades sin movimiento de venta —o vendidas sin
// Infonavit/Fovissste— con DTU bloqueado para siempre.)

// La letra con que empieza el número de unidad es la torre/etapa (A102 -> A).
// Los desarrollos cuyas unidades no llevan letra se muestran sin nivel de torre.
const torreDe = (u) => (String(u.numero || '').trim().match(/^([A-Za-zÁÉÍÓÚÑ]+)/)?.[1] || '').toUpperCase();

const VACIO = { avance_obra_pct: 0, dtu: false, lista_avaluo: false };

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export default function Construccion() {
  const puede = usePuede();
  const puedeAvance = puede('construccion.editar_avance');
  const puedeDtu = puede('construccion.marcar_dtu');
  const puedeLista = puede('construccion.marcar_lista_avaluo');
  const isMobile = useIsMobile();
  const [desarrollos, setDesarrollos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [seguimientos, setSeguimientos] = useState({});
  const [tipoCompraPorUnidad, setTipoCompraPorUnidad] = useState({});
  const [desarrolloSel, setDesarrolloSel] = useState('');
  const [abiertos, setAbiertos] = useState({});
  const [cargando, setCargando] = useState(true);
  const [unidadAbierta, setUnidadAbierta] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  // Avance que marca el programa de obra: unidad_id -> { pct, frente }. Es una sugerencia; nunca se aplica solo.
  const [deObra, setDeObra] = useState({});

  useEffect(() => { cargarTodo(); }, []);

  const cargarTodo = async () => {
    setCargando(true);
    const { data: des } = await supabase.from('desarrollos').select('id, nombre').eq('activo', true).order('nombre');
    setDesarrollos(des || []);
    const mapaNombres = {};
    (des || []).forEach(d => { mapaNombres[d.id] = d.nombre; });

    const { data: inv } = await supabase.from('inventario')
      .select('id, numero, desarrollo_id, estatus')
      .order('numero');
    const invConNombre = (inv || []).map(u => ({ ...u, desarrollo_nombre: mapaNombres[u.desarrollo_id] || '' }));
    setUnidades(invConNombre);

    const unidadIds = (inv || []).map(u => u.id);
    if (unidadIds.length > 0) {
      const { data: seg } = await supabase.from('titulacion_seguimiento').select('*').in('unidad_id', unidadIds);
      const mapa = {};
      (seg || []).forEach(s => { mapa[s.unidad_id] = s; });
      setSeguimientos(mapa);

      const { data: movs } = await supabase.from('movimientos')
        .select('unidad_id, tipo_compra, created_at')
        .in('unidad_id', unidadIds)
        .in('tipo', ['Apartado', 'Vendida'])
        .order('created_at', { ascending: false });
      const mapaTipo = {};
      (movs || []).forEach(m => { if (!mapaTipo[m.unidad_id]) mapaTipo[m.unidad_id] = m.tipo_compra; });
      setTipoCompraPorUnidad(mapaTipo);
    } else {
      setSeguimientos({});
      setTipoCompraPorUnidad({});
    }
    setCargando(false);
    cargarObra(invConNombre);
  };

  // Avance real de cada frente de obra con programa (torre o tren) -> unidades que le corresponden.
  // Torre: las unidades del mismo desarrollo cuya letra es la de la torre (A102 -> Torre A).
  // Tren u otro frente: las viviendas ligadas a él.
  const cargarObra = async (inv) => {
    try {
      const [torres, partidas, programa, ligas] = await Promise.all([
        traerTodo(() => supabase.from('obra_torres').select('id, desarrollo_id, torre, nombre, tipo, fecha_arranque').eq('es_plantilla', false).order('created_at')),
        traerTodo(() => supabase.from('obra_partidas').select('id, torre_id, parent_id, avance_pct, cantidad, precio_unitario, terminada_en').order('id')),
        traerTodo(() => supabase.from('obra_programa').select('partida_id, semana, dia').order('partida_id').order('semana').order('dia')),
        traerTodo(() => supabase.from('obra_torre_unidades').select('torre_id, unidad_id').order('unidad_id')),
      ]);
      const progMap = new Map();
      programa.forEach(x => { if (!progMap.has(x.partida_id)) progMap.set(x.partida_id, []); progMap.get(x.partida_id).push(1); });
      const mapa = {};
      torres.forEach(t => {
        const ps = partidas.filter(p => p.torre_id === t.id);
        const hijos = indexar(ps);
        const hojas = ps.filter(p => !hijos.has(p.id));
        if (!hojas.some(p => progMap.has(p.id))) return; // sin programa no hay obra que reportar
        const pct = Math.round(resumen(hojas, progMap, null).real * 10) / 10;
        const ligadas = ligas.filter(l => l.torre_id === t.id).map(l => l.unidad_id);
        let unidades = ligadas;
        if (t.tipo === 'torre' && ligadas.length === 0) {
          const letra = String(t.nombre || t.torre || '').trim().replace(/^torre\s+/i, '').toUpperCase();
          unidades = inv.filter(u => u.desarrollo_id === t.desarrollo_id && torreDe(u) === letra).map(u => u.id);
        }
        unidades.forEach(id => { mapa[id] = { pct, frente: nombreFrente(t) }; });
      });
      setDeObra(mapa);
    } catch (e) { setDeObra({}); }
  };

  const unidadesVisibles = unidades.filter(u => !desarrolloSel || u.desarrollo_nombre === desarrolloSel);

  const alternar = (clave, abierto) => setAbiertos(a => ({ ...a, [clave]: !abierto }));

  const dtuHabilitado = (avanceObra) => Number(avanceObra) >= 90;

  const abrirUnidad = (u) => {
    setUnidadAbierta(u);
    setForm({ ...VACIO, ...(seguimientos[u.id] || {}) });
  };

  // Pasa a las unidades el avance que marca el programa de obra. Siempre es una acción explícita:
  // el avance habilita el DTU (90%) y alimenta Titulación, así que no se escribe solo.
  const aplicarObra = async (lista, etiqueta) => {
    const cambios = lista.filter(u => deObra[u.id] && Number((seguimientos[u.id] || VACIO).avance_obra_pct || 0) !== deObra[u.id].pct);
    if (cambios.length === 0) { alert('Esas unidades ya tienen el avance que marca la obra.'); return; }
    if (!window.confirm(`Se actualizará el avance de obra de ${cambios.length} ${cambios.length === 1 ? 'unidad' : 'unidades'} a lo que marca el programa (${etiqueta}). Reemplaza lo capturado a mano y, si queda abajo de 90%, quita el DTU. ¿Continuar?`)) return;
    const { data: { user } } = await supabase.auth.getUser();
    const filas = cambios.map(u => {
      const previo = seguimientos[u.id] || VACIO;
      const pct = deObra[u.id].pct;
      return {
        unidad_id: u.id, desarrollo_id: u.desarrollo_id, avance_obra_pct: pct,
        dtu: dtuHabilitado(pct) ? !!previo.dtu : false, lista_avaluo: !!previo.lista_avaluo,
        actualizado_por: user?.email || null, updated_at: new Date().toISOString(),
      };
    });
    const { data, error } = await supabase.from('titulacion_seguimiento').upsert(filas, { onConflict: 'unidad_id' }).select();
    if (error) { alert('No se pudo actualizar: ' + error.message); return; }
    setSeguimientos(prev => { const n = { ...prev }; (data || []).forEach(x => { n[x.unidad_id] = x; }); return n; });
  };
  const botonAplicar = (lista, etiqueta) => {
    const mapeadas = lista.filter(u => deObra[u.id]);
    if (!puedeAvance || mapeadas.length === 0) return null;
    const dif = mapeadas.filter(u => Number((seguimientos[u.id] || VACIO).avance_obra_pct || 0) !== deObra[u.id].pct).length;
    return (
      <button onClick={(e) => { e.stopPropagation(); aplicarObra(mapeadas, etiqueta); }} disabled={dif === 0}
        title="Pasa a las unidades el avance que marca el programa de obra"
        style={{ padding: '4px 10px', border: '0.5px solid currentColor', borderRadius: '6px', background: 'transparent', color: 'inherit', fontSize: '11px', cursor: dif === 0 ? 'default' : 'pointer', opacity: dif === 0 ? 0.5 : 1 }}>
        {dif === 0 ? 'Obra y unidades coinciden' : `Aplicar avance de obra (${dif})`}
      </button>
    );
  };

  const guardar = async () => {
    setGuardando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const habilitado = dtuHabilitado(form.avance_obra_pct);
    const payload = {
      unidad_id: unidadAbierta.id,
      desarrollo_id: unidadAbierta.desarrollo_id,
      avance_obra_pct: Number(form.avance_obra_pct) || 0,
      dtu: habilitado ? !!form.dtu : false,
      lista_avaluo: !!form.lista_avaluo,
      actualizado_por: user?.email || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('titulacion_seguimiento')
      .upsert(payload, { onConflict: 'unidad_id' })
      .select().single();
    setGuardando(false);
    if (!error && data) {
      setSeguimientos(prev => ({ ...prev, [unidadAbierta.id]: data }));
      setUnidadAbierta(null);
    }
  };

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Construcción</h2>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '1rem' }}>Avance de obra y DTU por unidad (vendida o no)</div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <select value={desarrolloSel} onChange={e => setDesarrolloSel(e.target.value)}
          style={{ padding: '8px 12px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', background: '#fff' }}>
          <option value=''>Todos los proyectos</option>
          {desarrollos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
        </select>
      </div>

      {cargando ? (
        <div style={{ color: '#888', fontSize: '13px' }}>Cargando...</div>
      ) : unidadesVisibles.length === 0 ? (
        <div style={{ color: '#888', fontSize: '13px' }}>No hay unidades que coincidan con el filtro.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {(() => {
            const natural = (x, y) => String(x.numero).localeCompare(String(y.numero), 'es', { numeric: true });
            const filaUnidad = (u) => {
              const s = seguimientos[u.id] || VACIO;
              return (
                <div key={u.id} onClick={() => abrirUnidad(u)}
                  style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '10px', padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>{u.numero}</div>
                    <div style={{ fontSize: '12px', color: '#888' }}>{u.estatus}{tipoCompraPorUnidad[u.id] ? ` · ${tipoCompraPorUnidad[u.id]}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {deObra[u.id] && (
                      <div title={`Avance que marca el programa de obra (${deObra[u.id].frente})`}
                        style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', background: deObra[u.id].pct === Number(s.avance_obra_pct || 0) ? '#f3f3f5' : '#FFF4E5', color: deObra[u.id].pct === Number(s.avance_obra_pct || 0) ? '#888' : '#B45309' }}>
                        Obra {deObra[u.id].pct}%
                      </div>
                    )}
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#1a1a2e' }}>{Number(s.avance_obra_pct || 0)}%</div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: s.dtu ? '#10B981' : '#ccc' }}>DTU {s.dtu ? '✓' : '—'}</div>
                  </div>
                </div>
              );
            };
            const porDesarrollo = {};
            unidadesVisibles.forEach(u => { (porDesarrollo[u.desarrollo_nombre || 'Sin desarrollo'] = porDesarrollo[u.desarrollo_nombre || 'Sin desarrollo'] || []).push(u); });
            return Object.keys(porDesarrollo).sort((x, y) => x.localeCompare(y, 'es')).map(nombre => {
              const lista = porDesarrollo[nombre].slice().sort(natural);
              const claveDes = nombre;
              const abierto = !!abiertos[claveDes];
              const hayTorres = lista.some(u => torreDe(u));
              const torres = {};
              if (hayTorres) lista.forEach(u => { const t = torreDe(u) || '—'; (torres[t] = torres[t] || []).push(u); });
              const promedio = (arr) => arr.length ? Math.round(arr.reduce((t, u) => t + Number((seguimientos[u.id] || VACIO).avance_obra_pct || 0), 0) / arr.length) : 0;
              return (
                <div key={nombre}>
                  <div onClick={() => alternar(claveDes, abierto)}
                    style={{ background: '#1a1a2e', color: '#fff', borderRadius: '10px', padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '12px', display: 'inline-block', transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                      <span style={{ fontSize: '14px', fontWeight: '600' }}>{nombre}</span>
                      <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.18)', borderRadius: '20px', padding: '2px 10px' }}>
                        {hayTorres ? `${Object.keys(torres).length} ${Object.keys(torres).length === 1 ? 'torre' : 'torres'} · ` : ''}{lista.length} {lista.length === 1 ? 'unidad' : 'unidades'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '12px' }}>
                      {botonAplicar(lista, nombre)}
                      <span style={{ opacity: 0.85 }}>Avance promedio: <b>{promedio(lista)}%</b></span>
                    </div>
                  </div>
                  {abierto && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                      {!hayTorres && lista.map(filaUnidad)}
                      {hayTorres && Object.keys(torres).sort((x, y) => x.localeCompare(y, 'es')).map(t => {
                        const claveTorre = `${nombre}||${t}`;
                        const torreAbierta = !!abiertos[claveTorre];
                        return (
                          <div key={t} style={{ marginLeft: isMobile ? '8px' : '20px' }}>
                            <div onClick={() => alternar(claveTorre, torreAbierta)}
                              style={{ background: '#f0f0f5', color: '#1a1a2e', border: '0.5px solid #e0e0e0', borderRadius: '10px', padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '11px', display: 'inline-block', transform: torreAbierta ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                                <span style={{ fontSize: '13px', fontWeight: '600' }}>{t === '—' ? 'Sin torre' : `Torre ${t}`}</span>
                                <span style={{ fontSize: '11px', color: '#888' }}>{torres[t].length} {torres[t].length === 1 ? 'unidad' : 'unidades'}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '12px', color: '#666' }}>
                                {deObra[torres[t][0]?.id] && <span>Obra marca <b>{deObra[torres[t][0].id].pct}%</b></span>}
                                {botonAplicar(torres[t], `Torre ${t}`)}
                                <span>Avance promedio: <b>{promedio(torres[t])}%</b></span>
                              </div>
                            </div>
                            {torreAbierta && <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>{torres[t].map(filaUnidad)}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}

      {unidadAbierta && (
        <div onClick={() => setUnidadAbierta(null)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '420px' }}>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a2e', marginBottom: '2px' }}>{unidadAbierta.numero} — {unidadAbierta.desarrollo_nombre}</div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
              {unidadAbierta.estatus}{tipoCompraPorUnidad[unidadAbierta.id] ? ` · ${tipoCompraPorUnidad[unidadAbierta.id]}` : ' · Sin tipo de compra registrado'}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', color: '#555', display: 'block', marginBottom: '4px' }}>Avance de obra</label>
              {deObra[unidadAbierta.id] && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px', background: '#f7f7f9', borderRadius: '8px', padding: '8px 10px', marginBottom: '8px' }}>
                  <span style={{ color: '#555' }}>El programa de obra ({deObra[unidadAbierta.id].frente}) marca <b>{deObra[unidadAbierta.id].pct}%</b></span>
                  {puedeAvance && Number(form.avance_obra_pct) !== deObra[unidadAbierta.id].pct && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, avance_obra_pct: deObra[unidadAbierta.id].pct }))}
                      style={{ padding: '3px 10px', border: '0.5px solid #ddd', borderRadius: '6px', background: '#fff', fontSize: '11px', cursor: 'pointer' }}>Usar este avance</button>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="number" min="0" max="100" disabled={!puedeAvance} value={form.avance_obra_pct}
                  onChange={e => setForm(f => ({ ...f, avance_obra_pct: e.target.value }))}
                  style={{ width: '90px', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px' }} />
                <span style={{ fontSize: '13px', color: '#555' }}>%</span>
              </div>
            </div>

            <label style={{ fontSize: '13px', color: '#333', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
              <input type="checkbox" disabled={!puedeLista} checked={!!form.lista_avaluo} onChange={e => setForm(f => ({ ...f, lista_avaluo: e.target.checked }))} />
              Lista para avalúo
            </label>

            {(() => {
              const habilitado = dtuHabilitado(form.avance_obra_pct);
              return (
                <label style={{ fontSize: '13px', color: habilitado ? '#333' : '#bbb', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', cursor: habilitado ? 'pointer' : 'not-allowed' }}>
                  <input type="checkbox" checked={habilitado && !!form.dtu} disabled={!habilitado || !puedeDtu}
                    onChange={e => setForm(f => ({ ...f, dtu: e.target.checked }))} />
                  DTU
                </label>
              );
            })()}
            <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '20px' }}>
              Se habilita con 90% de avance de obra.
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setUnidadAbierta(null)}
                style={{ flex: 1, padding: '10px', background: '#fff', color: '#666', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando}
                style={{ flex: 1, padding: '10px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
