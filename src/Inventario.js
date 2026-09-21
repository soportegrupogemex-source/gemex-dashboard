import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import Cotizador from './Cotizador';

const ESTATUS_OPCIONES = ['Libre', 'Bloqueado', 'Apartado', 'Vendido'];
const ORIENTACION_OPCIONES = ['', 'Norte', 'Sur', 'Este', 'Oeste', 'Noreste', 'Noroeste', 'Sureste', 'Suroeste'];
const OPCIONES_NUM = ['','0','1','1.5','1 a 2','1 a 3','1 a 4','2 a 3','2 a 4','2','2.5','3 a 4','3 a 5','3','3.5','4 a 5','4','4.5','5'];
const colorEstatus = { Libre: '#27500A', Bloqueado: '#7A5900', Apartado: '#7A3900', Vendido: '#A32D2D' };
const bgEstatus = { Libre: '#EAF3DE', Bloqueado: '#FFF8E1', Apartado: '#FFF3E0', Vendido: '#FCEBEB' };

// FIX: "No." de unidad puede traer una letra de torre/edificio antes del
// número (ej. "A101"). parseFloat("A101") da NaN para todas por igual,
// así que el orden por número quedaba sin efecto real. Se separa el
// prefijo de letras del número y se compara primero por letra, luego
// por número (A101, A102... B101, B102...).
const parseNumeroUnidad = (numero) => {
  const str = String(numero || '');
  const match = str.match(/^([A-Za-z]*)(\d*)/);
  return {
    prefijo: match ? match[1].toUpperCase() : '',
    num: match && match[2] ? parseInt(match[2], 10) : 0,
  };
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

function filaVacia(estructura) {
  return {
    estatus: 'Libre', numero: '', tipologia: '', nivel: '', orientacion: '',
    recamaras: '', estacionamiento: '', banos: '', m2_bodega: 0,
    sumar_m2_bodega: false, m2_interior: 0, m2_terraza: 0,
    m2_total: 0, precio_lista: 0, precio_m2: 0, detalles: '', estructura: estructura || ''
  };
}

function calcularTotales(fila) {
  const interior = parseFloat(fila.m2_interior) || 0;
  const terraza = parseFloat(fila.m2_terraza) || 0;
  const bodega = parseFloat(fila.m2_bodega) || 0;
  const total = Math.round((interior + terraza + (fila.sumar_m2_bodega ? bodega : 0)) * 100) / 100;
  const precioM2 = total > 0 ? Math.round((parseFloat(fila.precio_lista) || 0) / total) : 0;
  return { m2_total: total, precio_m2: precioM2 };
}

export default function Inventario({ desarrollo, onBack }) {
  const isMobile = useIsMobile();
  const [unidades, setUnidades] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [filtroEstatus, setFiltroEstatus] = useState('');
  const [filtroTipologia, setFiltroTipologia] = useState('');
  const [filtroNivel, setFiltroNivel] = useState('');
  const [ordenCol, setOrdenCol] = useState('numero');
  const [ordenDir, setOrdenDir] = useState('asc');
  const [showForm, setShowForm] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(formVacio());
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [showComparar, setShowComparar] = useState(false);
  const [menuEstatus, setMenuEstatus] = useState(null);
  const [menuAccion, setMenuAccion] = useState(null);
  const [pagina, setPagina] = useState(0);
  const [unidadCotizar, setUnidadCotizar] = useState(null);
  const [unidadesComparaCotizar, setUnidadesComparaCotizar] = useState(null);
  // FIX: si el desarrollo tiene torres/etapas, arranca con la primera
  // seleccionada por default (en vez de null) — evita mezclar unidades y
  // planes de varias torres a la vez, que era lo que causaba los planes
  // duplicados en la tabla.
  const [estructuraSel, setEstructuraSel] = useState(desarrollo.tiene_etapas ? `${desarrollo.tipo_estructura} 1` : null);
  const [unidadDetalle, setUnidadDetalle] = useState(null);
  const [showFiltros, setShowFiltros] = useState(false);
  const [miRol, setMiRol] = useState(null);
  const [miNombre, setMiNombre] = useState('');
  const [misDesarrollosCargo, setMisDesarrollosCargo] = useState([]);
  const [editandoPrecio, setEditandoPrecio] = useState(null);
  const [precioTemp, setPrecioTemp] = useState('');
  // FIX: "Comparar" en móvil — antes solo existía en escritorio (el botón
  // y el panel vivían dentro de un bloque `{!isMobile && ...}`). Se agrega
  // un modo de selección activado con "mantener presionada" una tarjeta,
  // más una barra flotante y una pantalla completa de comparación.
  const [seleccionModoMobile, setSeleccionModoMobile] = useState(false);
  const [showCompararMobile, setShowCompararMobile] = useState(false);
  const longPressTimerRef = useRef(null);
  const longPressActivadoRef = useRef(false);

  // Carga masiva
  const [showMasiva, setShowMasiva] = useState(false);
  const [numUnidades, setNumUnidades] = useState(10);
  const [estructuraMasiva, setEstructuraMasiva] = useState('');
  const [filasMasivas, setFilasMasivas] = useState([]);
  const [guardandoMasivo, setGuardandoMasivo] = useState(false);
  const [msgMasivo, setMsgMasivo] = useState('');

  const POR_PAGINA = 1000;

  function formVacio() {
    return {
      numero: '', tipologia: '', nivel: '', superficie: 0, precio: 0,
      estatus: 'Libre', orientacion: '', recamaras: '', estacionamiento: '',
      banos: '', m2_bodega: 0, sumar_m2_bodega: false, m2_interior: 0,
      m2_terraza: 0, m2_total: 0, precio_lista: 0, precio_m2: 0,
      detalles: '', notas: '', posicion: '', estructura: ''
    };
  }

  useEffect(() => { cargarMiRol(); }, []);
  useEffect(() => { cargarUnidades(); cargarPlanes(); }, [filtroEstatus, filtroTipologia, filtroNivel, ordenCol, ordenDir, estructuraSel]);

  useEffect(() => {
    const interior = parseFloat(form.m2_interior) || 0;
    const terraza = parseFloat(form.m2_terraza) || 0;
    const bodega = parseFloat(form.m2_bodega) || 0;
    const total = Math.round((interior + terraza + (form.sumar_m2_bodega ? bodega : 0)) * 100) / 100;
    const precioM2 = total > 0 ? Math.round((parseFloat(form.precio_lista) || 0) / total) : 0;
    setForm(f => ({ ...f, m2_total: total, precio_m2: precioM2 }));
  }, [form.m2_interior, form.m2_terraza, form.m2_bodega, form.sumar_m2_bodega, form.precio_lista]);

  const cargarMiRol = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('agentes').select('rol, nombre, apellidos, desarrollos_cargo').eq('correo', user.email).single();
      setMiRol(data?.rol || 'Agente');
      setMiNombre(data ? `${data.nombre || ''} ${data.apellidos || ''}`.trim() : user.email);
      setMisDesarrollosCargo(data?.desarrollos_cargo || []);
    }
  };

  // FIX: Mesa de Control es responsable de precios/estatus/planes SOLO en
  // los desarrollos que tiene asignados a su cargo — a diferencia de
  // Super Admin/Admin que pueden en cualquier desarrollo.
  const esMesaControlDeEsteDesarrollo = miRol === 'Mesa de Control' && misDesarrollosCargo.includes(desarrollo.nombre);
  const puedeGestionarEstatus = miRol === 'Super Admin' || miRol === 'Admin' || esMesaControlDeEsteDesarrollo;
  // FIX: los precios (precio de lista, en línea, en el formulario y en la
  // carga masiva) solo los mueve Super Admin — Admin y Mesa de Control
  // conservan el resto de la gestión del inventario (estatus, datos de la
  // unidad), pero no el precio.
  const puedeCambiarPrecio = miRol === 'Super Admin';
  const puedeVerPrecioOculto = miRol === 'Super Admin';
  // FIX BUG DE SEGURIDAD: antes los botones "+ Cargar unidad", "Editar" y
  // "Eliminar" (menú "···" en escritorio y panel de detalle en móvil) no
  // tenían NINGÚN candado de rol — cualquier Agente podía crear, editar o
  // borrar unidades de inventario con solo entrar a la pantalla. Solo
  // "Cambiar estatus" y el precio en línea sí estaban protegidos. Se usa
  // el mismo set de roles que ya gestiona estatus/precio, y además se
  // agrega el mismo candado DENTRO de handleGuardar/handleEditar/
  // handleEliminar como respaldo, no solo ocultando el botón en pantalla.
  const puedeEditarInventario = puedeGestionarEstatus;

  const precioVisible = (u) => {
    if (u.estatus === 'Vendido' || u.estatus === 'Apartado') return puedeVerPrecioOculto;
    return true;
  };

  // FIX: cargarPlanes ahora filtra por la torre/etapa seleccionada
  // (estructuraSel), igual que ya hace Planes.js y Cotizador.js. Antes
  // traía TODOS los planes del desarrollo sin importar la torre, lo que
  // duplicaba columnas cuando cada torre tiene sus propios planes.
  const cargarPlanes = async () => {
    let query = supabase.from('planes_pago').select('*').eq('desarrollo_id', desarrollo.id).eq('activo', true);
    if (desarrollo.tiene_etapas && estructuraSel) query = query.eq('estructura', estructuraSel);
    const { data } = await query.order('created_at');
    setPlanes(data || []);
  };

  const cargarUnidades = async () => {
    setLoading(true);
    let query = supabase.from('inventario').select('*').eq('desarrollo_id', desarrollo.id);
    if (filtroEstatus) query = query.eq('estatus', filtroEstatus);
    if (filtroTipologia) query = query.eq('tipologia', filtroTipologia);
    if (filtroNivel) query = query.eq('nivel', filtroNivel);
    if (estructuraSel) query = query.eq('estructura', estructuraSel);
    if (!ordenCol.startsWith('plan_') && ordenCol !== 'numero') {
      query = query.order(ordenCol, { ascending: ordenDir === 'asc' });
    }
    // FIX: Supabase limita a 1000 filas por defecto. Un desarrollo con más
// de 1000 unidades se truncaría silenciosamente. .limit(5000) cubre
// holgadamente el inventario actual y el crecimiento futuro.
const { data } = await query.limit(5000);
    setUnidades(data || []);
    setLoading(false);
  };

  const calcularPlan = (plan, precio) => {
    const precioConPreventa = precio * (1 - plan.descuento_preventa / 100);
    const precioConDescuento = precioConPreventa * (1 - plan.descuento_plan / 100);
    const enganche = precioConDescuento * plan.enganche / 100;
    const duranteObra = precioConDescuento * plan.durante_obra / 100;
    const restoPorc = 100 - plan.enganche - plan.durante_obra;
    const resto = precioConDescuento * restoPorc / 100;
    const mensualidad = plan.meses_plan > 0 ? duranteObra / plan.meses_plan : 0;
    return { precioConDescuento, enganche, duranteObra, mensualidad, restoPorc, resto };
  };

  const fmt = (n) => `$${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;

  const handleGuardar = async () => {
    if (!puedeEditarInventario) return; // FIX: respaldo de seguridad
    setGuardando(true);
    // Sin permiso de precio: al editar no se toca el precio; al crear
    // la unidad queda en 0 hasta que Super Admin le ponga precio.
    const { precio_lista: _pl, precio_m2: _pm, ...formSinPrecio } = form;
    if (editandoId) await supabase.from('inventario').update(puedeCambiarPrecio ? form : formSinPrecio).eq('id', editandoId);
    else await supabase.from('inventario').insert([{ ...(puedeCambiarPrecio ? form : { ...formSinPrecio, precio_lista: 0, precio_m2: 0 }), desarrollo_id: desarrollo.id }]);
    setGuardando(false);
    setShowForm(false); setEditandoId(null); setForm(formVacio());
    cargarUnidades();
  };

  const handleEditar = (u) => {
    if (!puedeEditarInventario) return; // FIX: respaldo de seguridad
    setForm({ ...formVacio(), ...u });
    setEditandoId(u.id); setShowForm(true); setMenuAccion(null); setUnidadDetalle(null);
  };

  const handleEliminar = async (id) => {
    if (!puedeEditarInventario) return; // FIX: respaldo de seguridad
    if (!window.confirm('¿Eliminar esta unidad?')) return;
    await supabase.from('inventario').delete().eq('id', id);
    setMenuAccion(null); setUnidadDetalle(null);
    cargarUnidades();
  };

  const handleCambiarEstatus = async (id, nuevoEstatus) => {
    await supabase.from('inventario').update({ estatus: nuevoEstatus }).eq('id', id);
    setMenuEstatus(null);
    if (unidadDetalle?.id === id) setUnidadDetalle(prev => ({ ...prev, estatus: nuevoEstatus }));
    cargarUnidades();
  };

  // FIX: registra quién y cuándo hizo el último cambio de precio —
  // solo visible para Super Admin en la tabla (columna "Editado por").
  const handleGuardarPrecio = async (id) => {
    if (!puedeCambiarPrecio) return; // FIX: respaldo de seguridad
    const nuevo = parseFloat(precioTemp);
    if (!isNaN(nuevo) && nuevo > 0) {
      const m2Total = unidades.find(u => u.id === id)?.m2_total || 0;
      const precioM2 = m2Total > 0 ? Math.round(nuevo / m2Total) : 0;
      await supabase.from('inventario').update({
        precio_lista: nuevo, precio_m2: precioM2,
        precio_editado_por: miNombre || '', precio_editado_en: new Date().toISOString(),
      }).eq('id', id);
      cargarUnidades();
    }
    setEditandoPrecio(null);
    setPrecioTemp('');
  };

  const handleOrden = (col) => {
    if (ordenCol === col) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setOrdenCol(col); setOrdenDir('asc'); }
  };

  const flecha = (col) => ordenCol === col ? (ordenDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';

  const handleSeleccionar = (id) => {
    setSeleccionadas(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // FIX: handlers para "mantener presionada" una tarjeta en móvil y activar
  // el modo de selección para comparar.
  const handleLongPressStart = (u) => {
    longPressActivadoRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressActivadoRef.current = true;
      setSeleccionModoMobile(true);
      handleSeleccionar(u.id);
      if (navigator.vibrate) navigator.vibrate(15);
    }, 450);
  };

  const handleLongPressEnd = () => {
    clearTimeout(longPressTimerRef.current);
  };

  const handleTapTarjetaMobile = (u) => {
    // Si el "mantener presionado" ya activó la selección, el click que
    // sigue al soltar el dedo no debe hacer nada más (evita abrir el
    // detalle justo después de seleccionar).
    if (longPressActivadoRef.current) { longPressActivadoRef.current = false; return; }
    if (seleccionModoMobile) { handleSeleccionar(u.id); return; }
    setUnidadDetalle(u);
  };

  const handleCancelarSeleccionMobile = () => {
    setSeleccionModoMobile(false);
    setSeleccionadas([]);
    setShowCompararMobile(false);
  };

  const handleExportar = () => {
    const datos = unidadesFiltradas.map(u => ({
      'No.': u.numero, 'Tipología': u.tipologia, 'Nivel': u.nivel,
      'Superficie m²': u.superficie, 'Precio Lista': u.precio_lista,
      'Precio m²': u.precio_m2, 'Estatus': u.estatus,
      'Recámaras': u.recamaras, 'Baños': u.banos,
      'Estacionamiento': u.estacionamiento, 'Orientación': u.orientacion,
      'm² Interior': u.m2_interior, 'm² Terraza': u.m2_terraza,
      'm² Total': u.m2_total, 'm² Bodega': u.m2_bodega,
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf]), `${desarrollo.nombre}_inventario.xlsx`);
  };

  // --- CARGA MASIVA ---
  const handleAbrirMasiva = () => {
    const est = desarrollo.tiene_etapas ? `${desarrollo.tipo_estructura} 1` : '';
    setEstructuraMasiva(est);
    setFilasMasivas(Array.from({ length: 10 }, () => filaVacia(est)));
    setNumUnidades(10);
    setMsgMasivo('');
    setShowMasiva(true);
  };

  const handleNumUnidades = (n) => {
    const num = Math.max(1, Math.min(200, parseInt(n) || 1));
    setNumUnidades(num);
    setFilasMasivas(prev => {
      if (num > prev.length) {
        return [...prev, ...Array.from({ length: num - prev.length }, () => filaVacia(estructuraMasiva))];
      }
      return prev.slice(0, num);
    });
  };

  const handleEstructuraMasiva = (est) => {
    setEstructuraMasiva(est);
    setFilasMasivas(prev => prev.map(f => ({ ...f, estructura: est })));
  };

  const handleCampoFila = (idx, campo, valor) => {
    setFilasMasivas(prev => {
      const nueva = [...prev];
      nueva[idx] = { ...nueva[idx], [campo]: valor };
      if (['m2_interior', 'm2_terraza', 'm2_bodega', 'sumar_m2_bodega', 'precio_lista'].includes(campo)) {
        const totales = calcularTotales(nueva[idx]);
        nueva[idx] = { ...nueva[idx], ...totales };
      }
      return nueva;
    });
  };

  const handleGuardarMasivo = async () => {
    if (!puedeEditarInventario) return; // FIX: respaldo de seguridad
    const validas = filasMasivas.filter(f => f.numero.toString().trim() !== '');
    if (validas.length === 0) { setMsgMasivo('Agrega al menos un número de unidad.'); return; }
    setGuardandoMasivo(true);
    setMsgMasivo('');
    const registros = validas.map(f => ({
      desarrollo_id: desarrollo.id,
      estatus: f.estatus || 'Libre',
      numero: f.numero.toString().trim(),
      tipologia: f.tipologia || '',
      nivel: f.nivel || '',
      orientacion: f.orientacion || '',
      recamaras: f.recamaras || '',
      estacionamiento: f.estacionamiento || '',
      banos: f.banos || '',
      m2_bodega: parseFloat(f.m2_bodega) || 0,
      sumar_m2_bodega: f.sumar_m2_bodega || false,
      m2_interior: parseFloat(f.m2_interior) || 0,
      m2_terraza: parseFloat(f.m2_terraza) || 0,
      m2_total: f.m2_total || 0,
      precio_lista: puedeCambiarPrecio ? (parseFloat(f.precio_lista) || 0) : 0,
      precio_m2: puedeCambiarPrecio ? (f.precio_m2 || 0) : 0,
      detalles: f.detalles || '',
      estructura: f.estructura || '',
    }));
    const { error } = await supabase.from('inventario').insert(registros);
    setGuardandoMasivo(false);
    if (error) {
      setMsgMasivo('Error al guardar: ' + error.message);
    } else {
      setMsgMasivo(`✅ ${registros.length} unidades cargadas correctamente`);
      setTimeout(() => { setShowMasiva(false); cargarUnidades(); }, 1500);
    }
  };

  const conteos = {
    Libre: unidades.filter(u => u.estatus === 'Libre').length,
    Bloqueado: unidades.filter(u => u.estatus === 'Bloqueado').length,
    Apartado: unidades.filter(u => u.estatus === 'Apartado').length,
    Vendido: unidades.filter(u => u.estatus === 'Vendido').length,
  };

  const tipologias = [...new Set(unidades.map(u => u.tipologia).filter(Boolean))];
  const niveles = [...new Set(unidades.map(u => u.nivel).filter(Boolean))].sort((a, b) => a - b);

  const unidadesFiltradas = (() => {
    let lista = unidades.filter(u =>
      !buscar || u.numero?.toLowerCase().includes(buscar.toLowerCase()) || u.tipologia?.toLowerCase().includes(buscar.toLowerCase())
    );
    if (ordenCol === 'numero') {
      lista = [...lista].sort((a, b) => {
        const pa = parseNumeroUnidad(a.numero);
        const pb = parseNumeroUnidad(b.numero);
        const cmp = pa.prefijo.localeCompare(pb.prefijo) || (pa.num - pb.num);
        return ordenDir === 'asc' ? cmp : -cmp;
      });
    } else if (ordenCol.startsWith('plan_')) {
      const planId = ordenCol.replace('plan_', '');
      const plan = planes.find(p => p.id === planId);
      if (plan) {
        lista = [...lista].sort((a, b) => {
          const va = calcularPlan(plan, a.precio_lista || 0).precioConDescuento;
          const vb = calcularPlan(plan, b.precio_lista || 0).precioConDescuento;
          return ordenDir === 'asc' ? va - vb : vb - va;
        });
      }
    }
    return lista;
  })();

  const unidadesPagina = unidadesFiltradas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const unidadesComparar = unidades.filter(u => seleccionadas.includes(u.id));
  // FIX: +1 al colSpan cuando se agrega la columna "Editado por" (Super Admin)
  const colSpanTotal = 7 + planes.length + 1 + 1 + 1 + (miRol === 'Super Admin' ? 1 : 0);

  const inp = (label, key, type = 'text', readOnly = false) => (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
        readOnly={readOnly}
        style={{ width: '100%', padding: isMobile ? '10px' : '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px', boxSizing: 'border-box', background: readOnly ? '#f9f9f9' : '#fff' }} />
    </div>
  );

  const sel = (label, key, opciones) => (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>{label}</label>
      <select value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
        style={{ width: '100%', padding: isMobile ? '10px' : '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px', background: '#fff' }}>
        <option value=''>Elige una opción...</option>
        {opciones.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  if (unidadCotizar) return <Cotizador unidad={unidadCotizar} desarrollo={desarrollo} onClose={() => setUnidadCotizar(null)} />;
  if (unidadesComparaCotizar) return <Cotizador unidades={unidadesComparaCotizar} desarrollo={desarrollo} onClose={() => setUnidadesComparaCotizar(null)} />;

  // ---- MODAL CARGA MASIVA ----
  if (showMasiva) {
    const inpCell = (idx, campo, type = 'text') => (
      <input type={type}
        value={filasMasivas[idx][campo]}
        onChange={e => handleCampoFila(idx, campo, type === 'number' ? e.target.value : e.target.value)}
        style={{ width: '100%', padding: '4px 6px', border: '0.5px solid #ddd', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
    );
    const selCell = (idx, campo, opciones) => (
      <select value={filasMasivas[idx][campo]}
        onChange={e => handleCampoFila(idx, campo, e.target.value)}
        style={{ width: '100%', padding: '4px 6px', border: '0.5px solid #ddd', borderRadius: '4px', fontSize: '12px', background: '#fff' }}>
        {opciones.map(o => <option key={o} value={o}>{o || '—'}</option>)}
      </select>
    );

    return (
      <div style={{ padding: '1.5rem', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1a1a2e', marginBottom: '4px' }}>Carga masiva — {desarrollo.nombre}</h2>
            <div style={{ fontSize: '13px', color: '#888' }}>Llena los datos y presiona "Cargar unidades" al finalizar</div>
          </div>
          <button onClick={() => setShowMasiva(false)}
            style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#888' }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Número de unidades</label>
            <input type='number' min={1} max={200} value={numUnidades}
              onChange={e => handleNumUnidades(e.target.value)}
              style={{ width: '100px', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', fontWeight: '600', textAlign: 'center' }} />
          </div>
          {desarrollo.tiene_etapas && (
            <div>
              <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>{desarrollo.tipo_estructura}</label>
              <select value={estructuraMasiva} onChange={e => handleEstructuraMasiva(e.target.value)}
                style={{ padding: '8px 12px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', background: '#fff' }}>
                {Array.from({ length: desarrollo.num_estructuras || 1 }, (_, i) => (
                  <option key={i} value={`${desarrollo.tipo_estructura} ${i + 1}`}>{desarrollo.tipo_estructura} {i + 1}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={{ overflowX: 'auto', background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                <th style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: '500', textAlign: 'center' }}>#</th>
                <th style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: '500' }}>Estatus</th>
                <th style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: '500' }}>No. Unidad*</th>
                <th style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: '500' }}>Tipología</th>
                <th style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: '500' }}>Nivel</th>
                <th style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: '500' }}>Orientación</th>
                <th style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: '500' }}>Recámaras</th>
                <th style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: '500' }}>Estac.</th>
                <th style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: '500' }}>Baños</th>
                <th style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: '500' }}>m² Bodega</th>
                <th style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: '500' }}>+Bodega</th>
                <th style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: '500' }}>m² Interior</th>
                <th style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: '500' }}>m² Terraza</th>
                <th style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: '500', background: '#2d2d4e' }}>m² Total</th>
                <th style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: '500' }}>Precio Lista</th>
                <th style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: '500', background: '#2d2d4e' }}>Precio m²</th>
                <th style={{ padding: '10px 8px', whiteSpace: 'nowrap', fontWeight: '500' }}>Detalles</th>
              </tr>
            </thead>
            <tbody>
              {filasMasivas.map((fila, idx) => (
                <tr key={idx} style={{ borderBottom: '0.5px solid #f0f0f0', background: idx % 2 === 0 ? '#fafafa' : '#fff' }}>
                  <td style={{ padding: '6px 8px', textAlign: 'center', color: '#888', fontSize: '11px' }}>{idx + 1}</td>
                  <td style={{ padding: '6px 8px', minWidth: '90px' }}>{selCell(idx, 'estatus', ESTATUS_OPCIONES)}</td>
                  <td style={{ padding: '6px 8px', minWidth: '80px' }}>{inpCell(idx, 'numero')}</td>
                  <td style={{ padding: '6px 8px', minWidth: '80px' }}>{inpCell(idx, 'tipologia')}</td>
                  <td style={{ padding: '6px 8px', minWidth: '60px' }}>{inpCell(idx, 'nivel')}</td>
                  <td style={{ padding: '6px 8px', minWidth: '100px' }}>{selCell(idx, 'orientacion', ORIENTACION_OPCIONES)}</td>
                  <td style={{ padding: '6px 8px', minWidth: '80px' }}>{selCell(idx, 'recamaras', OPCIONES_NUM)}</td>
                  <td style={{ padding: '6px 8px', minWidth: '80px' }}>{selCell(idx, 'estacionamiento', OPCIONES_NUM)}</td>
                  <td style={{ padding: '6px 8px', minWidth: '80px' }}>{selCell(idx, 'banos', OPCIONES_NUM)}</td>
                  <td style={{ padding: '6px 8px', minWidth: '80px' }}>{inpCell(idx, 'm2_bodega', 'number')}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <input type='checkbox' checked={fila.sumar_m2_bodega}
                      onChange={e => handleCampoFila(idx, 'sumar_m2_bodega', e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                  </td>
                  <td style={{ padding: '6px 8px', minWidth: '80px' }}>{inpCell(idx, 'm2_interior', 'number')}</td>
                  <td style={{ padding: '6px 8px', minWidth: '80px' }}>{inpCell(idx, 'm2_terraza', 'number')}</td>
                  <td style={{ padding: '6px 8px', minWidth: '80px', background: '#f0f0f8' }}>
                    <input readOnly value={fila.m2_total}
                      style={{ width: '100%', padding: '4px 6px', border: '0.5px solid #ddd', borderRadius: '4px', fontSize: '12px', background: '#f0f0f8', boxSizing: 'border-box' }} />
                  </td>
                  <td style={{ padding: '6px 8px', minWidth: '100px' }}>{puedeCambiarPrecio ? inpCell(idx, 'precio_lista', 'number') : <span style={{ fontSize: '12px', color: '#aaa' }}>solo Super Admin</span>}</td>
                  <td style={{ padding: '6px 8px', minWidth: '80px', background: '#f0f0f8' }}>
                    <input readOnly value={fila.precio_m2}
                      style={{ width: '100%', padding: '4px 6px', border: '0.5px solid #ddd', borderRadius: '4px', fontSize: '12px', background: '#f0f0f8', boxSizing: 'border-box' }} />
                  </td>
                  <td style={{ padding: '6px 8px', minWidth: '140px' }}>
                    <input value={fila.detalles}
                      onChange={e => handleCampoFila(idx, 'detalles', e.target.value)}
                      placeholder='Sala, Comedor...'
                      style={{ width: '100%', padding: '4px 6px', border: '0.5px solid #ddd', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
          {msgMasivo && (
            <div style={{ padding: '10px 16px', borderRadius: '8px', fontSize: '13px',
              background: msgMasivo.startsWith('✅') ? '#EAF3DE' : '#FCEBEB',
              color: msgMasivo.startsWith('✅') ? '#27500A' : '#A32D2D' }}>
              {msgMasivo}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <button onClick={() => setShowMasiva(false)} style={btnOutline}>Cancelar</button>
            <button onClick={handleGuardarMasivo} disabled={guardandoMasivo}
              style={{ ...btnPrimary, padding: '10px 28px', fontSize: '14px' }}>
              {guardandoMasivo ? 'Guardando...' : `Cargar ${filasMasivas.filter(f => f.numero.toString().trim() !== '').length} unidades`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem', position: 'relative' }} onClick={() => { setMenuEstatus(null); setMenuAccion(null); }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#C0203A' }}>
          ← {isMobile ? 'Volver' : 'Volver a Desarrollos'}
        </button>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {!isMobile && miRol === 'Super Admin' && <button onClick={handleExportar} style={btnOutline}>Exportar</button>}
          {!isMobile && (
            <button onClick={() => setShowComparar(!showComparar)}
              style={{ ...btnOutline, background: showComparar ? '#f0f0f0' : '#fff' }}>
              Comparar {seleccionadas.length > 0 && `(${seleccionadas.length})`}
            </button>
          )}
          {!isMobile && (miRol === 'Super Admin' || miRol === 'Admin') && (
            <button onClick={handleAbrirMasiva} style={btnOutline}>
              ⬆ Carga masiva
            </button>
          )}
          {/* FIX: candado de rol — antes este botón era visible y funcional
              para CUALQUIER rol (incluyendo Agente), en móvil y escritorio. */}
          {puedeEditarInventario && (
            <button onClick={() => { setShowForm(true); setEditandoId(null); setForm(formVacio()); }}
              style={{ ...btnPrimary, padding: isMobile ? '10px 14px' : '8px 16px', fontSize: isMobile ? '14px' : '13px' }}>
              + {isMobile ? 'Nueva' : 'Cargar unidad'}
            </button>
          )}
        </div>
      </div>

      <h2 style={{ fontSize: isMobile ? '17px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>{desarrollo.nombre}</h2>
      <div style={{ fontSize: '13px', color: '#888', marginBottom: '1rem' }}>{unidades.length} unidades</div>

      {desarrollo.tiene_etapas && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap', overflowX: 'auto' }}>
          {Array.from({ length: desarrollo.num_estructuras || 1 }, (_, i) => {
            const nombre = `${desarrollo.tipo_estructura} ${i + 1}`;
            return (
              // FIX: ya no se puede "deseleccionar" la torre (antes hacía toggle a
              // null y eso volvía a mezclar todas las torres). Siempre debe
              // quedar exactamente una torre activa.
              <button key={i} onClick={() => setEstructuraSel(nombre)}
                style={{ padding: isMobile ? '8px 16px' : '6px 16px', borderRadius: '20px', border: '0.5px solid', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap',
                  background: estructuraSel === nombre ? '#C0203A' : '#fff',
                  color: estructuraSel === nombre ? '#fff' : '#666',
                  borderColor: estructuraSel === nombre ? '#C0203A' : '#ddd' }}>
                {nombre}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '1rem' }}>
        {Object.entries(conteos).map(([est, cnt]) => (
          <div key={est} onClick={() => setFiltroEstatus(filtroEstatus === est ? '' : est)}
            style={{ padding: isMobile ? '8px' : '6px 16px', borderRadius: '8px', border: `2px solid ${filtroEstatus === est ? colorEstatus[est] : '#e0e0e0'}`, cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#888' }}>{est}</div>
            <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: '600', color: colorEstatus[est] }}>{cnt}</div>
          </div>
        ))}
      </div>

      {isMobile ? (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input placeholder='Buscar...' value={buscar} onChange={e => { setBuscar(e.target.value); setPagina(0); }}
              style={{ flex: 1, padding: '10px 12px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '14px' }} />
            <button onClick={() => setShowFiltros(f => !f)}
              style={{ padding: '10px 14px', border: '0.5px solid #ddd', borderRadius: '8px', background: showFiltros ? '#C0203A' : '#fff', color: showFiltros ? '#fff' : '#333', fontSize: '13px', cursor: 'pointer' }}>
              ⚙️
            </button>
          </div>
          {!seleccionModoMobile && (
            <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>Mantén presionada una unidad para compararla</div>
          )}
          {showFiltros && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
              <select value={filtroEstatus} onChange={e => { setFiltroEstatus(e.target.value); setPagina(0); }}
                style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }}>
                <option value=''>Todos los estatus</option>
                {ESTATUS_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <select value={filtroTipologia} onChange={e => { setFiltroTipologia(e.target.value); setPagina(0); }}
                style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }}>
                <option value=''>Todas las tipologías</option>
                {tipologias.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filtroNivel} onChange={e => { setFiltroNivel(e.target.value); setPagina(0); }}
                style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }}>
                <option value=''>Todos los niveles</option>
                {niveles.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input placeholder='Buscar...' value={buscar} onChange={e => { setBuscar(e.target.value); setPagina(0); }}
            style={{ padding: '7px 12px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '160px' }} />
          <select value={filtroEstatus} onChange={e => { setFiltroEstatus(e.target.value); setPagina(0); }} style={filtroStyle}>
            <option value=''>Estatus</option>
            {ESTATUS_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={filtroTipologia} onChange={e => { setFiltroTipologia(e.target.value); setPagina(0); }} style={filtroStyle}>
            <option value=''>Tipología</option>
            {tipologias.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filtroNivel} onChange={e => { setFiltroNivel(e.target.value); setPagina(0); }} style={filtroStyle}>
            <option value=''>Nivel</option>
            {niveles.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}

      {isMobile ? (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Cargando...</div>
          ) : unidadesPagina.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Sin unidades</div>
          ) : unidadesPagina.map(u => {
            const estaSeleccionada = seleccionadas.includes(u.id);
            return (
              <div key={u.id}
                onClick={() => handleTapTarjetaMobile(u)}
                onTouchStart={() => handleLongPressStart(u)}
                onTouchEnd={handleLongPressEnd}
                onTouchMove={handleLongPressEnd}
                style={{ background: estaSeleccionada ? '#f0f0f8' : '#fff', border: estaSeleccionada ? '2px solid #C0203A' : '0.5px solid #e0e0e0', borderRadius: '10px', padding: '14px 16px', marginBottom: '8px', cursor: 'pointer', borderLeft: `4px solid ${colorEstatus[u.estatus]}`, position: 'relative', userSelect: 'none' }}>
                {seleccionModoMobile && (
                  <div style={{ position: 'absolute', top: '10px', right: '10px', width: '22px', height: '22px', borderRadius: '50%', border: `2px solid ${estaSeleccionada ? '#C0203A' : '#ccc'}`, background: estaSeleccionada ? '#C0203A' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '13px', fontWeight: '700' }}>
                    {estaSeleccionada ? '✓' : ''}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', paddingRight: seleccionModoMobile ? '30px' : '0' }}>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '15px', color: '#1a1a2e' }}>#{u.numero}</div>
                    <div style={{ fontSize: '13px', color: '#555' }}>{u.tipologia} {u.nivel ? `· Nivel ${u.nivel}` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: '700', fontSize: '14px', color: '#1a1a2e' }}>
                      {precioVisible(u) ? fmt(u.precio_lista) : '—'}
                    </div>
                    <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', background: bgEstatus[u.estatus], color: colorEstatus[u.estatus], fontWeight: '500' }}>{u.estatus}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#888' }}>
                  {u.m2_total > 0 && <span>📐 {u.m2_total} m²</span>}
                  {u.recamaras && <span>🛏 {u.recamaras}</span>}
                  {u.banos && <span>🚿 {u.banos}</span>}
                  {u.estacionamiento && <span>🚗 {u.estacionamiento}</span>}
                </div>
              </div>
            );
          })}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '1rem', fontSize: '13px', color: '#666', paddingBottom: seleccionModoMobile ? '80px' : '1rem' }}>
            <button onClick={() => setPagina(p => Math.max(0, p-1))} disabled={pagina === 0}
              style={{ padding: '8px 16px', border: '0.5px solid #ddd', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>‹</button>
            <span>{pagina * POR_PAGINA + 1}–{Math.min((pagina+1)*POR_PAGINA, unidadesFiltradas.length)} de {unidadesFiltradas.length}</span>
            <button onClick={() => setPagina(p => p+1)} disabled={(pagina+1)*POR_PAGINA >= unidadesFiltradas.length}
              style={{ padding: '8px 16px', border: '0.5px solid #ddd', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>›</button>
          </div>

          {/* FIX: barra flotante de selección — aparece al mantener presionada
              una tarjeta. "Cancelar" limpia todo, "Comparar" abre la pantalla
              completa de comparación. */}
          {seleccionModoMobile && (
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1a1a2e', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 -4px 16px rgba(0,0,0,0.2)', zIndex: 900 }}>
              <div style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>
                {seleccionadas.length} seleccionada{seleccionadas.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleCancelarSeleccionMobile}
                  style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={() => setShowCompararMobile(true)} disabled={seleccionadas.length === 0}
                  style={{ padding: '10px 16px', background: seleccionadas.length === 0 ? '#555' : '#fff', color: seleccionadas.length === 0 ? '#999' : '#000', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: seleccionadas.length === 0 ? 'default' : 'pointer', fontWeight: '600' }}>
                  Comparar
                </button>
              </div>
            </div>
          )}

          {/* FIX: pantalla completa de comparación en móvil, equivalente al
              panel lateral que ya existía en escritorio. */}
          {showCompararMobile && (
            <div style={{ position: 'fixed', top: 0, right: 0, width: '100%', height: '100%', background: '#fff', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '0.5px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '500', margin: 0 }}>Comparar unidades</h3>
                <button onClick={() => setShowCompararMobile(false)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888' }}>×</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
                {unidadesComparar.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#888', textAlign: 'center', padding: '2rem 0' }}>Sin unidades seleccionadas</div>
                ) : unidadesComparar.map(u => (
                  <div key={u.id} style={{ padding: '14px', background: '#f9f9f9', borderRadius: '10px', marginBottom: '10px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ fontWeight: '700', fontSize: '15px' }}>No. {u.numero} — {u.tipologia}</div>
                      <button onClick={() => handleSeleccionar(u.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#e53935' }}>✕ Quitar</button>
                    </div>
                    <div style={{ color: '#666' }}>Nivel: {u.nivel || '—'}</div>
                    <div style={{ color: '#666' }}>m² Total: {u.m2_total || '—'}</div>
                    <div style={{ color: '#666' }}>Precio: {precioVisible(u) ? fmt(u.precio_lista) : '—'}</div>
                    <span style={{ display: 'inline-block', marginTop: '6px', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', background: bgEstatus[u.estatus], color: colorEstatus[u.estatus] }}>{u.estatus}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #f0f0f0' }}>
                <button onClick={() => { setUnidadesComparaCotizar(unidadesComparar); setShowCompararMobile(false); setSeleccionModoMobile(false); setSeleccionadas([]); }}
                  disabled={unidadesComparar.length === 0}
                  style={{ ...btnPrimary, width: '100%', padding: '14px', justifyContent: 'center', fontSize: '15px', opacity: unidadesComparar.length === 0 ? 0.5 : 1 }}>
                  Generar cotización
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ flex: 1, background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '0.5px solid #e0e0e0' }}>
                  <th style={{ padding: '10px 14px', width: '40px' }}>
                    <input type='checkbox' onChange={e => setSeleccionadas(e.target.checked ? unidadesPagina.map(u => u.id) : [])} />
                  </th>
                  {[['numero','No.'],['tipologia','Tipología'],['nivel','Nivel'],['m2_total','Superficie'],['precio_lista','Precio Lista'],['estatus','Estatus']].map(([col, label]) => (
                    <th key={col} onClick={() => handleOrden(col)}
                      style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '500', color: '#555', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                      {label}{flecha(col)}
                    </th>
                  ))}
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '500', color: '#555', whiteSpace: 'nowrap' }}>Detalles</th>
                  {planes.map(plan => (
                    <th key={plan.id} onClick={() => handleOrden(`plan_${plan.id}`)}
                      style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '500', color: '#555', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                      {plan.nombre}{flecha(`plan_${plan.id}`)}
                    </th>
                  ))}
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '500', color: '#555' }}>Cotizar</th>
                  {miRol === 'Super Admin' && (
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '500', color: '#555', whiteSpace: 'nowrap' }}>Editado por</th>
                  )}
                  <th style={{ padding: '10px 14px' }}></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={colSpanTotal} style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Cargando...</td></tr>
                ) : unidadesPagina.length === 0 ? (
                  <tr><td colSpan={colSpanTotal} style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Sin unidades</td></tr>
                ) : unidadesPagina.map(u => (
                  <tr key={u.id} style={{ borderBottom: '0.5px solid #f0f0f0', background: seleccionadas.includes(u.id) ? '#f0f0f0' : 'transparent' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <input type='checkbox' checked={seleccionadas.includes(u.id)} onChange={() => handleSeleccionar(u.id)} />
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: '500' }}>{u.numero}</td>
                    <td style={{ padding: '12px 14px', color: '#333' }}>{u.tipologia}</td>
                    <td style={{ padding: '12px 14px', color: '#333' }}>{u.nivel}</td>
                    <td style={{ padding: '12px 14px', color: '#333' }}>{u.m2_total} m²</td>
                    <td style={{ padding: '12px 14px', color: '#333' }} onClick={e => e.stopPropagation()}>
                      {!precioVisible(u) ? (
                        <span style={{ color: '#ccc', fontSize: '12px' }}>—</span>
                      ) : puedeCambiarPrecio && editandoPrecio === u.id ? (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <input type='number' value={precioTemp} onChange={e => setPrecioTemp(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleGuardarPrecio(u.id); if (e.key === 'Escape') { setEditandoPrecio(null); setPrecioTemp(''); } }}
                            style={{ width: '110px', padding: '4px 8px', border: '1px solid #C0203A', borderRadius: '4px', fontSize: '13px' }}
                            autoFocus />
                          <button onClick={() => handleGuardarPrecio(u.id)} style={{ padding: '4px 8px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>✓</button>
                          <button onClick={() => { setEditandoPrecio(null); setPrecioTemp(''); }} style={{ padding: '4px 8px', background: '#f0f0f0', color: '#333', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>✕</button>
                        </div>
                      ) : (
                        <span onClick={() => { if (puedeCambiarPrecio) { setEditandoPrecio(u.id); setPrecioTemp(u.precio_lista || ''); } }}
                          style={{ cursor: puedeCambiarPrecio ? 'pointer' : 'default', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}
                          title={puedeCambiarPrecio ? 'Click para editar precio' : ''}>
                          {fmt(u.precio_lista)}
                          {puedeCambiarPrecio && <span style={{ marginLeft: '4px', fontSize: '11px', color: '#bbb' }}>✏️</span>}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', position: 'relative' }} onClick={e => e.stopPropagation()}>
                      {puedeGestionarEstatus ? (
                        <>
                          <button onClick={() => setMenuEstatus(menuEstatus === u.id ? null : u.id)}
                            style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', border: 'none', cursor: 'pointer', background: bgEstatus[u.estatus], color: colorEstatus[u.estatus] }}>
                            {u.estatus} ▾
                          </button>
                          {menuEstatus === u.id && (
                            <div style={{ position: 'absolute', top: '36px', left: '14px', background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 1000, minWidth: '130px' }}>
                              {ESTATUS_OPCIONES.map(e => (
                                <button key={e} onClick={() => handleCambiarEstatus(u.id, e)}
                                  style={{ display: 'block', width: '100%', padding: '8px 14px', background: e === u.estatus ? '#f5f5f5' : 'none', border: 'none', cursor: 'pointer', fontSize: '13px', textAlign: 'left', color: colorEstatus[e], fontWeight: e === u.estatus ? '600' : 'normal' }}>
                                  {e === u.estatus ? '✓ ' : ''}{e}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', background: bgEstatus[u.estatus], color: colorEstatus[u.estatus] }}>
                          {u.estatus}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#888', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '10px', fontSize: '12px' }}>
                        {u.recamaras && <span>🛏 {u.recamaras}</span>}
                        {u.banos && <span>🚿 {u.banos}</span>}
                        {u.estacionamiento && <span>🚗 {u.estacionamiento}</span>}
                      </div>
                    </td>
                    {planes.map(plan => {
                      const calc = calcularPlan(plan, u.precio_lista || 0);
                      return (
                        <td key={plan.id} style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: '12px', color: '#333' }}>
                            {precioVisible(u) ? fmt(calc.precioConDescuento) : '—'}
                          </div>
                        </td>
                      );
                    })}
                    <td style={{ padding: '12px 14px' }}>
                      {u.estatus === 'Vendido' ? (
                        <span style={{ fontSize: '13px', color: '#ccc' }}>Cotizar &gt;</span>
                      ) : (
                        <button onClick={() => setUnidadCotizar(u)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#2E7D4F', textDecoration: 'underline', fontWeight: '500' }}>
                          Cotizar &gt;
                        </button>
                      )}
                    </td>
                    {miRol === 'Super Admin' && (
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        {u.precio_editado_por ? (
                          <div>
                            <div style={{ fontSize: '12px', color: '#333' }}>{u.precio_editado_por}</div>
                            <div style={{ fontSize: '11px', color: '#aaa' }}>
                              {u.precio_editado_en ? new Date(u.precio_editado_en).toLocaleString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#ccc' }}>—</span>
                        )}
                      </td>
                    )}
                    <td style={{ padding: '12px 14px', position: 'relative' }} onClick={e => e.stopPropagation()}>
                      {/* FIX: candado de rol — antes este menú "···" (con Editar y
                          Eliminar) era visible y funcional para CUALQUIER rol. */}
                      {puedeEditarInventario && (
                        <>
                          <button onClick={() => setMenuAccion(menuAccion === u.id ? null : u.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#666' }}>
                            ···
                          </button>
                          {menuAccion === u.id && (
                            <div style={{ position: 'absolute', right: 0, top: '36px', background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 1000, minWidth: '130px' }}>
                              <button onClick={() => handleEditar(u)}
                                style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', textAlign: 'left', color: '#333' }}>
                                ✏️ Editar
                              </button>
                              <button onClick={() => handleEliminar(u.id)}
                                style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', textAlign: 'left', color: '#e53935' }}>
                                🗑 Eliminar
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', borderTop: '0.5px solid #f0f0f0', fontSize: '13px', color: '#666' }}>
              <span>{pagina * POR_PAGINA + 1}–{Math.min((pagina + 1) * POR_PAGINA, unidadesFiltradas.length)} de {unidadesFiltradas.length}</span>
              <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>‹</button>
              <button onClick={() => setPagina(p => p + 1)} disabled={(pagina + 1) * POR_PAGINA >= unidadesFiltradas.length} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>›</button>
            </div>
          </div>

          {showComparar && (
            <div style={{ width: '280px', background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '16px', alignSelf: 'flex-start' }}>
              <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '12px' }}>Comparar unidades</div>
              {seleccionadas.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#888' }}>Selecciona unidades de la tabla para compararlas</div>
              ) : (
                <>
                  {unidadesComparar.map(u => (
                    <div key={u.id} style={{ padding: '10px', background: '#f9f9f9', borderRadius: '8px', marginBottom: '8px', fontSize: '12px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>No. {u.numero} — {u.tipologia}</div>
                      <div style={{ color: '#666' }}>Nivel: {u.nivel}</div>
                      <div style={{ color: '#666' }}>m² Total: {u.m2_total}</div>
                      <div style={{ color: '#666' }}>Precio: {precioVisible(u) ? fmt(u.precio_lista) : '—'}</div>
                      <div style={{ color: colorEstatus[u.estatus] }}>{u.estatus}</div>
                      <button onClick={() => handleSeleccionar(u.id)} style={{ marginTop: '4px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#e53935' }}>✕ Quitar</button>
                    </div>
                  ))}
                  <button onClick={() => setUnidadesComparaCotizar(unidadesComparar)} style={{ ...btnPrimary, width: '100%', marginTop: '8px' }}>Generar cotización</button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {unidadDetalle && isMobile && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: '100%', height: '100%', background: '#fff', zIndex: 1000, display: 'flex', flexDirection: 'column', maxHeight: '100dvh' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '0.5px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '500', margin: 0 }}>Unidad #{unidadDetalle.numero}</h3>
            <button onClick={() => setUnidadDetalle(null)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888' }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a2e' }}>
                  {precioVisible(unidadDetalle) ? fmt(unidadDetalle.precio_lista) : '—'}
                </div>
                <div style={{ fontSize: '13px', color: '#888' }}>{unidadDetalle.tipologia} {unidadDetalle.nivel ? `· Nivel ${unidadDetalle.nivel}` : ''}</div>
              </div>
              <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '13px', background: bgEstatus[unidadDetalle.estatus], color: colorEstatus[unidadDetalle.estatus], fontWeight: '600' }}>
                {unidadDetalle.estatus}
              </span>
            </div>
            {[
              ['m² Interior', unidadDetalle.m2_interior ? `${unidadDetalle.m2_interior} m²` : '—'],
              ['m² Terraza', unidadDetalle.m2_terraza ? `${unidadDetalle.m2_terraza} m²` : '—'],
              ['m² Total', unidadDetalle.m2_total ? `${unidadDetalle.m2_total} m²` : '—'],
              ['m² Bodega', unidadDetalle.m2_bodega ? `${unidadDetalle.m2_bodega} m²` : '—'],
              ['Recámaras', unidadDetalle.recamaras || '—'],
              ['Baños', unidadDetalle.banos || '—'],
              ['Estacionamiento', unidadDetalle.estacionamiento || '—'],
              ['Orientación', unidadDetalle.orientacion || '—'],
              ['Precio m²', precioVisible(unidadDetalle) && unidadDetalle.precio_m2 ? fmt(unidadDetalle.precio_m2) : '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', padding: '10px 0', borderBottom: '0.5px solid #f5f5f5', fontSize: '13px' }}>
                <span style={{ width: '130px', color: '#888', flexShrink: 0 }}>{label}</span>
                <span style={{ color: '#333' }}>{val}</span>
              </div>
            ))}
            {planes.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '11px', color: '#888', fontWeight: '500', marginBottom: '10px' }}>PLANES DE PAGO</div>
                {planes.map(plan => {
                  const calc = calcularPlan(plan, unidadDetalle.precio_lista || 0);
                  return (
                    <div key={plan.id} style={{ padding: '10px', background: '#f9f9f9', borderRadius: '8px', marginBottom: '8px', fontSize: '13px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>{plan.nombre}</div>
                      <div style={{ color: '#555' }}>Precio: {precioVisible(unidadDetalle) ? fmt(calc.precioConDescuento) : '—'}</div>
                    </div>
                  );
                })}
              </div>
            )}
            {unidadDetalle.detalles && (
              <div style={{ marginTop: '1rem', padding: '12px', background: '#f9f9f9', borderRadius: '8px', fontSize: '13px', color: '#555' }}>
                {unidadDetalle.detalles}
              </div>
            )}
            {puedeGestionarEstatus && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '11px', color: '#888', fontWeight: '500', marginBottom: '8px' }}>CAMBIAR ESTATUS</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {ESTATUS_OPCIONES.map(e => (
                    <button key={e} onClick={() => handleCambiarEstatus(unidadDetalle.id, e)}
                      style={{ padding: '8px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '13px', background: bgEstatus[e], color: colorEstatus[e], fontWeight: unidadDetalle.estatus === e ? '700' : '400' }}>
                      {unidadDetalle.estatus === e ? '✓ ' : ''}{e}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #f0f0f0', display: 'flex', gap: '8px' }}>
            {unidadDetalle.estatus !== 'Vendido' && (
              <button onClick={() => { setUnidadCotizar(unidadDetalle); setUnidadDetalle(null); }}
                style={{ flex: 1, padding: '12px', background: '#2E7D4F', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}>
                Cotizar
              </button>
            )}
            {/* FIX: candado de rol — antes Editar y Eliminar eran visibles y
                funcionales para CUALQUIER rol en el panel de detalle de móvil.
                Esta era la vía más directa por la que un Agente podía editar
                inventario desde el celular. */}
            {puedeEditarInventario && (
              <>
                <button onClick={() => handleEditar(unidadDetalle)}
                  style={{ flex: 1, padding: '12px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}>
                  Editar
                </button>
                <button onClick={() => handleEliminar(unidadDetalle.id)}
                  style={{ padding: '12px 16px', background: '#FCEBEB', color: '#A32D2D', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
                  🗑
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showForm && puedeEditarInventario && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: isMobile ? '100%' : '360px', height: '100dvh', background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '0.5px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <h3 style={{ fontSize: '16px', fontWeight: '500', margin: 0 }}>{editandoId ? 'Editar unidad' : 'Cargar unidad'}</h3>
            <button onClick={() => { setShowForm(false); setEditandoId(null); }} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888' }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
            {sel('Estatus inventario', 'estatus', ESTATUS_OPCIONES)}
            {inp('Número', 'numero')}
            {inp('Tipología', 'tipologia')}
            {inp('Nivel', 'nivel')}
            {sel('Orientación', 'orientacion', ORIENTACION_OPCIONES.filter(o => o !== ''))}
            {sel('Recámaras', 'recamaras', OPCIONES_NUM.filter(o => o !== ''))}
            {sel('Estacionamiento', 'estacionamiento', OPCIONES_NUM.filter(o => o !== ''))}
            {sel('Baños', 'banos', OPCIONES_NUM.filter(o => o !== ''))}
            {inp('m² Bodega', 'm2_bodega', 'number')}
            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input type='checkbox' checked={form.sumar_m2_bodega} onChange={e => setForm({ ...form, sumar_m2_bodega: e.target.checked })} id='sumar_bodega' style={{ width: '18px', height: '18px' }} />
              <label htmlFor='sumar_bodega' style={{ fontSize: isMobile ? '14px' : '13px', color: '#333' }}>¿Sumar m² bodega?</label>
            </div>
            {inp('m² Interior', 'm2_interior', 'number')}
            {inp('m² Terraza', 'm2_terraza', 'number')}
            {inp('m² Total (automático)', 'm2_total', 'number', true)}
            {puedeCambiarPrecio && inp('Precio de lista', 'precio_lista', 'number')}
            {inp('Precio por m² (automático)', 'precio_m2', 'number', true)}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Detalles</label>
              <textarea value={form.detalles} onChange={e => setForm({ ...form, detalles: e.target.value })} rows={3}
                style={{ width: '100%', padding: isMobile ? '10px' : '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Notas (interno)</label>
              <textarea value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} rows={3}
                style={{ width: '100%', padding: isMobile ? '10px' : '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
            {inp('Posición', 'posicion')}
            {desarrollo.tiene_etapas && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>{desarrollo.tipo_estructura}</label>
                <select value={form.estructura} onChange={e => setForm({ ...form, estructura: e.target.value })}
                  style={{ width: '100%', padding: isMobile ? '10px' : '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px', background: '#fff' }}>
                  <option value=''>Sin asignar</option>
                  {Array.from({ length: desarrollo.num_estructuras || 1 }, (_, i) => (
                    <option key={i} value={`${desarrollo.tipo_estructura} ${i+1}`}>{desarrollo.tipo_estructura} {i+1}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #f0f0f0', flexShrink: 0 }}>
            <button onClick={handleGuardar} disabled={guardando}
              style={{ ...btnPrimary, width: '100%', padding: isMobile ? '14px' : '12px', fontSize: isMobile ? '15px' : '13px', justifyContent: 'center' }}>
              {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Agregar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary = { background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '500', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const btnOutline = { background: '#fff', color: '#333', border: '0.5px solid #ddd', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' };
const filtroStyle = { padding: '7px 12px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', background: '#fff' };