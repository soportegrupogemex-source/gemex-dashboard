import React, { useState, useEffect, useRef } from 'react';
import { enviarPush } from './enviarPush';
import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import DetalleContacto from './DetalleContacto';

const ESTATUS_OPCIONES = ['Prospecto', 'Prospecto Calificado', 'Cliente', 'No interesado'];
const MEDIO_OPCIONES = ['Autogeneración', 'Mensaje WhatsApp', 'Campañas digitales', 'Referido', 'Portal inmobiliario', 'Showroom'];
const TIEMPO_COMPRA_OPCIONES = ['Inmediato', '1 a 3 meses', '3 a 6 meses', '6 a 12 meses', 'Más de 1 año'];
const TIPO_COMPRA_OPCIONES = ['Contado', 'Crédito hipotecario', 'Infonavit', 'Fovissste'];
const ROLES_VER_TODOS = ['Super Admin', 'Admin', 'Sub Admin'];
// FIX: para elegir libremente el asesor de ventas al crear un contacto,
// el requisito es más estricto que ROLES_VER_TODOS — excluye a Sub Admin.
const ROLES_ELIGEN_ASESOR = ['Super Admin', 'Admin'];

const LADAS = [
  { code: '+52', flag: '🇲🇽', abbr: 'MX', country: 'México' },
  { code: '+1', flag: '🇺🇸', abbr: 'US', country: 'Estados Unidos' },
  { code: '+1CA', flag: '🇨🇦', abbr: 'CA', country: 'Canadá' },
  { code: '+54', flag: '🇦🇷', abbr: 'AR', country: 'Argentina' },
  { code: '+55', flag: '🇧🇷', abbr: 'BR', country: 'Brasil' },
  { code: '+56', flag: '🇨🇱', abbr: 'CL', country: 'Chile' },
  { code: '+57', flag: '🇨🇴', abbr: 'CO', country: 'Colombia' },
  { code: '+51', flag: '🇵🇪', abbr: 'PE', country: 'Perú' },
  { code: '+58', flag: '🇻🇪', abbr: 'VE', country: 'Venezuela' },
  { code: '+502', flag: '🇬🇹', abbr: 'GT', country: 'Guatemala' },
  { code: '+503', flag: '🇸🇻', abbr: 'SV', country: 'El Salvador' },
  { code: '+504', flag: '🇭🇳', abbr: 'HN', country: 'Honduras' },
  { code: '+505', flag: '🇳🇮', abbr: 'NI', country: 'Nicaragua' },
  { code: '+506', flag: '🇨🇷', abbr: 'CR', country: 'Costa Rica' },
  { code: '+507', flag: '🇵🇦', abbr: 'PA', country: 'Panamá' },
  { code: '+53', flag: '🇨🇺', abbr: 'CU', country: 'Cuba' },
  { code: '+1809', flag: '🇩🇴', abbr: 'DO', country: 'Rep. Dominicana' },
  { code: '+598', flag: '🇺🇾', abbr: 'UY', country: 'Uruguay' },
  { code: '+591', flag: '🇧🇴', abbr: 'BO', country: 'Bolivia' },
  { code: '+593', flag: '🇪🇨', abbr: 'EC', country: 'Ecuador' },
  { code: '+595', flag: '🇵🇾', abbr: 'PY', country: 'Paraguay' },
  { code: '+34', flag: '🇪🇸', abbr: 'ES', country: 'España' },
  { code: '+44', flag: '🇬🇧', abbr: 'GB', country: 'Reino Unido' },
  { code: '+33', flag: '🇫🇷', abbr: 'FR', country: 'Francia' },
  { code: '+49', flag: '🇩🇪', abbr: 'DE', country: 'Alemania' },
  { code: '+39', flag: '🇮🇹', abbr: 'IT', country: 'Italia' },
  { code: '+31', flag: '🇳🇱', abbr: 'NL', country: 'Países Bajos' },
  { code: '+32', flag: '🇧🇪', abbr: 'BE', country: 'Bélgica' },
  { code: '+41', flag: '🇨🇭', abbr: 'CH', country: 'Suiza' },
  { code: '+43', flag: '🇦🇹', abbr: 'AT', country: 'Austria' },
  { code: '+351', flag: '🇵🇹', abbr: 'PT', country: 'Portugal' },
  { code: '+7', flag: '🇷🇺', abbr: 'RU', country: 'Rusia' },
  { code: '+81', flag: '🇯🇵', abbr: 'JP', country: 'Japón' },
  { code: '+82', flag: '🇰🇷', abbr: 'KR', country: 'Corea del Sur' },
  { code: '+86', flag: '🇨🇳', abbr: 'CN', country: 'China' },
  { code: '+91', flag: '🇮🇳', abbr: 'IN', country: 'India' },
  { code: '+61', flag: '🇦🇺', abbr: 'AU', country: 'Australia' },
  { code: '+64', flag: '🇳🇿', abbr: 'NZ', country: 'Nueva Zelanda' },
  { code: '+27', flag: '🇿🇦', abbr: 'ZA', country: 'Sudáfrica' },
  { code: '+20', flag: '🇪🇬', abbr: 'EG', country: 'Egipto' },
  { code: '+971', flag: '🇦🇪', abbr: 'AE', country: 'Emiratos Árabes' },
  { code: '+966', flag: '🇸🇦', abbr: 'SA', country: 'Arabia Saudita' },
  { code: '+972', flag: '🇮🇱', abbr: 'IL', country: 'Israel' },
  { code: '+90', flag: '🇹🇷', abbr: 'TR', country: 'Turquía' },
];

const CAMPOS_REQUERIDOS = [
  ['nombres', 'Nombres'], ['apellidos', 'Apellidos'], ['correo', 'Correo'],
  ['telefono', 'Teléfono'], ['desarrollo', 'Desarrollo'], ['estatus', 'Estatus'],
  ['tiempo_compra', 'Tiempo de compra'], ['tipo_compra', 'Tipo de compra'], ['fuente_medio', 'Fuente de medio'],
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

function LadaDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = LADAS.find(l => l.code === value) || LADAS[0];
  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: '20px', lineHeight: 1 }}>{selected.flag}</span>
        <span style={{ color: '#444', fontWeight: '500' }}>{selected.abbr}</span>
        <span style={{ color: '#999', fontSize: '11px' }}>{selected.code === '+1CA' ? '+1' : selected.code}</span>
        <span style={{ color: '#bbb', fontSize: '10px', marginLeft: '2px' }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 9999, background: '#fff', border: '0.5px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto', minWidth: '230px' }}>
          {LADAS.map(l => (
            <button key={l.code} type="button" onClick={() => { onChange(l.code); setOpen(false); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: 'none', background: l.code === value ? '#f5f5f5' : 'transparent', cursor: 'pointer', fontSize: '13px', textAlign: 'left' }}>
              <span style={{ fontSize: '18px' }}>{l.flag}</span>
              <span style={{ fontWeight: '500', color: '#333', width: '28px' }}>{l.abbr}</span>
              <span style={{ color: '#aaa', fontSize: '12px', width: '38px' }}>{l.code === '+1CA' ? '+1' : l.code}</span>
              <span style={{ color: '#888', fontSize: '12px' }}>{l.country}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function diasRestantes(ultimaActividad, vigenciaDias) {
  if (!ultimaActividad) return vigenciaDias;
  const diff = (new Date() - new Date(ultimaActividad)) / (1000 * 60 * 60 * 24);
  return Math.max(0, vigenciaDias - Math.floor(diff));
}

function BadgeVigencia({ dias, alertaDias, vigenciaActiva, estatus }) {
  // FIX: "No interesado" se distingue con gris — es un contacto liberado
  // a propósito, distinto de uno que se venció por falta de seguimiento
  // (ese sigue en rojo). Tiene prioridad sobre el resto de los cálculos.
  if (estatus === 'No interesado') return <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', background: '#F0F0F0', color: '#888', fontWeight: '500' }}>No interesado</span>;
  if (vigenciaActiva === false || dias <= 0) return <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', background: '#FCEBEB', color: '#A32D2D', fontWeight: '500' }}>Expirado</span>;
  if (dias <= alertaDias) return <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', background: '#FFF3CD', color: '#856404', fontWeight: '500' }}>⚠️ {dias}d</span>;
  return <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', background: '#EAF3DE', color: '#27500A' }}>{dias}d</span>;
}

export default function Contactos() {
  const isMobile = useIsMobile();
  const [contactos, setContactos] = useState([]);
  const [desarrollos, setDesarrollos] = useState([]);
  const [agentes, setAgentes] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [filtroMedio, setFiltroMedio] = useState('');
  const [filtroEstatus, setFiltroEstatus] = useState('');
  const [filtroDesarrollo, setFiltroDesarrollo] = useState('');
  // FIX: filtros nuevos — registrado por, rango de fecha de creación, y vigencia
  const [filtroRegistradoPor, setFiltroRegistradoPor] = useState('');
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');
  const [filtroVigencia, setFiltroVigencia] = useState('');
  const [pagina, setPagina] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [contactoDetalle, setContactoDetalle] = useState(null);
  const [lada, setLada] = useState('+52');
  const [miAgente, setMiAgente] = useState(null);
  const [miRol, setMiRol] = useState(null);
  const [vigenciaDias, setVigenciaDias] = useState(30);
  const [showVigenciaModal, setShowVigenciaModal] = useState(false);
  const [nuevaVigencia, setNuevaVigencia] = useState(30);
  // FIX: umbral de días para la alerta de "próximos a vencer" — antes
  // estaba fijo en 5 dentro del código, ahora es configurable y se guarda
  // en la misma tabla `configuracion` que ya usas para vigenciaDias.
  const [alertaDias, setAlertaDias] = useState(5);
  const [showAlertaDiasModal, setShowAlertaDiasModal] = useState(false);
  const [nuevaAlertaDias, setNuevaAlertaDias] = useState(5);
  const [showAlertaVigencia, setShowAlertaVigencia] = useState(false);
  const [contactosAlerta, setContactosAlerta] = useState([]);
  // FIX: alertas de "interés cruzado" — mismo contacto preguntó en otro
  // desarrollo mientras lo tiene registrado otro asesor.
  const [showAlertaCruzada, setShowAlertaCruzada] = useState(false);
  const [alertasCruzadas, setAlertasCruzadas] = useState([]);
  const [showFiltros, setShowFiltros] = useState(false);
  const [form, setForm] = useState({
    nombres: '', apellidos: '', correo: '', telefono: '',
    edad: '', cumpleanos: '', desarrollo: '', estatus: '',
    tiempo_compra: '', tipo_compra: '', asesor_ventas: '',
    presupuesto: '', fuente_medio: '', razon_no_compra: ''
  });
  const [guardando, setGuardando] = useState(false);
  const POR_PAGINA = 100;

  // FIX: importador de histórico masivo (contactos ya limpios y con
  // asesor resuelto por ID desde el CRM viejo) — inserta por lotes
  // directo a la base, sin crear cuentas, con detección de duplicados
  // contra lo que ya existe en `contactos`.
  const [showImportHistorico, setShowImportHistorico] = useState(false);
  const [filasHistorico, setFilasHistorico] = useState([]);
  const [nombreArchivoHistorico, setNombreArchivoHistorico] = useState('');
  const [importandoHistorico, setImportandoHistorico] = useState(false);
  const [pausadoHistorico, setPausadoHistorico] = useState(false);
  const [progresoHistorico, setProgresoHistorico] = useState({ procesados: 0, total: 0, exitosos: 0, saltados: 0, errores: 0 });
  const [erroresHistorico, setErroresHistorico] = useState([]);
  const [msgHistorico, setMsgHistorico] = useState('');
  const pausarHistoricoRef = useRef(false);
  const importHistoricoInputRef = useRef(null);
  const LS_KEY_HISTORICO = 'bsh_import_contactos_historico_procesados';
  const TAMANO_LOTE_HISTORICO = 200;
  const CORREO_SUPER_ADMIN_FALLBACK = 'adrianurbinaf@gmail.com';

  useEffect(() => { cargarMiAgente(); cargarAgentes(); cargarVigencia(); cargarAlertaDias(); cargarDesarrollos(); }, []);
  // FIX: recarga desarrollos una vez que ya se conoce miRol/miAgente —
  // el primer llamado (arriba) corre antes de saber el rol, así que para
  // Mesa de Control el filtro por desarrollos_cargo no aplicaría a tiempo.
  useEffect(() => { if (miRol !== null) cargarDesarrollos(); }, [miRol, miAgente]);
  useEffect(() => {
    if (miRol !== null) { cargarContactos(); }
  }, [buscar, filtroMedio, filtroEstatus, filtroDesarrollo, filtroRegistradoPor, filtroFechaDesde, filtroFechaHasta, filtroVigencia, pagina, miRol, miAgente, vigenciaDias, alertaDias]);
  // FIX: revisa alertas de interés cruzado una sola vez al conocer el rol
  useEffect(() => { if (miRol !== null) cargarAlertasCruzadas(); }, [miRol, miAgente]);

  const cargarMiAgente = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('agentes').select('*').eq('correo', user.email).single();
      setMiAgente(data || null);
      setMiRol(data?.rol || 'Agente');
    }
  };

  const cargarAgentes = async () => {
    const { data } = await supabase.from('agentes').select('id, nombre, apellidos, correo').eq('activo', true).order('nombre');
    setAgentes(data || []);
  };

  const cargarVigencia = async () => {
    const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'vigencia_dias').single();
    if (data) { setVigenciaDias(parseInt(data.valor)); setNuevaVigencia(parseInt(data.valor)); }
  };

  const guardarVigencia = async () => {
    await supabase.from('configuracion').upsert({ clave: 'vigencia_dias', valor: String(nuevaVigencia) }, { onConflict: 'clave' });
    setVigenciaDias(nuevaVigencia);
    setShowVigenciaModal(false);
  };

  // FIX: carga y guarda el umbral de la alerta de "próximos a vencer"
  const cargarAlertaDias = async () => {
    const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'alerta_dias').single();
    if (data) { setAlertaDias(parseInt(data.valor)); setNuevaAlertaDias(parseInt(data.valor)); }
  };

  const guardarAlertaDias = async () => {
    await supabase.from('configuracion').upsert({ clave: 'alerta_dias', valor: String(nuevaAlertaDias) }, { onConflict: 'clave' });
    setAlertaDias(nuevaAlertaDias);
    setShowAlertaDiasModal(false);
  };

  // FIX: todos los roles pueden crear contactos para cualquier desarrollo activo,
  // sin restringirse a sus "desarrollos_cargo" o "desarrollos" asignados —
  // EXCEPTO Mesa de Control, que solo debe ver/usar sus propios desarrollos.
  const cargarDesarrollos = async () => {
    const { data } = await supabase.from('desarrollos').select('*').eq('activo', true).order('nombre');
    if (miRol === 'Mesa de Control') {
      const cargo = miAgente?.desarrollos_cargo || [];
      setDesarrollos((data || []).filter(d => cargo.includes(d.nombre)));
    } else {
      setDesarrollos(data || []);
    }
  };

  const verificarExpiracion = async (contactosList) => {
    if (!contactosList?.length || !vigenciaDias) return;
    const ahora = new Date();
    const expirados = contactosList.filter(c => {
      if (!c.ultima_actividad) return false;
      const diff = (ahora - new Date(c.ultima_actividad)) / (1000 * 60 * 60 * 24);
      return diff >= vigenciaDias && c.vigencia_activa;
    });
    if (expirados.length > 0) {
      for (const c of expirados) {
        await supabase.from('contactos').update({ vigencia_activa: false }).eq('id', c.id);
      }
    }
    const proximos = contactosList.filter(c => {
      if (!c.ultima_actividad || !c.vigencia_activa) return false;
      const d = diasRestantes(c.ultima_actividad, vigenciaDias);
      return d > 0 && d <= alertaDias;
    });
    if (proximos.length > 0) { setContactosAlerta(proximos); setShowAlertaVigencia(true); }
  };

  // FIX: carga alertas de interés cruzado y las filtra al mismo alcance
  // que ya rige la visibilidad de Contactos por rol — si el usuario ya
  // puede ver ese contacto hoy en su lista, ve su alerta. El "ya la vi"
  // ahora es POR PERSONA (tabla contacto_alertas_leidas) — antes era una
  // sola bandera compartida en la alerta, así que si un Super Admin la
  // cerraba primero, desaparecía también para el asesor dueño del
  // contacto aunque nunca la hubiera visto.
  const cargarAlertasCruzadas = async () => {
    if (!miRol || !miAgente?.correo) return;
    const { data } = await supabase.from('contacto_alertas_cruzadas')
      .select('id, desarrollo_interes, created_at, contactos(id, nombres, apellidos, creado_por, asesor_ventas, desarrollo)')
      .order('created_at', { ascending: false }).limit(500);
    if (!data || data.length === 0) return;

    const { data: leidas } = await supabase.from('contacto_alertas_leidas').select('alerta_id').eq('leido_por', miAgente.correo);
    const idsLeidas = new Set((leidas || []).map(l => l.alerta_id));

    const correo = miAgente?.correo || '';
    const nombreCompleto = miAgente ? `${miAgente.nombre || ''} ${miAgente.apellidos || ''}`.trim() : '';
    const cargo = miAgente?.desarrollos_cargo || [];
    const agentesCargoCorreos = miAgente?.agentes_cargo || [];
    const nombresEquipoExterno = agentesCargoCorreos
      .map(c => { const ag = agentes.find(a => a.correo === c); return ag ? `${ag.nombre} ${ag.apellidos}`.trim() : ''; })
      .filter(Boolean);

    const enMiAlcance = (c) => {
      if (!c) return false;
      if (ROLES_VER_TODOS.includes(miRol)) return true;
      if (miRol === 'Agente' || miRol === 'Asesor Premium' || miRol === 'Desarrollador') {
        return c.creado_por === correo || c.asesor_ventas === nombreCompleto;
      }
      if (miRol === 'Mesa de Control') {
        const esDeMiEquipo = c.creado_por === correo || c.asesor_ventas === nombreCompleto || nombresEquipoExterno.includes(c.asesor_ventas);
        return esDeMiEquipo && cargo.includes(c.desarrollo);
      }
      if (miRol === 'Gerente Editor' || miRol === 'Gerente Operador') {
        return c.creado_por === correo || cargo.includes(c.desarrollo);
      }
      return false;
    };

    const filtradas = data.filter(a => !idsLeidas.has(a.id) && enMiAlcance(a.contactos));
    if (filtradas.length > 0) { setAlertasCruzadas(filtradas); setShowAlertaCruzada(true); }
  };

  const handleCerrarAlertaCruzada = async () => {
    const ids = alertasCruzadas.map(a => a.id);
    setShowAlertaCruzada(false);
    if (ids.length > 0 && miAgente?.correo) {
      const filas = ids.map(id => ({ alerta_id: id, leido_por: miAgente.correo }));
      await supabase.from('contacto_alertas_leidas').upsert(filas, { onConflict: 'alerta_id,leido_por' });
    }
  };

  const cargarContactos = async () => {
    setLoading(true);
    let query = supabase.from('contactos').select('*', { count: 'exact' });
    if (ROLES_VER_TODOS.includes(miRol)) {
    } else if (miRol === 'Agente' || miRol === 'Asesor Premium' || miRol === 'Desarrollador') {
      // FIX BUG DE VISIBILIDAD: antes solo se filtraba por `creado_por`
      // (quién dio de alta el contacto originalmente). Si un Super
      // Admin/Admin reasignaba el contacto a otro agente cambiando
      // "Asesor de ventas" desde el detalle, ese campo (asesor_ventas)
      // cambiaba pero `creado_por` se quedaba igual — así que el nuevo
      // agente asignado NUNCA veía el contacto en su lista. Ahora se
      // incluyen también los contactos donde el agente es el asesor de
      // ventas asignado actualmente, aunque no lo haya creado él.
      const correo = miAgente?.correo || '';
      const nombreCompleto = miAgente ? `${miAgente.nombre || ''} ${miAgente.apellidos || ''}`.trim() : '';
      if (correo) {
        if (nombreCompleto) {
          const nombreEscapado = nombreCompleto.replace(/"/g, '\\"');
          query = query.or(`creado_por.eq.${correo},asesor_ventas.eq."${nombreEscapado}"`);
        } else {
          query = query.eq('creado_por', correo);
        }
      } else { setContactos([]); setTotal(0); setLoading(false); return; }
    } else if (miRol === 'Gerente Editor' || miRol === 'Gerente Operador') {
      // Ve sus propios contactos creados (cualquier desarrollo) + los de sus desarrollos a cargo
      const cargo = miAgente?.desarrollos_cargo || [];
      const correo = miAgente?.correo || '';
      if (cargo.length > 0 && correo) {
        const listaDesarrollos = cargo.map(d => `"${d.replace(/"/g, '\\"')}"`).join(',');
        query = query.or(`creado_por.eq.${correo},desarrollo.in.(${listaDesarrollos})`);
      } else if (correo) {
        query = query.eq('creado_por', correo);
      } else { setContactos([]); setTotal(0); setLoading(false); return; }
    } else if (miRol === 'Mesa de Control') {
      // FIX: Mesa de Control (trabaja para el desarrollador) solo ve
      // contactos de SU GENTE (él + los agentes que tiene a cargo,
      // asignados manualmente), y solo dentro de sus desarrollos
      // asignados — a diferencia de Gerente Editor/Operador, que ven
      // TODOS los contactos del desarrollo sin importar quién los trajo.
      const cargo = miAgente?.desarrollos_cargo || [];
      const correo = miAgente?.correo || '';
      const agentesCargoCorreos = miAgente?.agentes_cargo || [];
      if (cargo.length === 0 || !correo) { setContactos([]); setTotal(0); setLoading(false); return; }
      const correosEquipo = [correo, ...agentesCargoCorreos];
      const nombreCompleto = miAgente ? `${miAgente.nombre || ''} ${miAgente.apellidos || ''}`.trim() : '';
      const nombresEquipo = [
        nombreCompleto,
        ...agentesCargoCorreos.map(c => {
          const ag = agentes.find(a => a.correo === c);
          return ag ? `${ag.nombre} ${ag.apellidos}`.trim() : '';
        }),
      ].filter(Boolean);
      const condsCreadoPor = correosEquipo.map(c => `creado_por.eq.${c}`).join(',');
      const condsAsesor = nombresEquipo.map(n => `asesor_ventas.eq."${n.replace(/"/g, '\\"')}"`).join(',');
      query = query.or([condsCreadoPor, condsAsesor].filter(Boolean).join(',')).in('desarrollo', cargo);
    } else { setContactos([]); setTotal(0); setLoading(false); return; }

    if (buscar) query = query.or(`nombres.ilike.%${buscar}%,apellidos.ilike.%${buscar}%,correo.ilike.%${buscar}%,telefono.ilike.%${buscar}%,asesor_ventas.ilike.%${buscar}%`);
    if (filtroMedio) query = query.eq('fuente_medio', filtroMedio);
    if (filtroEstatus) query = query.eq('estatus', filtroEstatus);
    if (filtroDesarrollo) query = query.eq('desarrollo', filtroDesarrollo);
    if (filtroRegistradoPor) query = query.eq('asesor_ventas', filtroRegistradoPor);
    if (filtroFechaDesde) query = query.gte('created_at', `${filtroFechaDesde}T00:00:00`);
    if (filtroFechaHasta) query = query.lte('created_at', `${filtroFechaHasta}T23:59:59`);
    if (filtroVigencia === 'Expirado') {
      query = query.eq('vigencia_activa', false);
    } else if (filtroVigencia === 'Proximo' || filtroVigencia === 'Activo') {
      const umbral = new Date();
      umbral.setDate(umbral.getDate() - (vigenciaDias - alertaDias));
      query = query.eq('vigencia_activa', true);
      if (filtroVigencia === 'Proximo') {
        query = query.not('ultima_actividad', 'is', null).lte('ultima_actividad', umbral.toISOString());
      } else {
        query = query.or(`ultima_actividad.is.null,ultima_actividad.gt.${umbral.toISOString()}`);
      }
    }
    query = query.order('created_at', { ascending: false }).range(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA - 1);

    const { data, count } = await query;
    setContactos(data || []);
    setTotal(count || 0);
    setLoading(false);
    verificarExpiracion(data || []);
  };

  const handleExportar = () => {
    const datos = contactos.map(c => ({
      'Nombres': c.nombres || '', 'Apellidos': c.apellidos || '', 'Correo': c.correo || '',
      'Teléfono': c.telefono || '', 'Edad': c.edad || '', 'Cumpleaños': c.cumpleanos || '',
      'Desarrollo': c.desarrollo || '', 'Estatus': c.estatus || '',
      'Tiempo de compra': c.tiempo_compra || '', 'Tipo de compra': c.tipo_compra || '',
      'Asesor de ventas': c.asesor_ventas || '', 'Presupuesto': c.presupuesto || '',
      'Fuente de medio': c.fuente_medio || '', 'Razón de no compra': c.razon_no_compra || '',
      'Creado por': c.creado_por || '',
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contactos');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'contactos_blacksheep.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  // ============================================
  // IMPORTADOR DE HISTÓRICO MASIVO (contactos ya limpios del CRM viejo)
  // ============================================

  const getProcesadosHistorico = () => {
    try {
      const raw = localStorage.getItem(LS_KEY_HISTORICO);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  };

  const guardarProcesadoHistorico = (clave) => {
    const set = getProcesadosHistorico();
    set.add(clave);
    localStorage.setItem(LS_KEY_HISTORICO, JSON.stringify([...set]));
  };

  // clave única por fila para llevar el control de reanudación (correo si
  // hay, si no telefono, si no un índice — nunca deberían faltar ambos
  // porque ya se filtraron al limpiar el archivo)
  const claveFila = (fila, idx) => fila.correo || fila.telefono || `sin_dato_${idx}`;

  const handleArchivoHistorico = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setNombreArchivoHistorico(file.name);
    setErroresHistorico([]);
    setMsgHistorico('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(ws);
      const limpias = filas.map(f => ({
        nombres: (f['Nombres'] || '').toString().trim(),
        apellidos: (f['Apellidos'] || '').toString().trim(),
        correo: (f['Correo'] || '').toString().trim().toLowerCase(),
        telefono: (f['Telefono'] || '').toString().trim(),
        desarrollo: (f['Desarrollo'] || '').toString().trim(),
        estatus: (f['Estatus'] || '').toString().trim(),
        tiempo_compra: (f['TiempoCompra'] || '').toString().trim(),
        // FIX: "TipoCompra" viene vacío del archivo; usamos NotaMotivoCompra
        // (Invertir/Vivir/Rentar del CRM viejo) para no perder ese dato,
        // aunque no coincida con las opciones de forma de pago del CRM nuevo.
        tipo_compra: (f['NotaMotivoCompra'] || '').toString().trim(),
        presupuesto: f['Presupuesto'] || null,
        fuente_medio: (f['FuenteMedio'] || '').toString().trim(),
        razon_no_compra: (f['RazonNoCompra'] || '').toString().trim(),
        asesor_ventas: (f['AsesorVentas'] || '').toString().trim(),
        creado_por: (f['CreadoPor'] || '').toString().trim().toLowerCase() || CORREO_SUPER_ADMIN_FALLBACK,
      })).filter(f => f.correo || f.telefono);
      setFilasHistorico(limpias);
      setProgresoHistorico({ procesados: 0, total: limpias.length, exitosos: 0, saltados: 0, errores: 0 });
    };
    reader.readAsArrayBuffer(file);
  };

  const handlePausarHistorico = () => { pausarHistoricoRef.current = true; setPausadoHistorico(true); };
  const handleReanudarHistorico = () => { pausarHistoricoRef.current = false; setPausadoHistorico(false); handleIniciarImportHistorico(); };

  const handleIniciarImportHistorico = async () => {
    setImportandoHistorico(true);
    pausarHistoricoRef.current = false;
    setPausadoHistorico(false);

    // Traer correos y teléfonos ya existentes en la base para detectar
    // duplicados sin tener que consultar uno por uno.
    const { data: existentes } = await supabase.from('contactos').select('correo, telefono').limit(30000);
    const correosExistentes = new Set((existentes || []).map(c => c.correo?.toLowerCase()).filter(Boolean));
    const telefonosExistentes = new Set((existentes || []).map(c => c.telefono).filter(Boolean));
    const yaProcesados = getProcesadosHistorico();

    let exitosos = progresoHistorico.exitosos;
    let saltados = progresoHistorico.saltados;
    let errores = progresoHistorico.errores;
    const nuevosErrores = [...erroresHistorico];

    // Filtrar de entrada lo que ya se procesó (de una corrida anterior)
    // o que ya existe en la base — y armar el detalle de por qué se saltó.
    const pendientes = [];
    for (let i = 0; i < filasHistorico.length; i++) {
      const fila = filasHistorico[i];
      const clave = claveFila(fila, i);
      if (yaProcesados.has(clave)) continue; // ya se insertó en una corrida anterior, ni se cuenta de nuevo
      const yaExisteCorreo = fila.correo && correosExistentes.has(fila.correo);
      const yaExisteTelefono = fila.telefono && telefonosExistentes.has(fila.telefono);
      if (yaExisteCorreo || yaExisteTelefono) {
        saltados++;
        nuevosErrores.push({
          nombre: `${fila.nombres} ${fila.apellidos}`, correo: fila.correo, telefono: fila.telefono,
          motivo: yaExisteCorreo ? 'Correo ya existe en el sistema' : 'Teléfono ya existe en el sistema',
        });
      } else {
        pendientes.push({ fila, idx: i, clave });
      }
    }
    setProgresoHistorico({ procesados: filasHistorico.length - pendientes.length, total: filasHistorico.length, exitosos, saltados, errores });

    // Insertar en lotes
    for (let i = 0; i < pendientes.length; i += TAMANO_LOTE_HISTORICO) {
      if (pausarHistoricoRef.current) break;
      const lote = pendientes.slice(i, i + TAMANO_LOTE_HISTORICO);
      const payload = lote.map(({ fila }) => ({
        nombres: fila.nombres, apellidos: fila.apellidos, correo: fila.correo || '', telefono: fila.telefono || '',
        desarrollo: fila.desarrollo, estatus: fila.estatus, tiempo_compra: fila.tiempo_compra,
        tipo_compra: fila.tipo_compra, asesor_ventas: fila.asesor_ventas,
        presupuesto: fila.presupuesto || null, fuente_medio: fila.fuente_medio,
        razon_no_compra: fila.razon_no_compra, creado_por: fila.creado_por,
        ultima_actividad: new Date().toISOString(), vigencia_activa: true,
      }));

      const { error } = await supabase.from('contactos').insert(payload);
      if (error) {
        // Si falla el lote completo (normalmente por un duplicado dentro
        // del mismo lote que no se detectó antes), se reintenta fila por
        // fila para no perder todo el lote por un solo registro malo.
        for (const { fila, clave } of lote) {
          const { error: errUno } = await supabase.from('contactos').insert([{
            nombres: fila.nombres, apellidos: fila.apellidos, correo: fila.correo || '', telefono: fila.telefono || '',
            desarrollo: fila.desarrollo, estatus: fila.estatus, tiempo_compra: fila.tiempo_compra,
            tipo_compra: fila.tipo_compra, asesor_ventas: fila.asesor_ventas,
            presupuesto: fila.presupuesto || null, fuente_medio: fila.fuente_medio,
            razon_no_compra: fila.razon_no_compra, creado_por: fila.creado_por,
            ultima_actividad: new Date().toISOString(), vigencia_activa: true,
          }]);
          if (errUno) {
            errores++;
            nuevosErrores.push({ nombre: `${fila.nombres} ${fila.apellidos}`, correo: fila.correo, telefono: fila.telefono, motivo: errUno.message });
          } else {
            exitosos++;
            guardarProcesadoHistorico(clave);
          }
        }
      } else {
        lote.forEach(({ clave }) => guardarProcesadoHistorico(clave));
        exitosos += lote.length;
      }

      setProgresoHistorico({ procesados: (filasHistorico.length - pendientes.length) + Math.min(i + TAMANO_LOTE_HISTORICO, pendientes.length), total: filasHistorico.length, exitosos, saltados, errores });
      setErroresHistorico([...nuevosErrores]);
    }

    setImportandoHistorico(false);
    if (!pausarHistoricoRef.current) {
      setMsgHistorico(`✅ Importación terminada: ${exitosos} creados, ${saltados} ya existían, ${errores} con error`);
      cargarContactos();
    }
  };

  const handleDescargarErroresHistorico = () => {
    const ws = XLSX.utils.json_to_sheet(erroresHistorico.map(e => ({ Nombre: e.nombre, Correo: e.correo, Telefono: e.telefono, Motivo: e.motivo })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Errores');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'errores_importacion_contactos.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCerrarImportHistorico = () => {
    if (importandoHistorico) { if (!window.confirm('La importación sigue en curso. ¿Cerrar de todas formas? Puedes reabrir y reanudar después.')) return; }
    setShowImportHistorico(false);
  };

  // ============================================

  // FIX: solo Super Admin/Admin pueden asignar el contacto a cualquier
  // asesor; el resto de roles solo puede darlo de alta bajo su propio usuario.
  const puedeElegirAsesor = ROLES_ELIGEN_ASESOR.includes(miRol);

  const handleCrear = async () => {
    setErrorMsg('');
    for (const [key, label] of CAMPOS_REQUERIDOS) {
      if (!form[key] || form[key].toString().trim() === '') { setErrorMsg(`El campo "${label}" es obligatorio`); return; }
    }
    if (form.telefono.length < 7) { setErrorMsg('El teléfono debe tener al menos 7 dígitos'); return; }
    // FIX: respaldo de seguridad — aunque el campo esté bloqueado en pantalla,
    // se fuerza el asesor propio antes de guardar por si el estado del
    // formulario se manipuló de alguna forma.
    const asesorFinal = puedeElegirAsesor ? form.asesor_ventas : `${miAgente?.nombre || ''} ${miAgente?.apellidos || ''}`.trim();
    const formConAsesor = { ...form, asesor_ventas: asesorFinal };
    // FIX: el teléfono se guarda en la base como "lada dígitos" (ej. "+52
    // 3312345678"), pero antes se comparaba solo contra los dígitos sueltos
    // con .eq — nunca hacía match. Ahora se busca con ilike, que encuentra
    // el número sin importar qué lada tenga guardada.
    const { data: existente } = await supabase.from('contactos').select('*').or(`correo.eq.${form.correo},telefono.ilike.%${form.telefono}%`).single();
    if (existente) {
      if (!existente.vigencia_activa) {
        const ladaReal = lada === '+1CA' ? '+1' : lada;
        await supabase.from('contactos').update({ ...formConAsesor, presupuesto: form.presupuesto === '' ? null : form.presupuesto, cumpleanos: form.cumpleanos === '' ? null : form.cumpleanos, telefono: `${ladaReal} ${form.telefono}`, creado_por: miAgente?.correo || '', ultima_actividad: new Date().toISOString(), vigencia_activa: true }).eq('id', existente.id);
        setShowForm(false); setLada('+52');
        setForm({ nombres: '', apellidos: '', correo: '', telefono: '', edad: '', cumpleanos: '', desarrollo: '', estatus: '', tiempo_compra: '', tipo_compra: '', asesor_ventas: '', presupuesto: '', fuente_medio: '', razon_no_compra: '' });
        cargarContactos(); return;
      } else {
        // FIX: contacto duplicado activo de otro asesor — se bloquea igual
        // que antes, pero además se registra una alerta de "interés
        // cruzado" para que el dueño del contacto (y su Gerente/Super
        // Admin) sepa que también preguntó en este otro desarrollo. El
        // asesor que intentó registrarlo (Asesor B) NUNCA se identifica
        // en ninguna pantalla — solo se guarda internamente por si algún
        // día hace falta auditar mal uso del sistema.
        await supabase.from('contacto_alertas_cruzadas').insert([{
          contacto_id: existente.id,
          desarrollo_interes: form.desarrollo,
          detectado_por: miAgente?.correo || '',
        }]);
        // FIX: avisa por push al dueño real del contacto — nunca menciona
        // quién lo intentó registrar, ni en el título ni en el cuerpo.
        if (existente.creado_por) {
          const { data: misAlertas } = await supabase.from('contacto_alertas_cruzadas')
            .select('id, contactos!inner(creado_por)').eq('contactos.creado_por', existente.creado_por);
          const idsAlertas = (misAlertas || []).map(a => a.id);
          let leidasCount = 0;
          if (idsAlertas.length > 0) {
            const { count } = await supabase.from('contacto_alertas_leidas').select('alerta_id', { count: 'exact', head: true })
              .eq('leido_por', existente.creado_por).in('alerta_id', idsAlertas);
            leidasCount = count || 0;
          }
          enviarPush({
            correos: [existente.creado_por],
            title: 'Interés en otro desarrollo',
            body: `${existente.nombres} ${existente.apellidos} preguntó en ${form.desarrollo}`,
            url: '/',
            badgeCount: Math.max(0, idsAlertas.length - leidasCount),
          });
        }
        setErrorMsg('Ya existe un contacto activo con ese correo o teléfono');
        return;
      }
    }
    setGuardando(true);
    const ladaReal = lada === '+1CA' ? '+1' : lada;
    const { error } = await supabase.from('contactos').insert([{
      ...formConAsesor, presupuesto: form.presupuesto === '' ? null : form.presupuesto,
      cumpleanos: form.cumpleanos === '' ? null : form.cumpleanos,
      telefono: `${ladaReal} ${form.telefono}`, creado_por: miAgente?.correo || '',
      ultima_actividad: new Date().toISOString(), vigencia_activa: form.estatus !== 'No interesado'
    }]);
    setGuardando(false);
    if (error) {
      if (error.message.includes('contactos_correo_unique')) setErrorMsg('Ya existe un contacto con ese correo electrónico');
      else if (error.message.includes('contactos_telefono_unique')) setErrorMsg('Ya existe un contacto con ese teléfono');
      else setErrorMsg('Error al guardar el contacto');
      return;
    }
    setShowForm(false); setLada('+52');
    setForm({ nombres: '', apellidos: '', correo: '', telefono: '', edad: '', cumpleanos: '', desarrollo: '', estatus: '', tiempo_compra: '', tipo_compra: '', asesor_ventas: '', presupuesto: '', fuente_medio: '', razon_no_compra: '' });
    cargarContactos();
  };

  const handleEliminar = async (id) => {
    if (miRol !== 'Super Admin') return; // FIX: solo Super Admin puede eliminar contactos
    if (!window.confirm('¿Eliminar este contacto?')) return;
    await supabase.from('contactos').delete().eq('id', id);
    cargarContactos();
  };

  if (contactoDetalle) {
    return <DetalleContacto contactoId={contactoDetalle} onBack={() => { setContactoDetalle(null); cargarContactos(); }} miRol={miRol} miAgente={miAgente} vigenciaDias={vigenciaDias} />;
  }

  const inp = (label, key, type = 'text', required = false) => (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>
        {label}{required && <span style={{ color: '#e53e3e', marginLeft: '2px' }}>*</span>}
      </label>
      <input type={type} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
        style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
    </div>
  );

  const sel = (label, key, opciones, required = false) => (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>
        {label}{required && <span style={{ color: '#e53e3e', marginLeft: '2px' }}>*</span>}
      </label>
      <select value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
        style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }}>
        <option value=''>Elige una opción...</option>
        {opciones.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem', position: 'relative' }}>

      {/* Alerta vigencia */}
      {showAlertaVigencia && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '2rem', maxWidth: '440px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e', marginBottom: '8px' }}>Contactos próximos a vencer</div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '1rem' }}>
              Tienes {contactosAlerta.length} contacto{contactosAlerta.length > 1 ? 's' : ''} sin seguimiento que {contactosAlerta.length > 1 ? 'vencen' : 'vence'} pronto:
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '1.5rem' }}>
              {contactosAlerta.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#FFF8E1', borderRadius: '8px', marginBottom: '6px', fontSize: '13px' }}>
                  <span style={{ fontWeight: '500' }}>{c.nombres} {c.apellidos}</span>
                  <span style={{ color: '#856404' }}>{diasRestantes(c.ultima_actividad, vigenciaDias)}d restantes</span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowAlertaVigencia(false)}
              style={{ width: '100%', padding: '12px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}>
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* FIX: alerta de interés cruzado — el contacto (mío o de mi equipo/
          desarrollo, según el rol) preguntó en otro desarrollo mientras
          está registrado aquí. Nunca menciona quién lo intentó registrar. */}
      {showAlertaCruzada && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '2rem', maxWidth: '440px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔔</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e', marginBottom: '8px' }}>Interés en otro desarrollo</div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '1rem' }}>
              {alertasCruzadas.length === 1
                ? 'Uno de tus contactos también preguntó en otro desarrollo:'
                : `${alertasCruzadas.length} de tus contactos también preguntaron en otros desarrollos:`}
            </div>
            <div style={{ maxHeight: '260px', overflowY: 'auto', marginBottom: '1.5rem' }}>
              {alertasCruzadas.map(a => (
                <div key={a.id} style={{ padding: '10px 12px', background: '#F3F0FF', borderRadius: '8px', marginBottom: '6px', fontSize: '13px' }}>
                  <div style={{ fontWeight: '500', color: '#1a1a2e' }}>{a.contactos?.nombres} {a.contactos?.apellidos}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                    <span style={{ color: '#8B5CF6' }}>Preguntó en: {a.desarrollo_interes}</span>
                    <span style={{ color: '#aaa', fontSize: '12px' }}>{a.created_at?.slice(0, 10)}</span>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={handleCerrarAlertaCruzada}
              style={{ width: '100%', padding: '12px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}>
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Modal vigencia */}
      {showVigenciaModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '2rem', maxWidth: '360px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e', marginBottom: '8px' }}>Configurar vigencia</div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '1.5rem' }}>Define cuántos días puede estar un contacto sin actividad antes de liberarse.</div>
            <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '6px' }}>Días de vigencia</label>
            <input type='number' min={1} max={365} value={nuevaVigencia} onChange={e => setNuevaVigencia(parseInt(e.target.value))}
              style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box', marginBottom: '1.5rem', textAlign: 'center', fontWeight: '600' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowVigenciaModal(false)} style={{ flex: 1, padding: '10px', background: '#f5f5f5', color: '#333', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarVigencia} style={{ flex: 1, padding: '10px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* FIX: modal para configurar el umbral de días de la alerta de "próximos a vencer" */}
      {showAlertaDiasModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '2rem', maxWidth: '360px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e', marginBottom: '8px' }}>Configurar alerta de vencimiento</div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '1.5rem' }}>Define con cuántos días de anticipación quieres que te avise que un contacto está por vencerse.</div>
            <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '6px' }}>Días de anticipación</label>
            <input type='number' min={1} max={vigenciaDias} value={nuevaAlertaDias} onChange={e => setNuevaAlertaDias(parseInt(e.target.value))}
              style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box', marginBottom: '1.5rem', textAlign: 'center', fontWeight: '600' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowAlertaDiasModal(false)} style={{ flex: 1, padding: '10px', background: '#f5f5f5', color: '#333', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarAlertaDias} style={{ flex: 1, padding: '10px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* FIX: modal del importador de histórico masivo */}
      {showImportHistorico && miRol === 'Super Admin' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={handleCerrarImportHistorico}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '2rem', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e' }}>Importar histórico de contactos</div>
              <button onClick={handleCerrarImportHistorico} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888' }}>×</button>
            </div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '1.25rem' }}>
              Sube el archivo ya limpio y con asesor resuelto. Se salta automáticamente cualquier correo o teléfono que ya exista en el sistema, sin actualizar nada — solo se registra el motivo en el reporte de errores.
            </div>

            {filasHistorico.length === 0 ? (
              <label style={{ display: 'block', padding: '24px', border: '2px dashed #ddd', borderRadius: '10px', textAlign: 'center', cursor: 'pointer', color: '#888', fontSize: '13px' }}>
                📄 Haz click para elegir el archivo Excel
                <input ref={importHistoricoInputRef} type='file' accept='.xlsx,.xls' onChange={handleArchivoHistorico} style={{ display: 'none' }} />
              </label>
            ) : (
              <>
                <div style={{ padding: '10px 14px', background: '#f9f9f9', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>
                  📄 <strong>{nombreArchivoHistorico}</strong> — {filasHistorico.length} contactos detectados
                </div>

                {(importandoHistorico || progresoHistorico.procesados > 0) && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ height: '10px', background: '#f0f0f0', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
                      <div style={{ height: '100%', width: `${progresoHistorico.total > 0 ? (progresoHistorico.procesados / progresoHistorico.total) * 100 : 0}%`, background: '#C0203A', transition: 'width 0.2s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666', flexWrap: 'wrap', gap: '6px' }}>
                      <span>{progresoHistorico.procesados} / {progresoHistorico.total}</span>
                      <span style={{ color: '#27500A' }}>✓ {progresoHistorico.exitosos} creados</span>
                      <span style={{ color: '#7A5900' }}>⏭ {progresoHistorico.saltados} ya existían</span>
                      <span style={{ color: '#A32D2D' }}>✕ {progresoHistorico.errores} errores</span>
                    </div>
                  </div>
                )}

                {msgHistorico && (
                  <div style={{ padding: '10px 14px', background: '#EAF3DE', color: '#27500A', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>{msgHistorico}</div>
                )}

                {erroresHistorico.length > 0 && (
                  <button onClick={handleDescargarErroresHistorico} style={{ ...btnOutline, width: '100%', marginBottom: '14px', fontSize: '13px' }}>
                    ⬇ Descargar reporte ({erroresHistorico.length} saltados/con error)
                  </button>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  {!importandoHistorico && progresoHistorico.procesados < progresoHistorico.total && (
                    <button onClick={pausadoHistorico ? handleReanudarHistorico : handleIniciarImportHistorico}
                      style={{ ...btnPrimary, flex: 1, justifyContent: 'center', padding: '12px' }}>
                      {progresoHistorico.procesados > 0 ? 'Reanudar importación' : 'Iniciar importación'}
                    </button>
                  )}
                  {importandoHistorico && (
                    <button onClick={handlePausarHistorico} style={{ ...btnOutline, flex: 1, padding: '12px' }}>⏸ Pausar</button>
                  )}
                  {!importandoHistorico && (
                    <button onClick={() => { setFilasHistorico([]); setNombreArchivoHistorico(''); }} style={{ ...btnOutline, padding: '12px' }}>
                      Elegir otro archivo
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '10px' }}>
                  No cierres esta pestaña mientras esté en curso. Se inserta por lotes de {TAMANO_LOTE_HISTORICO}, así que debería tardar solo un par de minutos.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: isMobile ? '17px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '2px' }}>Contactos</h2>
          <div style={{ fontSize: '13px', color: '#888' }}>{total} registros</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {miRol === 'Super Admin' && !isMobile && (
            <button onClick={() => setShowVigenciaModal(true)} style={btnOutline} title="Días de vigencia total">⏱ {vigenciaDias}d</button>
          )}
          {miRol === 'Super Admin' && !isMobile && (
            <button onClick={() => setShowAlertaDiasModal(true)} style={btnOutline} title="Días de anticipación de la alerta">⚠️ {alertaDias}d</button>
          )}
          {miRol === 'Super Admin' && !isMobile && (
            <>
              <button onClick={handleExportar} style={btnOutline}>Exportar</button>
              <button onClick={() => { setShowImportHistorico(true); setFilasHistorico([]); setNombreArchivoHistorico(''); setErroresHistorico([]); setMsgHistorico(''); setProgresoHistorico({ procesados: 0, total: 0, exitosos: 0, saltados: 0, errores: 0 }); }}
                style={btnOutline}>
                ⬆ Importar histórico
              </button>
            </>
          )}
          <button onClick={() => {
            setShowForm(true);
            if (!ROLES_ELIGEN_ASESOR.includes(miRol) && miAgente) {
              setForm(f => ({ ...f, asesor_ventas: `${miAgente.nombre} ${miAgente.apellidos}`.trim() }));
            }
          }} style={{ ...btnPrimary, padding: isMobile ? '10px 14px' : '8px 16px', fontSize: isMobile ? '14px' : '13px' }}>
            + {isMobile ? 'Nuevo' : 'Crear un contacto'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      {isMobile ? (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input placeholder='Buscar contacto...' value={buscar} onChange={e => { setBuscar(e.target.value); setPagina(0); }}
              style={{ flex: 1, padding: '10px 12px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '14px' }} />
            <button onClick={() => setShowFiltros(f => !f)}
              style={{ padding: '10px 14px', border: '0.5px solid #ddd', borderRadius: '8px', background: showFiltros ? '#C0203A' : '#fff', color: showFiltros ? '#fff' : '#333', fontSize: '13px', cursor: 'pointer' }}>
              ⚙️ Filtros
            </button>
          </div>
          {showFiltros && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
              <select value={filtroDesarrollo} onChange={e => { setFiltroDesarrollo(e.target.value); setPagina(0); }} style={{ ...filtroStyle, width: '100%', padding: '10px' }}>
                <option value=''>Todos los desarrollos</option>
                {desarrollos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
              </select>
              <select value={filtroMedio} onChange={e => { setFiltroMedio(e.target.value); setPagina(0); }} style={{ ...filtroStyle, width: '100%', padding: '10px' }}>
                <option value=''>Todos los medios</option>
                {MEDIO_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <select value={filtroEstatus} onChange={e => { setFiltroEstatus(e.target.value); setPagina(0); }} style={{ ...filtroStyle, width: '100%', padding: '10px' }}>
                <option value=''>Todos los estatus</option>
                {ESTATUS_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <select value={filtroVigencia} onChange={e => { setFiltroVigencia(e.target.value); setPagina(0); }} style={{ ...filtroStyle, width: '100%', padding: '10px' }}>
                <option value=''>Toda vigencia</option>
                <option value='Activo'>Activo</option>
                <option value='Proximo'>Próximo a vencer</option>
                <option value='Expirado'>Expirado</option>
              </select>
              {ROLES_VER_TODOS.includes(miRol) && (
                <select value={filtroRegistradoPor} onChange={e => { setFiltroRegistradoPor(e.target.value); setPagina(0); }} style={{ ...filtroStyle, width: '100%', padding: '10px' }}>
                  <option value=''>Vendedor (todos)</option>
                  {agentes.map(a => <option key={a.id} value={`${a.nombre} ${a.apellidos}`.trim()}>{a.nombre} {a.apellidos}</option>)}
                </select>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type='date' value={filtroFechaDesde} onChange={e => { setFiltroFechaDesde(e.target.value); setPagina(0); }}
                  style={{ ...filtroStyle, flex: 1, padding: '10px' }} />
                <input type='date' value={filtroFechaHasta} onChange={e => { setFiltroFechaHasta(e.target.value); setPagina(0); }}
                  style={{ ...filtroStyle, flex: 1, padding: '10px' }} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder='Buscar...' value={buscar} onChange={e => { setBuscar(e.target.value); setPagina(0); }}
            style={{ padding: '7px 12px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', width: '180px' }} />
          <select value={filtroDesarrollo} onChange={e => { setFiltroDesarrollo(e.target.value); setPagina(0); }} style={filtroStyle}>
            <option value=''>Desarrollos</option>
            {desarrollos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
          </select>
          <select value={filtroMedio} onChange={e => { setFiltroMedio(e.target.value); setPagina(0); }} style={filtroStyle}>
            <option value=''>Medio</option>
            {MEDIO_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={filtroEstatus} onChange={e => { setFiltroEstatus(e.target.value); setPagina(0); }} style={filtroStyle}>
            <option value=''>Estatus</option>
            {ESTATUS_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={filtroVigencia} onChange={e => { setFiltroVigencia(e.target.value); setPagina(0); }} style={filtroStyle}>
            <option value=''>Vigencia</option>
            <option value='Activo'>Activo</option>
            <option value='Proximo'>Próximo a vencer</option>
            <option value='Expirado'>Expirado</option>
          </select>
          {ROLES_VER_TODOS.includes(miRol) && (
            <select value={filtroRegistradoPor} onChange={e => { setFiltroRegistradoPor(e.target.value); setPagina(0); }} style={{ ...filtroStyle, minWidth: '160px' }}>
              <option value=''>Vendedor</option>
              {agentes.map(a => <option key={a.id} value={`${a.nombre} ${a.apellidos}`.trim()}>{a.nombre} {a.apellidos}</option>)}
            </select>
          )}
          <span style={{ fontSize: '12px', color: '#888' }}>Creación:</span>
          <input type='date' value={filtroFechaDesde} onChange={e => { setFiltroFechaDesde(e.target.value); setPagina(0); }} style={filtroStyle} />
          <span style={{ fontSize: '12px', color: '#888' }}>a</span>
          <input type='date' value={filtroFechaHasta} onChange={e => { setFiltroFechaHasta(e.target.value); setPagina(0); }} style={filtroStyle} />
        </div>
      )}

      {/* Lista móvil */}
      {isMobile ? (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Cargando...</div>
          ) : contactos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Sin contactos</div>
          ) : contactos.map(c => {
            const dias = diasRestantes(c.ultima_actividad, vigenciaDias);
            return (
              <div key={c.id} onClick={() => setContactoDetalle(c.id)}
                style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '10px', padding: '14px 16px', marginBottom: '8px', opacity: !c.vigencia_activa ? 0.5 : 1, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: '#1a1a2e' }}>{c.nombres} {c.apellidos}</div>
                  <BadgeVigencia dias={dias} alertaDias={alertaDias} vigenciaActiva={c.vigencia_activa} estatus={c.estatus} />
                </div>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>{c.correo}</div>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>{c.telefono}</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {c.desarrollo && <span style={{ fontSize: '11px', padding: '2px 8px', background: '#f0f0f0', borderRadius: '20px', color: '#555' }}>{c.desarrollo}</span>}
                  {c.estatus && <span style={{ fontSize: '11px', padding: '2px 8px', background: '#EAF3DE', borderRadius: '20px', color: '#27500A' }}>{c.estatus}</span>}
                  {c.fuente_medio && <span style={{ fontSize: '11px', padding: '2px 8px', background: '#f0f0f0', borderRadius: '20px', color: '#555' }}>{c.fuente_medio}</span>}
                </div>
              </div>
            );
          })}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '1rem', fontSize: '13px', color: '#666' }}>
            <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0}
              style={{ padding: '8px 16px', border: '0.5px solid #ddd', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>‹</button>
            <span>{pagina * POR_PAGINA + 1}–{Math.min((pagina + 1) * POR_PAGINA, total)} de {total}</span>
            <button onClick={() => setPagina(p => p + 1)} disabled={(pagina + 1) * POR_PAGINA >= total}
              style={{ padding: '8px 16px', border: '0.5px solid #ddd', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}>›</button>
          </div>
        </div>
      ) : (
        /* Tabla desktop */
        <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '0.5px solid #e0e0e0' }}>
                {['Nombre','Correo','Teléfono','Desarrollo','Medio','Creación','Estatus','Vigencia', ROLES_VER_TODOS.includes(miRol) ? 'Vendedor' : '', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '500', color: '#555', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Cargando...</td></tr>
              ) : contactos.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Sin contactos</td></tr>
              ) : contactos.map(c => {
                const dias = diasRestantes(c.ultima_actividad, vigenciaDias);
                return (
                  <tr key={c.id} style={{ borderBottom: '0.5px solid #f0f0f0', opacity: !c.vigencia_activa ? 0.5 : 1 }}>
                    <td style={{ padding: '12px 14px' }}>
                      <button onClick={() => setContactoDetalle(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C0203A', fontSize: '13px', textAlign: 'left', padding: 0, textDecoration: 'underline' }}>
                        {c.nombres} {c.apellidos}
                      </button>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#333' }}>{c.correo}</td>
                    <td style={{ padding: '12px 14px', color: '#333' }}>{c.telefono}</td>
                    <td style={{ padding: '12px 14px', color: '#333' }}>{c.desarrollo}</td>
                    <td style={{ padding: '12px 14px', color: '#333' }}>{c.fuente_medio}</td>
                    <td style={{ padding: '12px 14px', color: '#333' }}>{c.created_at?.slice(0,10)}</td>
                    <td style={{ padding: '12px 14px', color: '#333' }}>{c.estatus}</td>
                    <td style={{ padding: '12px 14px' }}><BadgeVigencia dias={dias} alertaDias={alertaDias} vigenciaActiva={c.vigencia_activa} estatus={c.estatus} /></td>
                    {ROLES_VER_TODOS.includes(miRol) && (
                      <td style={{ padding: '12px 14px', color: '#888', fontSize: '12px' }}>{c.asesor_ventas || '—'}</td>
                    )}
                    <td style={{ padding: '12px 14px' }}>
                      {miRol === 'Super Admin' && (
                        <button onClick={() => handleEliminar(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: '16px' }}>🗑</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', borderTop: '0.5px solid #f0f0f0', fontSize: '13px', color: '#666' }}>
            <span>{total === 0 ? 0 : pagina * POR_PAGINA + 1}–{Math.min((pagina + 1) * POR_PAGINA, total)} de {total}</span>
            <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>‹</button>
            <button onClick={() => setPagina(p => p + 1)} disabled={(pagina + 1) * POR_PAGINA >= total} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>›</button>
          </div>
        </div>
      )}

      {/* Panel crear contacto */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: isMobile ? '100%' : '400px', height: '100dvh', background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '0.5px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <h3 style={{ fontSize: '16px', fontWeight: '500', margin: 0 }}>Crear contacto</h3>
            <button onClick={() => { setShowForm(false); setErrorMsg(''); }} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888' }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
            {inp('Nombres', 'nombres', 'text', true)}
            {inp('Apellidos', 'apellidos', 'text', true)}
            {inp('Edad', 'edad')}
            {inp('Cumpleaños', 'cumpleanos', 'date')}
            {inp('Correo', 'correo', 'email', true)}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>
                Teléfono<span style={{ color: '#e53e3e', marginLeft: '2px' }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
                <LadaDropdown value={lada} onChange={setLada} />
                <input type="tel" value={form.telefono}
                  onChange={e => { const val = e.target.value.replace(/\D/g, '').slice(0, 10); setForm({ ...form, telefono: val }); }}
                  placeholder="10 dígitos"
                  style={{ flex: 1, padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px' }} />
              </div>
              {form.telefono && <div style={{ fontSize: '11px', color: '#bbb', marginTop: '3px' }}>{form.telefono.length}/10 dígitos</div>}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>
                Desarrollo<span style={{ color: '#e53e3e', marginLeft: '2px' }}>*</span>
              </label>
              <select value={form.desarrollo} onChange={e => setForm({ ...form, desarrollo: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }}>
                <option value=''>Selecciona...</option>
                {desarrollos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
              </select>
            </div>
            {sel('Estatus', 'estatus', ESTATUS_OPCIONES, true)}
            {sel('Tiempo de compra', 'tiempo_compra', TIEMPO_COMPRA_OPCIONES, true)}
            {sel('Tipo de compra', 'tipo_compra', TIPO_COMPRA_OPCIONES, true)}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Asesor de ventas</label>
              {puedeElegirAsesor ? (
                <select value={form.asesor_ventas} onChange={e => setForm({ ...form, asesor_ventas: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }}>
                  <option value=''>Selecciona un asesor...</option>
                  {agentes.map(a => <option key={a.id} value={`${a.nombre} ${a.apellidos}`.trim()}>{a.nombre} {a.apellidos}</option>)}
                </select>
              ) : (
                <input value={form.asesor_ventas} readOnly
                  style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#f9f9f9', color: '#888', boxSizing: 'border-box' }} />
              )}
            </div>
            {inp('Presupuesto', 'presupuesto', 'number')}
            {sel('Fuente de medio', 'fuente_medio', MEDIO_OPCIONES, true)}
          </div>
          <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #f0f0f0', flexShrink: 0, background: '#fff' }}>
            {errorMsg && (
              <div style={{ marginBottom: '10px', padding: '10px', borderRadius: '8px', background: '#FCEBEB', color: '#A32D2D', fontSize: '13px' }}>{errorMsg}</div>
            )}
            <button onClick={handleCrear} disabled={guardando}
              style={{ ...btnPrimary, width: '100%', padding: '14px', justifyContent: 'center', fontSize: '15px' }}>
              {guardando ? 'Guardando...' : 'Crear contacto'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary = { background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '500', display: 'flex', alignItems: 'center' };
const btnOutline = { background: '#fff', color: '#333', border: '0.5px solid #ddd', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' };
const filtroStyle = { padding: '7px 12px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', background: '#fff' };