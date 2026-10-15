import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { cargarFirmantes, construirLiquidacionPdf, etiquetasCredito } from './liquidacionPdf';
import { fmtDinero, InputDinero } from './dinero';
import { usePuede } from './PermisosContext';

// FIX: Cliente asignado, Valor venta y Tipo de compra ya NO se capturan
// aquí — se leen en vivo del movimiento 'Vendida' de la unidad (fuente
// única de verdad). cobranza_seguimiento solo guarda lo que es propio de
// Cobranza: Financiera 1/2 y Liberación. Cada abono (cobranza_pagos)
// puede llevar un comprobante adjunto (bucket privado 'cobranza').
const ROLES_GERENTE = ['Gerente Editor', 'Gerente Operador'];
// Importes con centavos (los pagos y montos de cobranza pueden llevarlos).
const fmt = (n) => fmtDinero(n, { centavos: true });
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const SEG_VACIO = { financiera_1_monto: 0, financiera_2_monto: 0, liberacion_monto: 0, cuotas_condominales: 0 };

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export default function Cobranza({ miRol, miAgente }) {
  const isMobile = useIsMobile();
  // Cada acción tiene su interruptor en el panel Permisos (Mesa de Control, de fábrica, solo descarga el PDF).
  const puede = usePuede();
  const puedeAgregarPagos = puede('cobranza.agregar_pagos');
  const puedeEliminarPagos = puede('cobranza.eliminar_pagos');
  const puedeEditarMontos = puede('cobranza.editar_montos');
  const puedeMarcarLiquidacion = puede('cobranza.marcar_liquidacion');
  const puedeDescargarLiquidacion = puede('cobranza.descargar_liquidacion');
  const [desarrollos, setDesarrollos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [seguimientos, setSeguimientos] = useState({});
  // Financiera 1 y 2 vienen de Titulación (Autorización financiera 1 y 2); aquí solo se leen.
  const [montosTit, setMontosTit] = useState({}); // unidad_id -> { f1, f2 }
  const [pagosPorUnidad, setPagosPorUnidad] = useState({});
  const [ventaPorUnidad, setVentaPorUnidad] = useState({}); // unidad_id -> {contacto_nombre, monto, tipo_compra}
  const [desarrolloSel, setDesarrolloSel] = useState('');
  const [cargando, setCargando] = useState(true);
  const [unidadAbierta, setUnidadAbierta] = useState(null);
  const [form, setForm] = useState(SEG_VACIO);
  const [nuevoPago, setNuevoPago] = useState({ fecha: new Date().toISOString().slice(0, 10), monto: '', archivo: null });
  const [guardando, setGuardando] = useState(false);
  const [procesandoLiquidacion, setProcesandoLiquidacion] = useState(false);
  const [subiendoComprobante, setSubiendoComprobante] = useState(false);
  const [firmantes, setFirmantes] = useState({ titulacion: '', tesorero: '' });

  useEffect(() => { cargarTodo(); }, []);

  const desarrollosPermitidos = ROLES_GERENTE.includes(miRol)
    ? desarrollos.filter(d => (miAgente?.desarrollos_cargo || []).includes(d.nombre))
    : desarrollos;
  const idsPermitidos = desarrollosPermitidos.map(d => d.id);

  const cargarTodo = async () => {
    setCargando(true);
    const { data: des } = await supabase.from('desarrollos').select('id, nombre').eq('activo', true).order('nombre');
    // Nombres de las firmas: se capturan en Administración → Ajustes de administración.
    setFirmantes(await cargarFirmantes(supabase));
    setDesarrollos(des || []);
    const mapaNombres = {};
    (des || []).forEach(d => { mapaNombres[d.id] = d.nombre; });

    const { data: inv } = await supabase.from('inventario')
      .select('id, numero, desarrollo_id')
      .eq('estatus', 'Vendido')
      .order('numero');
    const invConNombre = (inv || []).map(u => ({ ...u, desarrollo_nombre: mapaNombres[u.desarrollo_id] || '' }));
    setUnidades(invConNombre);

    const unidadIds = (inv || []).map(u => u.id);
    if (unidadIds.length > 0) {
      const { data: seg } = await supabase.from('cobranza_seguimiento').select('*').in('unidad_id', unidadIds);
      const mapa = {};
      (seg || []).forEach(s => { mapa[s.unidad_id] = s; });
      setSeguimientos(mapa);

      const { data: tit } = await supabase.from('titulacion_seguimiento')
        .select('unidad_id, autorizacion_financiera_1_monto, autorizacion_financiera_2_monto').in('unidad_id', unidadIds);
      const mapaTit = {};
      (tit || []).forEach(t => { mapaTit[t.unidad_id] = { f1: Number(t.autorizacion_financiera_1_monto || 0), f2: Number(t.autorizacion_financiera_2_monto || 0) }; });
      setMontosTit(mapaTit);

      const { data: pagos } = await supabase.from('cobranza_pagos').select('*').in('unidad_id', unidadIds).order('fecha');
      const mapaPagos = {};
      (pagos || []).forEach(p => { (mapaPagos[p.unidad_id] = mapaPagos[p.unidad_id] || []).push(p); });
      setPagosPorUnidad(mapaPagos);

      const { data: movs } = await supabase.from('movimientos')
        .select('unidad_id, contacto_nombre, monto, tipo_compra, created_at')
        .eq('tipo', 'Vendida')
        .in('unidad_id', unidadIds)
        .order('created_at', { ascending: false });
      const mapaVenta = {};
      (movs || []).forEach(m => { if (!mapaVenta[m.unidad_id]) mapaVenta[m.unidad_id] = m; });
      setVentaPorUnidad(mapaVenta);
    } else {
      setSeguimientos({});
      setMontosTit({});
      setPagosPorUnidad({});
      setVentaPorUnidad({});
    }
    setCargando(false);
  };

  const unidadesVisibles = unidades.filter(u => {
    if (ROLES_GERENTE.includes(miRol) && !idsPermitidos.includes(u.desarrollo_id)) return false;
    if (desarrolloSel && u.desarrollo_nombre !== desarrolloSel) return false;
    return true;
  });

  const totalPagos = (unidadId) => r2((pagosPorUnidad[unidadId] || []).reduce((s, p) => s + Number(p.monto || 0), 0));

  const calc = (unidadId, s) => {
    const valorVenta = Number(ventaPorUnidad[unidadId]?.monto || 0);
    const pagado = totalPagos(unidadId);
    const diferenciaPorCubrir = r2(valorVenta - pagado);
    const f1 = Number(montosTit[unidadId]?.f1 || 0);
    const f2 = Number(montosTit[unidadId]?.f2 || 0);
    const saldoNeto = r2(diferenciaPorCubrir - f1 - f2);
    const remanente = r2(f1 + f2 - Number(s.liberacion_monto || 0));
    return { valorVenta, pagado, diferenciaPorCubrir, saldoNeto, remanente };
  };

  const abrirUnidad = (u) => {
    setUnidadAbierta(u);
    setForm({ ...SEG_VACIO, ...(seguimientos[u.id] || {}), financiera_1_monto: montosTit[u.id]?.f1 || 0, financiera_2_monto: montosTit[u.id]?.f2 || 0 });
    setNuevoPago({ fecha: new Date().toISOString().slice(0, 10), monto: '', archivo: null });
  };

  const guardarSeguimiento = async () => {
    if (!puedeEditarMontos) return null;
    setGuardando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      unidad_id: unidadAbierta.id,
      desarrollo_id: unidadAbierta.desarrollo_id,
      liberacion_monto: r2(form.liberacion_monto),
      cuotas_condominales: r2(form.cuotas_condominales),
      actualizado_por: user?.email || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('cobranza_seguimiento')
      .upsert(payload, { onConflict: 'unidad_id' })
      .select().single();
    setGuardando(false);
    if (error) { alert('No se pudo guardar: ' + error.message); return null; }
    if (data) {
      setSeguimientos(prev => ({ ...prev, [unidadAbierta.id]: data }));
    }
    return data;
  };

  const agregarPago = async () => {
    if (!puedeAgregarPagos) return;
    if (!nuevoPago.monto || r2(nuevoPago.monto) <= 0) return;
    setSubiendoComprobante(true);
    const { data: { user } } = await supabase.auth.getUser();

    let comprobantePath = null;
    if (nuevoPago.archivo) {
      const ext = nuevoPago.archivo.name.split('.').pop();
      const path = `${unidadAbierta.id}/${Date.now()}.${ext}`;
      const { error: errUpload } = await supabase.storage.from('cobranza').upload(path, nuevoPago.archivo);
      if (!errUpload) comprobantePath = path;
    }

    const { data, error } = await supabase.from('cobranza_pagos').insert([{
      unidad_id: unidadAbierta.id,
      fecha: nuevoPago.fecha,
      monto: r2(nuevoPago.monto),
      comprobante_path: comprobantePath,
      capturado_por: user?.email || null,
    }]).select().single();
    setSubiendoComprobante(false);
    if (error) { alert('No se pudo registrar el pago: ' + error.message); return; }
    if (data) {
      setPagosPorUnidad(prev => ({ ...prev, [unidadAbierta.id]: [...(prev[unidadAbierta.id] || []), data] }));
      setNuevoPago({ fecha: new Date().toISOString().slice(0, 10), monto: '', archivo: null });
    }
  };

  const eliminarPago = async (pago) => {
    if (!puedeEliminarPagos) return;
    await supabase.from('cobranza_pagos').delete().eq('id', pago.id);
    if (pago.comprobante_path) await supabase.storage.from('cobranza').remove([pago.comprobante_path]);
    setPagosPorUnidad(prev => ({ ...prev, [unidadAbierta.id]: (prev[unidadAbierta.id] || []).filter(p => p.id !== pago.id) }));
  };

  const verComprobante = async (path) => {
    const { data } = await supabase.storage.from('cobranza').createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  // Liquidación final: mismo formato que el que usa Tesorería.
  const construirLiquidacion = async () => {
    const { valorVenta, pagado } = calc(unidadAbierta.id, form);
    const venta = ventaPorUnidad[unidadAbierta.id] || {};
    return construirLiquidacionPdf({
      cliente: venta.contacto_nombre, tipoCompra: venta.tipo_compra,
      unidadNumero: unidadAbierta.numero, desarrolloNombre: unidadAbierta.desarrollo_nombre,
      valorVenta, pagado, f1: form.financiera_1_monto, f2: form.financiera_2_monto, cuotas: form.cuotas_condominales,
      firmantes,
    });
  };

  const descargarPDF = async () => {
    const { doc, cliente } = await construirLiquidacion();
    doc.save(`${cliente} - Liquidación final.pdf`);
  };

  // Al marcar "Unidad cotejada" se guarda el seguimiento, se
  // genera el PDF y se sube al bucket 'cobranza' para que Titulación lo vea.
  // Al desmarcar se borra el archivo. El PDF es una foto del momento: si
  // cambian pagos o montos después, hay que desmarcar y volver a marcar.
  const toggleLiquidacionFinal = async (marcada) => {
    if (procesandoLiquidacion || !puedeMarcarLiquidacion) return;
    setProcesandoLiquidacion(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ahora = new Date().toISOString();
      const actual = seguimientos[unidadAbierta.id] || {};
      if (!marcada) {
        if (actual.liquidacion_final_path) await supabase.storage.from('cobranza').remove([actual.liquidacion_final_path]);
        const { data, error } = await supabase.from('cobranza_seguimiento').upsert({
          unidad_id: unidadAbierta.id, desarrollo_id: unidadAbierta.desarrollo_id,
          liquidacion_final_completada: false, liquidacion_final_path: null,
          liquidacion_final_fecha: null, liquidacion_final_por: null, updated_at: ahora,
        }, { onConflict: 'unidad_id' }).select().single();
        if (error) { alert('No se pudo guardar: ' + error.message); return; }
        setSeguimientos(prev => ({ ...prev, [unidadAbierta.id]: data }));
        setForm(f => ({ ...f, liquidacion_final_completada: false, liquidacion_final_path: null }));
        return;
      }
      const guardado = await guardarSeguimiento();
      if (!guardado) return;
      const { doc } = await construirLiquidacion();
      const blob = doc.output('blob');
      const path = `${unidadAbierta.id}/liquidacion_final_${Date.now()}.pdf`;
      const { error: errUpload } = await supabase.storage.from('cobranza').upload(path, blob, { contentType: 'application/pdf' });
      if (errUpload) { alert('No se pudo subir la liquidación: ' + errUpload.message); return; }
      if (actual.liquidacion_final_path) await supabase.storage.from('cobranza').remove([actual.liquidacion_final_path]);
      const { data, error } = await supabase.from('cobranza_seguimiento').upsert({
        unidad_id: unidadAbierta.id, desarrollo_id: unidadAbierta.desarrollo_id,
        liquidacion_final_completada: true, liquidacion_final_path: path,
        liquidacion_final_fecha: ahora, liquidacion_final_por: user?.email || null, updated_at: ahora,
      }, { onConflict: 'unidad_id' }).select().single();
      if (error) { alert('No se pudo guardar: ' + error.message); return; }
      setSeguimientos(prev => ({ ...prev, [unidadAbierta.id]: data }));
      setForm(f => ({ ...f, liquidacion_final_completada: true, liquidacion_final_path: path }));
    } finally {
      setProcesandoLiquidacion(false);
    }
  };

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Cobranza</h2>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '1rem' }}>Enganche, pagos y financieras por unidad vendida</div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <select value={desarrolloSel} onChange={e => setDesarrolloSel(e.target.value)}
          style={{ padding: '8px 12px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', background: '#fff' }}>
          <option value=''>Todos los proyectos</option>
          {desarrollosPermitidos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
        </select>
      </div>

      {cargando ? (
        <div style={{ color: '#888', fontSize: '13px' }}>Cargando...</div>
      ) : unidadesVisibles.length === 0 ? (
        <div style={{ color: '#888', fontSize: '13px' }}>No hay unidades que coincidan con el filtro.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {unidadesVisibles.map(u => {
            const s = seguimientos[u.id] || SEG_VACIO;
            const { pagado, saldoNeto } = calc(u.id, s);
            return (
              <div key={u.id} onClick={() => abrirUnidad(u)}
                style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '10px', padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>{u.numero} — {u.desarrollo_nombre}</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>{ventaPorUnidad[u.id]?.contacto_nombre || 'Sin comprador registrado'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ fontSize: '12px', color: '#888' }}>Pagado: <span style={{ color: '#1a1a2e', fontWeight: '600' }}>{fmt(pagado)}</span></div>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#fff', background: saldoNeto <= 0 ? '#10B981' : '#F59E0B', borderRadius: '20px', padding: '4px 12px' }}>
                    Saldo neto: {fmt(saldoNeto)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {unidadAbierta && (() => {
        const { valorVenta, pagado, diferenciaPorCubrir, saldoNeto, remanente } = calc(unidadAbierta.id, form);
        const venta = ventaPorUnidad[unidadAbierta.id] || {};
        const pagos = pagosPorUnidad[unidadAbierta.id] || [];
        return (
          <div onClick={() => setUnidadAbierta(null)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: '#fff', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a2e', marginBottom: '2px' }}>{unidadAbierta.numero} — {unidadAbierta.desarrollo_nombre}</div>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>Cliente asignado: {venta.contacto_nombre || 'Sin comprador registrado'}</div>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <div style={{ flex: 1, background: '#f9f9f9', borderRadius: '10px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#888' }}>Valor venta</div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a2e' }}>{fmt(valorVenta)}</div>
                </div>
                <div style={{ flex: 1, background: '#f9f9f9', borderRadius: '10px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#888' }}>Tipo de compra</div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a2e' }}>{venta.tipo_compra || '—'}</div>
                </div>
              </div>

              <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e', margin: '16px 0 8px' }}>Enganche y pagos</div>
              {pagos.length > 0 && (
                <div style={{ marginBottom: '8px' }}>
                  {pagos.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid #f0f0f0', fontSize: '13px' }}>
                      <span style={{ color: '#888' }}>{p.fecha}</span>
                      <span style={{ color: '#1a1a2e', fontWeight: '600' }}>{fmt(p.monto)}</span>
                      {p.comprobante_path
                        ? <button onClick={() => verComprobante(p.comprobante_path)} style={{ border: 'none', background: 'none', color: '#3B82F6', cursor: 'pointer', fontSize: '12px' }}>Ver comprobante</button>
                        : <span style={{ fontSize: '11px', color: '#bbb' }}>Sin comprobante</span>}
                      {puedeEliminarPagos && <button onClick={() => eliminarPago(p)}
                        style={{ border: 'none', background: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '12px' }}>Eliminar</button>}
                    </div>
                  ))}
                </div>
              )}
              {puedeAgregarPagos && <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <input type="date" value={nuevoPago.fecha} onChange={e => setNuevoPago(p => ({ ...p, fecha: e.target.value }))}
                  style={{ flex: 1, minWidth: '120px', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px' }} />
                <InputDinero placeholder="Monto" value={nuevoPago.monto} onChange={e => setNuevoPago(p => ({ ...p, monto: e.target.value }))}
                  style={{ flex: 1, minWidth: '90px', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px' }} />
                <input type="file" onChange={e => setNuevoPago(p => ({ ...p, archivo: e.target.files[0] || null }))}
                  style={{ flex: 1, minWidth: '140px', fontSize: '12px' }} />
                <button onClick={agregarPago} disabled={subiendoComprobante}
                  style={{ padding: '8px 14px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  {subiendoComprobante ? 'Subiendo...' : '+ Agregar'}
                </button>
              </div>}
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>Total abonado: <strong style={{ color: '#1a1a2e' }}>{fmt(pagado)}</strong></div>

              <div style={{ background: '#f9f9f9', borderRadius: '10px', padding: '12px', fontSize: '13px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#555' }}>Diferencia por cubrir</span>
                  <span style={{ fontWeight: '600' }}>{fmt(diferenciaPorCubrir)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '4px' }}>
                {[['Financiera 1', etiquetasCredito(venta.tipo_compra).f1, form.financiera_1_monto], ['Financiera 2', etiquetasCredito(venta.tipo_compra).f2, form.financiera_2_monto]].map(([t, e, monto]) => (
                  <div key={t} style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: '#555', marginBottom: '4px' }}>{t} — {e}</div>
                    <div style={{ padding: '8px 10px', background: '#f3f3f3', border: '0.5px solid #e5e5e5', borderRadius: '8px', fontSize: '13px', color: '#1a1a2e' }}>{fmt(monto)}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '12px' }}>Estos montos se capturan en Titulación (Autorización financiera 1 y 2).</div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Liberación</label>
                <InputDinero disabled={!puedeEditarMontos} value={form.liberacion_monto}
                  onChange={e => setForm(f => ({ ...f, liberacion_monto: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Cuotas condominales (2 meses)</label>
                <InputDinero disabled={!puedeEditarMontos} value={form.cuotas_condominales}
                  onChange={e => setForm(f => ({ ...f, cuotas_condominales: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: form.liquidacion_final_completada ? '#EAF3DE' : '#f9f9f9', borderRadius: '10px', marginBottom: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <input type="checkbox" checked={!!form.liquidacion_final_completada} disabled={procesandoLiquidacion || !puedeMarcarLiquidacion}
                  onChange={e => toggleLiquidacionFinal(e.target.checked)} style={{ width: '16px', height: '16px' }} />
                <span style={{ color: '#1a1a2e', fontWeight: '600' }}>{procesandoLiquidacion ? 'Procesando...' : 'Unidad cotejada'}</span>
              </label>
              <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '16px' }}>
                Titulación ya ve el estado de cuenta en vivo con lo que vayas capturando. Al cotejar la unidad se guarda la liquidación final definitiva y Titulación la ve marcada como "Unidad cotejada". Si cambias pagos o montos después, desmárcala y vuélvela a marcar para actualizarla.
              </div>

              <div style={{ background: '#f9f9f9', borderRadius: '10px', padding: '12px', fontSize: '13px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#555' }}>Saldo neto</span>
                  <span style={{ fontWeight: '700', color: saldoNeto <= 0 ? '#10B981' : '#F59E0B' }}>{fmt(saldoNeto)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#555' }}>Remanente</span>
                  <span style={{ fontWeight: '700', color: '#1a1a2e' }}>{fmt(remanente)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button onClick={() => setUnidadAbierta(null)}
                  style={{ flex: 1, padding: '10px', background: '#fff', color: '#666', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  Cerrar
                </button>
                {puedeEditarMontos && <button onClick={guardarSeguimiento} disabled={guardando}
                  style={{ flex: 1, padding: '10px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>}
              </div>
              {puedeDescargarLiquidacion && <button onClick={descargarPDF}
                style={{ width: '100%', padding: '10px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                ⬇ Descargar liquidación final (PDF)
              </button>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
