import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import Inventario from './Inventario';
import Planes from './Planes';

const OPCIONES_NUM = ['0','1','1.5','1 a 2','1 a 3','1 a 4','2 a 3','2 a 4','2','2.5','3 a 4','3 a 5','3','3.5','4 a 5','4','4.5','5'];
const CIUDADES = ['Guadalajara','Zapopan','Tlaquepaque','Tonalá','Mazatlán','Ciudad de México','Monterrey','Cancún','Puerto Vallarta','Los Cabos'];
const TIPOS = ['Preventa','Construcción','Entrega inmediata','Proyecto'];
const MONEDAS = ['Pesos MXN','Dólares USD'];
const AMENIDADES_OPCIONES = [
  'Alberca','Alberca Climatizada','Gimnasio','Área De Asadores','Lobby','Áreas Verdes',
  'Jacuzzi con vista panoramica','Digital Concierge','Área de asoleaderos','Art Gallery',
  'Biblioteca De Objetos','Botadero De Lancha','Laundry Service','Terraza De Baile',
  'Grill Terrace','Video vigilancia','Arenero Infantil','Fitness Box','Spa','Sala De Juegos',
  'Ciclopuerto','Área para mascotas','Pet Park','Buzón Amazon','Cerraduras inteligentes',
  'Terraza con pergolado','Mesas de ping pong','Recolector de reciclaje','Sala De Cine',
  'Huerto Urbano','Áreas de convivencia','Elevador vehicular','Lago Artificial','Roof Top',
  'Cancha De Padel','Sky Bar','Sky Bar Cinema','Área De Estar Para Choferes','Juego infantiles',
  'Fogatero','Pozo De Fuego','Cancha De Tenis','Tool station','Motor Loby',
  'Sala de juntas y coworking','Temazcal','Piscina Infantil','Restaurante Bar',
  'Práctica de golf','Simulador De Golf','Area De Yoga','Salon De Fiesta O Eventos',
  'Cuarto De Mensajeria Y Paqueteria','Elevador','Almacenamiento de entregas','Solario',
  'Kids play room','Coworking','Cine Al Aire Libre','Fitnnes Garden',
  'Estacionamiento privado y de visitas','Ludoteca','Cámaras de seguridad','Sala De Boliche',
  'Sala de usos multiples','Estancia Roof','Pet Shower','Salon De Usos Multiples','Pista De Joggin',
  'Roof Garden','Seguridad 24h','Estacionamiento de visitas','Jardín'
];

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export default function Desarrollos({ miRol: miRolProp, miAgente: miAgenteProp }) {
  const isMobile = useIsMobile();
  const [desarrollos, setDesarrollos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showMenu, setShowMenu] = useState(null);
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(formVacio());
  const [vistaInventario, setVistaInventario] = useState(null);
  const [vistaPlanes, setVistaPlanes] = useState(null);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [subiendoPortada, setSubiendoPortada] = useState(false);
  const [subiendoBrochure, setSubiendoBrochure] = useState(false);
  const [subiendoFotoWeb, setSubiendoFotoWeb] = useState(false);
  const [miAgente, setMiAgente] = useState(miAgenteProp || null);
  const [miRol, setMiRol] = useState(miRolProp || null);
  const [nuevaAmenidad, setNuevaAmenidad] = useState('');
  const [otraCiudad, setOtraCiudad] = useState(false);
  const [tabForm, setTabForm] = useState('general');

  // FIX: filtros de precio y fecha de entrega en el listado de Desarrollos.
  const [filtroPrecioMin, setFiltroPrecioMin] = useState('');
  const [filtroPrecioMax, setFiltroPrecioMax] = useState('');
  const [filtroEntregaDesde, setFiltroEntregaDesde] = useState('');
  const [filtroEntregaHasta, setFiltroEntregaHasta] = useState('');
  // FIX: filtro por recámaras, para combinar con precio (ej. "2
  // recámaras" + "hasta $4,000,000"). Antes solo comparaba contra el
  // campo general "recamaras" del desarrollo (un solo valor por
  // desarrollo), lo que no reflejaba la mezcla real de tipologías. Ahora,
  // en cuanto se elige una opción de recámaras, la búsqueda consulta
  // directo la tabla `inventario` (unidades reales, con su propio
  // recamaras y precio_lista) y solo deja pasar desarrollos que sí
  // tengan al menos una unidad que cumpla exactamente el filtro.
  const [filtroRecamaras, setFiltroRecamaras] = useState('');
  const [idsPorUnidad, setIdsPorUnidad] = useState(null);
  const [buscandoPorUnidad, setBuscandoPorUnidad] = useState(false);
  // FIX: en móvil, los filtros van escondidos detrás de un botón
  // "⚙️ Filtros" (igual que en Contactos/Inventario), en vez de mostrarse
  // siempre en línea junto al buscador — se veía apretado en pantallas chicas.
  const [showFiltrosDesarrollos, setShowFiltrosDesarrollos] = useState(false);

  // FIX: datos que pueden variar por torre/etapa (cuenta bancaria, fecha
  // de entrega, brochure) — antes eran un solo valor para todo el
  // desarrollo, sin importar que cada torre pudiera tener su propia
  // cuenta, fecha de entrega distinta, o su propio brochure.
  const [estructurasData, setEstructurasData] = useState({});
  const [torreEditando, setTorreEditando] = useState(1);
  const [subiendoBrochureTorre, setSubiendoBrochureTorre] = useState(false);

  // FIX: brochures por torre para el menú "···" de cada tarjeta — antes
  // el botón "Brochure" siempre abría el brochure GENERAL del desarrollo
  // (d.brochure_url), ignorando por completo los brochures individuales
  // que ya se guardan por torre en desarrollo_estructuras. Cuando un
  // desarrollo tiene torres, ahora se listan todas con su propio link.
  const [estructurasMenu, setEstructurasMenu] = useState({});

  function formVacio() {
    return {
      nombre: '', tipo: '', direccion: '', ciudad: '', codigo_postal: '',
      coordenadas: '', area: '', telefono: '', telefono_whatsapp: '',
      amenidades: [], mensaje_whatsapp: '', precio_desde: 0, apartado: 0,
      precio_en: 'Pesos MXN', fecha_entrega: '', datos_bancarios: '',
      tiempo_entrega: '', recamaras: '', estacionamiento: '', banos: '',
      dueno: '', descripcion: '', video: '', landing_url: '', activo: true,
      logo_url: '', portada_url: '', brochure_url: '',
      mostrar_web: false, galeria_web: [],
      tiene_etapas: false, tipo_estructura: 'Etapa', num_estructuras: 1
    };
  }

  function estructuraVacia() {
    return { datos_bancarios: '', fecha_entrega: '', brochure_url: '' };
  }

  useEffect(() => {
    if (miRolProp) { setMiAgente(miAgenteProp || null); setMiRol(miRolProp); }
    else cargarMiAgente();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miRolProp, miAgenteProp]);

  useEffect(() => { if (miRol !== null) cargarDesarrollos(); }, [buscar, miAgente, miRol]);

  // FIX: cuando se elige un filtro de recámaras, busca en `inventario`
  // (unidades reales) las que cumplan recamaras + rango de precio, y
  // arma la lista de desarrollo_id que sí tienen al menos una unidad así.
  useEffect(() => {
    let cancelado = false;
    const buscarPorUnidad = async () => {
      if (!filtroRecamaras) { setIdsPorUnidad(null); return; }
      setBuscandoPorUnidad(true);
      let query = supabase.from('inventario').select('desarrollo_id').eq('recamaras', filtroRecamaras);
      if (filtroPrecioMin) query = query.gte('precio_lista', Number(filtroPrecioMin));
      if (filtroPrecioMax) query = query.lte('precio_lista', Number(filtroPrecioMax));
      const { data } = await query.limit(5000);
      if (!cancelado) {
        setIdsPorUnidad([...new Set((data || []).map(u => u.desarrollo_id))]);
        setBuscandoPorUnidad(false);
      }
    };
    buscarPorUnidad();
    return () => { cancelado = true; };
  }, [filtroRecamaras, filtroPrecioMin, filtroPrecioMax]);

  const cargarMiAgente = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('agentes').select('*').eq('correo', user.email).single();
      setMiAgente(data || null);
      setMiRol(data?.rol || 'Agente');
    } else { setMiRol('Agente'); }
  };

  const cargarDesarrollos = async () => {
    setLoading(true);
    let query = supabase.from('desarrollos').select('*').order('nombre');
    if (miRol === 'Super Admin' || miRol === 'Admin' || miRol === 'Sub Admin') {
    } else if (miAgente?.desarrollos?.length > 0) {
      query = query.in('nombre', miAgente.desarrollos);
    } else { setDesarrollos([]); setLoading(false); return; }
    if (buscar) query = query.ilike('nombre', `%${buscar}%`);
    const { data } = await query;
    setDesarrollos(data || []);
    setLoading(false);
  };

  // FIX: trae las filas de desarrollo_estructuras ya guardadas para este
  // desarrollo y las acomoda en un objeto { "Torre 1": {...}, "Torre 2": {...} }
  const cargarEstructuras = async (desarrolloId, tipoEstructura, numEstructuras) => {
    const { data } = await supabase.from('desarrollo_estructuras').select('*').eq('desarrollo_id', desarrolloId);
    const mapa = {};
    for (let i = 1; i <= (numEstructuras || 1); i++) {
      const nombreTorre = `${tipoEstructura || 'Etapa'} ${i}`;
      const existente = (data || []).find(e => e.nombre === nombreTorre);
      mapa[nombreTorre] = existente
        ? { datos_bancarios: existente.datos_bancarios || '', fecha_entrega: existente.fecha_entrega || '', brochure_url: existente.brochure_url || '' }
        : estructuraVacia();
    }
    setEstructurasData(mapa);
    setTorreEditando(1);
  };

  // FIX: abre el menú "···" de la tarjeta y, si el desarrollo tiene
  // torres/etapas, precarga sus brochures individuales (una sola vez,
  // se guarda en caché en estructurasMenu) para poder listarlos.
  const handleAbrirMenu = async (d) => {
    if (showMenu === d.id) { setShowMenu(null); return; }
    setShowMenu(d.id);
    if (d.tiene_etapas && !estructurasMenu[d.id]) {
      const { data } = await supabase.from('desarrollo_estructuras').select('nombre, brochure_url').eq('desarrollo_id', d.id).order('nombre');
      setEstructurasMenu(prev => ({ ...prev, [d.id]: data || [] }));
    }
  };

  const puedeEditar = (desarrollo) => {
    if (miRol === 'Super Admin' || miRol === 'Admin' || miRol === 'Sub Admin') return true;
    if (miRol === 'Gerente Editor' || miRol === 'Mesa de Control') return (miAgente?.desarrollos_cargo || []).includes(desarrollo.nombre);
    return false;
  };

  // FIX: cuando se crea un desarrollo NUEVO, se le agrega automáticamente
  // a cualquier agente que tenga la bandera desarrollos_todos = true (la
  // que se activa con el botón "✓ Todos" en Agentes.js) — así no hay que
  // volver a entrar a cada perfil para agregarlo a mano.
  const sincronizarDesarrolloNuevoATodos = async (nombreNuevo) => {
    const { data: agentesTodos } = await supabase.from('agentes').select('id, desarrollos').eq('desarrollos_todos', true);
    for (const a of agentesTodos || []) {
      const actuales = a.desarrollos || [];
      if (!actuales.includes(nombreNuevo)) {
        await supabase.from('agentes').update({ desarrollos: [...actuales, nombreNuevo] }).eq('id', a.id);
      }
    }
  };

  const handleGuardar = async () => {
    if (!form.nombre.trim()) return;
    setGuardando(true);
    // fecha_entrega es columna `date` — '' no es una fecha válida para Postgres.
    const payload = { ...form, fecha_entrega: form.fecha_entrega || null };
    let desarrolloId = editando;
    const esNuevo = !editando;
    let error;
    if (editando) {
      ({ error } = await supabase.from('desarrollos').update(payload).eq('id', editando));
    } else {
      const { data, error: insertError } = await supabase.from('desarrollos').insert([payload]).select().single();
      error = insertError;
      if (!error && data) desarrolloId = data.id;
    }
    if (error) {
      alert('No se pudo guardar el desarrollo: ' + error.message);
      setGuardando(false);
      return;
    }
    if (esNuevo && desarrolloId) await sincronizarDesarrolloNuevoATodos(form.nombre);

    // FIX: guardar los datos por torre/etapa, si el desarrollo tiene
    if (desarrolloId && form.tiene_etapas) {
      for (let i = 1; i <= (form.num_estructuras || 1); i++) {
        const nombreTorre = `${form.tipo_estructura} ${i}`;
        const datos = estructurasData[nombreTorre] || estructuraVacia();
        const { error: errorEstructura } = await supabase.from('desarrollo_estructuras').upsert({
          desarrollo_id: desarrolloId, nombre: nombreTorre,
          datos_bancarios: datos.datos_bancarios || null,
          fecha_entrega: datos.fecha_entrega || null,
          brochure_url: datos.brochure_url || null,
        }, { onConflict: 'desarrollo_id,nombre' });
        if (errorEstructura) alert(`No se pudieron guardar los datos de ${nombreTorre}: ` + errorEstructura.message);
      }
    }

    setGuardando(false);
    setShowForm(false); setEditando(null); setForm(formVacio()); setOtraCiudad(false);
    setEstructurasData({});
    // FIX: si se editó un desarrollo, invalida el caché de brochures del
    // menú para que la próxima vez que se abra jale los datos frescos.
    if (desarrolloId) setEstructurasMenu(prev => { const n = { ...prev }; delete n[desarrolloId]; return n; });
    cargarDesarrollos();
  };

  const handleEliminar = async (id) => {
    if (!window.confirm('¿Eliminar este desarrollo y todos sus datos?')) return;

    const desarrollo = desarrollos.find(d => d.id === id);
    if (!desarrollo) return;
    setShowMenu(null);

    try {
      if (desarrollo.nombre) {
        await supabase.from('contactos').delete().eq('desarrollo', desarrollo.nombre);
      }

      await supabase.from('movimientos').delete().eq('desarrollo_id', id);
      await supabase.from('inventario').delete().eq('desarrollo_id', id);
      await supabase.from('planes_pago').delete().eq('desarrollo_id', id);
      await supabase.from('objetivos').delete().eq('desarrollo_id', id);
      await supabase.from('desarrollo_estructuras').delete().eq('desarrollo_id', id);

      const { error } = await supabase.from('desarrollos').delete().eq('id', id);
      if (error) {
        alert('Error al eliminar: ' + error.message);
        return;
      }

      cargarDesarrollos();
    } catch (err) {
      console.error('Error inesperado:', err);
      alert('Error inesperado al eliminar');
    }
  };

  const handleEditar = (d) => {
    setForm({ ...formVacio(), ...d });
    setEditando(d.id); setShowForm(true); setShowMenu(null); setTabForm('general');
    setOtraCiudad(!CIUDADES.includes(d.ciudad) && !!d.ciudad);
    if (d.tiene_etapas) cargarEstructuras(d.id, d.tipo_estructura, d.num_estructuras);
    else setEstructurasData({});
  };

  const handleToggleAmenidad = (a) => {
    const arr = form.amenidades || [];
    setForm({ ...form, amenidades: arr.includes(a) ? arr.filter(x => x !== a) : [...arr, a] });
  };

  const handleAgregarAmenidad = () => {
    const val = nuevaAmenidad.trim();
    if (val && !(form.amenidades || []).includes(val)) {
      setForm({ ...form, amenidades: [...(form.amenidades || []), val] });
      setNuevaAmenidad('');
    }
  };

  const handleSubirArchivo = async (e, tipo) => {
    const file = e.target.files[0];
    if (!file) return;
    if (tipo === 'logo') setSubiendoLogo(true);
    else if (tipo === 'portada') setSubiendoPortada(true);
    else setSubiendoBrochure(true);
    const ext = file.name.split('.').pop();
    const fileName = `${editando || 'nuevo'}_${tipo}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('desarrollos').upload(fileName, file, { upsert: true });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('desarrollos').getPublicUrl(fileName);
      if (tipo === 'logo') setForm(f => ({ ...f, logo_url: publicUrl }));
      else if (tipo === 'portada') setForm(f => ({ ...f, portada_url: publicUrl }));
      else setForm(f => ({ ...f, brochure_url: publicUrl }));
    } else {
      alert('No se pudo subir el archivo: ' + error.message);
    }
    if (tipo === 'logo') setSubiendoLogo(false);
    else if (tipo === 'portada') setSubiendoPortada(false);
    else setSubiendoBrochure(false);
  };

  // FIX: galería de fotos para la página web pública (galeria_web) — se
  // agregan una por una, hasta 12, independiente de logo/portada/brochure.
  const MAX_FOTOS_WEB = 12;
  const handleSubirFotoWeb = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if ((form.galeria_web || []).length >= MAX_FOTOS_WEB) { alert(`Máximo ${MAX_FOTOS_WEB} fotos en la galería`); return; }
    setSubiendoFotoWeb(true);
    const ext = file.name.split('.').pop();
    const fileName = `${editando || 'nuevo'}_web_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('desarrollos').upload(fileName, file, { upsert: true });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('desarrollos').getPublicUrl(fileName);
      setForm(f => ({ ...f, galeria_web: [...(f.galeria_web || []), publicUrl] }));
    } else {
      alert('No se pudo subir la foto: ' + error.message);
    }
    setSubiendoFotoWeb(false);
  };
  const handleQuitarFotoWeb = (idx) => {
    setForm(f => ({ ...f, galeria_web: (f.galeria_web || []).filter((_, i) => i !== idx) }));
  };

  // FIX: subir un brochure específico para la torre que se está editando
  const handleSubirBrochureTorre = async (e, nombreTorre) => {
    const file = e.target.files[0];
    if (!file) return;
    setSubiendoBrochureTorre(true);
    const ext = file.name.split('.').pop();
    const fileName = `${editando || 'nuevo'}_${nombreTorre.replace(/\s/g, '_')}_brochure_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('desarrollos').upload(fileName, file, { upsert: true });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('desarrollos').getPublicUrl(fileName);
      setEstructurasData(prev => ({ ...prev, [nombreTorre]: { ...(prev[nombreTorre] || estructuraVacia()), brochure_url: publicUrl } }));
    } else {
      alert('No se pudo subir el brochure: ' + error.message);
    }
    setSubiendoBrochureTorre(false);
  };

  const actualizarCampoTorre = (nombreTorre, campo, valor) => {
    setEstructurasData(prev => ({ ...prev, [nombreTorre]: { ...(prev[nombreTorre] || estructuraVacia()), [campo]: valor } }));
  };

  const inp = (label, key, type = 'text') => (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>{label}</label>
      <input type={type} value={form[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })}
        style={{ width: '100%', padding: isMobile ? '10px' : '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px', boxSizing: 'border-box' }} />
    </div>
  );

  const sel = (label, key, opciones) => (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>{label}</label>
      <select value={form[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })}
        style={{ width: '100%', padding: isMobile ? '10px' : '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px', background: '#fff' }}>
        <option value=''>Elige una opción...</option>
        {opciones.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  // FIX: bloque de configuración por torre/etapa — chips para elegir cuál
  // torre se está editando, y sus 3 campos (cuenta bancaria, fecha de
  // entrega, brochure) independientes del resto.
  const bloqueEstructuras = () => {
    const nombreTorreActual = `${form.tipo_estructura} ${torreEditando}`;
    const datosTorre = estructurasData[nombreTorreActual] || estructuraVacia();
    return (
      <div style={{ marginTop: '10px', paddingTop: '14px', borderTop: '0.5px dashed #ddd' }}>
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px', fontWeight: '500' }}>
          DATOS POR {form.tipo_estructura.toUpperCase()} (cuenta bancaria, fecha de entrega y brochure pueden ser distintos en cada una)
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {Array.from({ length: form.num_estructuras || 1 }, (_, i) => i + 1).map(n => (
            <button key={n} type="button" onClick={() => setTorreEditando(n)}
              style={{ padding: '6px 14px', borderRadius: '20px', border: '0.5px solid', cursor: 'pointer', fontSize: '12px',
                background: torreEditando === n ? '#C0203A' : '#fff',
                color: torreEditando === n ? '#fff' : '#666',
                borderColor: torreEditando === n ? '#C0203A' : '#ddd' }}>
              {form.tipo_estructura} {n}
            </button>
          ))}
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Fecha de entrega — {nombreTorreActual}</label>
          <input type='date' value={datosTorre.fecha_entrega || ''} onChange={e => actualizarCampoTorre(nombreTorreActual, 'fecha_entrega', e.target.value)}
            style={{ width: '100%', padding: isMobile ? '10px' : '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Datos bancarios — {nombreTorreActual}</label>
          <textarea value={datosTorre.datos_bancarios || ''} onChange={e => actualizarCampoTorre(nombreTorreActual, 'datos_bancarios', e.target.value)} rows={3}
            style={{ width: '100%', padding: isMobile ? '10px' : '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px', boxSizing: 'border-box', resize: 'vertical' }} />
        </div>
        <div>
          <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '8px' }}>Brochure — {nombreTorreActual}</label>
          {datosTorre.brochure_url && <a href={datosTorre.brochure_url} target='_blank' rel='noreferrer' style={{ fontSize: '12px', color: '#C0203A', display: 'block', marginBottom: '8px' }}>📄 Ver brochure actual</a>}
          <label style={{ ...btnOutline, display: 'inline-block', cursor: 'pointer', fontSize: '12px' }}>
            {subiendoBrochureTorre ? 'Subiendo...' : '📎 Subir brochure'}
            <input type='file' accept='application/pdf' onChange={e => handleSubirBrochureTorre(e, nombreTorreActual)} style={{ display: 'none' }} />
          </label>
        </div>
      </div>
    );
  };

  if (vistaInventario) return <Inventario desarrollo={vistaInventario} onBack={() => setVistaInventario(null)} />;
  if (vistaPlanes) return <Planes desarrollo={vistaPlanes} onBack={() => setVistaPlanes(null)} miRol={miRol} miAgente={miAgente} />;

  // FIX: filtros de precio (precio_desde) y fecha de entrega (fecha_entrega
  // general del desarrollo), aplicados sobre lo que ya llegó del servidor.
  const desarrollosFiltrados = desarrollos.filter(d => {
    if (filtroEntregaDesde && (!d.fecha_entrega || d.fecha_entrega < filtroEntregaDesde)) return false;
    if (filtroEntregaHasta && (!d.fecha_entrega || d.fecha_entrega > filtroEntregaHasta)) return false;
    if (filtroRecamaras) {
      // Modo preciso: mientras carga la consulta a inventario, no se
      // oculta nada todavía (evita parpadeo de lista vacía).
      if (buscandoPorUnidad || idsPorUnidad === null) return true;
      return idsPorUnidad.includes(d.id);
    }
    if (filtroPrecioMin && Number(d.precio_desde || 0) < Number(filtroPrecioMin)) return false;
    if (filtroPrecioMax && Number(d.precio_desde || 0) > Number(filtroPrecioMax)) return false;
    return true;
  });

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem', position: 'relative' }} onClick={() => setShowMenu(null)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: isMobile ? '17px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Desarrollos</h2>
          <div style={{ fontSize: '13px', color: '#888' }}>{desarrollosFiltrados.length} desarrollos</div>
        </div>
        {(miRol === 'Super Admin' || miRol === 'Admin' || miRol === 'Sub Admin') && (
          <button onClick={() => { setShowForm(true); setEditando(null); setForm(formVacio()); setOtraCiudad(false); setTabForm('general'); setEstructurasData({}); }}
            style={{ ...btnPrimary, padding: isMobile ? '10px 14px' : '8px 16px', fontSize: isMobile ? '14px' : '13px' }}>
            + {isMobile ? 'Nuevo' : 'Crear desarrollo'}
          </button>
        )}
      </div>

      {/* FIX: filtros de precio y entrega — panel colapsable en móvil
          (buscador + botón "⚙️ Filtros"), fila en línea en escritorio. */}
      {isMobile ? (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input placeholder='Buscar...' value={buscar} onChange={e => setBuscar(e.target.value)}
              style={{ flex: 1, padding: '10px 12px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '14px' }} />
            <button onClick={() => setShowFiltrosDesarrollos(f => !f)}
              style={{ padding: '10px 14px', border: '0.5px solid #ddd', borderRadius: '8px', background: showFiltrosDesarrollos ? '#C0203A' : '#fff', color: showFiltrosDesarrollos ? '#fff' : '#333', fontSize: '13px', cursor: 'pointer' }}>
              ⚙️ Filtros
            </button>
          </div>
          {showFiltrosDesarrollos && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input placeholder='Precio mín.' type='number' value={filtroPrecioMin} onChange={e => setFiltroPrecioMin(e.target.value)}
                  style={{ ...filtroStyle, flex: 1, padding: '10px' }} />
                <input placeholder='Precio máx.' type='number' value={filtroPrecioMax} onChange={e => setFiltroPrecioMax(e.target.value)}
                  style={{ ...filtroStyle, flex: 1, padding: '10px' }} />
              </div>
              <select value={filtroRecamaras} onChange={e => setFiltroRecamaras(e.target.value)}
                style={{ ...filtroStyle, width: '100%', padding: '10px' }}>
                <option value=''>Todas las recámaras</option>
                {OPCIONES_NUM.filter(o => o !== '').map(o => <option key={o} value={o}>{o} recámara{o !== '1' ? 's' : ''}</option>)}
              </select>
              {filtroRecamaras && (
                <div style={{ fontSize: '11px', color: '#aaa' }}>
                  {buscandoPorUnidad ? 'Buscando unidades...' : 'Con recámaras elegidas, el precio busca en unidades reales del inventario.'}
                </div>
              )}
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>Fecha de entrega</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type='date' value={filtroEntregaDesde} onChange={e => setFiltroEntregaDesde(e.target.value)}
                  style={{ ...filtroStyle, flex: 1, padding: '10px' }} />
                <input type='date' value={filtroEntregaHasta} onChange={e => setFiltroEntregaHasta(e.target.value)}
                  style={{ ...filtroStyle, flex: 1, padding: '10px' }} />
              </div>
              {(filtroPrecioMin || filtroPrecioMax || filtroEntregaDesde || filtroEntregaHasta || filtroRecamaras) && (
                <button onClick={() => { setFiltroPrecioMin(''); setFiltroPrecioMax(''); setFiltroEntregaDesde(''); setFiltroEntregaHasta(''); setFiltroRecamaras(''); }}
                  style={{ background: 'none', border: 'none', color: '#C0203A', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline', textAlign: 'left', padding: '4px 0' }}>
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder='Buscar...' value={buscar} onChange={e => setBuscar(e.target.value)}
            style={{ padding: '7px 12px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '200px', boxSizing: 'border-box' }} />
          <input placeholder='Precio mín.' type='number' value={filtroPrecioMin} onChange={e => setFiltroPrecioMin(e.target.value)}
            style={{ ...filtroStyle, width: '120px' }} />
          <input placeholder='Precio máx.' type='number' value={filtroPrecioMax} onChange={e => setFiltroPrecioMax(e.target.value)}
            style={{ ...filtroStyle, width: '120px' }} />
          <select value={filtroRecamaras} onChange={e => setFiltroRecamaras(e.target.value)} style={filtroStyle}>
            <option value=''>Recámaras</option>
            {OPCIONES_NUM.filter(o => o !== '').map(o => <option key={o} value={o}>{o} recámara{o !== '1' ? 's' : ''}</option>)}
          </select>
          {filtroRecamaras && buscandoPorUnidad && (
            <span style={{ fontSize: '11px', color: '#aaa' }}>Buscando unidades...</span>
          )}
          <span style={{ fontSize: '12px', color: '#888' }}>Entrega:</span>
          <input type='date' value={filtroEntregaDesde} onChange={e => setFiltroEntregaDesde(e.target.value)} style={filtroStyle} />
          <span style={{ fontSize: '12px', color: '#888' }}>a</span>
          <input type='date' value={filtroEntregaHasta} onChange={e => setFiltroEntregaHasta(e.target.value)} style={filtroStyle} />
          {(filtroPrecioMin || filtroPrecioMax || filtroEntregaDesde || filtroEntregaHasta || filtroRecamaras) && (
            <button onClick={() => { setFiltroPrecioMin(''); setFiltroPrecioMax(''); setFiltroEntregaDesde(''); setFiltroEntregaHasta(''); setFiltroRecamaras(''); }}
              style={{ background: 'none', border: 'none', color: '#C0203A', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>Cargando...</div>
      ) : desarrollosFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>
          {desarrollos.length > 0 ? 'Ningún desarrollo coincide con los filtros' : (miRol === 'Super Admin' || miRol === 'Admin' ? 'Sin desarrollos' : 'No tienes desarrollos asignados')}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '16px' }}>
          {desarrollosFiltrados.map(d => (
            <div key={d.id} style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px' }}>
              <div style={{ height: isMobile ? '140px' : '160px', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px 12px 0 0', overflow: 'hidden' }}>
                {d.portada_url ? (
                  <img src={d.portada_url} alt={d.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '40px' }}>🏢</span>
                )}
              </div>
              <div style={{ padding: isMobile ? '12px' : '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', fontSize: '14px', color: '#1a1a2e', marginBottom: '4px' }}>{d.nombre}</div>
                    {d.precio_desde > 0 && <div style={{ fontSize: '12px', color: '#666' }}>Desde: ${Number(d.precio_desde).toLocaleString()}</div>}
                    {d.fecha_entrega && <div style={{ fontSize: '12px', color: '#666' }}>Entrega: {d.fecha_entrega}</div>}
                    {d.ciudad && <div style={{ fontSize: '12px', color: '#666' }}>📍 {d.ciudad}</div>}
                    {d.mostrar_web && (
                      <span style={{ display: 'inline-block', marginTop: '6px', fontSize: '10px', padding: '2px 8px', borderRadius: '20px', background: '#EAF3DE', color: '#27500A', fontWeight: '500' }}>
                        🌐 En la web
                      </span>
                    )}
                    {d.tiene_etapas && (
                      <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                        ✓ {d.num_estructuras} {d.tipo_estructura}{d.num_estructuras > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                  <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleAbrirMenu(d)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#666', padding: '4px 8px' }}>
                      ···
                    </button>
                    {showMenu === d.id && (
                      <div style={{ position: 'absolute', right: 0, top: '32px', background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, minWidth: '170px' }}>
                        {(miRol === 'Super Admin' || miRol === 'Admin' || miRol === 'Sub Admin' || miRol === 'Gerente Editor' || miRol === 'Mesa de Control') && (
                          <button onClick={() => { setVistaPlanes(d); setShowMenu(null); }}
                            style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', textAlign: 'left', color: '#333' }}>
                            💳 Planes
                          </button>
                        )}
                        <button onClick={() => { setVistaInventario(d); setShowMenu(null); }}
                          style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', textAlign: 'left', color: '#333' }}>
                          📦 Inventario
                        </button>
                        {/* FIX: si el desarrollo tiene torres/etapas, se listan los
                            brochures de CADA una (desarrollo_estructuras) en vez de
                            un solo botón que siempre abría el brochure general. */}
                        {d.tiene_etapas ? (
                          !estructurasMenu[d.id] ? (
                            <div style={{ padding: '12px 16px', fontSize: '13px', color: '#aaa' }}>Cargando brochures...</div>
                          ) : estructurasMenu[d.id].length === 0 ? (
                            <div style={{ padding: '12px 16px', fontSize: '13px', color: '#ccc' }}>Sin brochures cargados</div>
                          ) : (
                            estructurasMenu[d.id].map(e => (
                              <button key={e.nombre} onClick={() => { if (e.brochure_url) window.open(e.brochure_url, '_blank'); setShowMenu(null); }}
                                style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', textAlign: 'left', color: e.brochure_url ? '#333' : '#ccc' }}>
                                📄 Brochure {e.nombre}
                              </button>
                            ))
                          )
                        ) : (
                          <button onClick={() => { if (d.brochure_url) window.open(d.brochure_url, '_blank'); setShowMenu(null); }}
                            style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', textAlign: 'left', color: d.brochure_url ? '#333' : '#ccc' }}>
                            📄 Brochure
                          </button>
                        )}
                        {puedeEditar(d) && (
                          <button onClick={() => handleEditar(d)}
                            style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', textAlign: 'left', color: '#333' }}>
                            ✏️ Editar
                          </button>
                        )}
                        {(miRol === 'Super Admin' || miRol === 'Admin') && (
                          <button onClick={() => handleEliminar(d.id)}
                            style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', textAlign: 'left', color: '#e53935' }}>
                            🗑 Eliminar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '12px', color: '#888' }}>
                  {d.recamaras && <span>🛏 {d.recamaras}</span>}
                  {d.banos && <span>🚿 {d.banos}</span>}
                  {d.estacionamiento && <span>🚗 {d.estacionamiento}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (miRol === 'Super Admin' || miRol === 'Admin' || miRol === 'Sub Admin') && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, overflowY: 'auto' }}>
          <div style={{ background: '#fff', margin: '0', minHeight: '100vh', padding: isMobile ? '1rem' : '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '0.5px solid #f0f0f0', position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
              <h3 style={{ fontSize: '17px', fontWeight: '500' }}>{editando ? 'Editar desarrollo' : 'Crear desarrollo'}</h3>
              <button onClick={() => { setShowForm(false); setEditando(null); setOtraCiudad(false); }}
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#888' }}>×</button>
            </div>

            {isMobile && (
              <div style={{ display: 'flex', background: '#f5f5f5', borderRadius: '10px', padding: '4px', marginBottom: '16px', gap: '4px', overflowX: 'auto' }}>
                {[
                  ['general', 'General'], ['amenidades', 'Amenidades'], ['precios', 'Precios'], ['media', 'Fotos'],
                  ...(miRol === 'Super Admin' ? [['web', 'Web']] : []),
                ].map(([key, label]) => (
                  <button key={key} onClick={() => setTabForm(key)}
                    style={{ flex: 1, padding: '8px 6px', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: tabForm === key ? '600' : '400', background: tabForm === key ? '#C0203A' : 'transparent', color: tabForm === key ? '#fff' : '#888', whiteSpace: 'nowrap' }}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            {isMobile ? (
              <div>
                {tabForm === 'general' && (
                  <div>
                    {inp('Nombre', 'nombre')}
                    {sel('Tipo', 'tipo', TIPOS)}
                    {inp('Dirección', 'direccion')}
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Ciudad</label>
                      <select value={otraCiudad ? '__otra__' : (form.ciudad || '')}
                        onChange={e => {
                          if (e.target.value === '__otra__') { setOtraCiudad(true); setForm({ ...form, ciudad: '' }); }
                          else { setOtraCiudad(false); setForm({ ...form, ciudad: e.target.value }); }
                        }}
                        style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff', marginBottom: otraCiudad ? '6px' : '0' }}>
                        <option value=''>Elige una opción...</option>
                        {CIUDADES.map(o => <option key={o} value={o}>{o}</option>)}
                        <option value='__otra__'>Otra ciudad...</option>
                      </select>
                      {otraCiudad && (
                        <input placeholder='Escribe la ciudad...' value={form.ciudad} onChange={e => setForm({ ...form, ciudad: e.target.value })}
                          style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
                      )}
                    </div>
                    {inp('Código Postal', 'codigo_postal')}
                    {sel('Recámaras', 'recamaras', OPCIONES_NUM)}
                    {sel('Estacionamiento', 'estacionamiento', OPCIONES_NUM)}
                    {sel('Baños', 'banos', OPCIONES_NUM)}
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Descripción</label>
                      <textarea value={form.descripcion || ''} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={3}
                        style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', resize: 'vertical' }} />
                    </div>
                    {inp('Video URL', 'video')}
                    {inp('Landing URL', 'landing_url')}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                      <input type='checkbox' checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} id='activo' style={{ width: '18px', height: '18px' }} />
                      <label htmlFor='activo' style={{ fontSize: '14px', color: '#333' }}>Activo</label>
                    </div>
                    <div style={{ marginBottom: '14px', padding: '14px', background: '#f9f9f9', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                        <input type='checkbox' id='tiene_etapas' checked={form.tiene_etapas} onChange={e => setForm({ ...form, tiene_etapas: e.target.checked })} style={{ width: '18px', height: '18px' }} />
                        <label htmlFor='tiene_etapas' style={{ fontSize: '14px', color: '#333', fontWeight: '500' }}>¿Tiene etapas o torres?</label>
                      </div>
                      {form.tiene_etapas && (
                        <>
                          <div style={{ marginBottom: '10px' }}>
                            <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '6px' }}>Tipo de estructura</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {['Etapa', 'Torre'].map(t => (
                                <button key={t} type="button" onClick={() => setForm({ ...form, tipo_estructura: t })}
                                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '0.5px solid', cursor: 'pointer', fontSize: '14px', background: form.tipo_estructura === t ? '#C0203A' : '#fff', color: form.tipo_estructura === t ? '#fff' : '#666', borderColor: form.tipo_estructura === t ? '#C0203A' : '#ddd' }}>
                                  {t}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Número de {form.tipo_estructura}s</label>
                            <select value={form.num_estructuras} onChange={e => setForm({ ...form, num_estructuras: parseInt(e.target.value) })}
                              style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }}>
                              {[2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n} {form.tipo_estructura}s</option>)}
                            </select>
                          </div>
                          {bloqueEstructuras()}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {tabForm === 'amenidades' && (
                  <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                      {AMENIDADES_OPCIONES.map(a => (
                        <button key={a} onClick={() => handleToggleAmenidad(a)}
                          style={{ padding: '8px 12px', borderRadius: '20px', border: '0.5px solid', cursor: 'pointer', fontSize: '13px', background: (form.amenidades || []).includes(a) ? '#C0203A' : '#f5f5f5', color: (form.amenidades || []).includes(a) ? '#fff' : '#666', borderColor: (form.amenidades || []).includes(a) ? '#C0203A' : '#ddd' }}>
                          {a}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input placeholder='Amenidad personalizada...' value={nuevaAmenidad} onChange={e => setNuevaAmenidad(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAgregarAmenidad(); } }}
                        style={{ flex: 1, padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px' }} />
                      <button onClick={handleAgregarAmenidad}
                        style={{ padding: '10px 16px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', cursor: 'pointer' }}>+</button>
                    </div>
                  </div>
                )}

                {tabForm === 'precios' && (
                  <div>
                    {miRol === 'Super Admin' && inp('Precio desde', 'precio_desde', 'number')}
                    {inp('Apartado', 'apartado', 'number')}
                    {sel('Precio en', 'precio_en', MONEDAS)}
                    {inp('Fecha de entrega', 'fecha_entrega', 'date')}
                    {inp('Tiempo estimado de entrega', 'tiempo_entrega')}
                    {inp('Teléfono', 'telefono')}
                    {inp('Teléfono WhatsApp', 'telefono_whatsapp')}
                    {inp('Mensaje WhatsApp', 'mensaje_whatsapp')}
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Datos bancarios</label>
                      <textarea value={form.datos_bancarios || ''} onChange={e => setForm({ ...form, datos_bancarios: e.target.value })} rows={4}
                        style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', resize: 'vertical' }} />
                    </div>
                    {form.tiene_etapas && (
                      <div style={{ fontSize: '11px', color: '#aaa', marginTop: '-8px', marginBottom: '14px' }}>
                        Nota: si cada {form.tipo_estructura.toLowerCase()} tiene su propia fecha/cuenta/brochure, configúralo en la pestaña "General" — esto de aquí es el valor general del desarrollo.
                      </div>
                    )}
                  </div>
                )}

                {tabForm === 'media' && (
                  <div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '8px' }}>Logo del desarrollo</label>
                      {form.logo_url && <img src={form.logo_url} alt="logo" style={{ height: '60px', objectFit: 'contain', marginBottom: '8px', display: 'block' }} />}
                      <label style={{ ...btnOutline, display: 'inline-block', cursor: 'pointer', fontSize: '14px', padding: '10px 16px' }}>
                        {subiendoLogo ? 'Subiendo...' : '📷 Subir logo'}
                        <input type='file' accept='image/*' onChange={e => handleSubirArchivo(e, 'logo')} style={{ display: 'none' }} />
                      </label>
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '8px' }}>Imagen de portada</label>
                      {form.portada_url && <img src={form.portada_url} alt="portada" style={{ width: '100%', height: '140px', objectFit: 'cover', marginBottom: '8px', borderRadius: '6px' }} />}
                      <label style={{ ...btnOutline, display: 'inline-block', cursor: 'pointer', fontSize: '14px', padding: '10px 16px' }}>
                        {subiendoPortada ? 'Subiendo...' : '🖼 Subir portada'}
                        <input type='file' accept='image/*' onChange={e => handleSubirArchivo(e, 'portada')} style={{ display: 'none' }} />
                      </label>
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '8px' }}>Brochure general (PDF)</label>
                      {form.brochure_url && <a href={form.brochure_url} target='_blank' rel='noreferrer' style={{ fontSize: '13px', color: '#C0203A', display: 'block', marginBottom: '8px' }}>📄 Ver brochure actual</a>}
                      <label style={{ ...btnOutline, display: 'inline-block', cursor: 'pointer', fontSize: '14px', padding: '10px 16px' }}>
                        {subiendoBrochure ? 'Subiendo...' : '📎 Subir brochure'}
                        <input type='file' accept='application/pdf' onChange={e => handleSubirArchivo(e, 'brochure')} style={{ display: 'none' }} />
                      </label>
                    </div>
                  </div>
                )}
                {tabForm === 'web' && miRol === 'Super Admin' && (
                  <div>
                    <div style={{ marginBottom: '20px', padding: '14px', background: form.mostrar_web ? '#EAF3DE' : '#f9f9f9', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div onClick={() => setForm({ ...form, mostrar_web: !form.mostrar_web })}
                        style={{ width: '44px', height: '24px', borderRadius: '12px', background: form.mostrar_web ? '#27500A' : '#ccc', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                        <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '2px', left: form.mostrar_web ? '22px' : '2px', transition: 'left 0.15s' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '500', color: '#1a1a2e' }}>Mostrar en la página web</div>
                        <div style={{ fontSize: '12px', color: '#888' }}>{form.mostrar_web ? 'Visible en bsh.mx' : 'Oculto del sitio público'}</div>
                      </div>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Coordenadas (para el mapa)</label>
                      <input value={form.coordenadas || ''} onChange={e => setForm({ ...form, coordenadas: e.target.value })} placeholder='20.6597,-103.3496'
                        style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
                      <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Formato: latitud,longitud — cópialo directo de Google Maps (clic derecho sobre el punto → clic en las coordenadas)</div>
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '8px' }}>Galería de fotos ({(form.galeria_web || []).length}/{MAX_FOTOS_WEB})</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                        {(form.galeria_web || []).map((url, i) => (
                          <div key={i} style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden' }}>
                            <img src={url} alt='' style={{ width: '100%', height: '90px', objectFit: 'cover', display: 'block' }} />
                            <button onClick={() => handleQuitarFotoWeb(i)} style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                          </div>
                        ))}
                      </div>
                      {(form.galeria_web || []).length < MAX_FOTOS_WEB && (
                        <label style={{ ...btnOutline, display: 'inline-block', cursor: 'pointer', fontSize: '14px', padding: '10px 16px' }}>
                          {subiendoFotoWeb ? 'Subiendo...' : '+ Agregar foto'}
                          <input type='file' accept='image/*' onChange={handleSubirFotoWeb} style={{ display: 'none' }} />
                        </label>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
                <div>
                  {inp('Nombre', 'nombre')}
                  {sel('Tipo', 'tipo', TIPOS)}
                  {inp('Dirección', 'direccion')}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Ciudad</label>
                    <select value={otraCiudad ? '__otra__' : (form.ciudad || '')}
                      onChange={e => {
                        if (e.target.value === '__otra__') { setOtraCiudad(true); setForm({ ...form, ciudad: '' }); }
                        else { setOtraCiudad(false); setForm({ ...form, ciudad: e.target.value }); }
                      }}
                      style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', background: '#fff', marginBottom: otraCiudad ? '6px' : '0' }}>
                      <option value=''>Elige una opción...</option>
                      {CIUDADES.map(o => <option key={o} value={o}>{o}</option>)}
                      <option value='__otra__'>Otra ciudad...</option>
                    </select>
                    {otraCiudad && (
                      <input placeholder='Escribe la ciudad...' value={form.ciudad} onChange={e => setForm({ ...form, ciudad: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                    )}
                  </div>
                  {inp('Código Postal', 'codigo_postal')}
                  {inp('Coordenadas', 'coordenadas')}
                  {inp('Área', 'area')}
                  {inp('Teléfono', 'telefono')}
                  {inp('Teléfono WhatsApp', 'telefono_whatsapp')}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '8px' }}>Logo del desarrollo</label>
                    {form.logo_url && <img src={form.logo_url} alt="logo" style={{ height: '60px', objectFit: 'contain', marginBottom: '8px', display: 'block' }} />}
                    <label style={{ ...btnOutline, display: 'inline-block', cursor: 'pointer', fontSize: '12px' }}>
                      {subiendoLogo ? 'Subiendo...' : '📷 Subir logo'}
                      <input type='file' accept='image/*' onChange={e => handleSubirArchivo(e, 'logo')} style={{ display: 'none' }} />
                    </label>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '8px' }}>Imagen de portada</label>
                    {form.portada_url && <img src={form.portada_url} alt="portada" style={{ width: '100%', height: '100px', objectFit: 'cover', marginBottom: '8px', borderRadius: '6px' }} />}
                    <label style={{ ...btnOutline, display: 'inline-block', cursor: 'pointer', fontSize: '12px' }}>
                      {subiendoPortada ? 'Subiendo...' : '🖼 Subir portada'}
                      <input type='file' accept='image/*' onChange={e => handleSubirArchivo(e, 'portada')} style={{ display: 'none' }} />
                    </label>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '8px' }}>Brochure general (PDF)</label>
                    {form.brochure_url && <a href={form.brochure_url} target='_blank' rel='noreferrer' style={{ fontSize: '12px', color: '#C0203A', display: 'block', marginBottom: '8px' }}>📄 Ver brochure actual</a>}
                    <label style={{ ...btnOutline, display: 'inline-block', cursor: 'pointer', fontSize: '12px' }}>
                      {subiendoBrochure ? 'Subiendo...' : '📎 Subir brochure'}
                      <input type='file' accept='application/pdf' onChange={e => handleSubirArchivo(e, 'brochure')} style={{ display: 'none' }} />
                    </label>
                  </div>
                </div>

                <div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '8px' }}>Amenidades</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '200px', overflowY: 'auto', padding: '4px' }}>
                      {AMENIDADES_OPCIONES.map(a => (
                        <button key={a} onClick={() => handleToggleAmenidad(a)}
                          style={{ padding: '4px 10px', borderRadius: '20px', border: '0.5px solid', cursor: 'pointer', fontSize: '12px', background: (form.amenidades || []).includes(a) ? '#C0203A' : '#f5f5f5', color: (form.amenidades || []).includes(a) ? '#fff' : '#666', borderColor: (form.amenidades || []).includes(a) ? '#C0203A' : '#ddd' }}>
                          {a}
                        </button>
                      ))}
                      {(form.amenidades || []).filter(a => !AMENIDADES_OPCIONES.includes(a)).map(a => (
                        <button key={a} onClick={() => handleToggleAmenidad(a)}
                          style={{ padding: '4px 10px', borderRadius: '20px', border: '0.5px solid', cursor: 'pointer', fontSize: '12px', background: '#C0203A', color: '#fff', borderColor: '#C0203A' }}>
                          {a} ✕
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <input placeholder='Agregar amenidad personalizada...' value={nuevaAmenidad} onChange={e => setNuevaAmenidad(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAgregarAmenidad(); } }}
                        style={{ flex: 1, padding: '6px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '12px' }} />
                      <button onClick={handleAgregarAmenidad}
                        style={{ padding: '6px 12px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                        + Agregar
                      </button>
                    </div>
                  </div>
                  {inp('Mensaje WhatsApp', 'mensaje_whatsapp')}
                  {miRol === 'Super Admin' && inp('Precio desde', 'precio_desde', 'number')}
                  {inp('Apartado', 'apartado', 'number')}
                  {sel('Precio en', 'precio_en', MONEDAS)}
                  {inp('Fecha de entrega', 'fecha_entrega', 'date')}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Datos bancarios</label>
                    <textarea value={form.datos_bancarios || ''} onChange={e => setForm({ ...form, datos_bancarios: e.target.value })} rows={4}
                      style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', resize: 'vertical' }} />
                  </div>
                  {inp('Tiempo estimado de entrega', 'tiempo_entrega')}
                  {form.tiene_etapas && (
                    <div style={{ fontSize: '11px', color: '#aaa', marginTop: '-8px' }}>
                      Nota: lo de arriba es el valor general. Para configurar fecha/cuenta/brochure por {form.tipo_estructura.toLowerCase()}, ve a la columna de la derecha →
                    </div>
                  )}
                </div>

                <div>
                  {sel('Recámaras', 'recamaras', OPCIONES_NUM)}
                  {sel('Estacionamiento', 'estacionamiento', OPCIONES_NUM)}
                  {sel('Baños', 'banos', OPCIONES_NUM)}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Descripción</label>
                    <textarea value={form.descripcion || ''} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={4}
                      style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', resize: 'vertical' }} />
                  </div>
                  {inp('Video URL', 'video')}
                  {inp('Landing URL', 'landing_url')}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <input type='checkbox' checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} id='activo' />
                    <label htmlFor='activo' style={{ fontSize: '13px', color: '#333' }}>Activo</label>
                  </div>
                  <div style={{ marginBottom: '16px', padding: '14px', background: '#f9f9f9', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <input type='checkbox' id='tiene_etapas' checked={form.tiene_etapas} onChange={e => setForm({ ...form, tiene_etapas: e.target.checked })} />
                      <label htmlFor='tiene_etapas' style={{ fontSize: '13px', color: '#333', fontWeight: '500' }}>¿Tiene etapas o torres?</label>
                    </div>
                    {form.tiene_etapas && (
                      <>
                        <div style={{ marginBottom: '10px' }}>
                          <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '6px' }}>Tipo de estructura</label>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {['Etapa', 'Torre'].map(t => (
                              <button key={t} type="button" onClick={() => setForm({ ...form, tipo_estructura: t })}
                                style={{ padding: '6px 16px', borderRadius: '20px', border: '0.5px solid', cursor: 'pointer', fontSize: '13px', background: form.tipo_estructura === t ? '#C0203A' : '#fff', color: form.tipo_estructura === t ? '#fff' : '#666', borderColor: form.tipo_estructura === t ? '#C0203A' : '#ddd' }}>
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Número de {form.tipo_estructura}s</label>
                          <select value={form.num_estructuras} onChange={e => setForm({ ...form, num_estructuras: parseInt(e.target.value) })}
                            style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', background: '#fff' }}>
                            {[2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n} {form.tipo_estructura}s</option>)}
                          </select>
                        </div>
                        {bloqueEstructuras()}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* FIX: sección Web — controla qué se publica en bsh.mx — solo Super Admin */}
              {miRol === 'Super Admin' && (
              <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '16px' }}>Página Web</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
                  <div>
                    <div style={{ padding: '14px', background: form.mostrar_web ? '#EAF3DE' : '#f9f9f9', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <div onClick={() => setForm({ ...form, mostrar_web: !form.mostrar_web })}
                        style={{ width: '44px', height: '24px', borderRadius: '12px', background: form.mostrar_web ? '#27500A' : '#ccc', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                        <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '2px', left: form.mostrar_web ? '22px' : '2px', transition: 'left 0.15s' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: '#1a1a2e' }}>Mostrar en la página web</div>
                        <div style={{ fontSize: '11px', color: '#888' }}>{form.mostrar_web ? 'Visible en bsh.mx' : 'Oculto del sitio público'}</div>
                      </div>
                    </div>
                    <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Coordenadas (para el mapa)</label>
                    <input value={form.coordenadas || ''} onChange={e => setForm({ ...form, coordenadas: e.target.value })} placeholder='20.6597,-103.3496'
                      style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                    <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Formato: latitud,longitud — cópialo de Google Maps (clic derecho sobre el punto → clic en las coordenadas)</div>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '8px' }}>Galería de fotos ({(form.galeria_web || []).length}/{MAX_FOTOS_WEB})</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '12px' }}>
                      {(form.galeria_web || []).map((url, i) => (
                        <div key={i} style={{ position: 'relative', borderRadius: '6px', overflow: 'hidden' }}>
                          <img src={url} alt='' style={{ width: '100%', height: '80px', objectFit: 'cover', display: 'block' }} />
                          <button onClick={() => handleQuitarFotoWeb(i)} style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '11px' }}>✕</button>
                        </div>
                      ))}
                    </div>
                    {(form.galeria_web || []).length < MAX_FOTOS_WEB && (
                      <label style={{ ...btnOutline, display: 'inline-block', cursor: 'pointer', fontSize: '12px' }}>
                        {subiendoFotoWeb ? 'Subiendo...' : '+ Agregar foto'}
                        <input type='file' accept='image/*' onChange={handleSubirFotoWeb} style={{ display: 'none' }} />
                      </label>
                    )}
                  </div>
                </div>
              </div>
              )}
              </>
            )}

            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleGuardar} disabled={guardando}
                style={{ ...btnPrimary, padding: isMobile ? '14px 32px' : '12px 32px', fontSize: isMobile ? '15px' : '13px', width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
                {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear desarrollo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary = { background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '500', display: 'flex', alignItems: 'center' };
const btnOutline = { background: '#fff', color: '#333', border: '0.5px solid #ddd', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' };
const filtroStyle = { padding: '7px 12px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', background: '#fff', boxSizing: 'border-box' };