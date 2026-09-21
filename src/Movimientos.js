import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

// FIX: Titulación y Cobranza se agregan como tipos de movimiento
// posteriores a la Venta — no cambian el estatus de Inventario (la
// unidad ya está Vendido) y no requieren columnas nuevas: reutilizan
// monto y fecha_firma (que fechaEfectiva() ya prioriza) para que el
// Dashboard pueda sumar el "real" por mes contra la meta de Objetivos.
const TIPOS = ['Apartado', 'Vendida', 'Cancelación', 'Cambio de Unidad', 'Titulación', 'Cobranza'];
const TIPOS_POST_VENTA = ['Titulación', 'Cobranza'];
// FIX: se agrega "Especial" — para negociaciones que no entran en las
// políticas de los demás planes (caso a caso).
const PLANES_PAGO = ['Hipotecario', 'A tu medida', 'Financiero 1', 'Financiero 2', '50-50', 'Contado', 'Especial'];
const ORIGEN_OPCIONES = ['Referido', 'Autogeneración', 'Campañas digitales', 'Mensaje WhatsApp', 'Portal inmobiliario', 'Showroom'];
const TIPO_COMPRA_OPCIONES = ['Contado', 'Infonavit', 'Fovissste', 'Bancario', 'Cofinavit'];
// FIX: Mesa de Control entra a la misma ventana martes-lunes que los demás Gerentes
const ROLES_GERENTE = ['Gerente Editor', 'Gerente Operador', 'Mesa de Control'];

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export default function Movimientos() {
  const isMobile = useIsMobile();
  const [tipo, setTipo] = useState('Apartado');
  const [desarrollos, setDesarrollos] = useState([]);
  const [desarrolloDetalle, setDesarrolloDetalle] = useState(null);
  const [contactos, setContactos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [estructuraSel, setEstructuraSel] = useState('');
  const [buscarContacto, setBuscarContacto] = useState('');
  const [showContactos, setShowContactos] = useState(false);
  const [contactoSel, setContactoSel] = useState(null);
  const [miAgente, setMiAgente] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [agentes, setAgentes] = useState([]);
  const [vendedorSel, setVendedorSel] = useState('');
  // FIX: correo del vendedor seleccionado — antes solo se guardaba el
  // nombre en texto libre (`vendedor`), lo que hacía poco confiable
  // cualquier cruce de "mis movimientos" cuando hay nombres repetidos.
  // Ahora se guarda también el correo real, que es único.
  const [vendedorCorreoSel, setVendedorCorreoSel] = useState('');
  const [msg, setMsg] = useState('');
  // FIX: ventana de tiempo para que los Gerentes solo puedan cargar
  // movimientos de martes a lunes hasta la hora configurada por Super Admin
  const [horaCierre, setHoraCierre] = useState('11:59');
  const [form, setForm] = useState({
    desarrollo_id: '', desarrollo_nombre: '',
    unidad_id: '', unidad_numero: '',
    monto: 0, plan_pago: 'Contado', tipo_compra: 'Contado',
    fecha_apartado: '', fecha_firma: '',
    fecha_cancelacion: '', motivo_cancelacion: '',
    comisionable: false, origen_cliente: 'Referido',
    unidad_inicial: '', nueva_unidad_id: '', nueva_unidad_numero: '',
    nuevo_plan_pago: 'Contado', nuevo_monto: 0,
  });

  useEffect(() => {
    cargarMiAgente();
    cargarDesarrollos();
    cargarAgentes();
    cargarConfigVentana();
  }, []);

  useEffect(() => {
    if (form.desarrollo_id) {
      cargarUnidades(form.desarrollo_id);
      const d = desarrollos.find(x => x.id === form.desarrollo_id);
      setDesarrolloDetalle(d || null);
      setEstructuraSel('');
    } else {
      setDesarrolloDetalle(null);
      setEstructuraSel('');
      setUnidades([]);
    }
  }, [form.desarrollo_id]);

  const cargarConfigVentana = async () => {
    const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'ventana_cierre_hora').limit(1);
    if (data && data.length > 0 && data[0].valor) setHoraCierre(data[0].valor);
  };

  const esGerente = ROLES_GERENTE.includes(miAgente?.rol);

  const dentroDeVentana = () => {
    const ahora = new Date();
    const dia = ahora.getDay(); // 0=Dom, 1=Lun, 2=Mar...6=Sab
    if (dia !== 1) return true; // martes a domingo: siempre abierto
    const [h, m] = horaCierre.split(':').map(Number);
    const limite = new Date(ahora); limite.setHours(h, m, 59, 999);
    return ahora <= limite;
  };

  const ventanaCerrada = esGerente && !dentroDeVentana();

  // FIX: el Gerente Operador solo puede cargar movimientos de los
  // desarrollos que tiene a su cargo.
  const desarrollosDisponibles = miAgente?.rol === 'Gerente Operador'
    ? desarrollos.filter(d => (miAgente?.desarrollos_cargo || []).includes(d.nombre))
    : desarrollos;

  const cargarMiAgente = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('agentes').select('*').eq('correo', user.email).single();
      setMiAgente(data);
      if (data?.rol === 'Agente') { setVendedorSel(`${data.nombre} ${data.apellidos}`.trim()); setVendedorCorreoSel(data.correo || ''); }
    }
  };

  const cargarAgentes = async () => {
    const { data } = await supabase.from('agentes').select('id, nombre, apellidos, correo').eq('activo', true).order('nombre');
    setAgentes(data || []);
  };

  const cargarDesarrollos = async () => {
    const { data } = await supabase.from('desarrollos').select('*').eq('activo', true).order('nombre');
    setDesarrollos(data || []);
  };

  const cargarUnidades = async (desarrolloId) => {
    const { data } = await supabase.from('inventario').select('id, numero, estatus, estructura').eq('desarrollo_id', desarrolloId).order('numero');
    setUnidades(data || []);
  };

  const abrirContactos = async () => {
    const desarrollo = desarrollos.find(d => d.id === form.desarrollo_id);
    let query = supabase.from('contactos').select('id, nombres, apellidos, correo, telefono').order('nombres');
    if (desarrollo) query = query.eq('desarrollo', desarrollo.nombre);
    const { data } = await query.limit(100);
    setContactos(data || []);
    setShowContactos(true);
  };

  const buscarContactos = async (texto) => {
    setBuscarContacto(texto);
    setContactoSel(null);
    const desarrollo = desarrollos.find(d => d.id === form.desarrollo_id);
    let query = supabase.from('contactos').select('id, nombres, apellidos, correo, telefono').order('nombres');
    if (desarrollo) query = query.eq('desarrollo', desarrollo.nombre);
    if (texto.length >= 1) query = query.or(`nombres.ilike.%${texto}%,apellidos.ilike.%${texto}%,correo.ilike.%${texto}%`);
    const { data } = await query.limit(50);
    setContactos(data || []);
    setShowContactos(true);
  };

  const handleDesarrolloChange = (e) => {
    const id = e.target.value;
    const d = desarrollos.find(x => x.id === id);
    setDesarrolloDetalle(d || null);
    setEstructuraSel('');
    setForm({ ...form, desarrollo_id: id, desarrollo_nombre: d?.nombre || '', unidad_id: '', unidad_numero: '' });
  };

  const handleUnidadChange = (e) => {
    const id = e.target.value;
    const u = unidadesFiltradas.find(x => x.id === id);
    setForm({ ...form, unidad_id: id, unidad_numero: u?.numero || '' });
  };

  // FIX: al elegir un vendedor del dropdown (Super Admin/Admin/Gerentes),
  // guarda también su correo — antes solo se guardaba el nombre escrito.
  const handleVendedorChange = (e) => {
    const correo = e.target.value;
    const ag = agentes.find(a => a.correo === correo);
    setVendedorCorreoSel(correo);
    setVendedorSel(ag ? `${ag.nombre} ${ag.apellidos}`.trim() : '');
  };

  // FIX: al Apartar/Vender una unidad, el precio de lista se pone en 0 en
  // Inventario (no debe seguir mostrándose una vez que no está disponible),
  // respaldando el precio real en precio_lista_respaldo para poder
  // restaurarlo si se Cancela el movimiento o hay un Cambio de Unidad.
  const aplicarEstatusUnidad = async (unidadId, nuevoEstatus) => {
    const { data: unidad } = await supabase.from('inventario')
      .select('precio_lista, precio_lista_respaldo, m2_total').eq('id', unidadId).single();
    if (!unidad) return;

    if (nuevoEstatus === 'Apartado' || nuevoEstatus === 'Vendido') {
      const respaldo = unidad.precio_lista > 0 ? unidad.precio_lista : unidad.precio_lista_respaldo;
      await supabase.from('inventario').update({
        estatus: nuevoEstatus, precio_lista: 0, precio: 0, precio_m2: 0,
        precio_lista_respaldo: respaldo || null,
      }).eq('id', unidadId);
    } else if (nuevoEstatus === 'Libre') {
      const precioRestaurado = unidad.precio_lista_respaldo || 0;
      const m2 = Number(unidad.m2_total) || 0;
      const precioM2Restaurado = m2 > 0 ? Math.round((precioRestaurado / m2) * 100) / 100 : 0;
      await supabase.from('inventario').update({
        estatus: 'Libre', precio_lista: precioRestaurado, precio: precioRestaurado,
        precio_m2: precioM2Restaurado, precio_lista_respaldo: null,
      }).eq('id', unidadId);
    } else {
      await supabase.from('inventario').update({ estatus: nuevoEstatus }).eq('id', unidadId);
    }
  };

  const handleGuardar = async () => {
    // FIX: los Gerentes no pueden cargar movimientos fuera de la ventana
    // martes-a-lunes (hasta la hora configurada por Super Admin)
    if (ventanaCerrada) {
      setMsg(`🔒 La ventana de carga está cerrada por hoy (lunes después de las ${horaCierre}). Podrás cargar de nuevo el martes.`);
      return;
    }
    if (!contactoSel) { setMsg('❌ Debes seleccionar un contacto registrado'); return; }
    if (!form.desarrollo_id) { setMsg('❌ Selecciona un desarrollo'); return; }
    if (!form.unidad_id) { setMsg('❌ Selecciona una unidad'); return; }

    setGuardando(true);
    setMsg('');

    // FIX: Titulación/Cobranza se registran SOBRE una unidad ya Vendida
    // (y Cobranza puede repetirse varias veces por pagos parciales), así
    // que no aplica el candado de "ya tiene un registro activo" — ese
    // candado es para no Apartar/Vender dos veces la misma unidad.
    if (tipo !== 'Cancelación' && !TIPOS_POST_VENTA.includes(tipo)) {
      const { data: existentes } = await supabase.from('movimientos').select('id, tipo, contacto_nombre').eq('unidad_id', form.unidad_id).neq('tipo', 'Cancelación');
      if (existentes && existentes.length > 0) {
        const e = existentes[0];
        setMsg(`❌ La unidad ${form.unidad_numero} ya tiene un registro activo (${e.tipo} — ${e.contacto_nombre}).`);
        setGuardando(false);
        return;
      }
    }

    let nuevoEstatus = null;
    if (tipo === 'Apartado') nuevoEstatus = 'Apartado';
    else if (tipo === 'Vendida') nuevoEstatus = 'Vendido';
    else if (tipo === 'Cancelación') nuevoEstatus = 'Libre';
    else if (tipo === 'Cambio de Unidad') nuevoEstatus = 'Libre';

    if (nuevoEstatus) await aplicarEstatusUnidad(form.unidad_id, nuevoEstatus);
    if (tipo === 'Cambio de Unidad' && form.nueva_unidad_id) await aplicarEstatusUnidad(form.nueva_unidad_id, 'Apartado');

    const { error } = await supabase.from('movimientos').insert([{
      tipo, desarrollo_id: form.desarrollo_id, desarrollo_nombre: form.desarrollo_nombre,
      contacto_id: contactoSel.id, contacto_nombre: `${contactoSel.nombres} ${contactoSel.apellidos}`,
      unidad_id: form.unidad_id, unidad_numero: form.unidad_numero,
      unidad_inicial: tipo === 'Cambio de Unidad' ? form.unidad_numero : null,
      monto: tipo === 'Cambio de Unidad' ? form.nuevo_monto : form.monto,
      plan_pago: tipo === 'Cambio de Unidad' ? form.nuevo_plan_pago : form.plan_pago,
      tipo_compra: form.tipo_compra,
      fecha_apartado: form.fecha_apartado || null, fecha_firma: form.fecha_firma || null,
      fecha_cancelacion: form.fecha_cancelacion || null, motivo_cancelacion: form.motivo_cancelacion || null,
      comisionable: form.comisionable, origen_cliente: form.origen_cliente,
      vendedor: vendedorSel || (miAgente ? `${miAgente.nombre} ${miAgente.apellidos}` : ''),
      vendedor_correo: vendedorCorreoSel || miAgente?.correo || '',
      registrado_por: miAgente?.correo || '', fecha_movimiento: new Date().toISOString(),
    }]);

    setGuardando(false);
    if (error) {
      setMsg('❌ Error al registrar el movimiento');
    } else {
      setMsg('✅ Movimiento registrado correctamente');
      setContactoSel(null); setBuscarContacto(''); setEstructuraSel('');
      setForm({
        desarrollo_id: '', desarrollo_nombre: '', unidad_id: '', unidad_numero: '',
        monto: 0, plan_pago: 'Contado', tipo_compra: 'Contado', fecha_apartado: '', fecha_firma: '',
        fecha_cancelacion: '', motivo_cancelacion: '', comisionable: false,
        origen_cliente: 'Referido', unidad_inicial: '', nueva_unidad_id: '',
        nueva_unidad_numero: '', nuevo_plan_pago: 'Contado', nuevo_monto: 0
      });
      setTimeout(() => setMsg(''), 4000);
    }
  };

  const tieneEtapas = desarrolloDetalle?.tiene_etapas;
  const tipoEstructura = desarrolloDetalle?.tipo_estructura || 'Etapa';
  const numEstructuras = desarrolloDetalle?.num_estructuras || 1;
  const estructuras = tieneEtapas ? Array.from({ length: numEstructuras }, (_, i) => `${tipoEstructura} ${i + 1}`) : [];
  const unidadesEnEstructura = estructuraSel ? unidades.filter(u => u.estructura === estructuraSel) : unidades;
  // FIX: para Titulación/Cobranza solo tiene sentido elegir unidades que
  // ya están Vendidas.
  const unidadesFiltradas = TIPOS_POST_VENTA.includes(tipo)
    ? unidadesEnEstructura.filter(u => u.estatus === 'Vendido')
    : unidadesEnEstructura;
  const unidadesNuevas = unidadesFiltradas.filter(u => u.id !== form.unidad_id && u.estatus === 'Libre');

  const btnTipo = (t) => (
    <button key={t} onClick={() => setTipo(t)}
      style={{ flex: 1, padding: isMobile ? '12px 6px' : '10px', border: `1px solid ${tipo === t ? '#C0203A' : '#ddd'}`, borderRadius: '8px', background: tipo === t ? '#C0203A' : '#fff', color: tipo === t ? '#fff' : '#333', cursor: 'pointer', fontSize: isMobile ? '12px' : '13px', fontWeight: tipo === t ? '600' : '400' }}>
      {t}
    </button>
  );

  const btnPlan = (p, key, newPlan = false) => (
    <button key={p} onClick={() => setForm({ ...form, [newPlan ? 'nuevo_plan_pago' : 'plan_pago']: p })}
      style={{ flex: 1, padding: isMobile ? '10px 4px' : '8px', border: `1px solid ${form[newPlan ? 'nuevo_plan_pago' : 'plan_pago'] === p ? '#C0203A' : '#ddd'}`, borderRadius: '8px', background: form[newPlan ? 'nuevo_plan_pago' : 'plan_pago'] === p ? '#C0203A' : '#fff', color: form[newPlan ? 'nuevo_plan_pago' : 'plan_pago'] === p ? '#fff' : '#333', cursor: 'pointer', fontSize: isMobile ? '11px' : '12px' }}>
      {p}
    </button>
  );

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem', maxWidth: '640px' }}>
      <h2 style={{ fontSize: isMobile ? '17px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Registrar Movimiento</h2>
      <div style={{ fontSize: '13px', color: '#888', marginBottom: '1.5rem' }}>Captura los datos del apartado, venta, cancelación o cambio de unidad</div>

      {/* FIX: aviso a los Gerentes cuando la ventana de carga está cerrada */}
      {ventanaCerrada && (
        <div style={{ padding: '12px 16px', background: '#FFF8E1', color: '#856404', borderRadius: '8px', fontSize: '13px', marginBottom: '1.25rem' }}>
          🔒 La ventana de carga está cerrada por hoy (lunes después de las {horaCierre}). Podrás volver a cargar movimientos el martes.
        </div>
      )}

      <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: isMobile ? '1.25rem' : '2rem', opacity: ventanaCerrada ? 0.6 : 1 }}>

        {/* Tipo */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: '#333', marginBottom: '10px' }}>Tipo de Movimiento</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {TIPOS.map(t => btnTipo(t))}
          </div>
        </div>

        {/* Desarrollo */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Proyecto</label>
          <select value={form.desarrollo_id} onChange={handleDesarrolloChange} style={inputStyle}>
            <option value=''>Seleccionar proyecto...</option>
            {desarrollosDisponibles.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        </div>

        {/* Etapas/torres */}
        {tieneEtapas && estructuras.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>{tipoEstructura}</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={() => { setEstructuraSel(''); setForm({ ...form, unidad_id: '', unidad_numero: '' }); }}
                style={{ padding: '8px 14px', borderRadius: '20px', border: '0.5px solid', cursor: 'pointer', fontSize: '13px',
                  background: !estructuraSel ? '#C0203A' : '#fff', color: !estructuraSel ? '#fff' : '#666', borderColor: !estructuraSel ? '#C0203A' : '#ddd' }}>
                Todas
              </button>
              {estructuras.map(est => (
                <button key={est} onClick={() => { setEstructuraSel(est); setForm({ ...form, unidad_id: '', unidad_numero: '' }); }}
                  style={{ padding: '8px 14px', borderRadius: '20px', border: '0.5px solid', cursor: 'pointer', fontSize: '13px',
                    background: estructuraSel === est ? '#C0203A' : '#fff', color: estructuraSel === est ? '#fff' : '#666', borderColor: estructuraSel === est ? '#C0203A' : '#ddd' }}>
                  {est}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Contacto */}
        <div style={{ marginBottom: '16px', position: 'relative' }}>
          <label style={labelStyle}>Contacto registrado <span style={{ color: '#e53e3e' }}>*</span></label>
          <input value={contactoSel ? `${contactoSel.nombres} ${contactoSel.apellidos}` : buscarContacto}
            onChange={e => buscarContactos(e.target.value)}
            onFocus={() => abrirContactos()}
            placeholder='Buscar contacto...'
            style={{ ...inputStyle, fontSize: isMobile ? '14px' : '13px', padding: isMobile ? '12px' : '9px 12px' }} />
          {showContactos && contactos.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '0.5px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: '220px', overflowY: 'auto' }}>
              {contactos.map(c => (
                <button key={c.id} onClick={() => { setContactoSel(c); setShowContactos(false); setBuscarContacto(''); }}
                  style={{ display: 'block', width: '100%', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '0.5px solid #f0f0f0', fontSize: '14px' }}>
                  <div style={{ fontWeight: '500' }}>{c.nombres} {c.apellidos}</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>{c.correo} · {c.telefono}</div>
                </button>
              ))}
            </div>
          )}
          {contactoSel && (
            <div style={{ marginTop: '6px', padding: '10px 12px', background: '#EAF3DE', borderRadius: '6px', fontSize: '13px', color: '#27500A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ flex: 1, marginRight: '8px' }}>✓ {contactoSel.nombres} {contactoSel.apellidos}</span>
              <button onClick={() => { setContactoSel(null); setBuscarContacto(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A32D2D', fontSize: '16px', flexShrink: 0 }}>✕</button>
            </div>
          )}
        </div>

        {/* Unidad y Origen — stack en móvil */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={labelStyle}>
              Número de Unidad {estructuraSel && <span style={{ color: '#888', fontWeight: '400' }}>({estructuraSel})</span>}
            </label>
            <select value={form.unidad_id} onChange={handleUnidadChange} style={{ ...inputStyle, padding: isMobile ? '12px' : '9px 12px' }} disabled={!form.desarrollo_id}>
              <option value=''>Seleccionar unidad...</option>
              {unidadesFiltradas.map(u => <option key={u.id} value={u.id}>{u.numero} — {u.estatus}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Origen del Cliente</label>
            <select value={form.origen_cliente} onChange={e => setForm({ ...form, origen_cliente: e.target.value })} style={{ ...inputStyle, padding: isMobile ? '12px' : '9px 12px' }}>
              {ORIGEN_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Monto (MXN)</label>
            <input type='number' value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} style={{ ...inputStyle, padding: isMobile ? '12px' : '9px 12px' }} placeholder='0' />
          </div>
          <div>
            <label style={labelStyle}>Vendedor</label>
            {miAgente?.rol === 'Agente' ? (
              <input value={`${miAgente.nombre} ${miAgente.apellidos}`.trim()} readOnly
                style={{ ...inputStyle, background: '#f9f9f9', color: '#888', cursor: 'not-allowed', padding: isMobile ? '12px' : '9px 12px' }} />
            ) : (
              // FIX: el select ahora usa el correo como value (antes usaba el
              // nombre) para poder guardar vendedor_correo de forma confiable.
              <select value={vendedorCorreoSel} onChange={handleVendedorChange} style={{ ...inputStyle, padding: isMobile ? '12px' : '9px 12px' }}>
                <option value=''>Selecciona un vendedor...</option>
                {agentes.map(a => <option key={a.id} value={a.correo}>{a.nombre} {a.apellidos}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Plan de pago */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Plan de Pagos</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {PLANES_PAGO.map(p => btnPlan(p, p))}
          </div>
        </div>

        {/* Tipo de compra */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Tipo de Compra</label>
          <select value={form.tipo_compra} onChange={e => setForm({ ...form, tipo_compra: e.target.value })} style={{ ...inputStyle, padding: isMobile ? '12px' : '9px 12px' }}>
            {TIPO_COMPRA_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {/* Fechas */}
        {TIPOS_POST_VENTA.includes(tipo) ? (
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>{tipo === 'Titulación' ? 'Fecha de Titulación' : 'Fecha de Cobro'}</label>
            <input type='date' value={form.fecha_firma} onChange={e => setForm({ ...form, fecha_firma: e.target.value })}
              style={{ ...inputStyle, padding: isMobile ? '12px' : '9px 12px' }} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: tipo === 'Vendida' ? (isMobile ? '1fr' : '1fr 1fr') : '1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Fecha de Apartado</label>
              <input type='date' value={form.fecha_apartado} onChange={e => setForm({ ...form, fecha_apartado: e.target.value })}
                style={{ ...inputStyle, padding: isMobile ? '12px' : '9px 12px' }} />
            </div>
            {tipo === 'Vendida' && (
              <div>
                <label style={labelStyle}>Fecha de Firma</label>
                <input type='date' value={form.fecha_firma} onChange={e => setForm({ ...form, fecha_firma: e.target.value })}
                  style={{ ...inputStyle, padding: isMobile ? '12px' : '9px 12px' }} />
              </div>
            )}
          </div>
        )}

        {/* Comisionable */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div onClick={() => setForm({ ...form, comisionable: !form.comisionable })}
            style={{ width: '48px', height: '26px', borderRadius: '13px', background: form.comisionable ? '#C0203A' : '#ccc', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
            <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '2px', left: form.comisionable ? '24px' : '2px', transition: 'left 0.2s' }} />
          </div>
          <span style={{ fontSize: '14px', color: '#333' }}>Comisionable</span>
        </div>

        {/* Cancelación */}
        {tipo === 'Cancelación' && (
          <div style={{ border: '1px solid #FCEBEB', borderRadius: '8px', padding: '16px', marginBottom: '16px', background: '#fff9f9' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#A32D2D', marginBottom: '12px' }}>Datos de Cancelación</div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Fecha de Cancelación</label>
              <input type='date' value={form.fecha_cancelacion} onChange={e => setForm({ ...form, fecha_cancelacion: e.target.value })} style={{ ...inputStyle, padding: isMobile ? '12px' : '9px 12px' }} />
            </div>
            <div>
              <label style={labelStyle}>Motivo de Cancelación</label>
              <textarea value={form.motivo_cancelacion} onChange={e => setForm({ ...form, motivo_cancelacion: e.target.value })}
                placeholder='Describe el motivo' rows={3} style={{ ...inputStyle, resize: 'vertical', fontSize: '14px' }} />
            </div>
          </div>
        )}

        {/* Cambio de Unidad */}
        {tipo === 'Cambio de Unidad' && (
          <div style={{ border: '1px solid #FFF3CD', borderRadius: '8px', padding: '16px', marginBottom: '16px', background: '#FFFDF0' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#856404', marginBottom: '12px' }}>Datos del Cambio de Unidad</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={labelStyle}>Unidad Inicial</label>
                <input value={form.unidad_numero || ''} readOnly style={{ ...inputStyle, background: '#f9f9f9', color: '#888' }} placeholder='Selecciona arriba' />
              </div>
              <div>
                <label style={labelStyle}>Nueva Unidad</label>
                <select value={form.nueva_unidad_id} onChange={e => {
                  const u = unidadesNuevas.find(x => x.id === e.target.value);
                  setForm({ ...form, nueva_unidad_id: e.target.value, nueva_unidad_numero: u?.numero || '' });
                }} style={inputStyle}>
                  <option value=''>Seleccionar...</option>
                  {unidadesNuevas.map(u => <option key={u.id} value={u.id}>{u.numero}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Nuevo Plan de Pago</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {PLANES_PAGO.map(p => btnPlan(p, p + '_new', true))}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Nuevo Monto (MXN)</label>
              <input type='number' value={form.nuevo_monto} onChange={e => setForm({ ...form, nuevo_monto: e.target.value })} style={inputStyle} placeholder='0' />
            </div>
          </div>
        )}

        {msg && (
          <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '8px', fontSize: '13px',
            background: msg.startsWith('✅') ? '#EAF3DE' : msg.startsWith('🔒') ? '#FFF8E1' : '#FCEBEB',
            color: msg.startsWith('✅') ? '#27500A' : msg.startsWith('🔒') ? '#856404' : '#A32D2D' }}>
            {msg}
          </div>
        )}

        <button onClick={handleGuardar} disabled={guardando || ventanaCerrada}
          style={{ width: '100%', padding: isMobile ? '16px' : '12px', background: ventanaCerrada ? '#ccc' : '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: isMobile ? '16px' : '14px', fontWeight: '600', cursor: ventanaCerrada ? 'not-allowed' : 'pointer' }}>
          {guardando ? 'Registrando...' : ventanaCerrada ? '🔒 Ventana cerrada' : `Registrar ${tipo}`}
        </button>
      </div>
    </div>
  );
}

const labelStyle = { fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '500' };
const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', background: '#fff' };