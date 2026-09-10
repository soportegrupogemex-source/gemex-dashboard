import React, { useState, useEffect, useRef } from 'react';
import { enviarPush } from './enviarPush';
import { supabase } from './supabase';

// FIX: "validacion_ine" y "comprobante_apartado" ahora aceptan imagen
// además de PDF (aceptaImagen). "comprobante_apartado" además admite
// varios archivos (hasta 10) — muchas veces el apartado se hace en
// varios movimientos/transferencias distintas.
const DOCS_ASESOR = [
  { id: 'ine_pasaporte', label: 'INE o Pasaporte (ambas hojas)', multiple: true, maxArchivos: 4, nota: 'Hasta 4 archivos (ambas hojas del INE, o pasaporte + hojas adicionales)', avisoRojo: 'SOLO DOCUMENTOS ESCANEADOS A COLOR, NO SE ACEPTARÁN ESCANEOS CON EL CELULAR O FOTOGRAFIAS' },
  { id: 'validacion_ine', label: 'Validación INE lista nominal', nota: 'Solo si subiste INE (no aplica si subiste Pasaporte)', aceptaImagen: true },
  { id: 'comprobante_domicilio', label: 'Comprobante de domicilio (no mayor a 3 meses)', avisoRojo: 'RECIBO DESCARGADO PDF O ESCANEO DEL RECIBO FISICO, NO FOTOS O ESCANEO DE CELULAR' },
  { id: 'acta_nacimiento', label: 'Acta de nacimiento', avisoRojo: 'ACTA DESCARGADA EN PDF O ESCANEO DEL ACTA FISICA, NO FOTOS O ESCANEO DE CELULAR' },
  { id: 'acta_matrimonio', label: 'Acta de matrimonio', avisoRojo: 'ACTA DESCARGADA EN PDF O ESCANEO DEL ACTA FISICA, NO FOTOS O ESCANEO DE CELULAR' },
  { id: 'curp', label: 'CURP', avisoRojo: 'CURP DESCARGADA EN PDF O ESCANEO DE LA CURP FISICA, NO FOTOS O ESCANEO DE CELULAR' },
  { id: 'constancia_fiscal', label: 'Constancia de situación fiscal (no mayor a 3 meses)', avisoRojo: 'CONSTANCIA DESCARGADA EN PDF O ESCANEO DE LA CONSTANCIA FISICA COMPLETA, NO FOTOS O ESCANEO DE CELULAR' },
  { id: 'cotizacion', label: 'Cotización completa a nombre del cliente', multiple: true, maxArchivos: 3, nota: 'Hasta 3 archivos', avisoRojo: 'DESCARGADA EN PDF' },
  { id: 'comprobante_apartado', label: 'Comprobante de apartado', aceptaImagen: true, multiple: true, maxArchivos: 10, nota: 'Puedes subir hasta 10 archivos si el apartado se hizo en varios movimientos', avisoRojo: 'ARCHIVO DESCARGADO EN PDF O FOTO LEGIBLE' },
  { id: 'kyc', label: 'KYC firmado', avisoRojo: 'ARCHIVO EN PDF O FOTO LEGIBLE' },
  { id: 'referencia_bancaria', label: 'Referencia bancaria', opcional: true, nota: 'En caso de aplicar — único documento que se puede omitir', avisoRojo: 'ARCHIVO EN PDF' },
  { id: 'documento_adicional', label: 'Documento adicional', opcional: true, multiple: true, maxArchivos: 15, aceptaImagen: true, nota: 'Solo si aplica algún documento adicional no contemplado arriba' },
];
const DOC_ORDEN_CONTRATO = { id: 'orden_contrato', label: 'Orden de contrato' };

// FIX: checklist de documentos por tipo de compra (Infonavit, Fovissste,
// Bancario, Cofinavit) — viene del checklist oficial de Los Arrayanes.
// Contado sigue usando DOCS_ASESOR tal cual (sin Titular/Coacreditado).
// Los documentos base de identidad se repiten para Titular y, si aplica,
// Coacreditado — con id prefijado `coac_` para el coacreditado, así el
// resto del sistema (que indexa documentos por `tipo_documento` en un
// mapa plano) no necesita cambiar de forma.
const docsBaseIdentidad = (prefix) => [
  { id: `${prefix}ine_pasaporte`, label: 'Identificación Oficial Vigente (INE o Pasaporte)', multiple: true, maxArchivos: 4, nota: 'Hasta 4 archivos (ambas hojas del INE, o pasaporte + hojas adicionales)', avisoRojo: 'SOLO DOCUMENTOS ESCANEADOS A COLOR, NO SE ACEPTARÁN ESCANEOS CON EL CELULAR O FOTOGRAFIAS' },
  { id: `${prefix}acta_nacimiento`, label: 'Acta de Nacimiento', avisoRojo: 'ACTA DESCARGADA EN PDF O ESCANEO DEL ACTA FISICA, NO FOTOS O ESCANEO DE CELULAR' },
  { id: `${prefix}acta_matrimonio`, label: 'Acta de Matrimonio (si aplica)', opcional: true, avisoRojo: 'ACTA DESCARGADA EN PDF O ESCANEO DEL ACTA FISICA, NO FOTOS O ESCANEO DE CELULAR' },
  { id: `${prefix}curp`, label: 'CURP', avisoRojo: 'CURP DESCARGADA EN PDF O ESCANEO DE LA CURP FISICA, NO FOTOS O ESCANEO DE CELULAR' },
  { id: `${prefix}constancia_fiscal`, label: 'Constancia de Situación Fiscal (RFC)', avisoRojo: 'CONSTANCIA DESCARGADA EN PDF O ESCANEO DE LA CONSTANCIA FISICA COMPLETA, NO FOTOS O ESCANEO DE CELULAR' },
  { id: `${prefix}comprobante_domicilio`, label: 'Comprobante de Domicilio (no mayor a 3 meses)', avisoRojo: 'RECIBO DESCARGADO PDF O ESCANEO DEL RECIBO FISICO, NO FOTOS O ESCANEO DE CELULAR' },
];

const DOC_DEFS_FINANCIADO = {
  precalificacion_infonavit: { label: 'Precalificación Infonavit' },
  constancia_taller: { label: 'Constancia del Taller "Saber Más para Decidir Mejor"' },
  estado_cuenta_afore: { label: 'Estado de Cuenta de AFORE' },
  validacion_credito_sofom: { label: 'Validación Crédito SOFOM' },
  ultimo_talon_pago: { label: 'Último Talón de Pago' },
  carta_autorizacion_banco: { label: 'Carta Autorización Banco' },
  carta_autorizacion_cofinavit: { label: 'Carta Autorización Cofinavit' },
  liquidacion_gemex: { label: 'Liquidación Gemex' },
};

// Por tipo de compra: qué documentos específicos van para Titular y
// Coacreditado (además de los de identidad, que siempre van), y cuáles
// son EXCLUSIVOS del Titular (no se piden al coacreditado).
const DOCS_FINANCIADO_ESPECIFICOS = {
  Infonavit: {
    comunes: ['precalificacion_infonavit', 'constancia_taller', 'estado_cuenta_afore'],
    soloTitular: ['liquidacion_gemex'],
    referenciasPersonales: true,
  },
  Fovissste: {
    comunes: ['validacion_credito_sofom', 'ultimo_talon_pago'],
    soloTitular: ['liquidacion_gemex'],
    referenciasPersonales: false,
  },
  Bancario: {
    comunes: ['carta_autorizacion_banco'],
    soloTitular: ['liquidacion_gemex'],
    referenciasPersonales: false,
  },
  Cofinavit: {
    comunes: ['precalificacion_infonavit', 'constancia_taller', 'estado_cuenta_afore'],
    soloTitular: ['carta_autorizacion_cofinavit', 'liquidacion_gemex'],
    referenciasPersonales: true,
  },
};

// Lista de documentos a pedir para una persona (titular/coacreditado) de
// un movimiento, según su tipo_compra. Contado (o sin tipo_compra, para
// movimientos viejos de antes de este cambio) sigue usando DOCS_ASESOR.
const docsRequeridos = (movimiento, persona = 'titular') => {
  const cfg = DOCS_FINANCIADO_ESPECIFICOS[movimiento?.tipo_compra];
  if (!cfg) return persona === 'titular' ? DOCS_ASESOR : [];
  const prefix = persona === 'coacreditado' ? 'coac_' : '';
  const base = docsBaseIdentidad(prefix);
  const comunes = cfg.comunes.map(id => ({ id: `${prefix}${id}`, ...DOC_DEFS_FINANCIADO[id] }));
  const soloTitular = persona === 'titular' ? cfg.soloTitular.map(id => ({ id, ...DOC_DEFS_FINANCIADO[id] })) : [];
  return [...base, ...comunes, ...soloTitular];
};

// Lista completa para conteos/ZIP: Titular + Coacreditado (si aplica) +
// Orden de contrato.
const docsRequeridosCompletos = (movimiento) => {
  const titular = docsRequeridos(movimiento, 'titular');
  const coacreditado = movimiento?.tiene_coacreditado ? docsRequeridos(movimiento, 'coacreditado') : [];
  return [...titular, ...coacreditado, DOC_ORDEN_CONTRATO];
};

const ROLES_GERENTE = ['Gerente Editor', 'Gerente Operador'];
const ROLES_ADMIN = ['Super Admin', 'Admin'];
const MESES_PARA_ARCHIVAR = 6;

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

function parseFechaLocal(fechaStr) {
  if (!fechaStr) return null;
  if (typeof fechaStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fechaStr)) {
    const [y, m, d] = fechaStr.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(fechaStr);
}

const fmtFechaHora = (f) => f ? new Date(f).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

const ESTADO_COLOR = {
  pendiente: { bg: '#F0F0F0', color: '#888', label: 'Pendiente de revisión' },
  aprobado: { bg: '#EAF3DE', color: '#27500A', label: 'Aprobado' },
  rechazado: { bg: '#FCEBEB', color: '#A32D2D', label: 'Rechazado' },
};

// FIX: extrae la lista de archivos de un documento — si tiene varios
// (archivos_json, ej. comprobante_apartado) los regresa todos; si no,
// regresa un arreglo de un solo elemento con el archivo_path clásico.
const getArchivosDoc = (doc) => {
  if (!doc) return [];
  if (doc.archivos_json) {
    try {
      const arr = JSON.parse(doc.archivos_json);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch { /* si el JSON está corrupto, cae al archivo_path clásico */ }
  }
  return doc.archivo_path ? [{ path: doc.archivo_path, nombre: doc.nombre_archivo }] : [];
};

export default function Expedientes({ miRol, miAgente }) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState('cargar');
  const [movimientos, setMovimientos] = useState([]);
  const [docsPorMovimiento, setDocsPorMovimiento] = useState({});
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [desarrollos, setDesarrollos] = useState([]);
  const [filtroDesarrollo, setFiltroDesarrollo] = useState('');
  const [movSel, setMovSel] = useState(null);
  const [subiendoTipo, setSubiendoTipo] = useState(null);
  const [generandoZip, setGenerandoZip] = useState(null);
  const [archivandoId, setArchivandoId] = useState(null);
  const [responsables, setResponsables] = useState([]);
  const [superAdmins, setSuperAdmins] = useState([]);
  const [showConfigResponsable, setShowConfigResponsable] = useState(false);
  const [nuevosResponsables, setNuevosResponsables] = useState([]);
  const [revisando, setRevisando] = useState(null);
  // FIX: Buyer Persona — 4 campos capturados en el contacto (no en el
  // expediente) justo después de "Referencia bancaria". Obligatorios
  // para poder aprobar los 11 documentos, pero SOLO en apartados creados
  // después de la fecha de corte (buyer_persona_activo_desde) — lo que
  // ya estaba en proceso antes de este cambio queda exento.
  const [ocupaciones, setOcupaciones] = useState([]);
  const [cutoffBuyerPersona, setCutoffBuyerPersona] = useState(null);
  const [contactoBuyerPersona, setContactoBuyerPersona] = useState(null);
  // FIX: los 4 campos ahora se editan en memoria (formBP) y solo se
  // mandan a la base cuando se da click en "Guardar" — antes cada campo
  // se guardaba solo con el onChange, sin ninguna confirmación visible
  // de que sí quedó bien guardado.
  const [formBP, setFormBP] = useState({ genero: '', estado_civil: '', edad: '', ocupacion_clave: null, ocupacion_texto: '', ocupacion_categoria: '' });
  const [guardandoBP, setGuardandoBP] = useState(false);
  const [msgBP, setMsgBP] = useState('');
  const [buscarOcupacion, setBuscarOcupacion] = useState('');
  const [showOcupaciones, setShowOcupaciones] = useState(false);
  // FIX: coacreditado (solo aplica a compras financiadas) y referencias
  // personales (solo Infonavit/Cofinavit) — igual que Buyer Persona, se
  // editan en memoria y solo se guardan al dar click en "Guardar".
  const [formCoacreditado, setFormCoacreditado] = useState({ tiene_coacreditado: false, coacreditado_nombre: '' });
  const [formReferencias, setFormReferencias] = useState({ referencia1_nombre: '', referencia1_telefono: '', referencia2_nombre: '', referencia2_telefono: '' });
  const [guardandoExtra, setGuardandoExtra] = useState(false);
  const [msgExtra, setMsgExtra] = useState('');
  // FIX: mapa correo -> nombre completo, para mostrar quién aprobó/rechazó
  // cada documento (registro de validación, por temas de manipulación de
  // información).
  const [agentesPorCorreo, setAgentesPorCorreo] = useState({});

  const nombreCompleto = miAgente ? `${miAgente.nombre} ${miAgente.apellidos}`.trim() : '';
  const esGerente = ROLES_GERENTE.includes(miRol);
  // FIX: Mesa de Control es quien revisa expedientes — a diferencia de los
  // demás Gerentes, ve y revisa TODOS los expedientes de la empresa, sin
  // restricción de desarrollo o equipo (confirmado con el cliente).
  const esMesaControl = miRol === 'Mesa de Control';
  const esAdmin = ROLES_ADMIN.includes(miRol);
  // FIX: Mesa de Control es quien valida expedientes — siempre puede
  // prender/apagar "Expediente completo", además de quien esté configurado
  // como responsable.
  const soyResponsable = esMesaControl || (miAgente?.correo && responsables.includes(miAgente.correo));
  // FIX: aviso a los responsables de expedientes con documentos por
  // revisar — se muestra una sola vez por sesión (no cada vez que se
  // actualiza algo en pantalla), con el mismo estilo que ya usa el aviso
  // de vigencia en Contactos.
  const [showAlertaPendientes, setShowAlertaPendientes] = useState(false);
  const yaAvisoPendientesRef = useRef(false);
  const misProyectos = miAgente?.desarrollos_cargo || [];

  const puedeVerDescarga = esAdmin || esGerente || esMesaControl;

  useEffect(() => {
    cargarMovimientos();
    cargarAgentesPorCorreo();
    cargarOcupaciones();
    cargarCutoffBuyerPersona();
    cargarDesarrollos();
    if (esAdmin) { cargarResponsables(); cargarSuperAdmins(); }
  }, [miRol, miAgente]);

  useEffect(() => { cargarContactoBuyerPersona(movSel?.contacto_id); setBuscarOcupacion(''); setShowOcupaciones(false); }, [movSel]);

  useEffect(() => {
    setFormCoacreditado({ tiene_coacreditado: !!movSel?.tiene_coacreditado, coacreditado_nombre: movSel?.coacreditado_nombre || '' });
    setFormReferencias({
      referencia1_nombre: movSel?.referencia1_nombre || '', referencia1_telefono: movSel?.referencia1_telefono || '',
      referencia2_nombre: movSel?.referencia2_nombre || '', referencia2_telefono: movSel?.referencia2_telefono || '',
    });
    setMsgExtra('');
  }, [movSel?.id]);

  const cargarMovimientos = async () => {
    setLoading(true);
    // FIX: se liga al movimiento tipo "Apartado" — es donde vive el
    // expediente desde el inicio, aunque después exista también una fila
    // separada de "Vendida" para la misma unidad.
    const { data } = await supabase.from('movimientos').select('*').eq('tipo', 'Apartado').order('created_at', { ascending: false });
    setMovimientos(data || []);
    if (data && data.length > 0) {
      const { data: docs } = await supabase.from('expediente_documentos').select('*').in('movimiento_id', data.map(m => m.id));
      const mapa = {};
      (docs || []).forEach(d => {
        if (!mapa[d.movimiento_id]) mapa[d.movimiento_id] = {};
        mapa[d.movimiento_id][d.tipo_documento] = d;
      });
      setDocsPorMovimiento(mapa);
    }
    setLoading(false);
  };

  // FIX: lista de desarrollos para el filtro — Gerente Editor/Operador
  // solo ven los suyos (desarrollos_cargo), igual que ya limita el resto
  // de la pantalla; Admin/Super Admin/Agente/Mesa de Control ven todos.
  const cargarDesarrollos = async () => {
    let query = supabase.from('desarrollos').select('id, nombre').eq('activo', true).order('nombre');
    if (esGerente) {
      if (misProyectos.length === 0) { setDesarrollos([]); return; }
      query = query.in('nombre', misProyectos);
    }
    const { data } = await query;
    setDesarrollos(data || []);
  };

  const cargarAgentesPorCorreo = async () => {
    const { data } = await supabase.from('agentes').select('correo, nombre, apellidos');
    const map = {};
    (data || []).forEach(a => { map[a.correo] = `${a.nombre || ''} ${a.apellidos || ''}`.trim() || a.correo; });
    setAgentesPorCorreo(map);
  };

  const nombrePorCorreo = (correo) => correo ? (agentesPorCorreo[correo] || correo) : null;

  // FIX: catálogo de ocupaciones (Ley Antilavado) y fecha de corte del
  // Buyer Persona — se cargan una sola vez.
  const cargarOcupaciones = async () => {
    const { data } = await supabase.from('ocupaciones_catalogo').select('*').order('ocupacion');
    setOcupaciones(data || []);
  };

  const cargarCutoffBuyerPersona = async () => {
    const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'buyer_persona_activo_desde').limit(1);
    if (data && data.length > 0) setCutoffBuyerPersona(data[0].valor);
  };

  // FIX: trae los 4 campos del comprador desde `contactos` (no desde el
  // expediente) cada vez que se abre el detalle de un movimiento, y
  // llena el formulario local (formBP) con lo que ya está guardado.
  const cargarContactoBuyerPersona = async (contactoId) => {
    if (!contactoId) { setContactoBuyerPersona(null); setFormBP({ genero: '', estado_civil: '', edad: '', ocupacion_clave: null, ocupacion_texto: '', ocupacion_categoria: '' }); return; }
    const { data } = await supabase.from('contactos').select('id, genero, estado_civil, edad, ocupacion_clave, ocupacion_texto, ocupacion_categoria').eq('id', contactoId).single();
    setContactoBuyerPersona(data || null);
    setFormBP({
      genero: data?.genero || '', estado_civil: data?.estado_civil || '', edad: data?.edad || '',
      ocupacion_clave: data?.ocupacion_clave || null, ocupacion_texto: data?.ocupacion_texto || '', ocupacion_categoria: data?.ocupacion_categoria || '',
    });
    setMsgBP('');
  };

  // FIX: ¿este movimiento cae dentro de la ventana en que el Buyer
  // Persona es obligatorio? (creado después de la fecha de corte)
  const aplicaBuyerPersona = (m) => {
    if (!cutoffBuyerPersona || !m?.created_at) return false;
    return new Date(m.created_at) >= new Date(cutoffBuyerPersona);
  };

  // FIX: el candado de aprobación revisa lo que ya está GUARDADO
  // (contactoBuyerPersona), no lo que el asesor tiene tecleado sin
  // guardar (formBP) — así se obliga a dar click en "Guardar".
  const buyerPersonaCompleto = !!(contactoBuyerPersona?.genero && contactoBuyerPersona?.estado_civil && contactoBuyerPersona?.edad && contactoBuyerPersona?.ocupacion_clave);
  const formBPModificado = contactoBuyerPersona
    ? (formBP.genero !== (contactoBuyerPersona.genero || '') || formBP.estado_civil !== (contactoBuyerPersona.estado_civil || '') ||
       String(formBP.edad || '') !== String(contactoBuyerPersona.edad || '') || formBP.ocupacion_clave !== (contactoBuyerPersona.ocupacion_clave || null))
    : (formBP.genero || formBP.estado_civil || formBP.edad || formBP.ocupacion_clave);

  const handleSeleccionarOcupacion = (op) => {
    setFormBP(f => ({ ...f, ocupacion_clave: op.clave, ocupacion_texto: op.ocupacion, ocupacion_categoria: op.categoria }));
    setBuscarOcupacion(''); setShowOcupaciones(false);
  };

  const handleGuardarBuyerPersona = async () => {
    if (!movSel?.contacto_id) return;
    setGuardandoBP(true); setMsgBP('');
    const { data, error } = await supabase.from('contactos').update({
      genero: formBP.genero || null, estado_civil: formBP.estado_civil || null,
      edad: formBP.edad ? parseInt(formBP.edad) : null,
      ocupacion_clave: formBP.ocupacion_clave || null, ocupacion_texto: formBP.ocupacion_texto || null, ocupacion_categoria: formBP.ocupacion_categoria || null,
    }).eq('id', movSel.contacto_id).select('id, genero, estado_civil, edad, ocupacion_clave, ocupacion_texto, ocupacion_categoria').single();
    setGuardandoBP(false);
    if (error) { setMsgBP('❌ Error al guardar: ' + error.message); return; }
    setContactoBuyerPersona(data);
    setMsgBP('✅ Guardado correctamente');
    setTimeout(() => setMsgBP(''), 3000);
  };

  // FIX: borra los 4 campos del comprador (ej. para limpiar pruebas) —
  // el dato vive en el CONTACTO, no en el expediente, así que borrar el
  // expediente/movimiento no lo quita del dashboard de Buyer Persona.
  // Esto sí lo quita.
  const handleBorrarBuyerPersona = async () => {
    if (!movSel?.contacto_id) return;
    if (!window.confirm('¿Borrar los datos del comprador de este contacto? Esto también lo quita del dashboard de Buyer Persona.')) return;
    setGuardandoBP(true); setMsgBP('');
    const { data, error } = await supabase.from('contactos').update({
      genero: null, estado_civil: null, edad: null, ocupacion_clave: null, ocupacion_texto: null, ocupacion_categoria: null,
    }).eq('id', movSel.contacto_id).select('id, genero, estado_civil, edad, ocupacion_clave, ocupacion_texto, ocupacion_categoria').single();
    setGuardandoBP(false);
    if (error) { setMsgBP('❌ Error al borrar: ' + error.message); return; }
    setContactoBuyerPersona(data);
    setFormBP({ genero: '', estado_civil: '', edad: '', ocupacion_clave: null, ocupacion_texto: '', ocupacion_categoria: '' });
    setMsgBP('✅ Datos borrados');
    setTimeout(() => setMsgBP(''), 3000);
  };

  // FIX: el checkbox "¿Hay coacreditado?" guarda al instante (como "No
  // aplica" en el resto del checklist) — al marcarlo, la segunda columna
  // de documentos debe aparecer de inmediato, sin un paso extra de
  // "Guardar" en medio.
  const handleToggleCoacreditado = async (valor) => {
    if (!movSel) return;
    const { data, error } = await supabase.from('movimientos').update({
      tiene_coacreditado: valor,
      coacreditado_nombre: valor ? movSel.coacreditado_nombre : null,
    }).eq('id', movSel.id).select().single();
    if (error) { alert('No se pudo guardar: ' + error.message); return; }
    setMovSel(data);
    setMovimientos(prev => prev.map(m => m.id === data.id ? data : m));
    setFormCoacreditado(f => ({ ...f, tiene_coacreditado: valor, coacreditado_nombre: data.coacreditado_nombre || '' }));
  };

  // FIX: el nombre del coacreditado sí se edita en memoria y se guarda
  // aparte (con botón), para no mandar un update por cada letra tecleada.
  const handleGuardarCoacreditado = async () => {
    if (!movSel) return;
    setGuardandoExtra(true); setMsgExtra('');
    const { data, error } = await supabase.from('movimientos').update({
      coacreditado_nombre: formCoacreditado.coacreditado_nombre || null,
    }).eq('id', movSel.id).select().single();
    setGuardandoExtra(false);
    if (error) { setMsgExtra('❌ Error al guardar: ' + error.message); return; }
    setMovSel(data);
    setMovimientos(prev => prev.map(m => m.id === data.id ? data : m));
    setMsgExtra('✅ Guardado correctamente');
    setTimeout(() => setMsgExtra(''), 3000);
  };

  // FIX: guarda las dos referencias personales (nombre + teléfono) — solo
  // texto, no es un documento, así que vive en el movimiento directamente.
  const handleGuardarReferencias = async () => {
    if (!movSel) return;
    setGuardandoExtra(true); setMsgExtra('');
    const { data, error } = await supabase.from('movimientos').update({
      referencia1_nombre: formReferencias.referencia1_nombre || null, referencia1_telefono: formReferencias.referencia1_telefono || null,
      referencia2_nombre: formReferencias.referencia2_nombre || null, referencia2_telefono: formReferencias.referencia2_telefono || null,
    }).eq('id', movSel.id).select().single();
    setGuardandoExtra(false);
    if (error) { setMsgExtra('❌ Error al guardar: ' + error.message); return; }
    setMovSel(data);
    setMovimientos(prev => prev.map(m => m.id === data.id ? data : m));
    setMsgExtra('✅ Guardado correctamente');
    setTimeout(() => setMsgExtra(''), 3000);
  };

  // FIX: "Expediente completo" — casilla que solo el responsable puede
  // prender/apagar. Al activarla, la unidad pasa a Titulación (que la
  // usa como único filtro de qué expedientes mostrar).
  const handleToggleExpedienteCompleto = async (mov, valor) => {
    if (!soyResponsable) return;
    const { data, error } = await supabase.from('movimientos').update({ expediente_completo: valor }).eq('id', mov.id).select().single();
    if (error) return;
    setMovSel(data);
    setMovimientos(prev => prev.map(m => m.id === data.id ? data : m));
  };

  const cargarResponsables = async () => {
    const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'expedientes_responsables_correos').limit(1);
    const lista = data && data.length > 0 && data[0].valor ? data[0].valor.split(',').map(s => s.trim()).filter(Boolean) : [];
    setResponsables(lista);
    setNuevosResponsables(lista);
  };

  // FIX: los responsables de expedientes ahora también pueden ser Admin
  // o Mesa de Control, no solo Super Admin.
  const cargarSuperAdmins = async () => {
    const { data } = await supabase.from('agentes').select('correo, nombre, apellidos, rol').in('rol', ['Super Admin', 'Admin', 'Mesa de Control']).eq('activo', true).order('nombre');
    setSuperAdmins(data || []);
  };

  const guardarResponsables = async () => {
    await supabase.from('configuracion').upsert({ clave: 'expedientes_responsables_correos', valor: nuevosResponsables.join(',') }, { onConflict: 'clave' });
    setResponsables(nuevosResponsables);
    setShowConfigResponsable(false);
  };

  const toggleResponsableSel = (correo) => {
    setNuevosResponsables(prev => {
      if (prev.includes(correo)) return prev.filter(c => c !== correo);
      if (prev.length >= 4) return prev; // máximo 4
      return [...prev, correo];
    });
  };

  const docsDe = (movimientoId) => docsPorMovimiento[movimientoId] || {};

  // FIX: comparar por correo (estable) en vez de solo por nombre — si el
  // agente corrige su nombre/apellidos en "Mi cuenta" después de registrar
  // un movimiento, el nombre guardado ahí deja de coincidir con el actual
  // y el expediente se queda huérfano (esMio pasa a false sin motivo).
  const esVendedorDe = (m) => (miAgente?.correo && m.vendedor_correo === miAgente.correo) || (nombreCompleto && m.vendedor === nombreCompleto);
  const esDeMiProyecto = (m) => misProyectos.includes(m.desarrollo_nombre);

  // FIX: los 11 documentos del asesor se dan por completos cuando están
  // subidos Y aprobados (referencia_bancaria puede estar marcada "no aplica")
  const docsAsesorCompletos = (movimiento) => {
    const docs = docsDe(movimiento.id);
    return docsRequeridos(movimiento, 'titular').every(t => {
      const d = docs[t.id];
      if (t.opcional && d?.no_aplica) return true;
      return d?.archivo_path && d.estado_revision === 'aprobado';
    });
  };

  const contarAprobados = (movimiento) => {
    const docs = docsDe(movimiento.id);
    let n = 0;
    docsRequeridosCompletos(movimiento).forEach(t => {
      const d = docs[t.id];
      if (d && ((t.opcional && d.no_aplica) || (d.archivo_path && d.estado_revision === 'aprobado'))) n++;
    });
    return n;
  };

  const mesesDesde = (fecha) => {
    const f = parseFechaLocal(fecha);
    if (!f) return 0;
    return (new Date() - f) / (1000 * 60 * 60 * 24 * 30);
  };

  const expedienteArchivado = (movimientoId) => Object.values(docsDe(movimientoId)).some(d => d.archivado);
  const necesitaArchivar = (m) => !expedienteArchivado(m.id) && mesesDesde(m.fecha_apartado || m.created_at) >= MESES_PARA_ARCHIVAR;

  // FIX: aviso de rechazo — cualquier documento mío que haya sido
  // rechazado y todavía no lo haya vuelto a subir.
  const misDocumentosRechazados = () => {
    const lista = [];
    movimientos.forEach(m => {
      const docs = docsDe(m.id);
      Object.values(docs).forEach(d => {
        if (d.estado_revision === 'rechazado' && d.subido_por === miAgente?.correo) {
          lista.push({ movimiento: m, doc: d });
        }
      });
    });
    return lista;
  };

  // FIX: para documentos "multiple" (comprobante_apartado), sube y AGREGA
  // al arreglo de archivos en vez de reemplazar el anterior. También ya no
  // fuerza extensión .pdf — usa la extensión real del archivo, para poder
  // aceptar imágenes.
  // FIX: notifica por push a todos los Admin/Super Admin activos cuando
  // un asesor sube un documento que queda pendiente de revisar.
  // FIX: cuenta documentos pendientes de revisar en TODO el sistema (no
  // solo lo que ve el asesor que está subiendo, que normalmente no tiene
  // ni visibilidad de eso) — es lo que se manda como número de la burbuja.
  const contarPendientesGlobal = async () => {
    const { count } = await supabase.from('expediente_documentos').select('id', { count: 'exact', head: true }).eq('estado_revision', 'pendiente').eq('archivado', false);
    return count || 0;
  };

  const notificarAdminsDocumentoPendiente = async (movimientoId) => {
    const mov = movimientos.find(m => m.id === movimientoId);
    const { data: admins } = await supabase.from('agentes').select('correo').in('rol', ['Super Admin', 'Admin', 'Mesa de Control']).eq('activo', true);
    const correos = (admins || []).map(a => a.correo).filter(Boolean);
    const badgeCount = await contarPendientesGlobal();
    enviarPush({
      correos,
      title: 'Documento por revisar',
      body: mov ? `${mov.contacto_nombre} — ${mov.desarrollo_nombre}` : 'Un expediente tiene un documento nuevo por revisar',
      url: '/',
      badgeCount,
    });
  };

  const handleSubirDocumento = async (movimientoId, tipoId, file) => {
    if (!file) return;
    const tipoInfo = docsRequeridosCompletos(movSel).find(t => t.id === tipoId);
    setSubiendoTipo(tipoId);
    const ext = file.name.split('.').pop();
    const path = `${movimientoId}/${tipoId}_${Date.now()}.${ext}`;
    const { error: errUpload } = await supabase.storage.from('expedientes').upload(path, file, { upsert: true });
    if (errUpload) { alert('Error al subir: ' + errUpload.message); setSubiendoTipo(null); return; }

    if (tipoInfo?.multiple) {
      const existente = docsDe(movimientoId)[tipoId];
      const archivosActuales = getArchivosDoc(existente);
      if (archivosActuales.length >= (tipoInfo.maxArchivos || 10)) {
        alert(`Máximo ${tipoInfo.maxArchivos || 10} archivos para este documento`);
        await supabase.storage.from('expedientes').remove([path]);
        setSubiendoTipo(null);
        return;
      }
      const nuevosArchivos = [...archivosActuales, { path, nombre: file.name }];
      const { data, error } = await supabase.from('expediente_documentos').upsert({
        movimiento_id: movimientoId, tipo_documento: tipoId,
        archivo_path: nuevosArchivos[0].path, nombre_archivo: nuevosArchivos[0].nombre,
        archivos_json: JSON.stringify(nuevosArchivos),
        no_aplica: false, subido_por: miAgente?.correo || '',
        fecha_subida: new Date().toISOString(), estado_revision: 'pendiente',
        motivo_rechazo: null, revisado_por: null, fecha_revision: null,
        archivado: false, fecha_archivado: null,
      }, { onConflict: 'movimiento_id,tipo_documento' }).select().single();
      setSubiendoTipo(null);
      if (!error && data) { setDocsPorMovimiento(prev => ({ ...prev, [movimientoId]: { ...(prev[movimientoId] || {}), [tipoId]: data } })); notificarAdminsDocumentoPendiente(movimientoId); }
      else if (error) alert('El archivo se subió pero no se pudo registrar: ' + error.message);
      return;
    }

    const existente = docsDe(movimientoId)[tipoId];
    if (existente?.archivo_path) await supabase.storage.from('expedientes').remove([existente.archivo_path]);

    // FIX: al volver a subir, regresa a "pendiente" para que se revise de nuevo
    const { data, error } = await supabase.from('expediente_documentos').upsert({
      movimiento_id: movimientoId, tipo_documento: tipoId, archivo_path: path,
      nombre_archivo: file.name, no_aplica: false, subido_por: miAgente?.correo || '',
      fecha_subida: new Date().toISOString(), estado_revision: 'pendiente',
      motivo_rechazo: null, revisado_por: null, fecha_revision: null,
      archivado: false, fecha_archivado: null, archivos_json: null,
    }, { onConflict: 'movimiento_id,tipo_documento' }).select().single();

    setSubiendoTipo(null);
    if (!error && data) { setDocsPorMovimiento(prev => ({ ...prev, [movimientoId]: { ...(prev[movimientoId] || {}), [tipoId]: data } })); notificarAdminsDocumentoPendiente(movimientoId); }
    else if (error) alert('El archivo se subió pero no se pudo registrar: ' + error.message);
  };

  // FIX: quita un archivo individual de un documento de varios archivos
  // (comprobante_apartado) — vuelve a "pendiente" el estado de revisión.
  const handleQuitarArchivoComprobante = async (movimientoId, tipoId, index) => {
    const doc = docsDe(movimientoId)[tipoId];
    const archivos = getArchivosDoc(doc);
    const removido = archivos[index];
    const restantes = archivos.filter((_, i) => i !== index);
    if (removido?.path) await supabase.storage.from('expedientes').remove([removido.path]);
    const { data, error } = await supabase.from('expediente_documentos').upsert({
      movimiento_id: movimientoId, tipo_documento: tipoId,
      archivo_path: restantes[0]?.path || null, nombre_archivo: restantes[0]?.nombre || null,
      archivos_json: restantes.length > 0 ? JSON.stringify(restantes) : null,
      subido_por: miAgente?.correo || '', fecha_subida: new Date().toISOString(),
      estado_revision: 'pendiente', motivo_rechazo: null, revisado_por: null, fecha_revision: null,
    }, { onConflict: 'movimiento_id,tipo_documento' }).select().single();
    if (!error && data) setDocsPorMovimiento(prev => ({ ...prev, [movimientoId]: { ...(prev[movimientoId] || {}), [tipoId]: data } }));
    else if (error) alert('No se pudo actualizar el documento: ' + error.message);
  };

  const handleToggleNoAplica = async (movimientoId, tipoId, valor) => {
    const { data, error } = await supabase.from('expediente_documentos').upsert({
      movimiento_id: movimientoId, tipo_documento: tipoId, no_aplica: valor,
      subido_por: miAgente?.correo || '', fecha_subida: new Date().toISOString(),
    }, { onConflict: 'movimiento_id,tipo_documento' }).select().single();
    if (!error && data) setDocsPorMovimiento(prev => ({ ...prev, [movimientoId]: { ...(prev[movimientoId] || {}), [tipoId]: data } }));
    else if (error) alert('No se pudo guardar: ' + error.message);
  };

  const handleVerDocumento = async (path) => {
    const { data, error } = await supabase.storage.from('expedientes').createSignedUrl(path, 300);
    if (error) { alert('No se pudo abrir el archivo: ' + error.message); return; }
    window.open(data.signedUrl, '_blank');
  };

  // FIX: Admin y Super Admin revisan — aprueban o rechazan con motivo.
  // Queda registrado quién lo hizo (revisado_por) y cuándo (fecha_revision),
  // y ahora ese registro SÍ se muestra en pantalla (antes se guardaba pero
  // nunca se veía).
  const handleAprobar = async (movimientoId, tipoId) => {
    // FIX: respaldo — aunque el botón esté oculto, nunca aprobar si el
    // Buyer Persona es obligatorio y no está completo.
    if (movSel && aplicaBuyerPersona(movSel) && !buyerPersonaCompleto) return;
    setRevisando(tipoId);
    const { data, error } = await supabase.from('expediente_documentos').update({
      estado_revision: 'aprobado', motivo_rechazo: null, revisado_por: miAgente?.correo || '', fecha_revision: new Date().toISOString(),
    }).eq('movimiento_id', movimientoId).eq('tipo_documento', tipoId).select().single();
    setRevisando(null);
    if (!error && data) setDocsPorMovimiento(prev => ({ ...prev, [movimientoId]: { ...(prev[movimientoId] || {}), [tipoId]: data } }));
  };

  const handleRechazar = async (movimientoId, tipoId) => {
    const motivo = window.prompt('¿Qué está mal con este documento? (el asesor verá este motivo)');
    if (!motivo || !motivo.trim()) return;
    setRevisando(tipoId);
    const { data, error } = await supabase.from('expediente_documentos').update({
      estado_revision: 'rechazado', motivo_rechazo: motivo.trim(), revisado_por: miAgente?.correo || '', fecha_revision: new Date().toISOString(),
    }).eq('movimiento_id', movimientoId).eq('tipo_documento', tipoId).select().single();
    setRevisando(null);
    if (!error && data) {
      setDocsPorMovimiento(prev => ({ ...prev, [movimientoId]: { ...(prev[movimientoId] || {}), [tipoId]: data } }));
      if (data.subido_por) {
        const mov = movimientos.find(m => m.id === movimientoId);
        const tipoInfo = docsRequeridosCompletos(movSel).find(t => t.id === tipoId);
        const { count } = await supabase.from('expediente_documentos').select('id', { count: 'exact', head: true }).eq('subido_por', data.subido_por).eq('estado_revision', 'rechazado');
        enviarPush({
          correos: [data.subido_por],
          title: 'Documento rechazado',
          body: `${tipoInfo?.label || 'Un documento'} — ${mov?.contacto_nombre || ''}: ${motivo.trim()}`,
          url: '/',
          badgeCount: count || 0,
        });
      }
    }
  };

  // FIX: incluye TODOS los archivos de documentos con varios (comprobante
  // de apartado), no solo el primero. Ya no fuerza extensión .pdf en el zip.
  const handleDescargarZip = async (movimiento) => {
    setGenerandoZip(movimiento.id);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const docs = docsDe(movimiento.id);
      let algunoAgregado = false;
      for (const tipo of docsRequeridosCompletos(movimiento)) {
        const doc = docs[tipo.id];
        const archivos = getArchivosDoc(doc);
        for (let i = 0; i < archivos.length; i++) {
          const a = archivos[i];
          const { data: urlData } = await supabase.storage.from('expedientes').createSignedUrl(a.path, 300);
          if (urlData?.signedUrl) {
            const res = await fetch(urlData.signedUrl);
            const blob = await res.blob();
            const ext = a.path.split('.').pop();
            const nombreBase = tipo.label.replace(/[^\w\s]/g, '');
            const nombreArchivo = archivos.length > 1 ? `${nombreBase}_${i + 1}.${ext}` : `${nombreBase}.${ext}`;
            zip.file(nombreArchivo, blob);
            algunoAgregado = true;
          }
        }
      }
      if (!algunoAgregado) { alert('Este expediente todavía no tiene documentos subidos'); setGenerandoZip(null); return; }
      const contenido = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(contenido);
      const a = document.createElement('a');
      a.href = url; a.download = `Expediente_${movimiento.contacto_nombre?.replace(/\s/g, '_') || movimiento.id}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Error al generar el ZIP: ' + err.message);
    }
    setGenerandoZip(null);
  };

  const handleArchivar = async (movimiento) => {
    if (!window.confirm('¿Ya respaldaste este expediente fuera de Supabase? Esta acción borra los archivos de aquí para liberar espacio — no se pueden recuperar desde el CRM después.')) return;
    setArchivandoId(movimiento.id);
    const docs = docsDe(movimiento.id);
    const paths = Object.values(docs).flatMap(d => getArchivosDoc(d).map(a => a.path));
    if (paths.length > 0) await supabase.storage.from('expedientes').remove(paths);
    await supabase.from('expediente_documentos').update({ archivado: true, fecha_archivado: new Date().toISOString() }).eq('movimiento_id', movimiento.id);
    setArchivandoId(null);
    cargarMovimientos();
  };

  // ============ Listas filtradas por pestaña y rol ============

  const movimientosCargar = movimientos.filter(m => {
    if (esVendedorDe(m)) return true;
    if (esMesaControl) return true;
    if (esGerente && esDeMiProyecto(m)) return true;
    if (esAdmin) return true;
    return false;
  });

  const movimientosDescarga = movimientos.filter(m => {
    if (esAdmin) return true;
    if (esMesaControl) return true;
    if (esGerente && esDeMiProyecto(m)) return true;
    return false;
  });

  const listaActual = (tab === 'cargar' ? movimientosCargar : movimientosDescarga).filter(m =>
    (!buscar || m.contacto_nombre?.toLowerCase().includes(buscar.toLowerCase()) ||
      m.desarrollo_nombre?.toLowerCase().includes(buscar.toLowerCase()) ||
      m.unidad_numero?.toLowerCase().includes(buscar.toLowerCase())) &&
    (!filtroDesarrollo || m.desarrollo_nombre === filtroDesarrollo)
  );

  const rechazados = misDocumentosRechazados();
  const pendientesDeArchivar = movimientosDescarga.filter(necesitaArchivar);
  // FIX: expedientes con al menos un documento subido y todavía "pendiente"
  // de revisar (no aprobado ni rechazado) — para avisarle a los
  // responsables que tienen trabajo por hacer.
  const expedientesPorRevisar = movimientosDescarga.filter(m =>
    !expedienteArchivado(m.id) && Object.values(docsDe(m.id)).some(d => d?.archivo_path && d.estado_revision === 'pendiente')
  );

  useEffect(() => {
    if ((esAdmin || esMesaControl) && !yaAvisoPendientesRef.current && expedientesPorRevisar.length > 0) {
      yaAvisoPendientesRef.current = true;
      setShowAlertaPendientes(true);
    }
  }, [esAdmin, esMesaControl, expedientesPorRevisar.length]);

  // FIX: bloque reutilizable que muestra quién aprobó/rechazó el
  // documento y cuándo — registro visible SOLO para Super Admin (no
  // Admin ni otros roles), por temas de manipulación de información.
  const RegistroValidacion = ({ doc }) => {
    if (miRol !== 'Super Admin') return null;
    if (!doc?.revisado_por || (doc.estado_revision !== 'aprobado' && doc.estado_revision !== 'rechazado')) return null;
    const accion = doc.estado_revision === 'aprobado' ? 'Aprobado' : 'Rechazado';
    return (
      <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>
        {accion} por {nombrePorCorreo(doc.revisado_por)}{doc.fecha_revision ? ` — ${fmtFechaHora(doc.fecha_revision)}` : ''}
      </div>
    );
  };

  // ============ Vista de detalle de un expediente ============

  if (movSel) {
    const docs = docsDe(movSel.id);
    const archivado = expedienteArchivado(movSel.id);
    const esMio = esVendedorDe(movSel);
    const soloLectura11 = tab === 'cargar' && !esMio; // Gerente/Admin viendo lo de otros: solo lectura de los 11
    const puedoSubirOrden = esGerente && esDeMiProyecto(movSel);
    // FIX: Mesa de Control también puede aprobar/rechazar — es quien
    // revisa expedientes ahora, no solo Admin/Super Admin.
    const puedoRevisar = tab === 'descargar' && (esAdmin || esMesaControl);
    const cfgFinanciado = DOCS_FINANCIADO_ESPECIFICOS[movSel.tipo_compra];
    const esFinanciado = !!cfgFinanciado;
    const docsTitular = docsRequeridos(movSel, 'titular');
    const docsCoacreditado = movSel.tiene_coacreditado ? docsRequeridos(movSel, 'coacreditado') : [];

    // FIX: card de un documento — se reutiliza para Titular y Coacreditado,
    // ya que ambos viven en el mismo mapa plano de documentos (el id del
    // coacreditado viene prefijado `coac_`).
    const renderDocCard = (tipo) => {
      const doc = docs[tipo.id];
      const archivosMultiples = tipo.multiple ? getArchivosDoc(doc) : null;
      const tieneArchivo = tipo.multiple ? archivosMultiples.length > 0 : !!doc?.archivo_path;
      const estado = doc?.no_aplica ? null : (tieneArchivo ? (doc.estado_revision || 'pendiente') : null);
      const puedeSubirEste = esMio && !archivado;
      const aceptar = tipo.aceptaImagen ? 'application/pdf,image/*' : 'application/pdf';
      return (
        <div key={tipo.id} style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e' }}>{tipo.label}</div>
              {tipo.nota && <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>{tipo.nota}</div>}
              {tipo.avisoRojo && <div style={{ fontSize: '11px', color: '#A32D2D', fontWeight: '700', textTransform: 'uppercase', marginTop: '4px' }}>{tipo.avisoRojo}</div>}

              {/* FIX: lista de archivos — varios para tipo.multiple, uno para el resto */}
              {tipo.multiple ? (
                archivosMultiples.length > 0 && (
                  <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {archivosMultiples.map((a, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#888' }}>
                        <span>📄 {a.nombre}</span>
                        <button onClick={() => handleVerDocumento(a.path)} style={{ background: 'none', border: 'none', color: '#C0203A', textDecoration: 'underline', cursor: 'pointer', fontSize: '11px', padding: 0 }}>Ver</button>
                        {puedeSubirEste && (
                          <button onClick={() => handleQuitarArchivoComprobante(movSel.id, tipo.id, i)} style={{ background: 'none', border: 'none', color: '#e53935', cursor: 'pointer', fontSize: '11px', padding: 0 }}>✕ Quitar</button>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                doc?.nombre_archivo && <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>📄 {doc.nombre_archivo}</div>
              )}

              {doc?.no_aplica && <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>Marcado como "No aplica"</div>}
              {estado && (
                <span style={{ display: 'inline-block', marginTop: '6px', fontSize: '11px', padding: '2px 10px', borderRadius: '20px', background: ESTADO_COLOR[estado].bg, color: ESTADO_COLOR[estado].color, fontWeight: '500' }}>
                  {ESTADO_COLOR[estado].label}
                </span>
              )}
              <RegistroValidacion doc={doc} />
              {doc?.estado_revision === 'rechazado' && doc.motivo_rechazo && (
                <div style={{ fontSize: '12px', color: '#A32D2D', marginTop: '6px', background: '#FCEBEB', padding: '8px 10px', borderRadius: '6px' }}>
                  ✗ {doc.motivo_rechazo}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {!tipo.multiple && doc?.archivo_path && (
                <button onClick={() => handleVerDocumento(doc.archivo_path)}
                  style={{ padding: '6px 12px', background: '#f5f5f5', color: '#333', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                  👁 Ver
                </button>
              )}
              {puedeSubirEste && (!tipo.multiple || archivosMultiples.length < (tipo.maxArchivos || 10)) && (
                <label style={{ padding: '6px 12px', background: '#C0203A', color: '#fff', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                  {subiendoTipo === tipo.id ? 'Subiendo...' : tipo.multiple ? '+ Agregar archivo' : doc?.archivo_path ? 'Reemplazar' : 'Subir archivo'}
                  <input type='file' accept={aceptar} style={{ display: 'none' }}
                    onChange={e => handleSubirDocumento(movSel.id, tipo.id, e.target.files[0])} />
                </label>
              )}
              {puedeSubirEste && tipo.opcional && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#888', cursor: 'pointer' }}>
                  <input type='checkbox' checked={!!doc?.no_aplica} onChange={e => handleToggleNoAplica(movSel.id, tipo.id, e.target.checked)} />
                  No aplica
                </label>
              )}
              {puedoRevisar && tieneArchivo && (
                <>
                  {(!aplicaBuyerPersona(movSel) || buyerPersonaCompleto) && (
                    <button onClick={() => handleAprobar(movSel.id, tipo.id)} disabled={revisando === tipo.id}
                      style={{ padding: '6px 12px', background: '#EAF3DE', color: '#27500A', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      ✓ Aprobar
                    </button>
                  )}
                  <button onClick={() => handleRechazar(movSel.id, tipo.id)} disabled={revisando === tipo.id}
                    style={{ padding: '6px 12px', background: '#FCEBEB', color: '#A32D2D', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                    ✗ Rechazar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      );
    };

    return (
      <div style={{ padding: isMobile ? '1rem' : '2rem', maxWidth: '780px' }}>
        <button onClick={() => setMovSel(null)} style={{ background: 'none', border: 'none', color: '#C0203A', fontSize: '13px', cursor: 'pointer', marginBottom: '1rem', padding: 0 }}>
          ← Volver
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ fontSize: isMobile ? '17px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>{movSel.contacto_nombre}</h2>
            <div style={{ fontSize: '13px', color: '#888' }}>{movSel.desarrollo_nombre} — Unidad {movSel.unidad_numero} — Vendedor: {movSel.vendedor}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(esAdmin || esMesaControl || (esGerente && esDeMiProyecto(movSel))) && (
              <button onClick={() => handleDescargarZip(movSel)} disabled={generandoZip === movSel.id}
                style={{ padding: '8px 16px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                {generandoZip === movSel.id ? 'Generando ZIP...' : '⬇ Descargar todo (ZIP)'}
              </button>
            )}
            {soyResponsable && !archivado && tab === 'descargar' && (
              <button onClick={() => handleArchivar(movSel)} disabled={archivandoId === movSel.id}
                style={{ padding: '8px 16px', background: '#FFF8E1', color: '#856404', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                {archivandoId === movSel.id ? 'Archivando...' : '📦 Archivar (ya respaldado)'}
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '1.5rem 0 1rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#1a1a2e' }}>EXPEDIENTE PERSONA FÍSICA</div>
          {movSel.tipo_compra && (
            <span style={{ fontSize: '14px', padding: '5px 14px', borderRadius: '20px', background: '#F3F0FF', color: '#8B5CF6', fontWeight: '600' }}>{movSel.tipo_compra}</span>
          )}
        </div>

        {archivado && (
          <div style={{ padding: '12px 16px', background: '#EAF3DE', color: '#27500A', borderRadius: '8px', fontSize: '13px', marginBottom: '1.5rem' }}>
            📦 Este expediente ya fue archivado y respaldado fuera de Supabase.
          </div>
        )}

        {tab === 'descargar' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: movSel.expediente_completo ? '#EAF3DE' : '#FFF8E1', borderRadius: '8px', marginBottom: '1.5rem', cursor: soyResponsable ? 'pointer' : 'default' }}>
            <input type='checkbox' checked={!!movSel.expediente_completo} disabled={!soyResponsable}
              onChange={e => handleToggleExpedienteCompleto(movSel, e.target.checked)} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: movSel.expediente_completo ? '#27500A' : '#856404' }}>
                Expediente completo{!soyResponsable ? ' — solo el responsable puede cambiarlo' : ''}
              </div>
              <div style={{ fontSize: '11px', color: '#888' }}>Al activarla, la unidad pasa a Titulación.</div>
            </div>
          </label>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {esFinanciado && (
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#666', textTransform: 'uppercase', marginTop: '4px' }}>Documentación del Titular</div>
          )}
          {docsTitular.map(renderDocCard)}

          {/* FIX: referencias personales — solo texto (nombre + teléfono),
              no es un documento que se sube. Solo aplica al Titular, en
              Infonavit/Cofinavit según el checklist oficial. */}
          {cfgFinanciado?.referenciasPersonales && (
            <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '10px', padding: '14px 16px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e', marginBottom: '10px' }}>Dos Referencias Personales</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                {[1, 2].map(n => (
                  <div key={n} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <input placeholder={`Nombre — referencia ${n}`} disabled={!esMio || archivado}
                      value={formReferencias[`referencia${n}_nombre`]}
                      onChange={e => setFormReferencias(f => ({ ...f, [`referencia${n}_nombre`]: e.target.value }))}
                      style={{ padding: '8px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', background: (!esMio || archivado) ? '#f9f9f9' : '#fff' }} />
                    <input placeholder={`Teléfono — referencia ${n}`} disabled={!esMio || archivado}
                      value={formReferencias[`referencia${n}_telefono`]}
                      onChange={e => setFormReferencias(f => ({ ...f, [`referencia${n}_telefono`]: e.target.value }))}
                      style={{ padding: '8px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', background: (!esMio || archivado) ? '#f9f9f9' : '#fff' }} />
                  </div>
                ))}
              </div>
              {esMio && !archivado && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                  <button onClick={handleGuardarReferencias} disabled={guardandoExtra}
                    style={{ padding: '8px 18px', background: guardandoExtra ? '#ccc' : '#C0203A', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: guardandoExtra ? 'default' : 'pointer' }}>
                    {guardandoExtra ? 'Guardando...' : 'Guardar'}
                  </button>
                  {msgExtra && <span style={{ fontSize: '12px', color: msgExtra.startsWith('✅') ? '#27500A' : '#A32D2D' }}>{msgExtra}</span>}
                </div>
              )}
            </div>
          )}

          {/* FIX: coacreditado — solo aplica a compras financiadas. El
              vendedor marca si hay coacreditado y su nombre; al activarlo
              aparece una segunda columna de documentos (mismo checklist,
              menos los que son exclusivos del Titular). */}
          {esFinanciado && (
            <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '10px', padding: '14px 16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600', color: '#1a1a2e', cursor: (esMio && !archivado) ? 'pointer' : 'default' }}>
                <input type='checkbox' disabled={!esMio || archivado} checked={!!movSel.tiene_coacreditado}
                  onChange={e => handleToggleCoacreditado(e.target.checked)} />
                ¿Hay coacreditado?
              </label>
              {movSel.tiene_coacreditado && (
                <>
                  <input placeholder='Nombre del coacreditado' disabled={!esMio || archivado}
                    value={formCoacreditado.coacreditado_nombre}
                    onChange={e => setFormCoacreditado(f => ({ ...f, coacreditado_nombre: e.target.value }))}
                    style={{ width: '100%', padding: '8px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', marginTop: '10px', background: (!esMio || archivado) ? '#f9f9f9' : '#fff' }} />
                  {esMio && !archivado && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                      <button onClick={handleGuardarCoacreditado} disabled={guardandoExtra}
                        style={{ padding: '8px 18px', background: guardandoExtra ? '#ccc' : '#C0203A', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: guardandoExtra ? 'default' : 'pointer' }}>
                        {guardandoExtra ? 'Guardando...' : 'Guardar nombre'}
                      </button>
                      {msgExtra && <span style={{ fontSize: '12px', color: msgExtra.startsWith('✅') ? '#27500A' : '#A32D2D' }}>{msgExtra}</span>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {docsCoacreditado.length > 0 && (
            <>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#666', textTransform: 'uppercase', marginTop: '10px' }}>
                Documentación del Coacreditado{movSel.coacreditado_nombre ? ` — ${movSel.coacreditado_nombre}` : ''}
              </div>
              {docsCoacreditado.map(renderDocCard)}
            </>
          )}

          {/* FIX: Buyer Persona — solo aparece si el apartado cae después de
              la fecha de corte. Se edita en memoria (formBP) y solo se
              guarda en el contacto al dar click en "Guardar", con mensaje
              de confirmación — así queda claro que sí se guardó. */}
          {aplicaBuyerPersona(movSel) && (
            <div style={{ background: buyerPersonaCompleto ? '#fff' : '#FFFDF0', border: `0.5px solid ${buyerPersonaCompleto ? '#e0e0e0' : '#FFE082'}`, borderRadius: '10px', padding: '14px 16px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e' }}>
                Datos del comprador
                {!buyerPersonaCompleto && <span style={{ color: '#856404', fontWeight: '400', fontSize: '11px', marginLeft: '6px' }}>— obligatorio para poder aprobar los documentos</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px', marginTop: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Género</label>
                  <select disabled={!esMio || archivado} value={formBP.genero} onChange={e => setFormBP(f => ({ ...f, genero: e.target.value }))}
                    style={{ width: '100%', padding: '8px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', background: (!esMio || archivado) ? '#f9f9f9' : '#fff' }}>
                    <option value=''>Elige...</option>
                    <option value='Hombre'>Hombre</option>
                    <option value='Mujer'>Mujer</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Estado civil</label>
                  <select disabled={!esMio || archivado} value={formBP.estado_civil} onChange={e => setFormBP(f => ({ ...f, estado_civil: e.target.value }))}
                    style={{ width: '100%', padding: '8px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', background: (!esMio || archivado) ? '#f9f9f9' : '#fff' }}>
                    <option value=''>Elige...</option>
                    <option value='Casado'>Casado</option>
                    <option value='Soltero'>Soltero</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Edad</label>
                  <input type='number' min='18' max='110' disabled={!esMio || archivado} value={formBP.edad}
                    onChange={e => setFormBP(f => ({ ...f, edad: e.target.value }))}
                    style={{ width: '100%', padding: '8px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', background: (!esMio || archivado) ? '#f9f9f9' : '#fff' }} />
                </div>
                <div style={{ position: 'relative' }}>
                  <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Ocupación</label>
                  <input placeholder='Buscar...' disabled={!esMio || archivado}
                    value={formBP.ocupacion_texto && !showOcupaciones ? formBP.ocupacion_texto : buscarOcupacion}
                    onChange={e => { setBuscarOcupacion(e.target.value); setShowOcupaciones(true); }}
                    onFocus={() => { setBuscarOcupacion(''); setShowOcupaciones(true); }}
                    style={{ width: '100%', padding: '8px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', background: (!esMio || archivado) ? '#f9f9f9' : '#fff' }} />
                  {showOcupaciones && esMio && !archivado && (
                    <div onMouseLeave={() => setShowOcupaciones(false)}
                      style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, background: '#fff', border: '0.5px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: '240px', overflowY: 'auto' }}>
                      {ocupaciones
                        .filter(o => !buscarOcupacion || o.ocupacion.toLowerCase().includes(buscarOcupacion.toLowerCase()) || o.categoria.toLowerCase().includes(buscarOcupacion.toLowerCase()))
                        .map(o => (
                          <button key={o.id} type="button" onClick={() => handleSeleccionarOcupacion(o)}
                            style={{ display: 'block', width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '12px', textAlign: 'left', borderBottom: '0.5px solid #f5f5f5' }}>
                            <div style={{ color: '#1a1a2e' }}>{o.ocupacion}</div>
                            <div style={{ color: '#aaa', fontSize: '10px' }}>{o.categoria}</div>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
              {(esMio || miRol === 'Super Admin') && !archivado && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                  {esMio && (
                    <button onClick={handleGuardarBuyerPersona} disabled={guardandoBP || !formBPModificado}
                      style={{ padding: '8px 18px', background: (guardandoBP || !formBPModificado) ? '#ccc' : '#C0203A', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: (guardandoBP || !formBPModificado) ? 'default' : 'pointer' }}>
                      {guardandoBP ? 'Guardando...' : 'Guardar'}
                    </button>
                  )}
                  {(contactoBuyerPersona?.genero || contactoBuyerPersona?.estado_civil || contactoBuyerPersona?.edad || contactoBuyerPersona?.ocupacion_clave) && (
                    <button onClick={handleBorrarBuyerPersona} disabled={guardandoBP}
                      title="Quita estos datos del contacto y del dashboard de Buyer Persona"
                      style={{ padding: '8px 18px', background: '#FCEBEB', color: '#A32D2D', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: guardandoBP ? 'default' : 'pointer' }}>
                      🗑 Borrar datos
                    </button>
                  )}
                  {msgBP && (
                    <span style={{ fontSize: '12px', color: msgBP.startsWith('✅') ? '#27500A' : '#A32D2D' }}>{msgBP}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Orden de contrato — separado, la sube el Gerente */}
          <div style={{ marginTop: '10px', paddingTop: '14px', borderTop: '1px dashed #ddd' }}>
            {(() => {
              const doc = docs['orden_contrato'];
              const estado = doc?.archivo_path ? (doc.estado_revision || 'pendiente') : null;
              return (
                <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '10px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e' }}>{DOC_ORDEN_CONTRATO.label}</div>
                      {doc?.nombre_archivo && <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>📄 {doc.nombre_archivo}</div>}
                      {estado && (
                        <span style={{ display: 'inline-block', marginTop: '6px', fontSize: '11px', padding: '2px 10px', borderRadius: '20px', background: ESTADO_COLOR[estado].bg, color: ESTADO_COLOR[estado].color, fontWeight: '500' }}>
                          {ESTADO_COLOR[estado].label}
                        </span>
                      )}
                      <RegistroValidacion doc={doc} />
                      {!doc && !puedoSubirOrden && (
                        <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Solo el Gerente a cargo de este proyecto puede subirla</div>
                      )}
                      {doc?.estado_revision === 'rechazado' && doc.motivo_rechazo && (
                        <div style={{ fontSize: '12px', color: '#A32D2D', marginTop: '6px', background: '#FCEBEB', padding: '8px 10px', borderRadius: '6px' }}>
                          ✗ {doc.motivo_rechazo}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {doc?.archivo_path && (
                        <button onClick={() => handleVerDocumento(doc.archivo_path)}
                          style={{ padding: '6px 12px', background: '#f5f5f5', color: '#333', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                          👁 Ver
                        </button>
                      )}
                      {puedoSubirOrden && !archivado && (
                        <label style={{ padding: '6px 12px', background: '#C0203A', color: '#fff', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                          {subiendoTipo === 'orden_contrato' ? 'Subiendo...' : doc?.archivo_path ? 'Reemplazar' : 'Subir PDF'}
                          <input type='file' accept='application/pdf' style={{ display: 'none' }}
                            onChange={e => handleSubirDocumento(movSel.id, 'orden_contrato', e.target.files[0])} />
                        </label>
                      )}
                      {puedoRevisar && doc?.archivo_path && (
                        <>
                          {(!aplicaBuyerPersona(movSel) || buyerPersonaCompleto) && (
                            <button onClick={() => handleAprobar(movSel.id, 'orden_contrato')} disabled={revisando === 'orden_contrato'}
                              style={{ padding: '6px 12px', background: '#EAF3DE', color: '#27500A', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                              ✓ Aprobar
                            </button>
                          )}
                          <button onClick={() => handleRechazar(movSel.id, 'orden_contrato')} disabled={revisando === 'orden_contrato'}
                            style={{ padding: '6px 12px', background: '#FCEBEB', color: '#A32D2D', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                            ✗ Rechazar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    );
  }

  // ============ Vista de lista ============

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: isMobile ? '17px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Expedientes</h2>
        <div style={{ fontSize: '13px', color: '#888' }}>Expediente Persona Física</div>
      </div>

      {/* Pestañas */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '1.25rem', borderBottom: '1px solid #e0e0e0' }}>
        <button onClick={() => { setTab('cargar'); setBuscar(''); }}
          style={{ padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: tab === 'cargar' ? '600' : '400', color: tab === 'cargar' ? '#1a1a2e' : '#888', borderBottom: tab === 'cargar' ? '2px solid #1a1a2e' : '2px solid transparent' }}>
          Cargar
        </button>
        {puedeVerDescarga && (
          <button onClick={() => { setTab('descargar'); setBuscar(''); }}
            style={{ padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: tab === 'descargar' ? '600' : '400', color: tab === 'descargar' ? '#1a1a2e' : '#888', borderBottom: tab === 'descargar' ? '2px solid #1a1a2e' : '2px solid transparent' }}>
            Descargar
          </button>
        )}
      </div>

      {tab === 'cargar' && rechazados.length > 0 && (
        <div style={{ padding: '12px 16px', background: '#FCEBEB', color: '#A32D2D', borderRadius: '8px', fontSize: '13px', marginBottom: '1.25rem' }}>
          ✗ Tienes {rechazados.length} documento{rechazados.length !== 1 ? 's' : ''} rechazado{rechazados.length !== 1 ? 's' : ''} — entra al expediente correspondiente para ver el motivo y volver a subirlo.
        </div>
      )}

      {tab === 'descargar' && esAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <button onClick={() => setShowConfigResponsable(true)}
            style={{ padding: '8px 14px', border: '0.5px solid #ddd', borderRadius: '8px', background: '#fff', fontSize: '12px', cursor: 'pointer', color: '#333' }}>
            ⚙️ Responsables: {responsables.length > 0 ? responsables.map(c => superAdmins.find(a => a.correo === c)?.nombre || c).join(', ') : 'Sin asignar'}
          </button>
        </div>
      )}

      {tab === 'descargar' && soyResponsable && pendientesDeArchivar.length > 0 && (
        <div style={{ padding: '12px 16px', background: '#FFF8E1', color: '#856404', borderRadius: '8px', fontSize: '13px', marginBottom: '1.25rem' }}>
          ⚠️ Tienes {pendientesDeArchivar.length} expediente{pendientesDeArchivar.length !== 1 ? 's' : ''} con más de {MESES_PARA_ARCHIVAR} meses sin archivar.
        </div>
      )}

      {/* FIX: banner permanente (se ve cada vez que estás en "Descargar")
          + modal que solo aparece una vez por sesión, avisando que hay
          documentos subidos esperando revisión. */}
      {tab === 'descargar' && (esAdmin || esMesaControl) && expedientesPorRevisar.length > 0 && (
        <div style={{ padding: '12px 16px', background: '#EAF3DE', color: '#27500A', borderRadius: '8px', fontSize: '13px', marginBottom: '1.25rem' }}>
          📋 Tienes {expedientesPorRevisar.length} expediente{expedientesPorRevisar.length !== 1 ? 's' : ''} con documentos por revisar.
        </div>
      )}

      {showAlertaPendientes && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '2rem', maxWidth: '440px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📋</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e', marginBottom: '8px' }}>Expedientes por revisar</div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '1rem' }}>
              Tienes {expedientesPorRevisar.length} expediente{expedientesPorRevisar.length !== 1 ? 's' : ''} con documentos subidos esperando tu revisión:
            </div>
            <div style={{ maxHeight: '220px', overflowY: 'auto', marginBottom: '1.5rem' }}>
              {expedientesPorRevisar.map(m => (
                <div key={m.id} onClick={() => { setShowAlertaPendientes(false); setTab('descargar'); setMovSel(m); }}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#EAF3DE', borderRadius: '8px', marginBottom: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <span style={{ fontWeight: '500' }}>{m.contacto_nombre}</span>
                  <span style={{ color: '#27500A' }}>{m.desarrollo_nombre}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowAlertaPendientes(false)}
              style={{ width: '100%', padding: '12px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}>
              Entendido
            </button>
          </div>
        </div>
      )}

      {showConfigResponsable && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setShowConfigResponsable(false)}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '2rem', maxWidth: '380px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e', marginBottom: '8px' }}>Responsables de expedientes</div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '1.25rem' }}>
              Elige hasta 4 (Super Admin, Admin o Mesa de Control). Reciben el aviso cuando un expediente lleva más de {MESES_PARA_ARCHIVAR} meses sin archivar.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '1.5rem', maxHeight: '240px', overflowY: 'auto' }}>
              {superAdmins.map(a => (
                <label key={a.correo} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '8px 10px', background: nuevosResponsables.includes(a.correo) ? '#f5f5f5' : 'transparent', borderRadius: '6px', cursor: 'pointer' }}>
                  <input type='checkbox' checked={nuevosResponsables.includes(a.correo)} onChange={() => toggleResponsableSel(a.correo)} />
                  {a.nombre} {a.apellidos} <span style={{ fontSize: '11px', color: '#aaa' }}>({a.rol})</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowConfigResponsable(false)} style={{ flex: 1, padding: '10px', background: '#f5f5f5', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarResponsables} style={{ flex: 1, padding: '10px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <input placeholder='Buscar por cliente, desarrollo o unidad...' value={buscar} onChange={e => setBuscar(e.target.value)}
          style={{ width: isMobile ? '100%' : '280px', padding: '10px 12px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
        <select value={filtroDesarrollo} onChange={e => setFiltroDesarrollo(e.target.value)}
          style={{ width: isMobile ? '100%' : '220px', padding: '10px 12px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', background: '#fff', boxSizing: 'border-box' }}>
          <option value=''>Todos los desarrollos</option>
          {desarrollos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>Cargando...</div>
      ) : listaActual.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>Sin apartados{tab === 'cargar' ? ' a tu nombre' : ''}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {listaActual.map(m => {
            const aprobados = contarAprobados(m);
            const total = docsRequeridosCompletos(m).length;
            const archivado = expedienteArchivado(m.id);
            const pendiente = necesitaArchivar(m);
            const soyElVendedor = esVendedorDe(m);
            // FIX: para Mesa de Control y Super Admin (quienes revisan
            // documentos), un aviso junto al tipo de compra que identifique
            // de un vistazo qué expedientes tienen documentos subidos sin
            // revisar todavía — mismo criterio que expedientesPorRevisar,
            // como refuerzo visual además de la notificación push.
            const porRevisar = (miRol === 'Super Admin' || esMesaControl) && !archivado &&
              Object.values(docsDe(m.id)).some(d => d?.archivo_path && d.estado_revision === 'pendiente');
            return (
              <div key={m.id} onClick={() => setMovSel(m)}
                style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '10px', padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: '#1a1a2e' }}>{m.contacto_nombre}</div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                    {m.desarrollo_nombre} — Unidad {m.unidad_numero}{!soyElVendedor && ` — ${m.vendedor}`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {m.tipo_compra && <span style={{ fontSize: '13px', padding: '4px 12px', borderRadius: '20px', background: '#F3F0FF', color: '#8B5CF6', fontWeight: '600' }}>{m.tipo_compra}</span>}
                  {porRevisar && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: '#FDECEC', color: '#C0392B', fontWeight: '600' }}>🔎 Por revisar</span>}
                  {soyElVendedor && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: '#F3F0FF', color: '#8B5CF6' }}>Mío</span>}
                  {archivado && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: '#EAF3DE', color: '#27500A' }}>📦 Archivado</span>}
                  {!archivado && pendiente && soyResponsable && tab === 'descargar' && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: '#FFF3CD', color: '#856404' }}>⚠️ Archivar</span>}
                  <span style={{ fontSize: '12px', fontWeight: '600', color: aprobados === total ? '#2E7D4F' : '#888' }}>{aprobados}/{total}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}