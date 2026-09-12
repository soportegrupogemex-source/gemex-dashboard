import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

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
  const isMobile = useIsMobile();
  const [desarrollos, setDesarrollos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [seguimientos, setSeguimientos] = useState({});
  const [tipoCompraPorUnidad, setTipoCompraPorUnidad] = useState({});
  const [desarrolloSel, setDesarrolloSel] = useState('');
  const [cargando, setCargando] = useState(true);
  const [unidadAbierta, setUnidadAbierta] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);

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
  };

  const unidadesVisibles = unidades.filter(u => !desarrolloSel || u.desarrollo_nombre === desarrolloSel);

  const dtuHabilitado = (avanceObra) => Number(avanceObra) >= 90;

  const abrirUnidad = (u) => {
    setUnidadAbierta(u);
    setForm({ ...VACIO, ...(seguimientos[u.id] || {}) });
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {unidadesVisibles.map(u => {
            const s = seguimientos[u.id] || VACIO;
            return (
              <div key={u.id} onClick={() => abrirUnidad(u)}
                style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '10px', padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>{u.numero} — {u.desarrollo_nombre}</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>{u.estatus}{tipoCompraPorUnidad[u.id] ? ` · ${tipoCompraPorUnidad[u.id]}` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#1a1a2e' }}>{Number(s.avance_obra_pct || 0)}%</div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: s.dtu ? '#10B981' : '#ccc' }}>DTU {s.dtu ? '✓' : '—'}</div>
                </div>
              </div>
            );
          })}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="number" min="0" max="100" value={form.avance_obra_pct}
                  onChange={e => setForm(f => ({ ...f, avance_obra_pct: e.target.value }))}
                  style={{ width: '90px', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px' }} />
                <span style={{ fontSize: '13px', color: '#555' }}>%</span>
              </div>
            </div>

            <label style={{ fontSize: '13px', color: '#333', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!form.lista_avaluo} onChange={e => setForm(f => ({ ...f, lista_avaluo: e.target.checked }))} />
              Lista para avalúo
            </label>

            {(() => {
              const habilitado = dtuHabilitado(form.avance_obra_pct);
              return (
                <label style={{ fontSize: '13px', color: habilitado ? '#333' : '#bbb', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', cursor: habilitado ? 'pointer' : 'not-allowed' }}>
                  <input type="checkbox" checked={habilitado && !!form.dtu} disabled={!habilitado}
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
