import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from './supabase';

const TIPOS = ['Apartado', 'Vendida', 'Cancelación', 'Cambio de Unidad'];
// FIX: se agrega "Especial" — misma lista que Movimientos.js, para que el
// panel de edición del historial pueda mostrar/asignar este plan también.
const PLANES_PAGO = ['Hipotecario', 'A tu medida', 'Financiero 1', 'Financiero 2', '50-50', 'Contado', 'Especial'];
const TIPO_COMPRA_OPCIONES = ['Contado', 'Infonavit', 'Fovissste', 'Bancario', 'Cofinavit'];
const fmt = (n) => `$${Number(n||0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
const colorTipo = { 'Apartado': '#F59E0B', 'Vendida': '#10B981', 'Cancelación': '#EF4444', 'Cambio de Unidad': '#8B5CF6' };
const bgTipo = { 'Apartado': '#FFF8E1', 'Vendida': '#EAF3DE', 'Cancelación': '#FCEBEB', 'Cambio de Unidad': '#F3F0FF' };
const ROLES_GERENTE = ['Gerente Editor', 'Gerente Operador', 'Mesa de Control'];
const DIAS_SEMANA_LABEL = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

function parseFechaLocal(fechaStr) {
  if (!fechaStr) return null;
  if (typeof fechaStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fechaStr)) {
    const [y, m, d] = fechaStr.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(fechaStr);
}

const fmtFecha = (f) => {
  const d = parseFechaLocal(f);
  return d ? d.toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';
};
const fmtFechaHora = (f) => f ? new Date(f).toLocaleString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export default function HistorialMovimientos({ miRol, miAgente }) {
  const isMobile = useIsMobile();
  const [movimientos, setMovimientos] = useState([]);
  const [estructurasPorUnidad, setEstructurasPorUnidad] = useState({});
  const [agentesPorCorreo, setAgentesPorCorreo] = useState({});
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroDesarrollo, setFiltroDesarrollo] = useState('');
  const [buscar, setBuscar] = useState('');
  const [desarrollos, setDesarrollos] = useState([]);
  const [editando, setEditando] = useState(null);
  const [unidadesDesarrollo, setUnidadesDesarrollo] = useState([]);
  const [form, setForm] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [ordenCol, setOrdenCol] = useState('created_at');
  const [ordenDir, setOrdenDir] = useState('desc');
  const [filtroDia, setFiltroDia] = useState('');
  const [filtroMes, setFiltroMes] = useState('');
  const [filtroAnio, setFiltroAnio] = useState('');
  // FIX: filtro de rango de fechas (ej. "martes 14 a lunes 20") — cuando
  // está activo, tiene prioridad sobre día/mes/año sueltos, para no
  // combinar dos formas de filtrar fecha a la vez.
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');
  const [showFiltros, setShowFiltros] = useState(false);
  const [movDetalle, setMovDetalle] = useState(null);
  const POR_PAGINA = 50;

  // FIX: ventana de tiempo para que los Gerentes puedan cargar/editar —
  // de martes a lunes hasta la hora configurada (default 11:59). Fuera de
  // ese rango, solo Super Admin puede seguir editando.
  const [horaCierre, setHoraCierre] = useState('11:59');
  const [showConfigVentana, setShowConfigVentana] = useState(false);
  const [nuevaHoraCierre, setNuevaHoraCierre] = useState('11:59');
  const [guardandoVentana, setGuardandoVentana] = useState(false);

  const esGerente = ROLES_GERENTE.includes(miRol);

  const dentroDeVentana = () => {
    const ahora = new Date();
    const dia = ahora.getDay(); // 0=Dom, 1=Lun, 2=Mar...6=Sab
    if (dia !== 1) return true; // martes a domingo: siempre abierto
    const [h, m] = horaCierre.split(':').map(Number);
    const limite = new Date(ahora); limite.setHours(h, m, 59, 999);
    return ahora <= limite;
  };

  const puedeEditar = miRol === 'Super Admin' || (esGerente && dentroDeVentana());

  useEffect(() => { cargarConfigVentana(); }, []);
  useEffect(() => { cargarMovimientos(); cargarDesarrollos(); cargarAgentes(); }, [filtroTipo, filtroDesarrollo, miAgente]);

  const cargarConfigVentana = async () => {
    const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'ventana_cierre_hora').limit(1);
    if (data && data.length > 0 && data[0].valor) {
      setHoraCierre(data[0].valor);
      setNuevaHoraCierre(data[0].valor);
    }
  };

  const guardarConfigVentana = async () => {
    setGuardandoVentana(true);
    await supabase.from('configuracion').upsert({ clave: 'ventana_cierre_hora', valor: nuevaHoraCierre }, { onConflict: 'clave' });
    setHoraCierre(nuevaHoraCierre);
    setGuardandoVentana(false);
    setShowConfigVentana(false);
  };

  // FIX: los Gerentes solo ven movimientos de sus desarrollos a cargo,
  // igual que ya hacemos en Negocios y el Dashboard de Dirección.
  // FIX: Mesa de Control va MÁS ALLÁ — además del desarrollo, se limita
  // a movimientos de SU GENTE (él + agentes_cargo). Se cruza primero por
  // vendedor_correo (confiable, columna nueva) y como respaldo también
  // por nombre (para movimientos viejos cargados antes de que existiera
  // vendedor_correo).
  const cargarMovimientos = async () => {
    setLoading(true);
    let query = supabase.from('movimientos').select('*').order('created_at', { ascending: false });
    if (filtroTipo) query = query.eq('tipo', filtroTipo);
    if (filtroDesarrollo) query = query.eq('desarrollo_nombre', filtroDesarrollo);
    if (miRol === 'Mesa de Control') {
      const cargo = miAgente?.desarrollos_cargo || [];
      const correo = miAgente?.correo || '';
      const equipoCorreos = [correo, ...(miAgente?.agentes_cargo || [])].filter(Boolean);
      if (cargo.length === 0 || !correo) { setMovimientos([]); setLoading(false); return; }
      const { data: equipoAgentes } = await supabase.from('agentes').select('nombre, apellidos, correo').in('correo', equipoCorreos);
      const nombresEquipo = (equipoAgentes || []).map(a => `${a.nombre || ''} ${a.apellidos || ''}`.trim()).filter(Boolean);
      const condsCorreo = equipoCorreos.map(c => `vendedor_correo.eq.${c}`).join(',');
      const condsNombre = nombresEquipo.map(n => `vendedor.eq."${n.replace(/"/g, '\\"')}"`).join(',');
      query = query.or([condsCorreo, condsNombre].filter(Boolean).join(',')).in('desarrollo_nombre', cargo);
    } else if (esGerente) {
      const cargo = miAgente?.desarrollos_cargo || [];
      if (cargo.length === 0) { setMovimientos([]); setLoading(false); return; }
      query = query.in('desarrollo_nombre', cargo);
    }
    const { data } = await query;
    setMovimientos(data || []);
    setLoading(false);
    cargarEstructurasUnidades(data || []);
  };

  // FIX: `movimientos` no guarda a qué torre/etapa pertenece la unidad —
  // pero `inventario` sí (columna `estructura`). Se cruza por unidad_id
  // para poder mostrar la torre entre Desarrollo y Unidad, sin necesidad
  // de agregar un campo nuevo — y funciona retroactivo para todo el
  // historial ya cargado, no solo movimientos nuevos.
  const cargarEstructurasUnidades = async (movs) => {
    const ids = [...new Set(movs.map(m => m.unidad_id).filter(Boolean))];
    if (ids.length === 0) { setEstructurasPorUnidad({}); return; }
    const { data } = await supabase.from('inventario').select('id, estructura').in('id', ids);
    const mapa = {};
    (data || []).forEach(u => { if (u.estructura) mapa[u.id] = u.estructura; });
    setEstructurasPorUnidad(mapa);
  };

  const cargarDesarrollos = async () => {
    let query = supabase.from('desarrollos').select('id, nombre').eq('activo', true).order('nombre');
    if (esGerente) {
      const cargo = miAgente?.desarrollos_cargo || [];
      if (cargo.length === 0) { setDesarrollos([]); return; }
      query = query.in('nombre', cargo);
    }
    const { data } = await query;
    setDesarrollos(data || []);
  };

  const cargarAgentes = async () => {
    const { data } = await supabase.from('agentes').select('correo, nombre, apellidos');
    const map = {};
    (data || []).forEach(a => { map[a.correo] = `${a.nombre || ''} ${a.apellidos || ''}`.trim() || a.correo; });
    setAgentesPorCorreo(map);
  };

  const nombreCargador = (m) => {
    if (!m.registrado_por) return '—';
    return agentesPorCorreo[m.registrado_por] || m.registrado_por;
  };

  // FIX: nombre de quien hizo la última edición (distinto de quien lo cargó originalmente)
  const nombreEditor = (m) => {
    if (!m.editado_por) return '—';
    return agentesPorCorreo[m.editado_por] || m.editado_por;
  };

  // FIX: solo Super Admin puede corregir la unidad — se cargan las
  // unidades reales de ese mismo desarrollo (por id) para elegir de una
  // lista, en vez de dejar escribir un número que no exista en inventario.
  const handleEditar = async (m) => {
    setForm({ ...m }); setEditando(m.id); setMovDetalle(null);
    if (miRol === 'Super Admin' && m.desarrollo_id) {
      const { data } = await supabase.from('inventario').select('id, numero').eq('desarrollo_id', m.desarrollo_id).order('numero');
      setUnidadesDesarrollo(data || []);
    } else {
      setUnidadesDesarrollo([]);
    }
  };

  const handleGuardar = async () => {
    setGuardando(true);
    await supabase.from('movimientos').update({
      tipo: form.tipo, monto: form.monto, plan_pago: form.plan_pago, tipo_compra: form.tipo_compra,
      fecha_apartado: form.fecha_apartado, fecha_firma: form.fecha_firma,
      fecha_cancelacion: form.fecha_cancelacion, motivo_cancelacion: form.motivo_cancelacion,
      comisionable: form.comisionable, fecha_movimiento: new Date().toISOString(),
      editado_por: miAgente?.correo || null,
      unidad_id: form.unidad_id, unidad_numero: form.unidad_numero,
    }).eq('id', editando);
    setGuardando(false);
    setEditando(null);
    cargarMovimientos();
  };

  const handleEliminar = async (id) => {
    if (!window.confirm('¿Eliminar este movimiento? Esto no revertirá el estatus del inventario.')) return;
    const { error } = await supabase.from('movimientos').delete().eq('id', id);
    if (error) {
      alert('Error al eliminar: ' + error.message);
      return;
    }
    setMovDetalle(null);
    cargarMovimientos();
  };

  const handleOrden = (col) => {
    if (ordenCol === col) setOrdenDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setOrdenCol(col); setOrdenDir('asc'); }
  };

  const flecha = (col) => ordenCol === col ? (ordenDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';

  const aniosDisponibles = [...new Set(movimientos.map(m => {
    const d = parseFechaLocal(m.created_at);
    return d ? d.getFullYear() : null;
  }).filter(Boolean))].sort((a,b) => b - a);

  const meses = [
    { val: '1', label: 'Enero' }, { val: '2', label: 'Febrero' }, { val: '3', label: 'Marzo' },
    { val: '4', label: 'Abril' }, { val: '5', label: 'Mayo' }, { val: '6', label: 'Junio' },
    { val: '7', label: 'Julio' }, { val: '8', label: 'Agosto' }, { val: '9', label: 'Septiembre' },
    { val: '10', label: 'Octubre' }, { val: '11', label: 'Noviembre' }, { val: '12', label: 'Diciembre' }
  ];

  const getValorOrden = (m, col) => {
    switch(col) {
      case 'tipo': return m.tipo || '';
      case 'desarrollo_nombre': return m.desarrollo_nombre || '';
      case 'torre': return estructurasPorUnidad[m.unidad_id] || '';
      case 'unidad_numero': return m.unidad_numero || '';
      case 'contacto_nombre': return m.contacto_nombre || '';
      case 'vendedor': return m.vendedor || '';
      case 'monto': return Number(m.monto || 0);
      case 'plan_pago': return m.plan_pago || '';
      case 'tipo_compra': return m.tipo_compra || '';
      case 'comisionable': return m.comisionable ? 1 : 0;
      case 'fecha_apartado': { const d = parseFechaLocal(m.fecha_apartado); return d ? d.getTime() : 0; }
      case 'fecha_firma': { const d = parseFechaLocal(m.fecha_firma); return d ? d.getTime() : 0; }
      case 'created_at': return m.created_at ? new Date(m.created_at).getTime() : 0;
      case 'registrado_por': return nombreCargador(m) || '';
      case 'editado_por': return nombreEditor(m) || '';
      default: return '';
    }
  };

  const movsFiltrados = movimientos
    .filter(m => {
      const textOk = !buscar ||
        m.contacto_nombre?.toLowerCase().includes(buscar.toLowerCase()) ||
        m.desarrollo_nombre?.toLowerCase().includes(buscar.toLowerCase()) ||
        m.unidad_numero?.toLowerCase().includes(buscar.toLowerCase()) ||
        m.vendedor?.toLowerCase().includes(buscar.toLowerCase());
      const fecha = parseFechaLocal(m.created_at);
      // FIX: si hay rango desde/hasta activo, usa eso en vez de día/mes/año sueltos.
      let fechaOk = true;
      if (filtroFechaDesde || filtroFechaHasta) {
        if (filtroFechaDesde) {
          const desde = parseFechaLocal(filtroFechaDesde);
          fechaOk = fechaOk && !!fecha && fecha >= desde;
        }
        if (filtroFechaHasta) {
          const hasta = parseFechaLocal(filtroFechaHasta);
          hasta.setHours(23, 59, 59, 999);
          fechaOk = fechaOk && !!fecha && fecha <= hasta;
        }
      } else {
        const diaOk = !filtroDia || (fecha && fecha.getDate() === parseInt(filtroDia));
        const mesOk = !filtroMes || (fecha && fecha.getMonth() + 1 === parseInt(filtroMes));
        const anioOk = !filtroAnio || (fecha && fecha.getFullYear() === parseInt(filtroAnio));
        fechaOk = diaOk && mesOk && anioOk;
      }
      return textOk && fechaOk;
    })
    .sort((a, b) => {
      const va = getValorOrden(a, ordenCol);
      const vb = getValorOrden(b, ordenCol);
      if (typeof va === 'string') return ordenDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return ordenDir === 'asc' ? va - vb : vb - va;
    });

  const movsPagina = movsFiltrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const totalVendidas = movsFiltrados.filter(m => m.tipo === 'Vendida').length;
  const totalMonto = movsFiltrados.filter(m => m.tipo === 'Vendida').reduce((s,m) => s + Number(m.monto||0), 0);

  // FIX: exporta el historial filtrado (respeta buscador, tipo, desarrollo
  // y rango/día/mes/año activos) a un Excel con una hoja "Resumen" y una
  // hoja por cada proyecto que aparezca en los resultados.
  const handleExportarPorProyecto = () => {
    if (movsFiltrados.length === 0) { alert('No hay movimientos para exportar con estos filtros.'); return; }

    const proyectos = [...new Set(movsFiltrados.map(m => m.desarrollo_nombre || 'Sin proyecto'))].sort();

    const resumen = proyectos.map(p => {
      const movs = movsFiltrados.filter(m => (m.desarrollo_nombre || 'Sin proyecto') === p);
      const vendidas = movs.filter(m => m.tipo === 'Vendida').length;
      const monto = movs.filter(m => m.tipo === 'Vendida').reduce((s, m) => s + Number(m.monto || 0), 0);
      return { 'Proyecto': p, 'Movimientos': movs.length, 'Vendidas': vendidas, 'Monto vendido': monto };
    });

    const wb = XLSX.utils.book_new();
    const wsResumen = XLSX.utils.json_to_sheet(resumen);
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    const nombresUsados = new Set(['Resumen']);
    proyectos.forEach(p => {
      const movs = movsFiltrados.filter(m => (m.desarrollo_nombre || 'Sin proyecto') === p);
      const filas = movs.map(m => ({
        'Estatus': m.tipo, 'Torre/Etapa': estructurasPorUnidad[m.unidad_id] || '', 'Unidad': m.unidad_numero, 'Cliente': m.contacto_nombre,
        'Origen': m.origen_cliente, 'Vendedor': m.vendedor, 'Monto': Number(m.monto || 0),
        'Plan de Pago': m.plan_pago, 'Tipo de Compra': m.tipo_compra, 'Comisionable': m.comisionable ? 'Sí' : 'No',
        'F. Apartado': fmtFecha(m.fecha_apartado), 'F. Firma': fmtFecha(m.fecha_firma),
        'F. Cancelación': m.tipo === 'Cancelación' ? fmtFecha(m.fecha_cancelacion) : '',
        'Motivo Cancelación': m.motivo_cancelacion || '',
        'Cambio de Unidad': m.tipo === 'Cambio de Unidad' ? `#${m.unidad_inicial} -> #${m.unidad_numero}` : '',
        'Fecha de carga': fmtFechaHora(m.created_at),
        'Fecha de movimiento': m.fecha_movimiento ? fmtFechaHora(m.fecha_movimiento) : '',
        'Cargado por': nombreCargador(m), 'Editado por': nombreEditor(m),
      }));
      const ws = XLSX.utils.json_to_sheet(filas);
      // Nombres de hoja: máx 31 caracteres, sin \ / ? * [ ]
      let nombreHoja = p.replace(/[\\/*?:\[\]]/g, '').slice(0, 31) || 'Proyecto';
      let sufijo = 1;
      while (nombresUsados.has(nombreHoja)) { nombreHoja = `${nombreHoja.slice(0, 28)}_${sufijo++}`; }
      nombresUsados.add(nombreHoja);
      XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
    });

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const rango = (filtroFechaDesde || filtroFechaHasta) ? `_${filtroFechaDesde || 'inicio'}_a_${filtroFechaHasta || 'hoy'}` : '';
    const a = document.createElement('a');
    a.href = url; a.download = `historial_movimientos${rango}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  };

  const columnas = [
    { key: 'tipo', label: 'Estatus' },
    { key: 'desarrollo_nombre', label: 'Desarrollo' },
    { key: 'torre', label: 'Torre/Etapa' },
    { key: 'unidad_numero', label: 'Unidad' },
    { key: 'contacto_nombre', label: 'Cliente' },
    { key: 'origen_cliente', label: 'Origen' },
    { key: 'vendedor', label: 'Vendedor' },
    { key: 'monto', label: 'Monto' },
    { key: 'plan_pago', label: 'Plan de Pago' },
    { key: 'tipo_compra', label: 'Tipo de Compra' },
    { key: 'comisionable', label: 'Comisionable' },
    { key: 'fecha_apartado', label: 'F. Apartado' },
    { key: 'fecha_firma', label: 'F. Firma' },
    { key: 'cancelacion', label: 'Cancelación' },
    { key: 'cambio_unidad', label: 'Cambio de Unidad' },
    { key: 'created_at', label: 'Fecha de carga' },
    { key: 'fecha_movimiento', label: 'Fecha de movimiento' },
    { key: 'registrado_por', label: 'Cargado por' },
    { key: 'editado_por', label: 'Editado por' },
  ];

  // FIX: esto era `const PanelEditar = () => (...)` — al ser una función
  // definida dentro del render, React la trataba como un componente NUEVO
  // en cada tecleo (cada setForm re-renderiza el padre), remontando el
  // panel entero y haciendo que los inputs/textarea perdieran el foco
  // después de cada letra (el motivo de cancelación era el más notorio,
  // por ser el único campo de texto libre largo). Ahora es una constante
  // con el JSX ya armado — sigue siendo el mismo árbol de elementos en
  // cada render, así que React solo actualiza, no remonta.
  const panelEditar = (
    <div style={{ position: 'fixed', top: 0, right: 0, width: isMobile ? '100%' : '400px', height: '100dvh', background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '0.5px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '500', margin: 0 }}>Editar Movimiento</h3>
        <button onClick={() => setEditando(null)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888' }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
        <div style={{ marginBottom: '16px', padding: '12px', background: '#f9f9f9', borderRadius: '8px', fontSize: '13px' }}>
          <div style={{ fontWeight: '500' }}>{form.contacto_nombre}</div>
          <div style={{ color: '#888', fontSize: '12px' }}>{form.desarrollo_nombre} — Unidad {form.unidad_numero}</div>
          <div style={{ color: '#aaa', fontSize: '11px', marginTop: '4px' }}>Cargado: {fmtFechaHora(form.created_at)}</div>
          <div style={{ color: '#aaa', fontSize: '11px', marginTop: '2px' }}>Cargado por: {nombreCargador(form)}</div>
          {form.editado_por && <div style={{ color: '#aaa', fontSize: '11px', marginTop: '2px' }}>Última edición: {nombreEditor(form)}</div>}
        </div>
        {/* FIX: solo Super Admin puede corregir la unidad — se elige de la
            lista real del inventario de ese desarrollo, no texto libre. */}
        {miRol === 'Super Admin' && (
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Unidad <span style={{ color: '#e53e3e' }}>(corrección — Super Admin)</span></label>
            <select value={form.unidad_id || ''} onChange={e => {
              const u = unidadesDesarrollo.find(x => x.id === e.target.value);
              setForm({ ...form, unidad_id: e.target.value, unidad_numero: u?.numero || form.unidad_numero });
            }} style={inputStyle}>
              <option value={form.unidad_id || ''}>{form.unidad_numero} (actual)</option>
              {unidadesDesarrollo.filter(u => u.id !== form.unidad_id).map(u => (
                <option key={u.id} value={u.id}>{u.numero}</option>
              ))}
            </select>
          </div>
        )}
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Tipo</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {TIPOS.map(t => (
              <button key={t} onClick={() => setForm({ ...form, tipo: t })}
                style={{ padding: '10px', border: `1px solid ${form.tipo === t ? colorTipo[t] : '#ddd'}`, borderRadius: '8px', background: form.tipo === t ? bgTipo[t] : '#fff', color: form.tipo === t ? colorTipo[t] : '#333', cursor: 'pointer', fontSize: '13px', fontWeight: form.tipo === t ? '600' : '400' }}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Monto (MXN)</label>
          <input type='number' value={form.monto || ''} onChange={e => setForm({ ...form, monto: e.target.value })} style={inputStyle} />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Plan de Pago</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {PLANES_PAGO.map(p => (
              <button key={p} onClick={() => setForm({ ...form, plan_pago: p })}
                style={{ padding: '10px', border: `1px solid ${form.plan_pago === p ? '#C0203A' : '#ddd'}`, borderRadius: '8px', background: form.plan_pago === p ? '#C0203A' : '#fff', color: form.plan_pago === p ? '#fff' : '#333', cursor: 'pointer', fontSize: '13px' }}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Tipo de Compra</label>
          <select value={form.tipo_compra || ''} onChange={e => setForm({ ...form, tipo_compra: e.target.value })} style={inputStyle}>
            {TIPO_COMPRA_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Fecha de Apartado</label>
          <input type='date' value={form.fecha_apartado || ''} onChange={e => setForm({ ...form, fecha_apartado: e.target.value })} style={inputStyle} />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Fecha de Firma</label>
          <input type='date' value={form.fecha_firma || ''} onChange={e => setForm({ ...form, fecha_firma: e.target.value })} style={inputStyle} />
        </div>
        {form.tipo === 'Cancelación' && (
          <>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Fecha de Cancelación</label>
              <input type='date' value={form.fecha_cancelacion || ''} onChange={e => setForm({ ...form, fecha_cancelacion: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Motivo de Cancelación</label>
              <textarea value={form.motivo_cancelacion || ''} onChange={e => setForm({ ...form, motivo_cancelacion: e.target.value })} rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontSize: '14px' }} />
            </div>
          </>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div onClick={() => setForm({ ...form, comisionable: !form.comisionable })}
            style={{ width: '48px', height: '26px', borderRadius: '13px', background: form.comisionable ? '#C0203A' : '#ccc', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
            <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '2px', left: form.comisionable ? '24px' : '2px', transition: 'left 0.2s' }} />
          </div>
          <span style={{ fontSize: '14px', color: '#333' }}>Comisionable</span>
        </div>
      </div>
      <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #f0f0f0', display: 'flex', gap: '8px' }}>
        <button onClick={handleGuardar} disabled={guardando}
          style={{ flex: 1, padding: '14px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', cursor: 'pointer', fontWeight: '500' }}>
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button onClick={() => { handleEliminar(editando); setEditando(null); }}
          style={{ padding: '14px 18px', background: '#FCEBEB', color: '#A32D2D', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
          🗑
        </button>
      </div>
    </div>
  );

  const PanelDetalle = ({ m }) => (
    <div style={{ position: 'fixed', top: 0, right: 0, width: '100%', height: '100dvh', background: '#fff', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '0.5px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '500', margin: 0 }}>Detalle</h3>
        <button onClick={() => setMovDetalle(null)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888' }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600', background: bgTipo[m.tipo], color: colorTipo[m.tipo] }}>{m.tipo}</span>
          <span style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a2e' }}>{fmt(m.monto)}</span>
        </div>
        {[
          ['Desarrollo', m.desarrollo_nombre],
          ['Unidad', `#${m.unidad_numero}`],
          ['Cliente', m.contacto_nombre],
          ['Vendedor', m.vendedor],
          ['Origen', m.origen_cliente],
          ['Plan de Pago', m.plan_pago],
          ['Tipo de Compra', m.tipo_compra],
          ['Comisionable', m.comisionable ? 'Sí' : 'No'],
          ['F. Apartado', fmtFecha(m.fecha_apartado)],
          ['F. Firma', fmtFecha(m.fecha_firma)],
          ['Fecha de carga', fmtFechaHora(m.created_at)],
          ['Cargado por', nombreCargador(m)],
          ['Editado por', nombreEditor(m)],
        ].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', padding: '10px 0', borderBottom: '0.5px solid #f5f5f5', fontSize: '13px' }}>
            <span style={{ width: '130px', color: '#888', flexShrink: 0 }}>{label}</span>
            <span style={{ color: '#333' }}>{val || '—'}</span>
          </div>
        ))}
        {m.tipo === 'Cancelación' && m.fecha_cancelacion && (
          <div style={{ marginTop: '1rem', padding: '12px', background: '#FCEBEB', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#A32D2D', marginBottom: '4px' }}>Cancelación</div>
            <div style={{ fontSize: '13px', color: '#A32D2D' }}>{fmtFecha(m.fecha_cancelacion)}</div>
            {m.motivo_cancelacion && <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>{m.motivo_cancelacion}</div>}
          </div>
        )}
        {m.tipo === 'Cambio de Unidad' && (
          <div style={{ marginTop: '1rem', padding: '12px', background: '#F3F0FF', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#8B5CF6', marginBottom: '4px' }}>Cambio de Unidad</div>
            <div style={{ fontSize: '13px', color: '#8B5CF6' }}>#{m.unidad_inicial} → #{m.unidad_numero}</div>
          </div>
        )}
      </div>
      {puedeEditar && (
        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #f0f0f0', display: 'flex', gap: '8px' }}>
          <button onClick={() => handleEditar(m)} style={{ flex: 1, padding: '12px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}>
            Editar
          </button>
          <button onClick={() => handleEliminar(m.id)} style={{ padding: '12px 16px', background: '#FCEBEB', color: '#A32D2D', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
            🗑
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ fontSize: isMobile ? '17px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Historial de Movimientos</h2>
          <div style={{ fontSize: '13px', color: '#888' }}>{movsFiltrados.length} movimientos</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleExportarPorProyecto}
            style={{ padding: '8px 14px', border: '0.5px solid #ddd', borderRadius: '8px', background: '#fff', fontSize: '12px', cursor: 'pointer', color: '#333' }}
            title="Descarga el historial filtrado, con una hoja por proyecto">
            ⬇ Exportar por proyecto
          </button>
          {miRol === 'Super Admin' && (
            <button onClick={() => setShowConfigVentana(true)}
              style={{ padding: '8px 14px', border: '0.5px solid #ddd', borderRadius: '8px', background: '#fff', fontSize: '12px', cursor: 'pointer', color: '#333' }}
              title="Configurar hasta qué hora del lunes pueden cargar/editar los Gerentes">
              ⏱ Cierre lunes {horaCierre}
            </button>
          )}
          <div style={{ background: '#EAF3DE', borderRadius: '8px', padding: isMobile ? '6px 10px' : '8px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#27500A' }}>Vendidas</div>
            <div style={{ fontSize: isMobile ? '14px' : '18px', fontWeight: '700', color: '#27500A' }}>{totalVendidas}</div>
          </div>
          <div style={{ background: '#EAF3DE', borderRadius: '8px', padding: isMobile ? '6px 10px' : '8px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#27500A' }}>Monto</div>
            <div style={{ fontSize: isMobile ? '12px' : '18px', fontWeight: '700', color: '#27500A' }}>{fmt(totalMonto)}</div>
          </div>
        </div>
      </div>

      {/* FIX: aviso a los Gerentes cuando la ventana de edición está cerrada */}
      {esGerente && !dentroDeVentana() && (
        <div style={{ padding: '12px 16px', background: '#FFF8E1', color: '#856404', borderRadius: '8px', fontSize: '13px', marginBottom: '1rem' }}>
          🔒 La ventana de carga/edición está cerrada por hoy (lunes después de las {horaCierre}). Puedes seguir viendo el historial, pero no editar ni cargar movimientos nuevos hasta el martes.
        </div>
      )}

      {/* Modal configurar ventana */}
      {showConfigVentana && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setShowConfigVentana(false)}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '2rem', maxWidth: '380px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e', marginBottom: '8px' }}>Ventana de cierre semanal</div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '1.5rem' }}>
              Los Gerentes pueden cargar y editar movimientos de martes a lunes, hasta la hora que definas aquí. Después de esa hora del lunes, se bloquea hasta el martes siguiente. Super Admin nunca tiene esta restricción.
            </div>
            <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '6px' }}>Hora de cierre (lunes)</label>
            <input type='time' value={nuevaHoraCierre} onChange={e => setNuevaHoraCierre(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box', marginBottom: '1.5rem', textAlign: 'center', fontWeight: '600' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowConfigVentana(false)} style={{ flex: 1, padding: '10px', background: '#f5f5f5', color: '#333', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarConfigVentana} disabled={guardandoVentana} style={{ flex: 1, padding: '10px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
                {guardandoVentana ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtros móvil */}
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
          {showFiltros && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
              <select value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPagina(0); }}
                style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }}>
                <option value=''>Todos los tipos</option>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filtroDesarrollo} onChange={e => { setFiltroDesarrollo(e.target.value); setPagina(0); }}
                style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }}>
                <option value=''>Todos los desarrollos</option>
                {desarrollos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
              </select>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>Rango de fechas por Fecha de carga (ej. martes a lunes)</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type='date' value={filtroFechaDesde} onChange={e => { setFiltroFechaDesde(e.target.value); setPagina(0); }}
                  style={{ flex: 1, padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }} />
                <input type='date' value={filtroFechaHasta} onChange={e => { setFiltroFechaHasta(e.target.value); setPagina(0); }}
                  style={{ flex: 1, padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }} />
              </div>
              {(filtroFechaDesde || filtroFechaHasta) && (
                <div style={{ fontSize: '11px', color: '#aaa' }}>El rango tiene prioridad — se ignoran Día/Mes/Año mientras esté activo.</div>
              )}
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>O por día/mes/año suelto</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '8px' }}>
                <input type='number' placeholder='Día' value={filtroDia} onChange={e => { setFiltroDia(e.target.value); setPagina(0); }} min='1' max='31'
                  style={{ padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }} />
                <select value={filtroMes} onChange={e => { setFiltroMes(e.target.value); setPagina(0); }}
                  style={{ padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }}>
                  <option value=''>Mes</option>
                  {meses.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                </select>
                <select value={filtroAnio} onChange={e => { setFiltroAnio(e.target.value); setPagina(0); }}
                  style={{ padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }}>
                  <option value=''>Año</option>
                  {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              {(filtroDia || filtroMes || filtroAnio || filtroFechaDesde || filtroFechaHasta) && (
                <button onClick={() => { setFiltroDia(''); setFiltroMes(''); setFiltroAnio(''); setFiltroFechaDesde(''); setFiltroFechaHasta(''); setPagina(0); }}
                  style={{ padding: '8px', background: 'none', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', color: '#888' }}>
                  ✕ Limpiar fecha
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder='Buscar contacto, unidad, vendedor...' value={buscar} onChange={e => { setBuscar(e.target.value); setPagina(0); }}
            style={{ padding: '7px 12px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '240px' }} />
          <select value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPagina(0); }} style={filtroStyle}>
            <option value=''>Todos los tipos</option>
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filtroDesarrollo} onChange={e => { setFiltroDesarrollo(e.target.value); setPagina(0); }} style={filtroStyle}>
            <option value=''>Todos los desarrollos</option>
            {desarrollos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
          </select>
          <div style={{ width: '1px', height: '28px', background: '#e0e0e0', margin: '0 4px' }} />
          <span style={{ fontSize: '12px', color: '#888' }}>Rango (F. carga):</span>
          <input type='date' value={filtroFechaDesde} onChange={e => { setFiltroFechaDesde(e.target.value); setPagina(0); }} style={filtroStyle} />
          <span style={{ fontSize: '12px', color: '#888' }}>a</span>
          <input type='date' value={filtroFechaHasta} onChange={e => { setFiltroFechaHasta(e.target.value); setPagina(0); }} style={filtroStyle} />
          <div style={{ width: '1px', height: '28px', background: '#e0e0e0', margin: '0 4px' }} />
          <input type='number' placeholder='Día' value={filtroDia} onChange={e => { setFiltroDia(e.target.value); setPagina(0); }} min='1' max='31'
            style={{ ...filtroStyle, width: '70px' }} />
          <select value={filtroMes} onChange={e => { setFiltroMes(e.target.value); setPagina(0); }} style={{ ...filtroStyle, width: '120px' }}>
            <option value=''>Mes</option>
            {meses.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
          </select>
          <select value={filtroAnio} onChange={e => { setFiltroAnio(e.target.value); setPagina(0); }} style={{ ...filtroStyle, width: '90px' }}>
            <option value=''>Año</option>
            {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {(filtroDia || filtroMes || filtroAnio || filtroFechaDesde || filtroFechaHasta) && (
            <button onClick={() => { setFiltroDia(''); setFiltroMes(''); setFiltroAnio(''); setFiltroFechaDesde(''); setFiltroFechaHasta(''); setPagina(0); }}
              style={{ padding: '6px 10px', background: 'none', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#888' }}>
              ✕ Limpiar fecha
            </button>
          )}
        </div>
      )}

      {/* Vista móvil: tarjetas */}
      {isMobile ? (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Cargando...</div>
          ) : movsPagina.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Sin movimientos</div>
          ) : movsPagina.map(m => (
            <div key={m.id} onClick={() => setMovDetalle(m)}
              style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '10px', padding: '14px 16px', marginBottom: '8px', cursor: 'pointer', borderLeft: `4px solid ${colorTipo[m.tipo] || '#ccc'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <div>
                  <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: bgTipo[m.tipo], color: colorTipo[m.tipo] }}>{m.tipo}</span>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: '#1a1a2e', marginTop: '4px' }}>{m.contacto_nombre || '—'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: '700', fontSize: '14px', color: '#1a1a2e' }}>{fmt(m.monto)}</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{m.plan_pago || '—'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '12px', color: '#888' }}>
                {m.desarrollo_nombre && <span>🏢 {m.desarrollo_nombre}</span>}
                {estructurasPorUnidad[m.unidad_id] && <span>🏗 {estructurasPorUnidad[m.unidad_id]}</span>}
                {m.unidad_numero && <span>📋 #{m.unidad_numero}</span>}
                {m.vendedor && <span>👔 {m.vendedor}</span>}
              </div>
              {m.fecha_apartado && <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>📅 {fmtFecha(m.fecha_apartado)}</div>}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '1rem', fontSize: '13px', color: '#666' }}>
            <button onClick={() => setPagina(p => Math.max(0, p-1))} disabled={pagina === 0}
              style={{ padding: '8px 16px', border: '0.5px solid #ddd', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>‹</button>
            <span>{pagina * POR_PAGINA + 1}–{Math.min((pagina+1)*POR_PAGINA, movsFiltrados.length)} de {movsFiltrados.length}</span>
            <button onClick={() => setPagina(p => p+1)} disabled={(pagina+1)*POR_PAGINA >= movsFiltrados.length}
              style={{ padding: '8px 16px', border: '0.5px solid #ddd', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>›</button>
          </div>
        </div>
      ) : (
        /* Vista desktop: tabla */
        <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '1420px' }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '0.5px solid #e0e0e0' }}>
                {columnas.map(({ key, label }) => (
                  <th key={key} onClick={() => handleOrden(key)}
                    style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '500', color: '#555', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                    {label}{flecha(key)}
                  </th>
                ))}
                {puedeEditar && <th style={{ padding: '10px 12px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columnas.length + 1} style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Cargando...</td></tr>
              ) : movsPagina.length === 0 ? (
                <tr><td colSpan={columnas.length + 1} style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Sin movimientos</td></tr>
              ) : movsPagina.map(m => (
                <tr key={m.id} style={{ borderBottom: '0.5px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500', background: bgTipo[m.tipo], color: colorTipo[m.tipo] }}>{m.tipo}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#555' }}>{m.desarrollo_nombre || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#888', fontSize: '11px' }}>{estructurasPorUnidad[m.unidad_id] || '—'}</td>
                  <td style={{ padding: '10px 12px', fontWeight: '500', color: '#1a1a2e' }}>#{m.unidad_numero || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#333' }}>{m.contacto_nombre || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#555' }}>{m.origen_cliente || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#555' }}>{m.vendedor || '—'}</td>
                  <td style={{ padding: '10px 12px', fontWeight: '500', color: '#1a1a2e' }}>{fmt(m.monto)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {m.plan_pago ? <span style={{ fontSize: '11px', color: '#3B82F6', fontWeight: '500' }}>{m.plan_pago}</span> : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#555' }}>{m.tipo_compra || '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span style={{ fontSize: '12px', color: m.comisionable ? '#27500A' : '#888' }}>{m.comisionable ? 'Sí' : 'No'}</span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#555', fontSize: '11px' }}>{fmtFecha(m.fecha_apartado)}</td>
                  <td style={{ padding: '10px 12px', color: '#555', fontSize: '11px' }}>{fmtFecha(m.fecha_firma)}</td>
                  <td style={{ padding: '10px 12px', color: '#555', fontSize: '11px', maxWidth: '120px' }}>
                    {m.tipo === 'Cancelación' ? (
                      <div>
                        <div>{fmtFecha(m.fecha_cancelacion)}</div>
                        {m.motivo_cancelacion && <div style={{ color: '#aaa', fontSize: '10px', marginTop: '2px' }}>{m.motivo_cancelacion}</div>}
                      </div>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#555', fontSize: '11px' }}>
                    {m.tipo === 'Cambio de Unidad' ? (
                      <div>
                        <div style={{ fontWeight: '500' }}>#{m.unidad_inicial} → #{m.unidad_numero}</div>
                        {m.plan_pago && <div style={{ color: '#aaa', fontSize: '10px' }}>{m.plan_pago} · {fmt(m.monto)}</div>}
                      </div>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#888', fontSize: '11px', whiteSpace: 'nowrap' }}>{fmtFechaHora(m.created_at)}</td>
                  <td style={{ padding: '10px 12px', color: '#555', fontSize: '11px', whiteSpace: 'nowrap' }}>{m.fecha_movimiento ? fmtFechaHora(m.fecha_movimiento) : '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#555', fontSize: '11px', whiteSpace: 'nowrap' }}>{nombreCargador(m)}</td>
                  <td style={{ padding: '10px 12px', color: '#555', fontSize: '11px', whiteSpace: 'nowrap' }}>{nombreEditor(m)}</td>
                  {puedeEditar && (
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => handleEditar(m)}
                          style={{ background: 'none', border: '0.5px solid #ddd', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', color: '#333' }}>
                          Editar
                        </button>
                        <button onClick={() => handleEliminar(m.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: '15px' }}>
                          🗑
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', borderTop: '0.5px solid #f0f0f0', fontSize: '13px', color: '#666' }}>
            <span>{movsFiltrados.length === 0 ? 0 : pagina * POR_PAGINA + 1}–{Math.min((pagina+1)*POR_PAGINA, movsFiltrados.length)} de {movsFiltrados.length}</span>
            <button onClick={() => setPagina(p => Math.max(0, p-1))} disabled={pagina === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>‹</button>
            <button onClick={() => setPagina(p => p+1)} disabled={(pagina+1)*POR_PAGINA >= movsFiltrados.length} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>›</button>
          </div>
        </div>
      )}

      {movDetalle && isMobile && <PanelDetalle m={movDetalle} />}
      {editando && puedeEditar && panelEditar}
    </div>
  );
}

const labelStyle = { fontSize: '11px', color: '#888', display: 'block', marginBottom: '6px', fontWeight: '500' };
const inputStyle = { width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', background: '#fff' };
const filtroStyle = { padding: '7px 12px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', background: '#fff' };