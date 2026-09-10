import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

// FIX: Titulación ahora solo trabaja el Paso 2 (Titulación -> Escritura)
// — el Paso 1 (Avance de obra, DTU, Lista para avalúo) lo captura el
// módulo de Construcción, en la misma tabla titulacion_seguimiento, y
// aquí se muestra nada más como referencia (solo lectura). Además, la
// lista solo incluye unidades cuyo expediente (movimiento Apartado) ya
// tiene la casilla "Expediente completo" activada por su responsable en
// Expedientes — antes mostraba cualquier unidad Vendida sin importar el
// expediente.
const ROLES_GERENTE = ['Gerente Editor', 'Gerente Operador'];

const PASO2 = [
  { campo: 'saldo_cobrado', label: 'Saldo cobrado' },
  { campo: 'asignar_sofom', label: 'Asignar SOFOM' },
  { campo: 'autorizacion_financiera_1', label: 'Autorización financiera 1' },
  { campo: 'autorizacion_financiera_2', label: 'Autorización financiera 2' },
  { campo: 'liquidacion_final', label: 'Liquidación final' },
  { campo: 'carta_liberacion', label: 'Carta liberación' },
];
const TRAMITES = [
  { campo: 'cna_agua', label: 'CNA / Agua' },
  { campo: 'cuotas_predial', label: 'Cuotas / Predial' },
];

const VACIO = {
  avance_obra_pct: 0, dtu: false, lista_avaluo: false,
  fecha_solicitud_avaluo: '', fecha_terminacion_avaluo: '',
  saldo_cobrado: false, asignar_sofom: false,
  autorizacion_financiera_1: false, autorizacion_financiera_2: false,
  liquidacion_final: false, carta_liberacion: false,
  cna_agua: false, cuotas_predial: false,
};

function calcularEtapa(s) {
  const paso1 = s.dtu && s.lista_avaluo;
  const avaluoListo = !!s.fecha_terminacion_avaluo;
  const paso2 = paso1 && avaluoListo && PASO2.every(p => s[p.campo]);
  if (paso2) return 'Escriturado';
  if (paso1) return 'Titulación';
  return 'Contrato y Expediente';
}

const COLOR_ETAPA = {
  'Contrato y Expediente': '#F59E0B',
  'Titulación': '#3B82F6',
  'Escriturado': '#10B981',
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

export default function Titulacion({ miRol, miAgente }) {
  const isMobile = useIsMobile();
  const [desarrollos, setDesarrollos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [seguimientos, setSeguimientos] = useState({});
  const [compradores, setCompradores] = useState({});
  const [desarrolloSel, setDesarrolloSel] = useState('');
  const [etapaSel, setEtapaSel] = useState('');
  const [cargando, setCargando] = useState(true);
  const [unidadAbierta, setUnidadAbierta] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { cargarTodo(); }, []);

  const desarrollosPermitidos = ROLES_GERENTE.includes(miRol)
    ? desarrollos.filter(d => (miAgente?.desarrollos_cargo || []).includes(d.nombre))
    : desarrollos;
  const idsPermitidos = desarrollosPermitidos.map(d => d.id);

  const cargarTodo = async () => {
    setCargando(true);
    const { data: des } = await supabase.from('desarrollos').select('id, nombre').eq('activo', true).order('nombre');
    setDesarrollos(des || []);
    const mapaNombres = {};
    (des || []).forEach(d => { mapaNombres[d.id] = d.nombre; });

    // FIX: el expediente vive en el movimiento tipo 'Apartado' —
    // "expediente_completo" es una casilla que solo el responsable
    // enciende/apaga en Expedientes; en cuanto está activa la unidad debe
    // aparecer aquí, sin esperar a que exista un movimiento 'Vendida' (la
    // unidad puede seguir con estatus 'Apartado' en inventario mientras se
    // arma el expediente — antes se exigía estatus='Vendido' y por eso la
    // casilla no se reflejaba).
    const { data: apartados } = await supabase.from('movimientos')
      .select('id, unidad_id, contacto_nombre, expediente_completo, created_at')
      .eq('tipo', 'Apartado').eq('expediente_completo', true)
      .order('created_at', { ascending: false });
    const apartadoPorUnidad = {};
    (apartados || []).forEach(m => { if (!apartadoPorUnidad[m.unidad_id]) apartadoPorUnidad[m.unidad_id] = m; });
    const idsConExpediente = Object.keys(apartadoPorUnidad);
    if (idsConExpediente.length === 0) {
      setUnidades([]); setSeguimientos({}); setCompradores({}); setCargando(false);
      return;
    }

    const { data: inv } = await supabase.from('inventario')
      .select('id, numero, desarrollo_id, precio_lista_respaldo')
      .in('id', idsConExpediente)
      .order('numero');
    const invConExpediente = (inv || []).map(u => ({ ...u, desarrollo_nombre: mapaNombres[u.desarrollo_id] || '' }));
    setUnidades(invConExpediente);

    const { data: seg } = await supabase.from('titulacion_seguimiento').select('*').in('unidad_id', idsConExpediente);
    const mapa = {};
    (seg || []).forEach(s => { mapa[s.unidad_id] = s; });
    setSeguimientos(mapa);

    const { data: movs } = await supabase.from('movimientos')
      .select('unidad_id, contacto_nombre, created_at')
      .eq('tipo', 'Vendida').in('unidad_id', idsConExpediente)
      .order('created_at', { ascending: false });
    const mapaComp = {};
    (movs || []).forEach(m => { if (!mapaComp[m.unidad_id]) mapaComp[m.unidad_id] = m.contacto_nombre; });
    // FIX: si aún no existe movimiento 'Vendida', mostrar el contacto del
    // Apartado como respaldo (la unidad ya aparece aquí antes de venderse).
    idsConExpediente.forEach(id => { if (!mapaComp[id]) mapaComp[id] = apartadoPorUnidad[id]?.contacto_nombre; });
    setCompradores(mapaComp);

    setCargando(false);
  };

  const unidadesVisibles = unidades.filter(u => {
    if (ROLES_GERENTE.includes(miRol) && !idsPermitidos.includes(u.desarrollo_id)) return false;
    if (desarrolloSel && u.desarrollo_nombre !== desarrolloSel) return false;
    if (etapaSel) {
      const s = seguimientos[u.id] || VACIO;
      if (calcularEtapa(s) !== etapaSel) return false;
    }
    return true;
  });

  const abrirUnidad = (u) => {
    setUnidadAbierta(u);
    setForm({ ...VACIO, ...(seguimientos[u.id] || {}) });
  };

  const guardar = async () => {
    setGuardando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      unidad_id: unidadAbierta.id,
      desarrollo_id: unidadAbierta.desarrollo_id,
      fecha_solicitud_avaluo: form.fecha_solicitud_avaluo || null,
      fecha_terminacion_avaluo: form.fecha_terminacion_avaluo || null,
      saldo_cobrado: !!form.saldo_cobrado,
      asignar_sofom: !!form.asignar_sofom,
      autorizacion_financiera_1: !!form.autorizacion_financiera_1,
      autorizacion_financiera_2: !!form.autorizacion_financiera_2,
      liquidacion_final: !!form.liquidacion_final,
      carta_liberacion: !!form.carta_liberacion,
      cna_agua: !!form.cna_agua,
      cuotas_predial: !!form.cuotas_predial,
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

  const conteos = { 'Contrato y Expediente': 0, 'Titulación': 0, 'Escriturado': 0 };
  unidadesVisibles.forEach(u => { conteos[calcularEtapa(seguimientos[u.id] || VACIO)]++; });

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Titulación</h2>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '1rem' }}>Unidades vendidas con expediente completo, hasta escrituración</div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <select value={desarrolloSel} onChange={e => setDesarrolloSel(e.target.value)}
          style={{ padding: '8px 12px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', background: '#fff' }}>
          <option value=''>Todos los proyectos</option>
          {desarrollosPermitidos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
        </select>
        <select value={etapaSel} onChange={e => setEtapaSel(e.target.value)}
          style={{ padding: '8px 12px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', background: '#fff' }}>
          <option value=''>Todas las etapas</option>
          {Object.keys(COLOR_ETAPA).map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr 1fr' : 'repeat(3, 1fr)', gap: '10px', marginBottom: '1.5rem', maxWidth: isMobile ? 'none' : '600px' }}>
        {Object.entries(conteos).map(([etapa, n]) => (
          <div key={etapa} style={{ background: '#fff', border: `2px solid ${COLOR_ETAPA[etapa]}`, borderRadius: '12px', padding: '12px' }}>
            <div style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a2e' }}>{n}</div>
            <div style={{ fontSize: '11px', color: '#888' }}>{etapa}</div>
          </div>
        ))}
      </div>

      {cargando ? (
        <div style={{ color: '#888', fontSize: '13px' }}>Cargando...</div>
      ) : unidadesVisibles.length === 0 ? (
        <div style={{ color: '#888', fontSize: '13px' }}>No hay unidades con expediente completo que coincidan con el filtro.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {unidadesVisibles.map(u => {
            const s = seguimientos[u.id] || VACIO;
            const etapa = calcularEtapa(s);
            const totalItems = PASO2.length + 1; // +1 por avalúo (fechas)
            const hechos = PASO2.filter(p => s[p.campo]).length + (s.fecha_terminacion_avaluo ? 1 : 0);
            return (
              <div key={u.id} onClick={() => abrirUnidad(u)}
                style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '10px', padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>{u.numero} — {u.desarrollo_nombre}</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>{compradores[u.id] || 'Sin comprador registrado'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#888' }}>Paso 2: {hechos}/{totalItems}</div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', background: COLOR_ETAPA[etapa], borderRadius: '20px', padding: '4px 12px' }}>{etapa}</div>
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
            style={{ background: '#fff', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a2e', marginBottom: '2px' }}>{unidadAbierta.numero} — {unidadAbierta.desarrollo_nombre}</div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>{compradores[unidadAbierta.id] || 'Sin comprador registrado'}</div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', background: COLOR_ETAPA[calcularEtapa(form)], borderRadius: '20px', padding: '4px 12px', display: 'inline-block', marginBottom: '16px' }}>
              {calcularEtapa(form)}
            </div>

            <div style={{ background: '#f9f9f9', borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#888', marginBottom: '6px' }}>Paso 1 (Construcción) — solo lectura</div>
              <div style={{ fontSize: '13px', color: '#333' }}>Avance de obra: <strong>{Number(form.avance_obra_pct || 0)}%</strong></div>
              <div style={{ fontSize: '13px', color: '#333' }}>DTU: <strong>{form.dtu ? 'Sí' : 'No'}</strong> · Lista para avalúo: <strong>{form.lista_avaluo ? 'Sí' : 'No'}</strong></div>
            </div>

            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e', marginBottom: '8px' }}>Avalúo</div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Fecha de solicitud</label>
                <input type="date" value={form.fecha_solicitud_avaluo || ''}
                  onChange={e => setForm(f => ({ ...f, fecha_solicitud_avaluo: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Fecha de terminación</label>
                <input type="date" value={form.fecha_terminacion_avaluo || ''}
                  onChange={e => setForm(f => ({ ...f, fecha_terminacion_avaluo: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e', marginBottom: '8px' }}>Paso 2 — Titulación a Escritura</div>
            {PASO2.map(p => (
              <label key={p.campo} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#333', marginBottom: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!form[p.campo]} onChange={e => setForm(f => ({ ...f, [p.campo]: e.target.checked }))} />
                {p.label}
              </label>
            ))}

            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e', margin: '16px 0 8px' }}>Trámites tras carta de liberación</div>
            {TRAMITES.map(p => (
              <label key={p.campo} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#333', marginBottom: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!form[p.campo]} onChange={e => setForm(f => ({ ...f, [p.campo]: e.target.checked }))} />
                {p.label}
              </label>
            ))}

            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
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
