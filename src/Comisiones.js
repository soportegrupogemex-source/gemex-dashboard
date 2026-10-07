import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

// Comisiones — una fila por venta (movimiento tipo 'Vendida', la misma
// fuente del Historial). Los negocios se ligan por unidad (o por contacto)
// solo como referencia. Seguimiento propio en la tabla `comisiones`:
// enganche pagado / comisión solicitada / comisión pagada. "Comisionable"
// NO se captura aquí: viene del Historial (movimientos.comisionable).
// Permisos por casilla:
//  - Comisión pagada: solo Super Admin y Tesorería.
//  - Comisión solicitada: los Gerentes (solo de sus desarrollos y mientras
//    no esté pagada), además de Super Admin, Admin y Tesorería.
//  - Enganche pagado: Super Admin, Admin y Tesorería.
const ROLES_EDITAN = ['Super Admin', 'Admin', 'Tesorería'];
const ROLES_MARCAN_PAGADA = ['Super Admin', 'Tesorería'];
const ROLES_GERENTE = ['Gerente Editor', 'Gerente Operador'];
const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
const fmtFecha = (f) => f ? new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

const archivosDeDoc = (doc) => {
  if (!doc) return [];
  if (doc.archivos_json) {
    try { const a = JSON.parse(doc.archivos_json); if (Array.isArray(a) && a.length) return a; } catch (e) { /* cae al archivo único */ }
  }
  return doc.archivo_path ? [{ path: doc.archivo_path, nombre: doc.nombre_archivo || 'Archivo' }] : [];
};

const CAMPOS = [
  { key: 'enganche_pagado', label: 'Enganche pagado' },
  { key: 'comision_solicitada', label: 'Comisión solicitada' },
  { key: 'comision_pagada', label: 'Comisión pagada' },
];

export default function Comisiones({ miRol, miAgente }) {
  const isMobile = useIsMobile();
  const esGerente = ROLES_GERENTE.includes(miRol);
  const misDesarrollos = miAgente?.desarrollos_cargo || [];
  const puedeCampo = (campo, seg) => {
    if (campo === 'comision_pagada') return ROLES_MARCAN_PAGADA.includes(miRol);
    if (campo === 'comision_solicitada') return ROLES_EDITAN.includes(miRol) || (esGerente && !seg?.comision_pagada);
    return ROLES_EDITAN.includes(miRol);
  };
  const quienPuede = {
    enganche_pagado: 'solo Super Admin, Admin y Tesorería',
    comision_solicitada: 'solo Gerentes, Super Admin, Admin y Tesorería',
    comision_pagada: 'solo Super Admin y Tesorería',
  };
  const [ventas, setVentas] = useState([]);
  const [docsPorMov, setDocsPorMov] = useState({});
  const [segPorMov, setSegPorMov] = useState({});
  const [negocios, setNegocios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [filtroDesarrollo, setFiltroDesarrollo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [abierta, setAbierta] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { cargarTodo(); }, []);

  const cargarTodo = async () => {
    setCargando(true);
    const { data: movs } = await supabase.from('movimientos').select('*').eq('tipo', 'Vendida').order('created_at', { ascending: false });
    const lista = movs || [];
    setVentas(lista);
    const ids = lista.map(m => m.id);
    if (ids.length > 0) {
      const [{ data: docs }, { data: segs }, { data: negs }] = await Promise.all([
        supabase.from('expediente_documentos').select('*').in('movimiento_id', ids).in('tipo_documento', ['cotizacion', 'orden_contrato']),
        supabase.from('comisiones').select('*').in('movimiento_id', ids),
        supabase.from('negocios').select('id, nombre, etapa, unidad_id, contacto_id, desarrollo'),
      ]);
      const mapaDocs = {};
      (docs || []).forEach(d => { (mapaDocs[d.movimiento_id] = mapaDocs[d.movimiento_id] || {})[d.tipo_documento] = d; });
      setDocsPorMov(mapaDocs);
      const mapaSeg = {};
      (segs || []).forEach(s => { mapaSeg[s.movimiento_id] = s; });
      setSegPorMov(mapaSeg);
      setNegocios(negs || []);
    } else {
      setDocsPorMov({}); setSegPorMov({}); setNegocios([]);
    }
    setCargando(false);
  };

  const negocioDe = (m) =>
    negocios.find(n => n.unidad_id && n.unidad_id === m.unidad_id) ||
    negocios.find(n => n.contacto_id && n.contacto_id === m.contacto_id && ['Venta', 'Escritura', 'Cobranza'].includes(n.etapa)) ||
    null;

  const contratosDe = (m) => {
    const lista = [];
    if (m.contrato_firmado_path) lista.push({ bucket: 'contratos', path: m.contrato_firmado_path, nombre: 'Contrato firmado' });
    const doc = docsPorMov[m.id]?.orden_contrato;
    archivosDeDoc(doc).forEach(a => lista.push({ bucket: 'expedientes', path: a.path, nombre: a.nombre || 'Contrato firmado' }));
    return lista;
  };
  const cotizacionesDe = (m) => archivosDeDoc(docsPorMov[m.id]?.cotizacion).map(a => ({ bucket: 'expedientes', path: a.path, nombre: a.nombre || 'Cotización' }));
  const docArchivado = (m, tipo) => !!docsPorMov[m.id]?.[tipo]?.archivado;

  const estadoComision = (m) => {
    const s = segPorMov[m.id];
    if (s?.comision_pagada) return 'pagada';
    if (s?.comision_solicitada) return 'solicitada';
    return 'pendiente';
  };

  // Los Gerentes solo ven las ventas de sus desarrollos a cargo.
  const ventasAlcance = ventas.filter(m => !esGerente || misDesarrollos.includes(m.desarrollo_nombre));
  const desarrollos = [...new Set(ventasAlcance.map(v => v.desarrollo_nombre).filter(Boolean))].sort();
  const visibles = ventasAlcance.filter(m => {
    if (filtroDesarrollo && m.desarrollo_nombre !== filtroDesarrollo) return false;
    if (filtroEstado && estadoComision(m) !== filtroEstado) return false;
    const q = buscar.trim().toLowerCase();
    if (q && !`${m.contacto_nombre || ''} ${m.unidad_numero || ''} ${m.vendedor || ''} ${m.desarrollo_nombre || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const verArchivo = async (a) => {
    const { data, error } = await supabase.storage.from(a.bucket).createSignedUrl(a.path, 300);
    if (error) { alert('No se pudo abrir el archivo: ' + error.message); return; }
    window.open(data.signedUrl, '_blank');
  };

  const cambiarCampo = async (m, campo, valor) => {
    if (!puedeCampo(campo, segPorMov[m.id])) return;
    setGuardando(true);
    const ahora = new Date().toISOString();
    const payload = {
      movimiento_id: m.id,
      [campo]: valor,
      [`${campo}_por`]: valor ? (miAgente?.correo || '') : null,
      [`${campo}_fecha`]: valor ? ahora : null,
      updated_at: ahora,
    };
    const { data, error } = await supabase.from('comisiones').upsert(payload, { onConflict: 'movimiento_id' }).select().single();
    setGuardando(false);
    if (error) { alert('No se pudo guardar: ' + error.message); return; }
    setSegPorMov(prev => ({ ...prev, [m.id]: data }));
  };

  const chip = (ok, texto) => (
    <span style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '20px', background: ok ? '#EAF3DE' : '#f3f3f3', color: ok ? '#27500A' : '#999', fontWeight: '600', whiteSpace: 'nowrap' }}>
      {ok ? '✓' : '—'} {texto}
    </span>
  );

  const filaArchivos = (titulo, archivos, archivado) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '0.5px solid #f0f0f0', fontSize: '13px' }}>
      <span style={{ color: '#555' }}>{titulo}</span>
      {archivos.length > 0 ? (
        <span style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {archivos.map((a, i) => (
            <button key={i} onClick={() => verArchivo(a)} style={{ border: 'none', background: 'none', color: '#3B82F6', cursor: 'pointer', fontSize: '12px', padding: 0 }}>
              📄 {archivos.length > 1 ? `Ver ${i + 1}` : 'Ver'}
            </button>
          ))}
        </span>
      ) : (
        <span style={{ fontSize: '12px', color: archivado ? '#856404' : '#C0392B' }}>{archivado ? 'Archivado' : 'No cargado'}</span>
      )}
    </div>
  );

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Comisiones</h2>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '1rem' }}>Ventas marcadas en Historial, con su cotización, contrato y seguimiento de comisión</div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <input placeholder="Buscar cliente, unidad, vendedor..." value={buscar} onChange={e => setBuscar(e.target.value)}
          style={{ padding: '8px 12px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', minWidth: isMobile ? '100%' : '240px' }} />
        <select value={filtroDesarrollo} onChange={e => setFiltroDesarrollo(e.target.value)}
          style={{ padding: '8px 12px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', background: '#fff' }}>
          <option value=''>Todos los proyectos</option>
          {desarrollos.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          style={{ padding: '8px 12px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', background: '#fff' }}>
          <option value=''>Toda comisión</option>
          <option value='pendiente'>Sin solicitar</option>
          <option value='solicitada'>Solicitada</option>
          <option value='pagada'>Pagada</option>
        </select>
      </div>

      {cargando ? (
        <div style={{ color: '#888', fontSize: '13px' }}>Cargando...</div>
      ) : visibles.length === 0 ? (
        <div style={{ color: '#888', fontSize: '13px' }}>No hay ventas que coincidan con el filtro.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {visibles.map(m => {
            const s = segPorMov[m.id] || {};
            return (
              <div key={m.id} onClick={() => setAbierta(m.id)}
                style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '10px', padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>{m.unidad_numero} — {m.desarrollo_nombre}</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>{m.contacto_nombre || 'Sin cliente'} · {m.vendedor || 'Sin vendedor'} · {fmt(m.monto)}</div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {chip(!!m.expediente_completo, 'Exp. completo')}
                  {chip(cotizacionesDe(m).length > 0, 'Cotización')}
                  {chip(contratosDe(m).length > 0, 'Contrato')}
                  {chip(!!s.enganche_pagado, 'Enganche')}
                  {chip(!!m.comisionable, 'Comisionable')}
                  {chip(!!s.comision_solicitada, 'Solicitada')}
                  {chip(!!s.comision_pagada, 'Pagada')}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {abierta && (() => {
        const m = ventasAlcance.find(v => v.id === abierta);
        if (!m) return null;
        const s = segPorMov[m.id] || {};
        const neg = negocioDe(m);
        return (
          <div onClick={() => setAbierta(null)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: '#fff', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a2e', marginBottom: '2px' }}>{m.unidad_numero} — {m.desarrollo_nombre}</div>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '14px' }}>{m.contacto_nombre || 'Sin cliente'} · Vendedor: {m.vendedor || '—'}</div>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                <div style={{ flex: 1, background: '#f9f9f9', borderRadius: '10px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#888' }}>Valor venta</div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a2e' }}>{fmt(m.monto)}</div>
                </div>
                <div style={{ flex: 1, background: '#f9f9f9', borderRadius: '10px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#888' }}>Tipo de compra</div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a2e' }}>{m.tipo_compra || '—'}</div>
                </div>
              </div>
              {neg && (
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
                  Negocio ligado: <strong style={{ color: '#1a1a2e' }}>{neg.nombre}</strong> · etapa {neg.etapa}
                </div>
              )}

              <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e', margin: '8px 0 2px' }}>Expediente</div>
              {filaArchivos('Cotización del día del apartado', cotizacionesDe(m), docArchivado(m, 'cotizacion'))}
              {filaArchivos('Contrato firmado', contratosDe(m), docArchivado(m, 'orden_contrato') && !m.contrato_firmado_path)}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid #f0f0f0', fontSize: '13px' }}>
                <span style={{ color: '#555' }}>Expediente completo (Mesa de Control)</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: m.expediente_completo ? '#27500A' : '#C0392B' }}>{m.expediente_completo ? '✓ Sí' : 'No'}</span>
              </div>

              <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e', margin: '16px 0 6px' }}>Comisión</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', fontSize: '13px' }}>
                <input type="checkbox" checked={!!m.comisionable} disabled readOnly style={{ width: '16px', height: '16px' }} />
                <span style={{ color: '#333' }}>Comisionable</span>
                <span style={{ fontSize: '11px', color: '#aaa' }}>(se marca en Historial)</span>
              </div>
              {CAMPOS.map(c => (
                <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', fontSize: '13px', cursor: puedeCampo(c.key, s) ? 'pointer' : 'default', flexWrap: 'wrap' }}>
                  <input type="checkbox" checked={!!s[c.key]} disabled={!puedeCampo(c.key, s) || guardando}
                    onChange={e => cambiarCampo(m, c.key, e.target.checked)} style={{ width: '16px', height: '16px' }} />
                  <span style={{ color: '#333' }}>{c.label}</span>
                  {!puedeCampo(c.key, s) && <span style={{ fontSize: '11px', color: '#aaa' }}>({quienPuede[c.key]})</span>}
                  {s[c.key] && s[`${c.key}_fecha`] && (
                    <span style={{ fontSize: '11px', color: '#aaa' }}>{fmtFecha(s[`${c.key}_fecha`])}{s[`${c.key}_por`] ? ` · ${s[`${c.key}_por`]}` : ''}</span>
                  )}
                </label>
              ))}

              <button onClick={() => setAbierta(null)}
                style={{ width: '100%', marginTop: '16px', padding: '10px', background: '#fff', color: '#666', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                Cerrar
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
