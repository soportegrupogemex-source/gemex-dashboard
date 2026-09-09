import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';

const ETAPAS = [
  { id: 'Cotización', color: '#F59E0B' },
  { id: 'Cita', color: '#3B82F6' },
  { id: 'Seguimiento', color: '#8B5CF6' },
  { id: 'Apartado', color: '#EC4899' },
  { id: 'Venta', color: '#10B981' },
  { id: 'Escritura', color: '#6366F1' },
  { id: 'Cobranza', color: '#14B8A6' },
  { id: 'Cierre perdido', color: '#EF4444' },
];

const TIEMPO_COMPRA_OPCIONES = ['Inmediato', '1 a 3 meses', '3 a 6 meses', '6 a 12 meses', 'Más de 1 año'];
// FIX: mismo catálogo que ya usa Contactos (MEDIO_OPCIONES en contactos.js)
// para que "Fuente de medio" sea consistente en todo el sistema.
const MEDIO_OPCIONES = ['Autogeneración', 'Mensaje WhatsApp', 'Campañas digitales', 'Referido', 'Portal inmobiliario', 'Showroom'];
const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
const ROLES_VER_TODOS = ['Super Admin', 'Admin', 'Sub Admin'];
const ROLES_GERENTE = ['Gerente Editor', 'Gerente Operador'];
// FIX: Mesa de Control también debe limitarse a sus propios desarrollos
// asignados para el selector/dropdown — pero a diferencia de Editor/
// Operador, además se restringe a "su gente" (ver cargarNegocios).
const ROLES_GERENTE_TODOS = [...ROLES_GERENTE, 'Mesa de Control'];
const ROLES_ASIGNAR = ['Super Admin'];

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export default function Negocios() {
  const isMobile = useIsMobile();
  const [negocios, setNegocios] = useState([]);
  const [contactos, setContactos] = useState([]);
  const [desarrollos, setDesarrollos] = useState([]);
  const [agentes, setAgentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [miAgente, setMiAgente] = useState(null);
  const [miRol, setMiRol] = useState(null);
  const [buscar, setBuscar] = useState('');
  const [filtroDesarrollo, setFiltroDesarrollo] = useState('');
  const [filtroAsesor, setFiltroAsesor] = useState('');
  const [filtroEtapa, setFiltroEtapa] = useState('');
  const [negocioDetalle, setNegocioDetalle] = useState(null);
  const [form, setForm] = useState(formVacio());
  const [dragOver, setDragOver] = useState(null);
  const dragItem = useRef(null);
  const [unidadesForm, setUnidadesForm] = useState([]);
  // FIX: tareas del negocio abierto en el panel de detalle — lista +
  // captura de una nueva (descripción, fecha y hora opcionales). El
  // aviso push (5 min antes y al llegar la hora) lo dispara un cron en
  // la base de datos (revisar_tareas_negocios), no el navegador.
  const [tareas, setTareas] = useState([]);
  const [nuevaTarea, setNuevaTarea] = useState({ descripcion: '', fecha: '', hora: '' });
  const [guardandoTarea, setGuardandoTarea] = useState(false);

  function formVacio() {
    return {
      nombre: '', contacto_id: '', valor: '', etapa: 'Cotización',
      fecha_cierre: '', asesor_ventas: '', asesor_correo: '',
      desarrollo: '', tiempo_compra: '', descripcion: '',
      fuente_medio: '', unidad_id: '', unidad_numero: '',
    };
  }

  useEffect(() => {
    cargarMiAgente();
    cargarAgentes();
  }, []);

  // FIX: cargarDesarrollos ahora depende de miAgente/miRol para poder
  // limitar el dropdown a los desarrollos a cargo de un Gerente.
  useEffect(() => {
    if (miRol !== null) cargarDesarrollos();
  }, [miRol, miAgente]);

  // FIX: cargarContactos ahora también depende de miRol/miAgente — antes
  // traía TODOS los contactos del sistema sin importar quién los ve,
  // dejando elegir en el selector "Contacto" al crear un negocio a
  // clientes de otros asesores. Mismo filtro que ya usa Cotizador.js:
  // Agente/Desarrollador → los suyos; Mesa de Control → él + su equipo,
  // dentro de sus desarrollos a cargo; Gerente Editor/Operador → los
  // suyos + los de sus desarrollos a cargo; Super Admin/Admin/Sub Admin
  // → todos.
  useEffect(() => {
    if (miRol !== null) cargarContactos();
  }, [miRol, miAgente]);

  useEffect(() => {
    if (miRol !== null) cargarNegocios();
  }, [miRol, miAgente, buscar, filtroDesarrollo, filtroAsesor]);

  // FIX: unidades del formulario dependen del desarrollo elegido ahí —
  // se recargan cada vez que cambia, y se limpian si no hay desarrollo.
  useEffect(() => {
    if (showForm && form.desarrollo) cargarUnidadesForm(form.desarrollo);
    else setUnidadesForm([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, form.desarrollo]);

  useEffect(() => {
    if (negocioDetalle?.id) cargarTareas(negocioDetalle.id);
    else setTareas([]);
  }, [negocioDetalle?.id]);

  const cargarMiAgente = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('agentes').select('*').eq('correo', user.email).single();
      setMiAgente(data || null);
      setMiRol(data?.rol || 'Agente');
    } else { setMiRol('Agente'); }
  };

  const cargarContactos = async () => {
    const correo = miAgente?.correo || '';
    const nombreCompleto = miAgente ? `${miAgente.nombre || ''} ${miAgente.apellidos || ''}`.trim() : '';
    const cargo = miAgente?.desarrollos_cargo || [];

    let query = supabase.from('contactos').select('id, nombres, apellidos').order('nombres');

    if (ROLES_VER_TODOS.includes(miRol)) {
      // sin filtro — ve todos
    } else if (miRol === 'Mesa de Control') {
      const agentesCargoCorreos = miAgente?.agentes_cargo || [];
      const { data: equipo } = agentesCargoCorreos.length > 0
        ? await supabase.from('agentes').select('nombre, apellidos').in('correo', agentesCargoCorreos)
        : { data: [] };
      const nombresEquipo = (equipo || []).map(a => `${a.nombre} ${a.apellidos}`.trim());
      const nombresFiltro = [nombreCompleto, ...nombresEquipo].filter(Boolean);
      query = nombresFiltro.length > 0
        ? query.or(`creado_por.eq.${correo},asesor_ventas.in.(${nombresFiltro.map(n => `"${n}"`).join(',')})`)
        : query.eq('creado_por', correo);
      if (cargo.length > 0) query = query.in('desarrollo', cargo);
    } else if (ROLES_GERENTE.includes(miRol)) {
      query = cargo.length > 0
        ? query.or(`creado_por.eq.${correo},desarrollo.in.(${cargo.map(d => `"${d}"`).join(',')})`)
        : query.eq('creado_por', correo);
    } else {
      // Agente, Desarrollador, o cualquier otro rol: solo lo suyo
      query = query.or(`creado_por.eq.${correo},asesor_ventas.eq.${nombreCompleto}`);
    }

    const { data } = await query;
    setContactos(data || []);
  };

  // FIX: el selector de desarrollo (para crear/editar un negocio, y el
  // filtro de arriba) ahora siempre muestra TODOS los desarrollos
  // activos, sin restringirse a desarrollos_cargo — antes, un Gerente sin
  // ningún desarrollo asignado a su cargo se quedaba con el dropdown
  // vacío y no podía capturar un negocio propio ni de un proyecto donde
  // apoya sin tener el cargo formal. La visibilidad real de qué negocios
  // puede VER cada rol la sigue controlando cargarNegocios, esto solo
  // afecta qué opciones aparecen en el desplegable.
  const cargarDesarrollos = async () => {
    const { data } = await supabase.from('desarrollos').select('id, nombre').eq('activo', true).order('nombre');
    setDesarrollos(data || []);
  };

  const cargarAgentes = async () => {
    const { data } = await supabase.from('agentes').select('id, nombre, apellidos, correo, rol').eq('activo', true).order('nombre');
    setAgentes(data || []);
  };

  const cargarUnidadesForm = async (desarrolloNombre) => {
    const dev = desarrollos.find(d => d.nombre === desarrolloNombre);
    if (!dev) { setUnidadesForm([]); return; }
    const { data } = await supabase.from('inventario').select('id, numero').eq('desarrollo_id', dev.id).order('numero');
    setUnidadesForm(data || []);
  };

  const cargarTareas = async (negocioId) => {
    const { data } = await supabase.from('negocio_tareas').select('*').eq('negocio_id', negocioId).order('created_at');
    setTareas(data || []);
  };

  const handleAgregarTarea = async () => {
    if (!nuevaTarea.descripcion.trim() || !negocioDetalle) return;
    setGuardandoTarea(true);
    const { data, error } = await supabase.from('negocio_tareas').insert([{
      negocio_id: negocioDetalle.id,
      descripcion: nuevaTarea.descripcion.trim(),
      fecha: nuevaTarea.fecha || null,
      hora: nuevaTarea.hora || null,
      creado_por: miAgente?.correo || null,
    }]).select().single();
    setGuardandoTarea(false);
    if (!error && data) {
      setTareas(prev => [...prev, data]);
      setNuevaTarea({ descripcion: '', fecha: '', hora: '' });
    }
  };

  const handleToggleTarea = async (tarea) => {
    const { data, error } = await supabase.from('negocio_tareas').update({ completada: !tarea.completada }).eq('id', tarea.id).select().single();
    if (!error && data) setTareas(prev => prev.map(t => t.id === data.id ? data : t));
  };

  const handleEliminarTarea = async (tareaId) => {
    await supabase.from('negocio_tareas').delete().eq('id', tareaId);
    setTareas(prev => prev.filter(t => t.id !== tareaId));
  };

  // FIX: antes cualquier rol que no fuera Super Admin/Admin/Sub Admin
  // (incluidos los Gerentes) solo veía SUS PROPIOS negocios, como si
  // fueran Agente. Ahora los Gerentes ven todos los negocios de los
  // desarrollos que tienen a su cargo, no solo los suyos.
  // FIX BUG: además, un Gerente que trae un negocio propio (por ejemplo
  // sin desarrollo asignado, o de un desarrollo que no tiene a su cargo)
  // no lo veía, porque el filtro era SOLO "desarrollo IN cargo" y no
  // incluía "asesor_correo = él mismo". Ahora se combinan ambas
  // condiciones con OR, igual que ya se hace en Contactos.js.
  const cargarNegocios = async () => {
    setLoading(true);
    let query = supabase.from('negocios').select('*, contactos(nombres, apellidos)').order('created_at', { ascending: false });

    if (ROLES_VER_TODOS.includes(miRol)) {
      // ve todo, sin restricción
    } else if (miRol === 'Mesa de Control') {
      // FIX: Mesa de Control (trabaja para el desarrollador) solo ve
      // negocios de SU GENTE (él + los agentes que tiene a cargo), y
      // solo dentro de sus desarrollos asignados — a diferencia de
      // Gerente Editor/Operador, que ven TODOS los negocios del
      // desarrollo sin importar el asesor. Aquí sí se puede cruzar por
      // correo de forma confiable porque `asesor_correo` ya existe.
      const cargo = miAgente?.desarrollos_cargo || [];
      const correo = miAgente?.correo || '';
      const equipoCorreos = [correo, ...(miAgente?.agentes_cargo || [])];
      if (cargo.length === 0 || !correo) { setNegocios([]); setLoading(false); return; }
      query = query.in('asesor_correo', equipoCorreos).in('desarrollo', cargo);
    } else if (ROLES_GERENTE.includes(miRol)) {
      const cargo = miAgente?.desarrollos_cargo || [];
      const correo = miAgente?.correo || '';
      if (cargo.length > 0 && correo) {
        const listaDesarrollos = cargo.map(d => `"${d.replace(/"/g, '\\"')}"`).join(',');
        query = query.or(`desarrollo.in.(${listaDesarrollos}),asesor_correo.eq.${correo}`);
      } else if (correo) {
        query = query.eq('asesor_correo', correo);
      } else {
        setNegocios([]); setLoading(false); return;
      }
    } else if (miAgente?.correo) {
      query = query.eq('asesor_correo', miAgente.correo);
    } else {
      setNegocios([]); setLoading(false); return;
    }

    if (buscar) query = query.ilike('nombre', `%${buscar}%`);
    if (filtroDesarrollo) query = query.eq('desarrollo', filtroDesarrollo);
    if (filtroAsesor) query = query.eq('asesor_ventas', filtroAsesor);
    const { data, error } = await query;
    if (!error) setNegocios(data || []);
    setLoading(false);
  };

  const handleGuardar = async () => {
    if (!form.nombre.trim()) return;
    setGuardando(true);
    let asesorVentas = form.asesor_ventas;
    let asesorCorreo = form.asesor_correo;
    if (editando) {
      if (ROLES_ASIGNAR.includes(miRol)) {
        asesorVentas = form.asesor_ventas;
        asesorCorreo = form.asesor_correo;
      } else {
        const negocioOriginal = negocios.find(n => n.id === editando);
        asesorVentas = negocioOriginal?.asesor_ventas || form.asesor_ventas;
        asesorCorreo = negocioOriginal?.asesor_correo || form.asesor_correo;
      }
    } else {
      asesorVentas = miAgente ? `${miAgente.nombre} ${miAgente.apellidos}`.trim() : form.asesor_ventas;
      asesorCorreo = miAgente?.correo || '';
    }
    const payload = {
      nombre: form.nombre, contacto_id: form.contacto_id || null,
      valor: form.valor || 0, etapa: form.etapa,
      fecha_cierre: form.fecha_cierre || null, desarrollo: form.desarrollo || null,
      tiempo_compra: form.tiempo_compra || null, descripcion: form.descripcion || null,
      fuente_medio: form.fuente_medio || null,
      unidad_id: form.unidad_id || null, unidad_numero: form.unidad_numero || null,
      asesor_ventas: asesorVentas, asesor_correo: asesorCorreo,
      creado_por: form.creado_por || miAgente?.correo || '',
    };
    let error;
    if (editando) {
      ({ error } = await supabase.from('negocios').update(payload).eq('id', editando));
    } else {
      ({ error } = await supabase.from('negocios').insert([payload]));
    }
    setGuardando(false);
    if (!error) {
      setShowForm(false); setEditando(null); setNegocioDetalle(null); setForm(formVacio()); cargarNegocios();
    } else { alert('Error al guardar: ' + error.message); }
  };

  const handleEliminar = async (id) => {
    if (!window.confirm('¿Eliminar este negocio?')) return;
    await supabase.from('negocios').delete().eq('id', id);
    setNegocioDetalle(null); cargarNegocios();
  };

  const handleCambiarEtapa = async (id, nuevaEtapa) => {
    await supabase.from('negocios').update({ etapa: nuevaEtapa }).eq('id', id);
    cargarNegocios();
  };

  const handleDragStart = (negocio) => { dragItem.current = negocio; };
  const handleDragOver = (e, etapa) => { e.preventDefault(); setDragOver(etapa); };
  const handleDrop = async (e, etapa) => {
    e.preventDefault();
    if (dragItem.current && dragItem.current.etapa !== etapa) await handleCambiarEtapa(dragItem.current.id, etapa);
    setDragOver(null); dragItem.current = null;
  };
  const handleDragEnd = () => { setDragOver(null); dragItem.current = null; };

  const negociosFiltrados = negocios.filter(n =>
    (!buscar || n.nombre?.toLowerCase().includes(buscar.toLowerCase()) ||
      `${n.contactos?.nombres || ''} ${n.contactos?.apellidos || ''}`.toLowerCase().includes(buscar.toLowerCase())) &&
    (!filtroEtapa || n.etapa === filtroEtapa)
  );

  const negociosPorEtapa = (etapa) => negocios.filter(n => n.etapa === etapa && (
    !buscar || n.nombre?.toLowerCase().includes(buscar.toLowerCase()) ||
    `${n.contactos?.nombres || ''} ${n.contactos?.apellidos || ''}`.toLowerCase().includes(buscar.toLowerCase())
  ));

  const totalPorEtapa = (etapa) => negociosPorEtapa(etapa).reduce((sum, n) => sum + Number(n.valor || 0), 0);
  const asesoresUnicos = [...new Set(negocios.map(n => n.asesor_ventas).filter(Boolean))];
  const esSuperAdmin = ROLES_ASIGNAR.includes(miRol);
  // FIX: los Gerentes también ven varios negocios ahora, así que también
  // les sirve el filtro por asesor (antes solo Super Admin/Admin/Sub Admin)
  const puedeFiltrarPorAsesor = ROLES_VER_TODOS.includes(miRol) || ROLES_GERENTE_TODOS.includes(miRol);

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem', height: isMobile ? 'auto' : '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexShrink: 0 }}>
        <div>
          <h2 style={{ fontSize: isMobile ? '17px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '2px' }}>Negocios</h2>
          <div style={{ fontSize: '13px', color: '#888' }}>{negocios.length} negocios</div>
        </div>
        <button onClick={() => {
          setForm({ ...formVacio(), asesor_ventas: miAgente ? `${miAgente.nombre} ${miAgente.apellidos}`.trim() : '', asesor_correo: miAgente?.correo || '' });
          setEditando(null); setShowForm(true);
        }} style={{ ...btnPrimary, padding: isMobile ? '10px 14px' : '8px 16px', fontSize: isMobile ? '14px' : '13px' }}>
          + {isMobile ? 'Nuevo' : 'Crear negocio'}
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexShrink: 0, flexWrap: 'wrap' }}>
        <input placeholder='Buscar...' value={buscar} onChange={e => setBuscar(e.target.value)}
          style={{ padding: isMobile ? '10px 12px' : '7px 12px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', flex: isMobile ? 1 : 'none', width: isMobile ? 'auto' : '160px' }} />
        {isMobile && (
          <select value={filtroEtapa} onChange={e => setFiltroEtapa(e.target.value)}
            style={{ ...filtroStyle, padding: '10px 12px', flex: 1 }}>
            <option value=''>Todas las etapas</option>
            {ETAPAS.map(e => <option key={e.id} value={e.id}>{e.id}</option>)}
          </select>
        )}
        {!isMobile && (
          <>
            <select value={filtroDesarrollo} onChange={e => setFiltroDesarrollo(e.target.value)} style={filtroStyle}>
              <option value=''>Desarrollo</option>
              {desarrollos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
            </select>
            {puedeFiltrarPorAsesor && (
              <select value={filtroAsesor} onChange={e => setFiltroAsesor(e.target.value)} style={filtroStyle}>
                <option value=''>Asesor de ventas</option>
                {asesoresUnicos.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            )}
          </>
        )}
      </div>

      {/* Vista móvil: lista de tarjetas */}
      {isMobile ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Cargando...</div>
          ) : negociosFiltrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#aaa', fontSize: '13px' }}>Sin negocios</div>
          ) : negociosFiltrados.map(n => {
            const etapa = ETAPAS.find(e => e.id === n.etapa);
            return (
              <div key={n.id} onClick={() => { setNegocioDetalle(n); setShowForm(false); }}
                style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '10px', padding: '14px 16px', marginBottom: '8px', cursor: 'pointer', borderLeft: `4px solid ${etapa?.color || '#ccc'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: '#1a1a2e', flex: 1, marginRight: '8px' }}>{n.nombre}</div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: etapa?.color, whiteSpace: 'nowrap' }}>{fmt(n.valor)}</div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: (etapa?.color || '#ccc') + '20', color: etapa?.color }}>{n.etapa}</span>
                  {n.desarrollo && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#f0f0f0', color: '#555' }}>{n.desarrollo}{n.unidad_numero ? ` · ${n.unidad_numero}` : ''}</span>}
                </div>
                {n.contactos && <div style={{ fontSize: '12px', color: '#888' }}>👤 {n.contactos.nombres} {n.contactos.apellidos}</div>}
                {n.fuente_medio && <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>📣 {n.fuente_medio}</div>}
                {n.asesor_ventas && <div style={{ fontSize: '12px', color: '#aaa', marginTop: '2px' }}>👔 {n.asesor_ventas}</div>}
              </div>
            );
          })}
        </div>
      ) : (
        /* Vista desktop: kanban */
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', flex: 1, paddingBottom: '1rem' }}>
          {ETAPAS.map(etapa => {
            const items = negociosPorEtapa(etapa.id);
            const total = totalPorEtapa(etapa.id);
            const isDragOver = dragOver === etapa.id;
            return (
              <div key={etapa.id}
                onDragOver={e => handleDragOver(e, etapa.id)}
                onDrop={e => handleDrop(e, etapa.id)}
                onDragLeave={() => setDragOver(null)}
                style={{ minWidth: '240px', width: '240px', display: 'flex', flexDirection: 'column', background: isDragOver ? '#f0f0f0' : '#f5f5f5', borderRadius: '12px', border: isDragOver ? `2px dashed ${etapa.color}` : '2px solid transparent', transition: 'all 0.15s' }}>
                <div style={{ padding: '12px 14px', borderBottom: '0.5px solid #e0e0e0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: etapa.color }} />
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e' }}>{etapa.id}</span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#888', background: '#fff', padding: '2px 8px', borderRadius: '20px' }}>{items.length}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#888' }}>{fmt(total)}</div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                  {loading ? (
                    <div style={{ fontSize: '12px', color: '#aaa', textAlign: 'center', padding: '1rem' }}>Cargando...</div>
                  ) : items.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#ccc', textAlign: 'center', padding: '1rem' }}>Sin negocios</div>
                  ) : items.map(n => (
                    <div key={n.id}
                      draggable onDragStart={() => handleDragStart(n)} onDragEnd={handleDragEnd}
                      onClick={() => { setNegocioDetalle(n); setShowForm(false); }}
                      style={{ background: '#fff', borderRadius: '8px', padding: '12px', marginBottom: '8px', cursor: 'grab', border: '0.5px solid #e0e0e0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', userSelect: 'none' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e', marginBottom: '4px' }}>{n.nombre}</div>
                      {n.contactos && <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>👤 {n.contactos.nombres} {n.contactos.apellidos}</div>}
                      {n.desarrollo && <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>🏢 {n.desarrollo}{n.unidad_numero ? ` · Unidad ${n.unidad_numero}` : ''}</div>}
                      {n.fuente_medio && <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>📣 {n.fuente_medio}</div>}
                      <div style={{ fontSize: '12px', fontWeight: '600', color: etapa.color }}>{fmt(n.valor)}</div>
                      {n.fecha_cierre && <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>📅 {n.fecha_cierre}</div>}
                      {n.asesor_ventas && <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>👔 {n.asesor_ventas}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Panel detalle */}
      {negocioDetalle && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: isMobile ? '100%' : '400px', height: '100dvh', background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '0.5px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <h3 style={{ fontSize: '16px', fontWeight: '500', margin: 0 }}>Detalle del negocio</h3>
            <button onClick={() => setNegocioDetalle(null)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888' }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#1a1a2e', marginBottom: '4px' }}>{negocioDetalle.nombre}</div>
            <div style={{ display: 'inline-block', padding: '3px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '500', marginBottom: '1.5rem',
              background: ETAPAS.find(e => e.id === negocioDetalle.etapa)?.color + '20',
              color: ETAPAS.find(e => e.id === negocioDetalle.etapa)?.color }}>
              {negocioDetalle.etapa}
            </div>
            {[
              ['Contacto', negocioDetalle.contactos ? `${negocioDetalle.contactos.nombres} ${negocioDetalle.contactos.apellidos}` : '—'],
              ['Valor', fmt(negocioDetalle.valor)],
              ['Desarrollo', negocioDetalle.desarrollo || '—'],
              ['Unidad', negocioDetalle.unidad_numero || '—'],
              ['Fuente de medio', negocioDetalle.fuente_medio || '—'],
              ['Asesor', negocioDetalle.asesor_ventas || '—'],
              ['Tiempo de compra', negocioDetalle.tiempo_compra || '—'],
              ['Fecha de cierre', negocioDetalle.fecha_cierre || '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', padding: '10px 0', borderBottom: '0.5px solid #f5f5f5', fontSize: '13px' }}>
                <span style={{ width: '140px', color: '#888', flexShrink: 0 }}>{label}</span>
                <span style={{ color: '#333', fontWeight: label === 'Valor' ? '600' : '400' }}>{val}</span>
              </div>
            ))}
            {negocioDetalle.descripcion && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>DESCRIPCIÓN</div>
                <div style={{ fontSize: '13px', color: '#333', lineHeight: '1.6' }}>{negocioDetalle.descripcion}</div>
              </div>
            )}
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>MOVER A ETAPA</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {ETAPAS.filter(e => e.id !== negocioDetalle.etapa).map(e => (
                  <button key={e.id} onClick={() => { handleCambiarEtapa(negocioDetalle.id, e.id); setNegocioDetalle({ ...negocioDetalle, etapa: e.id }); }}
                    style={{ padding: '6px 14px', borderRadius: '20px', border: `0.5px solid ${e.color}`, background: 'transparent', color: e.color, fontSize: '13px', cursor: 'pointer' }}>
                    {e.id}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>TAREAS</div>
              <input placeholder='Nueva tarea...' value={nuevaTarea.descripcion}
                onChange={e => setNuevaTarea(t => ({ ...t, descripcion: e.target.value }))}
                style={{ ...inputStyle, marginBottom: '8px' }} />
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input type='date' value={nuevaTarea.fecha} onChange={e => setNuevaTarea(t => ({ ...t, fecha: e.target.value }))}
                  style={{ ...inputStyle, flex: 1 }} />
                <input type='time' value={nuevaTarea.hora} onChange={e => setNuevaTarea(t => ({ ...t, hora: e.target.value }))}
                  style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px' }}>
                Fecha y hora son opcionales — si las pones, te llega un aviso 5 minutos antes y al llegar la hora.
              </div>
              <button onClick={handleAgregarTarea} disabled={guardandoTarea || !nuevaTarea.descripcion.trim()}
                style={{ ...btnPrimary, width: '100%', justifyContent: 'center', padding: '10px', marginBottom: '1rem' }}>
                {guardandoTarea ? 'Agregando...' : 'Agregar tarea'}
              </button>
              {tareas.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#aaa', textAlign: 'center', padding: '0.5rem 0' }}>Sin tareas aún</div>
              ) : tareas.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 0', borderBottom: '0.5px solid #f5f5f5' }}>
                  <input type='checkbox' checked={!!t.completada} onChange={() => handleToggleTarea(t)} style={{ marginTop: '3px', cursor: 'pointer' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', color: t.completada ? '#aaa' : '#333', textDecoration: t.completada ? 'line-through' : 'none' }}>{t.descripcion}</div>
                    {(t.fecha || t.hora) && (
                      <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>
                        {t.fecha ? new Date(t.fecha + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
                        {t.hora ? ` ${t.hora.slice(0, 5)}` : ''}
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleEliminarTarea(t.id)} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '13px' }}>✕</button>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #f0f0f0', flexShrink: 0, display: 'flex', gap: '8px' }}>
            <button onClick={() => {
              setForm({ ...formVacio(), ...negocioDetalle });
              setEditando(negocioDetalle.id);
              setNegocioDetalle(null);
              setShowForm(true);
            }} style={{ ...btnPrimary, flex: 1, justifyContent: 'center', padding: '12px' }}>Editar</button>
            <button onClick={() => handleEliminar(negocioDetalle.id)}
              style={{ padding: '12px 16px', background: '#FCEBEB', color: '#A32D2D', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
              Eliminar
            </button>
          </div>
        </div>
      )}

      {/* Panel crear/editar */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: isMobile ? '100%' : '400px', height: '100dvh', background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '0.5px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <h3 style={{ fontSize: '16px', fontWeight: '500', margin: 0 }}>{editando ? 'Editar negocio' : 'Crear negocio'}</h3>
            <button onClick={() => { setShowForm(false); setEditando(null); }} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888' }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Nombre del negocio <span style={{ color: '#e53e3e' }}>*</span></label>
              <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Contacto</label>
              <select value={form.contacto_id} onChange={e => setForm({ ...form, contacto_id: e.target.value })} style={inputStyle}>
                <option value=''>Selecciona...</option>
                {contactos.map(c => <option key={c.id} value={c.id}>{c.nombres} {c.apellidos}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Valor del negocio</label>
              <input type='number' value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} style={inputStyle} placeholder='$0' />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Etapa</label>
              <select value={form.etapa} onChange={e => setForm({ ...form, etapa: e.target.value })} style={inputStyle}>
                {ETAPAS.map(e => <option key={e.id} value={e.id}>{e.id}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Fecha de cierre</label>
              <input type='date' value={form.fecha_cierre} onChange={e => setForm({ ...form, fecha_cierre: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>
                Asesor de ventas {esSuperAdmin && editando && <span style={{ color: '#3B82F6', fontWeight: '400' }}>(puedes reasignar)</span>}
              </label>
              {esSuperAdmin && editando ? (
                <select value={form.asesor_correo} onChange={e => {
                  const agente = agentes.find(a => a.correo === e.target.value);
                  setForm({ ...form, asesor_correo: e.target.value, asesor_ventas: agente ? `${agente.nombre} ${agente.apellidos}`.trim() : '' });
                }} style={inputStyle}>
                  <option value=''>Selecciona un asesor...</option>
                  {agentes.map(a => <option key={a.id} value={a.correo}>{a.nombre} {a.apellidos} ({a.rol})</option>)}
                </select>
              ) : (
                <input value={editando ? (form.asesor_ventas || '—') : (miAgente ? `${miAgente.nombre} ${miAgente.apellidos}`.trim() : '')}
                  readOnly style={{ ...inputStyle, background: '#f9f9f9', color: '#888', cursor: 'not-allowed' }} />
              )}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Desarrollo</label>
              <select value={form.desarrollo} onChange={e => setForm({ ...form, desarrollo: e.target.value, unidad_id: '', unidad_numero: '' })} style={inputStyle}>
                <option value=''>Selecciona...</option>
                {desarrollos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Unidad</label>
              <select value={form.unidad_id} disabled={!form.desarrollo} onChange={e => {
                const u = unidadesForm.find(x => x.id === e.target.value);
                setForm({ ...form, unidad_id: e.target.value, unidad_numero: u?.numero || '' });
              }} style={{ ...inputStyle, background: form.desarrollo ? '#fff' : '#f9f9f9' }}>
                <option value=''>{form.desarrollo ? 'Selecciona...' : 'Elige primero un desarrollo'}</option>
                {unidadesForm.map(u => <option key={u.id} value={u.id}>{u.numero}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Fuente de medio</label>
              <select value={form.fuente_medio} onChange={e => setForm({ ...form, fuente_medio: e.target.value })} style={inputStyle}>
                <option value=''>Elige una opción...</option>
                {MEDIO_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Tiempo de compra</label>
              <select value={form.tiempo_compra} onChange={e => setForm({ ...form, tiempo_compra: e.target.value })} style={inputStyle}>
                <option value=''>Elige una opción...</option>
                {TIEMPO_COMPRA_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Descripción</label>
              <textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={3}
                style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>
          <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #f0f0f0', flexShrink: 0 }}>
            <button onClick={handleGuardar} disabled={guardando}
              style={{ ...btnPrimary, width: '100%', padding: '14px', justifyContent: 'center', fontSize: '15px' }}>
              {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear negocio'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary = { background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '500', display: 'flex', alignItems: 'center' };
const filtroStyle = { padding: '7px 12px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', background: '#fff' };
const labelStyle = { fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' };
const inputStyle = { width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', background: '#fff' };