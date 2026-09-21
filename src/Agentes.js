import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from './supabase';

const ROLES = ['Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control', 'Agente', 'Construcción', 'Tesorería', 'Titulación'];
const EDGE_CREAR_USUARIO = `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/crear-usuario`;
const EQUIPOS = ['Gemex', 'Inmobiliaria', 'Asesor externo', 'Desarrollador'];
const ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const LS_KEY_PROCESADOS = 'gemex_import_agentes_procesados';

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export default function Agentes() {
  const isMobile = useIsMobile();
  const [agentes, setAgentes] = useState([]);
  const [desarrollos, setDesarrollos] = useState([]);
  const [inmobiliarias, setInmobiliarias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDetalle, setShowDetalle] = useState(null);
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [filtroEquipo, setFiltroEquipo] = useState('');
  const [filtroInmobiliariaId, setFiltroInmobiliariaId] = useState('');
  const [buscarInmoFiltro, setBuscarInmoFiltro] = useState('');
  const [showDropdownInmoFiltro, setShowDropdownInmoFiltro] = useState(false);
  const [showGestionInmobiliarias, setShowGestionInmobiliarias] = useState(false);
  const [buscarGestionInmo, setBuscarGestionInmo] = useState('');
  const [editandoInmoId, setEditandoInmoId] = useState(null);
  const [nombreInmoEditado, setNombreInmoEditado] = useState('');
  const [guardandoInmoNombre, setGuardandoInmoNombre] = useState(false);
  const [usuarioActual, setUsuarioActual] = useState(null);
  const [miRol, setMiRol] = useState('Asesor');
  const [form, setForm] = useState(formVacio());
  const [correoOriginal, setCorreoOriginal] = useState('');
  const [nuevaInmobiliariaNombre, setNuevaInmobiliariaNombre] = useState('');
  const [nuevaPass, setNuevaPass] = useState('');
  const [cambiandoPass, setCambiandoPass] = useState(false);
  const [msgPass, setMsgPass] = useState('');
  const [passProvisional, setPassProvisional] = useState('');
  const [creandoUsuario, setCreandoUsuario] = useState(false);
  // FIX: buscador para asignar "agentes a cargo" a un Mesa de Control —
  // con miles de agentes, un checklist plano no sirve, así que es
  // buscar + agregar, con chips removibles (mismo patrón que el buscador
  // de contactos en Movimientos.js).
  const [buscarAgenteCargo, setBuscarAgenteCargo] = useState('');
  const [showDropdownAgenteCargo, setShowDropdownAgenteCargo] = useState(false);

  const [diasInactividad, setDiasInactividad] = useState(60);
  const [showConfigInactividad, setShowConfigInactividad] = useState(false);
  const [nuevoDiasInactividad, setNuevoDiasInactividad] = useState(60);
  const [guardandoConfig, setGuardandoConfig] = useState(false);

  const [showImportModal, setShowImportModal] = useState(false);
  const [filasImport, setFilasImport] = useState([]);
  const [nombreArchivoImport, setNombreArchivoImport] = useState('');
  const [importando, setImportando] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [progresoImport, setProgresoImport] = useState({ procesados: 0, total: 0, exitosos: 0, errores: 0, saltados: 0 });
  const [erroresImport, setErroresImport] = useState([]);
  const [msgImport, setMsgImport] = useState('');
  const pausarRef = useRef(false);
  const importInputRef = useRef(null);

  function formVacio() {
    return {
      nombre: '', apellidos: '', correo: '', telefono: '',
      whatsapp: '', rol: 'Agente', equipo: 'Gemex',
      codigo_agente: '', inmobiliaria_id: null,
      desarrollos: [], desarrollos_cargo: [], desarrollos_todos: false, foto_url: '', activo: true,
      // FIX: correos de los agentes que un Mesa de Control tiene a su
      // cargo — se asigna manualmente, igual que desarrollos_cargo.
      agentes_cargo: [],
    };
  }

  useEffect(() => {
    cargarAgentes();
    cargarDesarrollos();
    cargarInmobiliarias();
    cargarUsuarioActual();
    cargarConfigInactividad();
  }, []);

  const cargarUsuarioActual = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('agentes').select('*').eq('correo', user.email).single();
      setUsuarioActual({ ...user, agente: data || null });
      setMiRol(data?.rol || 'Asesor');
    }
  };

  const cargarAgentes = async () => {
    setLoading(true);
    // FIX: Supabase limita a 1000 filas por defecto. Con más de 1000
    // agentes (tras la carga masiva) la lista se truncaba silenciosamente.
    const { data } = await supabase.from('agentes').select('*, inmobiliarias(id, nombre)').order('nombre').limit(5000);
    setAgentes(data || []);
    setLoading(false);
  };

  // FIX: antes solo traía desarrollos activos — si un agente ya tenía
  // acceso a uno que después se marcó inactivo, el chip desaparecía por
  // completo y no había forma de verlo ni quitárselo desde aquí.
  const cargarDesarrollos = async () => {
    const { data } = await supabase.from('desarrollos').select('id, nombre, activo').order('nombre');
    setDesarrollos(data || []);
  };

  const cargarInmobiliarias = async () => {
    const { data } = await supabase.from('inmobiliarias').select('*').order('nombre');
    setInmobiliarias(data || []);
  };

  const cargarConfigInactividad = async () => {
    const { data } = await supabase.from('configuracion').select('valor').eq('clave', 'dias_inactividad_agentes').single();
    if (data?.valor) {
      const dias = parseInt(data.valor);
      setDiasInactividad(dias);
      setNuevoDiasInactividad(dias);
    }
  };

  const guardarConfigInactividad = async () => {
    setGuardandoConfig(true);
    await supabase.from('configuracion').upsert({ clave: 'dias_inactividad_agentes', valor: String(nuevoDiasInactividad) }, { onConflict: 'clave' });
    setDiasInactividad(nuevoDiasInactividad);
    setGuardandoConfig(false);
    setShowConfigInactividad(false);
  };

  const obtenerOCrearInmobiliaria = async (nombre) => {
    const limpio = nombre.trim();
    if (!limpio) return null;
    const existente = inmobiliarias.find(i => i.nombre.toLowerCase() === limpio.toLowerCase());
    if (existente) return existente.id;
    const { data, error } = await supabase.from('inmobiliarias').upsert({ nombre: limpio }, { onConflict: 'nombre' }).select().single();
    if (error || !data) return null;
    setInmobiliarias(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    return data.id;
  };

  // FIX: permite corregir el nombre de una inmobiliaria (ej. arreglar
  // encoding roto o duplicados con distinta capitalización) sin tener que
  // editar cada agente uno por uno — el cambio se refleja solo en todos
  // los agentes ligados, porque comparten el mismo inmobiliaria_id.
  const handleGuardarNombreInmobiliaria = async (id) => {
    const nuevoNombre = nombreInmoEditado.trim();
    if (!nuevoNombre) return;
    setGuardandoInmoNombre(true);
    const { error } = await supabase.from('inmobiliarias').update({ nombre: nuevoNombre }).eq('id', id);
    setGuardandoInmoNombre(false);
    if (!error) {
      setEditandoInmoId(null);
      setNombreInmoEditado('');
      cargarInmobiliarias();
      cargarAgentes();
    } else {
      alert('Error al guardar: ' + error.message + (error.message.includes('duplicate') ? '\n\nYa existe una inmobiliaria con ese nombre exacto — si quieres unirlas, avísame para armar la función de fusionar.' : ''));
    }
  };

  const handleGuardar = async () => {
    if (!form.nombre.trim()) return;
    if (!form.correo.trim()) { alert('El correo es obligatorio'); return; }
    setGuardando(true);

    // FIX: respaldo — fuerza el correo sin espacios justo antes de guardar,
    // por si llegó con espacios de alguna otra forma (ej. precargado de un
    // registro viejo que ya los tenía guardados).
    const correoLimpio = form.correo.replace(/\s/g, '');
    let payload = { ...form, correo: correoLimpio };
    delete payload.inmobiliarias;

    if (form.equipo === 'Inmobiliaria' && nuevaInmobiliariaNombre.trim()) {
      const id = await obtenerOCrearInmobiliaria(nuevaInmobiliariaNombre);
      payload.inmobiliaria_id = id;
    } else if (form.equipo !== 'Inmobiliaria') {
      payload.inmobiliaria_id = null;
    }

    if (editando) {
      // FIX: si el correo cambió, primero se sincroniza la cuenta de
      // acceso real (Supabase Auth) — si eso falla porque el correo
      // viejo genuinamente no tiene cuenta (ej. agentes importados que
      // se quedaron sin cuenta real), se crea una nueva de una vez en
      // vez de solo bloquear el guardado.
      if (correoLimpio !== correoOriginal) {
        try {
          const res = await fetch(EDGE_CREAR_USUARIO, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
            body: JSON.stringify({ action: 'cambiar_correo', email: correoOriginal, nuevoEmail: correoLimpio })
          });
          const result = await res.json();
          if (result.error) {
            if (result.error.includes('no encontrado')) {
              // No existía cuenta con el correo viejo — se crea una nueva con el correo nuevo
              const resCrear = await fetch(EDGE_CREAR_USUARIO, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
                body: JSON.stringify({ action: 'crear', email: correoLimpio, password: '123456' })
              });
              const resultCrear = await resCrear.json();
              if (resultCrear.error) {
                alert('No se pudo crear la cuenta de acceso: ' + resultCrear.error + '\n\nNo se guardaron los cambios.');
                setGuardando(false);
                return;
              }
              alert('Este agente no tenía cuenta de acceso real — se creó una nueva con contraseña provisional 123456.');
            } else {
              alert('No se pudo actualizar el correo de acceso: ' + result.error + '\n\nNo se guardaron los cambios — corrige el correo o avísame.');
              setGuardando(false);
              return;
            }
          }
        } catch (err) {
          alert('Error de conexión al intentar actualizar el correo de acceso. No se guardaron los cambios.');
          setGuardando(false);
          return;
        }
      }
      await supabase.from('agentes').update(payload).eq('id', editando);
    } else {
      if (!passProvisional || passProvisional.length < 6) {
        alert('La contraseña provisional debe tener al menos 6 caracteres');
        setGuardando(false); return;
      }
      setCreandoUsuario(true);
      try {
        const res = await fetch(EDGE_CREAR_USUARIO, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
          body: JSON.stringify({ action: 'crear', email: correoLimpio, password: passProvisional })
        });
        const result = await res.json();
        if (result.error) { alert('Error al crear usuario: ' + result.error); setGuardando(false); setCreandoUsuario(false); return; }
      } catch (err) { alert('Error al crear usuario en el sistema'); setGuardando(false); setCreandoUsuario(false); return; }
      setCreandoUsuario(false);
      await supabase.from('agentes').insert([payload]);
    }
    setGuardando(false);
    setShowForm(false); setShowDetalle(null); setEditando(null); setForm(formVacio()); setPassProvisional(''); setNuevaInmobiliariaNombre('');
    cargarAgentes(); cargarUsuarioActual();
  };

  const handleEditar = (a) => {
    setForm({ ...formVacio(), ...a, desarrollos: a.desarrollos || [], desarrollos_cargo: a.desarrollos_cargo || [], agentes_cargo: a.agentes_cargo || [], codigo_agente: a.codigo_agente || '', inmobiliaria_id: a.inmobiliaria_id || null });
    setNuevaInmobiliariaNombre('');
    setCorreoOriginal(a.correo || '');
    setBuscarAgenteCargo('');
    setEditando(a.id); setShowDetalle(null); setShowForm(true); setNuevaPass(''); setMsgPass(''); setPassProvisional('');
  };

  const handleVerDetalle = (a) => { setShowDetalle(a); setShowForm(false); setNuevaPass(''); setMsgPass(''); };

  const handleEliminar = async (agente) => {
    if (miRol !== 'Super Admin') return; // FIX: solo Super Admin puede eliminar agentes
    if (!window.confirm('¿Eliminar este agente? Esto también elimina su cuenta de acceso.')) return;
    // FIX: antes solo se borraba la fila de `agentes`, dejando la cuenta
    // real de acceso huérfana en Auth — eso bloqueaba volver a dar de
    // alta a la misma persona con el mismo correo ("ya existe"). Ahora se
    // elimina también la cuenta real, en el mismo paso.
    if (agente?.correo) {
      try {
        await fetch(EDGE_CREAR_USUARIO, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
          body: JSON.stringify({ action: 'eliminar', email: agente.correo })
        });
      } catch (err) {
        // si falla la conexión, seguimos con el borrado de la fila igual —
        // mejor eso que dejar al usuario completamente atorado
      }
    }
    await supabase.from('agentes').delete().eq('id', agente.id);
    setShowDetalle(null); cargarAgentes();
  };

  const handleToggleActivo = async (agente) => {
    await supabase.from('agentes').update({ activo: !agente.activo }).eq('id', agente.id);
    cargarAgentes();
    if (showDetalle?.id === agente.id) setShowDetalle({ ...agente, activo: !agente.activo });
  };

  const handleSubirFoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSubiendoFoto(true);
    const ext = file.name.split('.').pop();
    const fileName = `foto_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('agentes').upload(fileName, file, { upsert: true });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('agentes').getPublicUrl(fileName);
      setForm(f => ({ ...f, foto_url: publicUrl }));
    }
    setSubiendoFoto(false);
  };

  // FIX: cualquier clic individual (agregar o quitar uno solo) significa
  // que el admin está personalizando la lista a mano — deja de estar en
  // modo "todos automático", aunque por casualidad terminen coincidiendo.
  const handleToggleDesarrollo = (nombre) => {
    const arr = form.desarrollos || [];
    const nuevo = arr.includes(nombre) ? arr.filter(x => x !== nombre) : [...arr, nombre];
    const cargo = (form.desarrollos_cargo || []).filter(x => nuevo.includes(x));
    setForm({ ...form, desarrollos: nuevo, desarrollos_cargo: cargo, desarrollos_todos: false });
  };

  // FIX: "✓ Todos" ahora también marca desarrollos_todos = true — esto
  // hace que, cuando se cree un desarrollo NUEVO más adelante, se le
  // agregue automáticamente a este agente sin tener que volver a entrar
  // a su perfil (ver sincronizarDesarrolloNuevoATodos en Desarrollos.js).
  const handleSeleccionarTodosDesarrollos = () => {
    const nombresActivos = desarrollos.filter(d => d.activo).map(d => d.nombre);
    const yaEstanTodosActivos = nombresActivos.length > 0 && nombresActivos.every(n => (form.desarrollos || []).includes(n));
    if (yaEstanTodosActivos) {
      // quita solo los activos, conserva cualquier inactivo que ya estuviera marcado
      setForm({ ...form, desarrollos: (form.desarrollos || []).filter(n => !nombresActivos.includes(n)), desarrollos_cargo: [], desarrollos_todos: false });
    } else {
      const conservarInactivos = (form.desarrollos || []).filter(n => !nombresActivos.includes(n));
      setForm({ ...form, desarrollos: [...new Set([...nombresActivos, ...conservarInactivos])], desarrollos_todos: true });
    }
  };

  const handleToggleCargo = (nombre) => {
    const arr = form.desarrollos_cargo || [];
    setForm({ ...form, desarrollos_cargo: arr.includes(nombre) ? arr.filter(x => x !== nombre) : [...arr, nombre] });
  };

  // FIX: agrega/quita un agente de la lista de "agentes a cargo" de un
  // Mesa de Control — se guarda por correo (identificador único de verdad).
  const handleToggleAgenteCargo = (correo) => {
    const arr = form.agentes_cargo || [];
    setForm({ ...form, agentes_cargo: arr.includes(correo) ? arr.filter(c => c !== correo) : [...arr, correo] });
  };

  const handleCambiarPassword = async () => {
    if (!nuevaPass || nuevaPass.length < 6) { setMsgPass('La contraseña debe tener al menos 6 caracteres'); return; }
    setCambiandoPass(true);
    try {
      const res = await fetch(EDGE_CREAR_USUARIO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ action: 'cambiar_password', email: showDetalle.correo, password: nuevaPass })
      });
      const result = await res.json();
      if (result.error) setMsgPass('Error: ' + result.error);
      else { setMsgPass('Contraseña actualizada correctamente'); setNuevaPass(''); }
    } catch (err) { setMsgPass('Error al conectar con el servidor'); }
    setCambiandoPass(false);
  };

  const getProcesadosGuardados = () => {
    try {
      const raw = localStorage.getItem(LS_KEY_PROCESADOS);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  };

  const guardarProcesado = (correo) => {
    const set = getProcesadosGuardados();
    set.add(correo.toLowerCase());
    localStorage.setItem(LS_KEY_PROCESADOS, JSON.stringify([...set]));
  };

  const handleArchivoImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setNombreArchivoImport(file.name);
    setErroresImport([]);
    setMsgImport('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(ws);
      const limpias = filas
        .map(f => ({
          nombres: (f['Nombres'] || '').toString().trim(),
          apellidos: (f['Apellidos'] || '').toString().trim(),
          correo: (f['Correo'] || '').toString().trim().toLowerCase(),
          telefono: (f['Telefono'] || '').toString().trim(),
          inmobiliaria: (f['Inmobiliaria'] || '').toString().trim(),
        }))
        .filter(f => f.correo && f.correo.includes('@'));
      const vistos = new Set();
      const dedup = limpias.filter(f => {
        if (vistos.has(f.correo)) return false;
        vistos.add(f.correo);
        return true;
      });
      setFilasImport(dedup);
      setProgresoImport({ procesados: 0, total: dedup.length, exitosos: 0, errores: 0, saltados: 0 });
    };
    reader.readAsArrayBuffer(file);
  };

  const handlePausar = () => { pausarRef.current = true; setPausado(true); };
  const handleReanudar = () => { pausarRef.current = false; setPausado(false); handleIniciarImportacion(); };

  const handleIniciarImportacion = async () => {
    setImportando(true);
    pausarRef.current = false;
    setPausado(false);

    // FIX: se consulta directo a la base de datos (con límite alto) en vez
    // de usar el estado local `agentes`, que podía estar incompleto si
    // ya se habían cargado más de 1000 agentes en la sesión.
    const { data: agentesExistentesDB } = await supabase.from('agentes').select('correo').limit(10000);
    const correosExistentes = new Set((agentesExistentesDB || []).map(a => a.correo?.toLowerCase()).filter(Boolean));
    const yaProcesados = getProcesadosGuardados();

    const { data: inmobiliariasExistentes } = await supabase.from('inmobiliarias').select('id, nombre');
    const cacheInmobiliarias = new Map((inmobiliariasExistentes || []).map(i => [i.nombre.trim().toLowerCase(), i.id]));

    let exitosos = progresoImport.exitosos;
    let errores = progresoImport.errores;
    let saltados = progresoImport.saltados;
    const nuevosErrores = [...erroresImport];

    for (let i = 0; i < filasImport.length; i++) {
      if (pausarRef.current) break;

      const fila = filasImport[i];

      if (correosExistentes.has(fila.correo) || yaProcesados.has(fila.correo)) {
        saltados++;
        setProgresoImport({ procesados: i + 1, total: filasImport.length, exitosos, errores, saltados });
        continue;
      }

      try {
        const res = await fetch(EDGE_CREAR_USUARIO, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
          body: JSON.stringify({ action: 'crear', email: fila.correo, password: '123456' })
        });
        const result = await res.json();
        // FIX: si el correo "ya existe" en Auth pero no tiene fila en `agentes`
        // (cuenta huérfana de una corrida anterior interrumpida), no lo
        // tratamos como error definitivo — completamos el registro faltante
        // en vez de dejarlo atorado para siempre.
        const yaExisteEnAuth = result.error && /ya existe|already exist|already registered|duplicate/i.test(result.error);
        if (result.error && !yaExisteEnAuth) {
          errores++;
          nuevosErrores.push({ correo: fila.correo, nombre: `${fila.nombres} ${fila.apellidos}`, motivo: result.error });
        } else {
          let inmobiliariaId = null;
          if (fila.inmobiliaria) {
            const key = fila.inmobiliaria.trim().toLowerCase();
            if (cacheInmobiliarias.has(key)) {
              inmobiliariaId = cacheInmobiliarias.get(key);
            } else {
              const { data: nuevaInmo } = await supabase.from('inmobiliarias').upsert({ nombre: fila.inmobiliaria.trim() }, { onConflict: 'nombre' }).select().single();
              if (nuevaInmo) { inmobiliariaId = nuevaInmo.id; cacheInmobiliarias.set(key, nuevaInmo.id); }
            }
          }

          const { error: errInsert } = await supabase.from('agentes').insert([{
            nombre: fila.nombres, apellidos: fila.apellidos, correo: fila.correo, telefono: fila.telefono,
            whatsapp: '', rol: 'Agente',
            equipo: fila.inmobiliaria ? 'Inmobiliaria' : 'Asesor externo',
            inmobiliaria_id: inmobiliariaId,
            codigo_agente: '', desarrollos: [], desarrollos_cargo: [], foto_url: '', activo: true,
          }]);
          if (errInsert) {
            errores++;
            nuevosErrores.push({ correo: fila.correo, nombre: `${fila.nombres} ${fila.apellidos}`, motivo: 'Usuario creado pero falló el registro en agentes: ' + errInsert.message });
          } else {
            exitosos++;
            guardarProcesado(fila.correo);
          }
        }
      } catch (err) {
        errores++;
        nuevosErrores.push({ correo: fila.correo, nombre: `${fila.nombres} ${fila.apellidos}`, motivo: 'Error de conexión' });
      }

      setProgresoImport({ procesados: i + 1, total: filasImport.length, exitosos, errores, saltados });
      setErroresImport([...nuevosErrores]);
      await new Promise(r => setTimeout(r, 200));
    }

    setImportando(false);
    if (!pausarRef.current) {
      setMsgImport(`✅ Importación terminada: ${exitosos} creados, ${saltados} ya existían, ${errores} con error`);
      cargarAgentes(); cargarInmobiliarias();
    }
  };

  const handleDescargarErrores = () => {
    const ws = XLSX.utils.json_to_sheet(erroresImport.map(e => ({ Nombre: e.nombre, Correo: e.correo, Motivo: e.motivo })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Errores');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'errores_importacion_agentes.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCerrarImportModal = () => {
    if (importando) { if (!window.confirm('La importación sigue en curso. ¿Cerrar de todas formas? Puedes reabrir y reanudar después.')) return; }
    setShowImportModal(false);
  };

  const puedeVerAcceso = ['Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador'].includes(miRol);
  const esAdmin = miRol === 'Super Admin' || miRol === 'Admin';

  const formatFecha = (fecha) => {
    if (!fecha) return 'Sin registro';
    return new Date(fecha).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const calcularVenceEn = (agente) => {
    if (!agente.activo) return null;
    if (!agente.last_sign_in) return null;
    const ultimoAcceso = new Date(agente.last_sign_in);
    const ahora = new Date();
    const diasTranscurridos = Math.floor((ahora - ultimoAcceso) / (1000 * 60 * 60 * 24));
    const diasRestantes = diasInactividad - diasTranscurridos;
    return diasRestantes;
  };

  const BadgeVenceEn = ({ agente }) => {
    const dias = calcularVenceEn(agente);
    if (dias === null) return <span style={{ color: '#ccc', fontSize: '12px' }}>—</span>;
    if (dias <= 0) return (
      <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', background: '#FCEBEB', color: '#A32D2D', fontWeight: '500' }}>
        Vencido
      </span>
    );
    if (dias <= 7) return (
      <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', background: '#FFF3CD', color: '#856404', fontWeight: '500' }}>
        ⚠️ {dias}d
      </span>
    );
    return (
      <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', background: '#EAF3DE', color: '#27500A' }}>
        {dias}d
      </span>
    );
  };

  const agentesFiltrados = agentes.filter(a => {
    const textOk = !buscar ||
      `${a.nombre} ${a.apellidos}`.toLowerCase().includes(buscar.toLowerCase()) ||
      a.correo?.toLowerCase().includes(buscar.toLowerCase()) ||
      a.inmobiliarias?.nombre?.toLowerCase().includes(buscar.toLowerCase());
    const equipoOk = !filtroEquipo || a.equipo === filtroEquipo;
    const inmoOk = !filtroInmobiliariaId || a.inmobiliaria_id === filtroInmobiliariaId;
    return textOk && equipoOk && inmoOk;
  });

  const conteos = {
    'Gemex': agentes.filter(a => a.equipo === 'Gemex').length,
    'Inmobiliaria': agentes.filter(a => a.equipo === 'Inmobiliaria').length,
    'Asesor externo': agentes.filter(a => a.equipo === 'Asesor externo').length,
    'Desarrollador': agentes.filter(a => a.equipo === 'Desarrollador').length,
  };

  const miAgente = usuarioActual?.agente;

  const equipoColor = (equipo) => {
    if (equipo === 'Gemex') return { bg: '#C0203A', color: '#fff' };
    if (equipo === 'Inmobiliaria') return { bg: '#C0203A', color: '#fff' };
    if (equipo === 'Asesor externo') return { bg: '#7A5900', color: '#fff' };
    if (equipo === 'Desarrollador') return { bg: '#3730A3', color: '#fff' };
    return { bg: '#C0203A', color: '#fff' };
  };

  const BadgeEquipo = ({ equipo }) => (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '500',
      background: equipoColor(equipo).bg, color: equipoColor(equipo).color, whiteSpace: 'nowrap', lineHeight: '1.4',
    }}>
      {equipo || 'Gemex'}
    </span>
  );

  const todosSeleccionados = desarrollos.filter(d => d.activo).length > 0 && desarrollos.filter(d => d.activo).every(d => (form.desarrollos || []).includes(d.nombre));

  const inmobiliariasConteo = filtroEquipo === 'Inmobiliaria'
    ? [...new Map(agentes.filter(a => a.equipo === 'Inmobiliaria' && a.inmobiliaria_id).map(a => [a.inmobiliaria_id, a.inmobiliarias?.nombre])).entries()]
      .map(([id, nombre]) => ({ id, nombre, total: agentes.filter(a => a.inmobiliaria_id === id).length }))
      .sort((a, b) => b.total - a.total)
    : [];

  const grupoActual = (lista) => {
    if (filtroEquipo !== 'Inmobiliaria') return [[null, lista]];
    const grupos = new Map();
    lista.forEach(a => {
      const key = a.inmobiliaria_id || 'sin_inmobiliaria';
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push(a);
    });
    return [...grupos.entries()].sort((a, b) => b[1].length - a[1].length);
  };

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ fontSize: isMobile ? '17px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Agentes</h2>
          <div style={{ fontSize: '13px', color: '#888' }}>
            {filtroEquipo ? `${agentesFiltrados.length} de ${agentes.length} agentes` : `${agentes.length} agentes registrados`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {miRol === 'Super Admin' && (
            <button onClick={() => setShowConfigInactividad(true)}
              style={{ ...btnOutline, fontSize: isMobile ? '12px' : '13px' }}>
              ⏱ {diasInactividad}d inactividad
            </button>
          )}
          {esAdmin && !isMobile && (
            <button onClick={() => { setShowImportModal(true); setFilasImport([]); setNombreArchivoImport(''); setErroresImport([]); setMsgImport(''); setProgresoImport({ procesados: 0, total: 0, exitosos: 0, errores: 0, saltados: 0 }); }}
              style={{ ...btnOutline, fontSize: '13px' }}>
              ⬆ Importar agentes
            </button>
          )}
          {esAdmin && (
            <button onClick={() => { setShowForm(true); setShowDetalle(null); setEditando(null); setForm(formVacio()); setNuevaInmobiliariaNombre(''); setBuscarAgenteCargo(''); }}
              style={{ ...btnPrimary, padding: isMobile ? '10px 14px' : '8px 16px', fontSize: isMobile ? '14px' : '13px' }}>
              + {isMobile ? 'Agregar' : 'Agregar agente'}
            </button>
          )}
        </div>
      </div>

      {showConfigInactividad && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setShowConfigInactividad(false)}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '2rem', maxWidth: '380px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e', marginBottom: '8px' }}>Configurar inactividad</div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '1.5rem' }}>
              Define cuántos días puede pasar un agente sin iniciar sesión antes de marcarse como Inactivo automáticamente.
            </div>
            <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '6px' }}>Días de inactividad</label>
            <input type='number' min={1} max={365} value={nuevoDiasInactividad}
              onChange={e => setNuevoDiasInactividad(parseInt(e.target.value) || 1)}
              style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box', marginBottom: '1.5rem', textAlign: 'center', fontWeight: '600' }} />
            <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '1.5rem', marginTop: '-10px' }}>
              Una tarea automática revisa todos los días y desactiva a los agentes que superen este límite sin conectarse.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowConfigInactividad(false)} style={{ flex: 1, padding: '10px', background: '#f5f5f5', color: '#333', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarConfigInactividad} disabled={guardandoConfig} style={{ flex: 1, padding: '10px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
                {guardandoConfig ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && esAdmin && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={handleCerrarImportModal}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '2rem', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e' }}>Importar agentes masivamente</div>
              <button onClick={handleCerrarImportModal} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888' }}>×</button>
            </div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '1.25rem' }}>
              Sube el Excel limpio (columnas: Nombres, Apellidos, Correo, Telefono, Inmobiliaria). A cada fila se le crea una cuenta real con contraseña provisional <strong>123456</strong>. Los que compartan el mismo nombre de inmobiliaria quedan agrupados bajo el mismo registro.
            </div>

            {filasImport.length === 0 ? (
              <label style={{ display: 'block', padding: '24px', border: '2px dashed #ddd', borderRadius: '10px', textAlign: 'center', cursor: 'pointer', color: '#888', fontSize: '13px' }}>
                📄 Haz click para elegir el archivo Excel
                <input ref={importInputRef} type='file' accept='.xlsx,.xls' onChange={handleArchivoImport} style={{ display: 'none' }} />
              </label>
            ) : (
              <>
                <div style={{ padding: '10px 14px', background: '#f9f9f9', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>
                  📄 <strong>{nombreArchivoImport}</strong> — {filasImport.length} agentes detectados (ya deduplicados por correo)
                </div>

                {(importando || progresoImport.procesados > 0) && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ height: '10px', background: '#f0f0f0', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
                      <div style={{ height: '100%', width: `${progresoImport.total > 0 ? (progresoImport.procesados / progresoImport.total) * 100 : 0}%`, background: '#C0203A', transition: 'width 0.2s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666', flexWrap: 'wrap', gap: '6px' }}>
                      <span>{progresoImport.procesados} / {progresoImport.total}</span>
                      <span style={{ color: '#27500A' }}>✓ {progresoImport.exitosos} creados</span>
                      <span style={{ color: '#7A5900' }}>⏭ {progresoImport.saltados} ya existían</span>
                      <span style={{ color: '#A32D2D' }}>✕ {progresoImport.errores} errores</span>
                    </div>
                  </div>
                )}

                {msgImport && (
                  <div style={{ padding: '10px 14px', background: '#EAF3DE', color: '#27500A', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>{msgImport}</div>
                )}

                {erroresImport.length > 0 && (
                  <button onClick={handleDescargarErrores} style={{ ...btnOutline, width: '100%', marginBottom: '14px', fontSize: '13px' }}>
                    ⬇ Descargar reporte de errores ({erroresImport.length})
                  </button>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  {!importando && progresoImport.procesados < progresoImport.total && (
                    <button onClick={pausado ? handleReanudar : handleIniciarImportacion}
                      style={{ ...btnPrimary, flex: 1, justifyContent: 'center', padding: '12px' }}>
                      {progresoImport.procesados > 0 ? 'Reanudar importación' : 'Iniciar importación'}
                    </button>
                  )}
                  {importando && (
                    <button onClick={handlePausar} style={{ ...btnOutline, flex: 1, padding: '12px' }}>
                      ⏸ Pausar
                    </button>
                  )}
                  {!importando && (
                    <button onClick={() => { setFilasImport([]); setNombreArchivoImport(''); }} style={{ ...btnOutline, padding: '12px' }}>
                      Elegir otro archivo
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '10px' }}>
                  No cierres esta pestaña mientras esté en curso. Puedes pausar y reanudar sin perder el avance — lo que ya se creó no se vuelve a intentar aunque cierres el modal o recargues la página.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* FIX: modal para gestionar (buscar y renombrar) inmobiliarias */}
      {showGestionInmobiliarias && esAdmin && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setShowGestionInmobiliarias(false)}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '2rem', maxWidth: '560px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px', flexShrink: 0 }}>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a2e' }}>Gestionar inmobiliarias</div>
              <button onClick={() => setShowGestionInmobiliarias(false)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888' }}>×</button>
            </div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '1rem', flexShrink: 0 }}>
              {inmobiliarias.length} inmobiliarias en total. Corrige nombres con errores de encoding o duplicados — el cambio se refleja en todos los agentes que pertenecen a ella.
            </div>
            <input placeholder='Buscar por nombre...' value={buscarGestionInmo} onChange={e => setBuscarGestionInmo(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', marginBottom: '1rem', flexShrink: 0 }} />
            <div style={{ flex: 1, overflowY: 'auto', border: '0.5px solid #f0f0f0', borderRadius: '8px' }}>
              {inmobiliarias
                .filter(i => !buscarGestionInmo || i.nombre.toLowerCase().includes(buscarGestionInmo.toLowerCase()))
                .map(inm => {
                  const totalAgentes = agentes.filter(a => a.inmobiliaria_id === inm.id).length;
                  const editando = editandoInmoId === inm.id;
                  return (
                    <div key={inm.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderBottom: '0.5px solid #f5f5f5' }}>
                      {editando ? (
                        <input value={nombreInmoEditado} onChange={e => setNombreInmoEditado(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleGuardarNombreInmobiliaria(inm.id); if (e.key === 'Escape') setEditandoInmoId(null); }}
                          autoFocus
                          style={{ flex: 1, padding: '6px 10px', border: '1px solid #C0203A', borderRadius: '6px', fontSize: '13px' }} />
                      ) : (
                        <span style={{ flex: 1, fontSize: '13px', color: '#1a1a2e' }}>{inm.nombre}</span>
                      )}
                      <span style={{ fontSize: '11px', color: '#aaa', flexShrink: 0 }}>{totalAgentes} agente{totalAgentes !== 1 ? 's' : ''}</span>
                      {editando ? (
                        <>
                          <button onClick={() => handleGuardarNombreInmobiliaria(inm.id)} disabled={guardandoInmoNombre}
                            style={{ padding: '5px 10px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}>
                            ✓
                          </button>
                          <button onClick={() => setEditandoInmoId(null)}
                            style={{ padding: '5px 10px', background: '#f0f0f0', color: '#333', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}>
                            ✕
                          </button>
                        </>
                      ) : (
                        <button onClick={() => { setEditandoInmoId(inm.id); setNombreInmoEditado(inm.nombre); }}
                          style={{ padding: '5px 10px', background: '#fff', color: '#C0203A', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}>
                          ✏️ Editar
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {miAgente && (
        <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: isMobile ? '1rem' : '1.5rem', marginBottom: '1rem' }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '10px', fontWeight: '500' }}>MI PERFIL</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', overflow: 'hidden', background: '#f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {miAgente.foto_url
                ? <img src={miAgente.foto_url} alt={miAgente.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: '18px', fontWeight: '600', color: '#888' }}>{miAgente.nombre?.[0]?.toUpperCase()}</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>{miAgente.nombre} {miAgente.apellidos}</div>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '1px' }}>{miAgente.rol} · {miAgente.equipo}</div>
              {!isMobile && (
                <div style={{ display: 'flex', gap: '16px', marginTop: '4px', fontSize: '12px', color: '#888' }}>
                  {miAgente.correo && <span>✉ {miAgente.correo}</span>}
                  {miAgente.telefono && <span>📞 {miAgente.telefono}</span>}
                </div>
              )}
            </div>
            <button onClick={() => handleVerDetalle(miAgente)}
              style={{ ...btnOutline, fontSize: isMobile ? '12px' : '13px', padding: isMobile ? '6px 12px' : '8px 16px', whiteSpace: 'nowrap' }}>
              Ver perfil
            </button>
          </div>
        </div>
      )}

      {usuarioActual && !miAgente && (
        <div style={{ background: '#FFF8E1', border: '0.5px solid #FFE082', borderRadius: '12px', padding: '1rem 1.5rem', marginBottom: '1rem' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: '#7A5900' }}>Tu sesión no está vinculada a ningún agente</div>
          <div style={{ fontSize: '12px', color: '#A07800', marginTop: '2px' }}>Pide al administrador que registre tu perfil</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button onClick={() => { setFiltroEquipo(''); setFiltroInmobiliariaId(''); }}
          style={{ padding: '6px 16px', borderRadius: '20px', border: '0.5px solid', cursor: 'pointer', fontSize: '13px', fontWeight: !filtroEquipo ? '600' : '400', background: !filtroEquipo ? '#1a1a2e' : '#fff', color: !filtroEquipo ? '#fff' : '#666', borderColor: !filtroEquipo ? '#1a1a2e' : '#ddd' }}>
          Todos ({agentes.length})
        </button>
        <button onClick={() => { setFiltroEquipo('Gemex'); setFiltroInmobiliariaId(''); }}
          style={{ padding: '6px 16px', borderRadius: '20px', border: '0.5px solid', cursor: 'pointer', fontSize: '13px', fontWeight: filtroEquipo === 'Gemex' ? '600' : '400', background: filtroEquipo === 'Gemex' ? '#C0203A' : '#fff', color: filtroEquipo === 'Gemex' ? '#fff' : '#333', borderColor: filtroEquipo === 'Gemex' ? '#C0203A' : '#ddd' }}>
          Gemex ({conteos['Gemex']})
        </button>
        <button onClick={() => { setFiltroEquipo('Inmobiliaria'); setFiltroInmobiliariaId(''); }}
          style={{ padding: '6px 16px', borderRadius: '20px', border: '0.5px solid', cursor: 'pointer', fontSize: '13px', fontWeight: filtroEquipo === 'Inmobiliaria' ? '600' : '400', background: filtroEquipo === 'Inmobiliaria' ? '#C0203A' : '#f0f0f0', color: filtroEquipo === 'Inmobiliaria' ? '#fff' : '#555', borderColor: filtroEquipo === 'Inmobiliaria' ? '#C0203A' : '#ddd' }}>
          Inmobiliaria ({conteos['Inmobiliaria']})
        </button>
        <button onClick={() => { setFiltroEquipo('Asesor externo'); setFiltroInmobiliariaId(''); }}
          style={{ padding: '6px 16px', borderRadius: '20px', border: '0.5px solid', cursor: 'pointer', fontSize: '13px', fontWeight: filtroEquipo === 'Asesor externo' ? '600' : '400', background: filtroEquipo === 'Asesor externo' ? '#7A5900' : '#FFF8E1', color: filtroEquipo === 'Asesor externo' ? '#fff' : '#7A5900', borderColor: filtroEquipo === 'Asesor externo' ? '#7A5900' : '#FFE082' }}>
          Asesor externo ({conteos['Asesor externo']})
        </button>
        <button onClick={() => { setFiltroEquipo('Desarrollador'); setFiltroInmobiliariaId(''); }}
          style={{ padding: '6px 16px', borderRadius: '20px', border: '0.5px solid', cursor: 'pointer', fontSize: '13px', fontWeight: filtroEquipo === 'Desarrollador' ? '600' : '400', background: filtroEquipo === 'Desarrollador' ? '#3730A3' : '#EEF2FF', color: filtroEquipo === 'Desarrollador' ? '#fff' : '#3730A3', borderColor: filtroEquipo === 'Desarrollador' ? '#3730A3' : '#C7D2FE' }}>
          Desarrollador ({conteos['Desarrollador']})
        </button>
      </div>

      {filtroEquipo === 'Inmobiliaria' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: isMobile ? '100%' : '320px' }}>
            <input
              placeholder='Buscar inmobiliaria...'
              value={filtroInmobiliariaId ? (inmobiliarias.find(i => i.id === filtroInmobiliariaId)?.nombre || '') : buscarInmoFiltro}
              onChange={e => { setBuscarInmoFiltro(e.target.value); setFiltroInmobiliariaId(''); setShowDropdownInmoFiltro(true); }}
              onFocus={() => setShowDropdownInmoFiltro(true)}
              style={{ width: '100%', padding: '8px 12px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
            {showDropdownInmoFiltro && (
              <div onMouseLeave={() => setShowDropdownInmoFiltro(false)}
                style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100, background: '#fff', border: '0.5px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: '260px', overflowY: 'auto' }}>
                <button onClick={() => { setFiltroInmobiliariaId(''); setBuscarInmoFiltro(''); setShowDropdownInmoFiltro(false); }}
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: 'none', background: !filtroInmobiliariaId ? '#f5f5f5' : 'transparent', cursor: 'pointer', fontSize: '13px', textAlign: 'left', fontWeight: '600' }}>
                  Todas las inmobiliarias
                </button>
                {inmobiliariasConteo
                  .filter(inm => !buscarInmoFiltro || inm.nombre?.toLowerCase().includes(buscarInmoFiltro.toLowerCase()))
                  .slice(0, 100)
                  .map(inm => (
                    <button key={inm.id} onClick={() => { setFiltroInmobiliariaId(inm.id); setBuscarInmoFiltro(''); setShowDropdownInmoFiltro(false); }}
                      style={{ display: 'block', width: '100%', padding: '10px 12px', border: 'none', background: filtroInmobiliariaId === inm.id ? '#f5f5f5' : 'transparent', cursor: 'pointer', fontSize: '13px', textAlign: 'left' }}>
                      {inm.nombre} <span style={{ color: '#aaa' }}>({inm.total})</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
          <button onClick={() => { setShowGestionInmobiliarias(true); setBuscarGestionInmo(''); }}
            style={{ ...btnOutline, fontSize: '13px' }}>
            ⚙️ Gestionar inmobiliarias
          </button>
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <input placeholder='Buscar agente o inmobiliaria...' value={buscar} onChange={e => setBuscar(e.target.value)}
          style={{ padding: isMobile ? '10px 12px' : '7px 12px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', width: isMobile ? '100%' : '260px', boxSizing: 'border-box' }} />
      </div>

      {isMobile ? (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Cargando...</div>
          ) : agentesFiltrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Sin agentes registrados</div>
          ) : grupoActual(agentesFiltrados).map(([grupoId, lista]) => (
            <div key={grupoId || 'flat'}>
              {filtroEquipo === 'Inmobiliaria' && (
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#888', margin: '14px 0 6px', textTransform: 'uppercase' }}>
                  {lista[0]?.inmobiliarias?.nombre || 'Sin inmobiliaria asignada'} ({lista.length})
                </div>
              )}
              {lista.map(a => (
                <div key={a.id} onClick={() => handleVerDetalle(a)}
                  style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '10px', padding: '14px 16px', marginBottom: '8px', opacity: a.activo ? 1 : 0.5, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', overflow: 'hidden', background: '#f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {a.foto_url
                        ? <img src={a.foto_url} alt={a.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: '16px', fontWeight: '600', color: '#888' }}>{a.nombre?.[0]?.toUpperCase()}</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: '#1a1a2e' }}>{a.nombre} {a.apellidos}</div>
                      <div style={{ fontSize: '12px', color: '#888', marginTop: '1px' }}>{a.rol}</div>
                      <div style={{ fontSize: '11px', color: '#aaa', marginTop: '1px' }}>{a.correo}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <BadgeEquipo equipo={a.equipo} />
                      <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', background: a.activo ? '#EAF3DE' : '#f0f0f0', color: a.activo ? '#27500A' : '#888' }}>
                        {a.activo ? 'Activo' : 'Inactivo'}
                      </span>
                      {a.activo && <BadgeVenceEn agente={a} />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '0.5px solid #e0e0e0' }}>
                {['Agente', 'Correo', 'Teléfono', 'Equipo', 'Puede ver', 'A cargo de', 'Estatus', 'Vence en', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '500', color: '#555', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Cargando...</td></tr>
              ) : agentesFiltrados.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Sin agentes registrados</td></tr>
              ) : grupoActual(agentesFiltrados).map(([grupoId, lista]) => (
                <React.Fragment key={grupoId || 'flat'}>
                  {filtroEquipo === 'Inmobiliaria' && (
                    <tr>
                      <td colSpan={9} style={{ padding: '10px 16px', background: '#f5f5f5', fontWeight: '600', color: '#555', fontSize: '12px', textTransform: 'uppercase' }}>
                        {lista[0]?.inmobiliarias?.nombre || 'Sin inmobiliaria asignada'} · {lista.length} agente{lista.length !== 1 ? 's' : ''}
                      </td>
                    </tr>
                  )}
                  {lista.map(a => (
                    <tr key={a.id} style={{ borderBottom: '0.5px solid #f0f0f0', opacity: a.activo ? 1 : 0.5 }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', background: '#f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {a.foto_url
                              ? <img src={a.foto_url} alt={a.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <span style={{ fontSize: '14px', fontWeight: '600', color: '#888' }}>{a.nombre?.[0]?.toUpperCase()}</span>}
                          </div>
                          <div>
                            <div style={{ fontWeight: '500', color: '#1a1a2e' }}>{a.nombre} {a.apellidos}</div>
                            <div style={{ fontSize: '11px', color: '#aaa' }}>{a.rol}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#555' }}>{a.correo || '—'}</td>
                      <td style={{ padding: '12px 16px', color: '#555' }}>{a.telefono || '—'}</td>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <BadgeEquipo equipo={a.equipo} />
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {a.desarrollos?.length > 0 ? (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {a.desarrollos.map(d => <span key={d} style={{ padding: '2px 8px', background: '#f0f0f0', borderRadius: '20px', fontSize: '11px', color: '#555' }}>{d}</span>)}
                          </div>
                        ) : <span style={{ color: '#ccc', fontSize: '12px' }}>Ninguno</span>}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {a.desarrollos_cargo?.length > 0 ? (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {a.desarrollos_cargo.map(d => <span key={d} style={{ padding: '2px 8px', background: '#EAF3DE', borderRadius: '20px', fontSize: '11px', color: '#27500A' }}>{d}</span>)}
                          </div>
                        ) : <span style={{ color: '#ccc', fontSize: '12px' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', background: a.activo ? '#EAF3DE' : '#f0f0f0', color: a.activo ? '#27500A' : '#888' }}>
                          {a.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <BadgeVenceEn agente={a} />
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <button onClick={() => handleVerDetalle(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#C0203A', textDecoration: 'underline' }}>
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showDetalle && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: isMobile ? '100%' : '440px', height: '100dvh', background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '0.5px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <h3 style={{ fontSize: '16px', fontWeight: '500', margin: 0 }}>Detalle del agente</h3>
            <button onClick={() => setShowDetalle(null)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888' }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '0.5px solid #f0f0f0' }}>
              <div style={{ width: '68px', height: '68px', borderRadius: '50%', overflow: 'hidden', background: '#f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {showDetalle.foto_url
                  ? <img src={showDetalle.foto_url} alt={showDetalle.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: '26px', fontWeight: '600', color: '#888' }}>{showDetalle.nombre?.[0]?.toUpperCase()}</span>}
              </div>
              <div>
                <div style={{ fontSize: '17px', fontWeight: '600', color: '#1a1a2e' }}>{showDetalle.nombre} {showDetalle.apellidos}</div>
                <div style={{ fontSize: '13px', color: '#888', marginTop: '2px' }}>{showDetalle.rol}</div>
                {showDetalle.equipo === 'Gemex' && showDetalle.codigo_agente && (
                  <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>Código: <strong>{showDetalle.codigo_agente}</strong></div>
                )}
                {showDetalle.inmobiliarias?.nombre && (
                  <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>Inmobiliaria: <strong>{showDetalle.inmobiliarias.nombre}</strong></div>
                )}
                <div style={{ marginTop: '6px' }}>
                  <BadgeEquipo equipo={showDetalle.equipo} />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '11px', color: '#888', fontWeight: '500', marginBottom: '10px' }}>DATOS DE CONTACTO</div>
              {[['Correo', showDetalle.correo], ['Teléfono', showDetalle.telefono], ['WhatsApp', showDetalle.whatsapp]].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', padding: '10px 0', borderBottom: '0.5px solid #f5f5f5', fontSize: '13px' }}>
                  <span style={{ width: '110px', color: '#888', flexShrink: 0 }}>{label}</span>
                  <span style={{ color: '#333', wordBreak: 'break-all' }}>{val || '—'}</span>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '11px', color: '#888', fontWeight: '500', marginBottom: '10px' }}>DESARROLLOS QUE PUEDE VER</div>
              {showDetalle.desarrollos?.length > 0 ? (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {showDetalle.desarrollos.map(d => <span key={d} style={{ padding: '4px 12px', background: '#f0f0f0', borderRadius: '20px', fontSize: '12px', color: '#555' }}>{d}</span>)}
                </div>
              ) : <span style={{ fontSize: '13px', color: '#ccc' }}>Ninguno asignado</span>}
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '11px', color: '#888', fontWeight: '500', marginBottom: '10px' }}>DESARROLLOS A SU CARGO</div>
              {showDetalle.desarrollos_cargo?.length > 0 ? (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {showDetalle.desarrollos_cargo.map(d => <span key={d} style={{ padding: '4px 12px', background: '#EAF3DE', borderRadius: '20px', fontSize: '12px', color: '#27500A' }}>{d}</span>)}
                </div>
              ) : <span style={{ fontSize: '13px', color: '#ccc' }}>Ninguno</span>}
            </div>

            {showDetalle.rol === 'Mesa de Control' && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '11px', color: '#888', fontWeight: '500', marginBottom: '10px' }}>AGENTES A SU CARGO</div>
                {showDetalle.agentes_cargo?.length > 0 ? (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {showDetalle.agentes_cargo.map(correo => {
                      const ag = agentes.find(x => x.correo === correo);
                      return <span key={correo} style={{ padding: '4px 12px', background: '#F3F0FF', borderRadius: '20px', fontSize: '12px', color: '#8B5CF6' }}>{ag ? `${ag.nombre} ${ag.apellidos}` : correo}</span>;
                    })}
                  </div>
                ) : <span style={{ fontSize: '13px', color: '#ccc' }}>Ninguno</span>}
              </div>
            )}

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '11px', color: '#888', fontWeight: '500', marginBottom: '10px' }}>ESTATUS</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '13px', background: showDetalle.activo ? '#EAF3DE' : '#f0f0f0', color: showDetalle.activo ? '#27500A' : '#888' }}>
                  {showDetalle.activo ? 'Activo' : 'Inactivo'}
                </span>
                {showDetalle.activo && <BadgeVenceEn agente={showDetalle} />}
                {esAdmin && (
                  <button onClick={() => handleToggleActivo(showDetalle)}
                    style={{ background: 'none', border: '0.5px solid #ddd', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px', color: '#555' }}>
                    {showDetalle.activo ? 'Desactivar' : 'Activar'}
                  </button>
                )}
              </div>
            </div>

            {puedeVerAcceso && (
              <div style={{ marginBottom: '1.5rem', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#888', fontWeight: '500', marginBottom: '6px' }}>ÚLTIMO ACCESO</div>
                <div style={{ fontSize: '13px', color: '#333' }}>{formatFecha(showDetalle.last_sign_in)}</div>
              </div>
            )}

            {esAdmin && (
              <div style={{ marginBottom: '1.5rem', padding: '16px', background: '#f9f9f9', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#888', fontWeight: '500', marginBottom: '12px' }}>CAMBIAR CONTRASEÑA</div>
                <input type="text" value={nuevaPass} onChange={e => setNuevaPass(e.target.value)} placeholder="Nueva contraseña"
                  style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', marginBottom: '8px' }} />
                {msgPass && (
                  <div style={{ padding: '8px', borderRadius: '6px', fontSize: '12px', marginBottom: '8px', background: msgPass.includes('Error') ? '#FCEBEB' : '#EAF3DE', color: msgPass.includes('Error') ? '#A32D2D' : '#27500A' }}>
                    {msgPass}
                  </div>
                )}
                <button onClick={handleCambiarPassword} disabled={cambiandoPass}
                  style={{ ...btnPrimary, width: '100%', justifyContent: 'center', padding: '10px' }}>
                  {cambiandoPass ? 'Actualizando...' : 'Actualizar contraseña'}
                </button>
              </div>
            )}
          </div>

          {esAdmin && (
            <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #f0f0f0', flexShrink: 0, display: 'flex', gap: '8px' }}>
              <button onClick={() => handleEditar(showDetalle)} style={{ ...btnPrimary, flex: 1, justifyContent: 'center', padding: '12px' }}>Editar datos</button>
              {miRol === 'Super Admin' && (
                <button onClick={() => handleEliminar(showDetalle)}
                  style={{ padding: '12px 16px', background: '#FCEBEB', color: '#A32D2D', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  Eliminar
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {showForm && esAdmin && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: isMobile ? '100%' : '420px', height: '100dvh', background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '0.5px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <h3 style={{ fontSize: '16px', fontWeight: '500', margin: 0 }}>{editando ? 'Editar agente' : 'Agregar agente'}</h3>
            <button onClick={() => { setShowForm(false); setEditando(null); }} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888' }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', overflow: 'hidden', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {form.foto_url ? <img src={form.foto_url} alt="foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '24px', color: '#bbb' }}>👤</span>}
              </div>
              <label style={{ ...btnOutline, cursor: 'pointer', fontSize: '13px', padding: '10px 16px' }}>
                {subiendoFoto ? 'Subiendo...' : '📷 Subir foto'}
                <input type='file' accept='image/*' onChange={handleSubirFoto} style={{ display: 'none' }} />
              </label>
            </div>

            {[['Nombre', 'nombre'], ['Apellidos', 'apellidos'], ['Correo', 'correo'], ['Teléfono', 'telefono'], ['WhatsApp', 'whatsapp']].map(([label, key]) => (
              <div key={key} style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>{label}</label>
                {/* FIX: el correo se limpia de espacios al inicio/final en automático
                    (común al copiar/pegar) — evita el error "invalid format" de Auth */}
                <input value={form[key] || ''} onChange={e => setForm({ ...form, [key]: key === 'correo' ? e.target.value.replace(/\s/g, '') : e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
            ))}

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Rol</label>
              <select value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff' }}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {form.rol === 'Mesa de Control' && (
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>
                  Trabaja para el desarrollador — solo ve su(s) desarrollo(s) asignado(s) y a los agentes que le asignes abajo.
                </div>
              )}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '8px' }}>Equipo</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {EQUIPOS.map(eq => (
                  <button key={eq} type="button"
                    onClick={() => setForm({ ...form, equipo: eq, codigo_agente: eq !== 'Gemex' ? '' : form.codigo_agente })}
                    style={{ padding: '8px 14px', borderRadius: '20px', border: '0.5px solid', cursor: 'pointer', fontSize: '13px',
                      background: form.equipo === eq ? '#C0203A' : '#f5f5f5',
                      color: form.equipo === eq ? '#fff' : '#666',
                      borderColor: form.equipo === eq ? '#C0203A' : '#ddd' }}>
                    {eq}
                  </button>
                ))}
              </div>
            </div>

            {form.equipo === 'Gemex' && (
              <div style={{ marginBottom: '16px', padding: '14px', background: '#f9f9f9', borderRadius: '8px' }}>
                <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Código de agente</label>
                <input value={form.codigo_agente || ''} onChange={e => setForm({ ...form, codigo_agente: e.target.value })} placeholder='Ej. GMX-001'
                  style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', background: '#fff' }} />
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Se mostrará en el sidebar debajo de tu nombre</div>
              </div>
            )}

            {form.equipo === 'Inmobiliaria' && (
              <div style={{ marginBottom: '16px', padding: '14px', background: '#f9f9f9', borderRadius: '8px' }}>
                <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Inmobiliaria</label>
                <select value={nuevaInmobiliariaNombre ? '__nueva__' : (form.inmobiliaria_id || '')}
                  onChange={e => {
                    if (e.target.value === '__nueva__') { setNuevaInmobiliariaNombre(' '); setForm({ ...form, inmobiliaria_id: null }); }
                    else { setNuevaInmobiliariaNombre(''); setForm({ ...form, inmobiliaria_id: e.target.value }); }
                  }}
                  style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', background: '#fff', marginBottom: nuevaInmobiliariaNombre ? '8px' : '0' }}>
                  <option value=''>Selecciona una inmobiliaria...</option>
                  {inmobiliarias.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                  <option value='__nueva__'>+ Nueva inmobiliaria...</option>
                </select>
                {nuevaInmobiliariaNombre && (
                  <input value={nuevaInmobiliariaNombre.trim()} onChange={e => setNuevaInmobiliariaNombre(e.target.value)}
                    placeholder='Nombre de la nueva inmobiliaria'
                    style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} autoFocus />
                )}
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Si varios agentes pertenecen a la misma inmobiliaria, selecciónala en vez de crear una nueva cada vez</div>
              </div>
            )}

            <div style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', color: '#888' }}>
                  {form.equipo === 'Desarrollador' ? 'Desarrollo asignado' : 'Desarrollos que puede ver'}
                </label>
                {form.equipo !== 'Desarrollador' && desarrollos.length > 0 && (
                  <button type="button" onClick={handleSeleccionarTodosDesarrollos}
                    style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', border: '0.5px solid #C0203A', background: todosSeleccionados ? '#C0203A' : '#fff', color: todosSeleccionados ? '#fff' : '#C0203A', cursor: 'pointer', fontWeight: '500' }}>
                    {todosSeleccionados ? '✕ Quitar todos' : '✓ Todos'}
                  </button>
                )}
              </div>
              {form.desarrollos_todos && (
                <div style={{ fontSize: '11px', color: '#27500A', background: '#EAF3DE', padding: '6px 10px', borderRadius: '6px', marginBottom: '8px' }}>
                  🔄 Los desarrollos nuevos que crees se le agregan automáticamente — se apaga solo si quitas alguno a mano.
                </div>
              )}
              {desarrollos.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#aaa' }}>Sin desarrollos</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {desarrollos.map(d => {
                    const seleccionado = (form.desarrollos || []).includes(d.nombre);
                    return (
                      <button key={d.id} type="button" onClick={() => handleToggleDesarrollo(d.nombre)}
                        style={{ padding: '6px 14px', borderRadius: '20px', border: '0.5px solid', cursor: 'pointer', fontSize: '13px',
                          background: seleccionado ? '#C0203A' : '#f5f5f5',
                          color: seleccionado ? '#fff' : '#666',
                          borderColor: seleccionado ? '#C0203A' : '#ddd' }}>
                        {d.nombre}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* FIX: el picker de "desarrollos a cargo" ahora también aplica a
                Mesa de Control y Gerente Operador (antes solo se mostraba para
                Gerente Editor) */}
            {(form.rol === 'Gerente Editor' || form.rol === 'Gerente Operador' || form.rol === 'Mesa de Control') && (
              <div style={{ marginBottom: '16px', marginTop: '12px', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
                <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '8px' }}>Desarrollos a su <strong>cargo</strong> (puede editar)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {(form.desarrollos || []).map(d => (
                    <button key={d} type="button" onClick={() => handleToggleCargo(d)}
                      style={{ padding: '6px 14px', borderRadius: '20px', border: '0.5px solid', cursor: 'pointer', fontSize: '13px',
                        background: (form.desarrollos_cargo || []).includes(d) ? '#27500A' : '#f5f5f5',
                        color: (form.desarrollos_cargo || []).includes(d) ? '#fff' : '#666',
                        borderColor: (form.desarrollos_cargo || []).includes(d) ? '#27500A' : '#ddd' }}>
                      {d}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '6px' }}>
                  {(form.desarrollos || []).length === 0 ? 'Primero asigna desarrollos que puede ver' : 'Solo aparecen los desarrollos que puede ver'}
                </div>
              </div>
            )}

            {/* FIX: buscador para armar "agentes a cargo" — solo para
                Mesa de Control. Con miles de agentes, un checklist plano
                no serviría, así que es buscar + agregar con chips. */}
            {form.rol === 'Mesa de Control' && (
              <div style={{ marginBottom: '16px', padding: '12px', background: '#f9f9f9', borderRadius: '8px', position: 'relative' }}>
                <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '8px' }}>Agentes a su cargo</label>
                <input placeholder='Buscar agente por nombre o correo...' value={buscarAgenteCargo}
                  onChange={e => { setBuscarAgenteCargo(e.target.value); setShowDropdownAgenteCargo(true); }}
                  onFocus={() => setShowDropdownAgenteCargo(true)}
                  style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                {showDropdownAgenteCargo && buscarAgenteCargo.length >= 1 && (
                  <div onMouseLeave={() => setShowDropdownAgenteCargo(false)}
                    style={{ position: 'absolute', top: 'calc(100% - 4px)', left: '12px', right: '12px', zIndex: 100, background: '#fff', border: '0.5px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto' }}>
                    {agentes
                      .filter(a => a.correo && a.correo !== form.correo)
                      .filter(a => !(form.agentes_cargo || []).includes(a.correo))
                      .filter(a => `${a.nombre} ${a.apellidos} ${a.correo}`.toLowerCase().includes(buscarAgenteCargo.toLowerCase()))
                      .slice(0, 30)
                      .map(a => (
                        <button key={a.id} type="button" onClick={() => { handleToggleAgenteCargo(a.correo); setBuscarAgenteCargo(''); setShowDropdownAgenteCargo(false); }}
                          style={{ display: 'block', width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', textAlign: 'left' }}>
                          {a.nombre} {a.apellidos} <span style={{ color: '#aaa', fontSize: '11px' }}>({a.correo})</span>
                        </button>
                      ))}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                  {(form.agentes_cargo || []).length === 0 ? (
                    <span style={{ fontSize: '12px', color: '#ccc' }}>Ningún agente asignado</span>
                  ) : (form.agentes_cargo || []).map(correo => {
                    const ag = agentes.find(a => a.correo === correo);
                    return (
                      <span key={correo} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: '#F3F0FF', borderRadius: '20px', fontSize: '12px', color: '#8B5CF6' }}>
                        {ag ? `${ag.nombre} ${ag.apellidos}` : correo}
                        <button type="button" onClick={() => handleToggleAgenteCargo(correo)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8B5CF6', fontSize: '13px', padding: 0, lineHeight: 1 }}>✕</button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {!editando && (
              <div style={{ marginBottom: '12px', marginTop: '8px', padding: '14px', background: '#f9f9f9', borderRadius: '8px' }}>
                <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>
                  Contraseña provisional <span style={{ color: '#e53e3e' }}>*</span>
                </label>
                <input type="text" value={passProvisional} onChange={e => setPassProvisional(e.target.value)} placeholder="Mínimo 6 caracteres"
                  style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>El agente podrá cambiarla después desde Mi cuenta</div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
              <input type='checkbox' id='activo' checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })}
                style={{ width: '18px', height: '18px' }} />
              <label htmlFor='activo' style={{ fontSize: '14px', color: '#333' }}>Activo</label>
            </div>
          </div>

          <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #f0f0f0', flexShrink: 0 }}>
            <button onClick={handleGuardar} disabled={guardando || creandoUsuario}
              style={{ ...btnPrimary, width: '100%', padding: '14px', justifyContent: 'center', fontSize: '15px' }}>
              {creandoUsuario ? 'Creando usuario...' : guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Agregar agente'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary = { background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '500', display: 'flex', alignItems: 'center' };
const btnOutline = { background: '#fff', color: '#333', border: '0.5px solid #ddd', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' };