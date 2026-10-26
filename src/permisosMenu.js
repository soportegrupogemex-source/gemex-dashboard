// Permisos del menú (sidebar). Las reglas "de fábrica" por rol viven aquí y el
// Super Admin puede sobrescribirlas desde el panel Permisos: la tabla
// `permisos_rol` solo guarda las diferencias (rol, 'menu.<pantalla>', true/false).
// El Super Admin siempre ve todo y no se le puede quitar nada.

// Sidebar en 4 módulos. Los ids de las pantallas (hojas) no cambian, solo
// cómo se agrupan. Un módulo con una sola hoja visible para el rol se
// muestra como botón directo.
import { EMPRESA } from './empresa';

const TODOS_LOS_MODULOS = [
  { id: 'mod_ventas', label: 'Ventas', icon: 'mod_ventas', submenu: [
    { id: 'dashboard_dir', label: 'Dashboard', icon: 'dashboard_dir' },
    { id: 'dashboard', label: 'Ranking Gemex', icon: 'dashboard' },
    { id: 'contactos', label: 'Contactos', icon: 'contactos' },
    { id: 'negocios', label: 'Negocios', icon: 'negocios' },
    { id: 'desarrollos', label: 'Desarrollos', icon: 'desarrollos' },
    { id: 'expedientes', label: 'Expedientes', icon: 'expedientes' },
    { id: 'objetivos', label: 'Objetivos', icon: 'objetivos' },
    { id: 'movimientos', label: 'Movimientos', icon: 'movimientos' },
    { id: 'historial', label: 'Historial', icon: 'historial' },
    { id: 'buyer_persona', label: 'Buyer Persona', icon: 'buyer_persona' },
    { id: 'tendencias_producto', label: 'Tendencias', icon: 'tendencias_producto' },
    { id: 'marketing', label: 'Marketing', icon: 'marketing' },
  ]},
  { id: 'mod_construccion', label: 'Construcción', icon: 'construccion', submenu: [
    { id: 'construccion', label: 'Avance por unidad', icon: 'construccion' },
    { id: 'obra_torres', label: 'Obra por torre', icon: 'obra_torres' },
  ]},
  { id: 'mod_titulacion', label: 'Titulación', icon: 'titulacion', submenu: [
    { id: 'titulacion', label: 'Titulación', icon: 'titulacion' },
  ]},
  { id: 'mod_administracion', label: 'Administración', icon: 'mod_administracion', submenu: [
    { id: 'cobranza', label: 'Cobranza', icon: 'cobranza' },
    { id: 'comisiones', label: 'Comisiones', icon: 'comisiones' },
    { id: 'agentes', label: 'Agentes', icon: 'agentes' },
    { id: 'ajustes_admin', label: 'Ajustes de administración', icon: 'ajustes_admin' },
  ]},
];

// Cada empresa ve solo sus pantallas (ver empresa.js).
export const MENU_MODULOS = TODOS_LOS_MODULOS
  .map(m => ({ ...m, submenu: m.submenu.filter(h => !EMPRESA.hojas || EMPRESA.hojas.includes(h.id)) }))
  .filter(m => m.submenu.length > 0);

// Pantallas que antes vivían dentro de "Dirección": su acceso se sigue
// decidiendo con el permiso 'direccion' + el filtro por rol de abajo.
export const HOJAS_DIRECCION = ['dashboard_dir', 'movimientos', 'historial', 'titulacion', 'cobranza', 'comisiones', 'ajustes_admin', 'construccion', 'obra_torres', 'objetivos', 'tendencias_producto', 'buyer_persona'];

export const MENU_POR_ROL = {
  'Super Admin': ['dashboard', 'contactos', 'negocios', 'desarrollos', 'agentes', 'expedientes', 'direccion'],
  'Admin':       ['dashboard', 'contactos', 'negocios', 'desarrollos', 'agentes', 'expedientes', 'direccion'],
  'Sub Admin':   ['dashboard', 'contactos', 'negocios', 'desarrollos', 'agentes', 'expedientes', 'direccion'],
  'Gerente Editor':   ['dashboard', 'contactos', 'negocios', 'desarrollos', 'expedientes', 'direccion'],
  // Gerente Operador también entra a Agentes — es quien da de alta a su
  // equipo, con acceso completo igual que Admin ahí.
  'Gerente Operador': ['dashboard', 'contactos', 'negocios', 'desarrollos', 'agentes', 'expedientes', 'direccion'],
  // Mesa de Control — revisa expedientes de TODA la empresa (sin
  // restricción de desarrollo/equipo, a diferencia de los demás Gerentes).
  'Mesa de Control':  ['desarrollos', 'expedientes', 'direccion'],
  'Agente':      ['dashboard', 'contactos', 'negocios', 'desarrollos', 'expedientes'],
  // Asesor Premium: igual que Agente, pero en Expedientes carga los
  // documentos de cualquier asesor.
  'Asesor Premium': ['dashboard', 'contactos', 'negocios', 'desarrollos', 'expedientes'],
  // Roles de un solo módulo — solo entran a su propia pantalla.
  'Construcción': ['direccion'],
  'Tesorería': ['direccion'],
  'Titulación': ['direccion'],
};

// Roles que se pueden configurar en el panel (Super Admin siempre tiene todo).
export const ROLES_CONFIGURABLES = ['Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control', 'Agente', 'Asesor Premium', 'Construcción', 'Tesorería', 'Titulación']
  .filter(r => !EMPRESA.rolesOcultos.includes(r));

// Pantallas que se pueden encender/apagar por rol ("Ajustes de administración"
// es solo del Super Admin y no se configura).
export const HOJAS_CONFIGURABLES = MENU_MODULOS.flatMap(m => m.submenu.filter(h => h.id !== 'ajustes_admin').map(h => ({ ...h, modulo: m.label })));

export const clavePermiso = (hojaId) => `menu.${hojaId}`;

// Regla de fábrica: ¿este rol ve esta pantalla sin ningún ajuste del Super Admin?
// ctx: { equipo, rankingBsVisible } — datos dinámicos del usuario.
export const reglaPorDefecto = (miRol, id, ctx = {}) => {
  const menuPermitido = MENU_POR_ROL[miRol] || [];
  // Marketing: leads de Meta — asesores, gerentes y administradores.
  if (id === 'marketing') return ['Agente', 'Asesor Premium', 'Gerente Editor', 'Gerente Operador', 'Admin', 'Sub Admin', 'Super Admin'].includes(miRol);
  if (!HOJAS_DIRECCION.includes(id)) {
    if (!menuPermitido.includes(id)) return false;
    if (id === 'dashboard' && (miRol === 'Agente' || miRol === 'Asesor Premium') && ctx.equipo !== 'Gemex') return false;
    if (id === 'dashboard' && miRol !== 'Super Admin' && !ctx.rankingBsVisible) return false;
    return true;
  }
  if (!menuPermitido.includes('direccion')) return false;
  if (id === 'ajustes_admin') return miRol === 'Super Admin';
  // Mesa de Control entra a Cobranza solo para ver y descargar la liquidación (PDF).
  if (id === 'cobranza' && miRol === 'Mesa de Control') return true;
  // Comisiones: los permisos finos (quién marca qué) se limitan dentro de la pantalla.
  if (id === 'comisiones') return ['Super Admin', 'Admin', 'Tesorería', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control'].includes(miRol);
  // Mesa de Control revisa Movimientos, Historial y Titulación.
  if (miRol === 'Mesa de Control') return id === 'movimientos' || id === 'historial' || id === 'titulacion';
  // Construcción y Tesorería son roles de un solo módulo.
  if (miRol === 'Construcción') return id === 'construccion' || id === 'obra_torres';
  if (miRol === 'Tesorería') return id === 'cobranza' || id === 'obra_torres';
  if (miRol === 'Titulación') return id === 'titulacion';
  // Gerente Operador — Dashboard (de sus desarrollos), Movimientos, Historial,
  // Titulación (solo ver) y Tendencias.
  if (miRol === 'Gerente Operador') return ['dashboard_dir', 'movimientos', 'historial', 'titulacion', 'tendencias_producto'].includes(id);
  if (id === 'historial') return miRol === 'Super Admin' || miRol === 'Gerente Editor';
  if (id === 'tendencias_producto') return miRol === 'Super Admin' || miRol === 'Gerente Editor';
  if (id === 'buyer_persona') return miRol === 'Super Admin' || miRol === 'Admin' || miRol === 'Gerente Editor';
  return true;
};

// Visibilidad real: regla de fábrica + ajustes del Super Admin (ctx.overrides =
// { 'menu.<id>': true|false }). Un "sí" forzado igual respeta el interruptor
// general del Ranking; el Super Admin nunca pierde acceso.
export const hojaVisible = (miRol, id, ctx = {}) => {
  if (miRol !== 'Super Admin' && id !== 'ajustes_admin') {
    const ov = ctx.overrides?.[clavePermiso(id)];
    if (ov === false) return false;
    if (ov === true) return !(id === 'dashboard' && !ctx.rankingBsVisible);
  }
  return reglaPorDefecto(miRol, id, ctx);
};

// ---------------------------------------------------------------------------
// Funciones dentro de cada sección (no solo ver la pantalla, sino QUÉ se puede
// modificar). Cada una tiene un valor de fábrica por rol (= lo que ya
// permitía el sistema) y el Super Admin lo puede cambiar desde el panel:
// se guarda en permisos_rol como 'accion.<id>'. El Super Admin siempre puede.
// Las restricciones de alcance (por desarrollo o por equipo) siguen aplicando
// en cada pantalla ADEMÁS del interruptor.
const roles = (...lista) => (rol) => lista.includes(rol);

export const ACCIONES = [
  { id: 'inventario.crear_unidades', seccion: 'Inventario', label: 'Cargar unidades nuevas', defecto: roles('Super Admin', 'Admin', 'Mesa de Control') },
  { id: 'inventario.carga_masiva', seccion: 'Inventario', label: 'Carga masiva de unidades', defecto: roles('Super Admin', 'Admin') },
  { id: 'inventario.editar_unidades', seccion: 'Inventario', label: 'Editar datos de una unidad', defecto: roles('Super Admin', 'Admin', 'Mesa de Control') },
  { id: 'inventario.eliminar_unidades', seccion: 'Inventario', label: 'Eliminar unidades', defecto: roles('Super Admin', 'Admin', 'Mesa de Control') },
  { id: 'inventario.cambiar_disponibilidad', seccion: 'Inventario', label: 'Cambiar disponibilidad (estatus)', defecto: roles('Super Admin', 'Admin', 'Mesa de Control') },
  { id: 'inventario.cambiar_precio', seccion: 'Inventario', label: 'Cambiar precios', defecto: roles('Super Admin') },
  { id: 'inventario.ver_precio_vendidas', seccion: 'Inventario', label: 'Ver precio de unidades vendidas o apartadas', defecto: roles('Super Admin') },
  { id: 'inventario.exportar', seccion: 'Inventario', label: 'Exportar inventario', defecto: roles('Super Admin') },

  { id: 'desarrollos.crear', seccion: 'Desarrollos', label: 'Crear desarrollos', defecto: roles('Super Admin', 'Admin', 'Sub Admin') },
  { id: 'desarrollos.editar', seccion: 'Desarrollos', label: 'Editar desarrollos', defecto: roles('Super Admin', 'Admin', 'Sub Admin') },
  { id: 'desarrollos.eliminar', seccion: 'Desarrollos', label: 'Eliminar desarrollos', defecto: roles('Super Admin', 'Admin') },
  { id: 'desarrollos.cambiar_precio_desde', seccion: 'Desarrollos', label: 'Cambiar "Precio desde"', defecto: roles('Super Admin') },
  { id: 'desarrollos.editar_web', seccion: 'Desarrollos', label: 'Editar publicación en la página web', defecto: roles('Super Admin') },
  { id: 'desarrollos.ver_planes', seccion: 'Desarrollos', label: 'Ver planes de pago del desarrollo', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Mesa de Control') },

  // Expedientes. La pestaña "Cargar" solo deja subir en expedientes propios (el
  // del asesor que es vendedor); "de cualquier asesor" es un permiso aparte.
  { id: 'expedientes.cargar_documentos', seccion: 'Expedientes', label: 'Cargar documentos y datos de sus propios expedientes', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control', 'Agente', 'Asesor Premium') },
  { id: 'expedientes.cargar_de_cualquier_asesor', seccion: 'Expedientes', label: 'Cargar documentos de expedientes de CUALQUIER asesor', defecto: roles('Asesor Premium'), sinSuperAdmin: true },
  { id: 'expedientes.revisar_documentos', seccion: 'Expedientes', label: 'Aprobar o rechazar documentos', defecto: roles('Super Admin', 'Admin', 'Mesa de Control') },
  { id: 'expedientes.marcar_completo', seccion: 'Expedientes', label: 'Marcar "Expediente completo"', defecto: roles('Mesa de Control'), sinSuperAdmin: true },
  { id: 'expedientes.enviar_titulacion', seccion: 'Expedientes', label: 'Marcar "Enviar a Titulación"', defecto: roles('Mesa de Control'), sinSuperAdmin: true },
  { id: 'expedientes.archivar', seccion: 'Expedientes', label: 'Archivar expedientes', defecto: roles('Mesa de Control'), sinSuperAdmin: true },
  { id: 'expedientes.configurar_responsables', seccion: 'Expedientes', label: 'Elegir a los responsables de expedientes', defecto: roles('Super Admin', 'Admin') },
  { id: 'expedientes.ver_descargar', seccion: 'Expedientes', label: 'Ver las pestañas Descargar y Contratos', defecto: roles('Super Admin', 'Admin', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control', 'Titulación') },
  { id: 'expedientes.descargar_zip', seccion: 'Expedientes', label: 'Descargar el expediente completo (ZIP)', defecto: roles('Super Admin', 'Admin', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control', 'Titulación') },
  { id: 'expedientes.cargar_contrato', seccion: 'Expedientes', label: 'Cargar el contrato firmado (pestaña Contratos)', defecto: roles('Super Admin', 'Admin', 'Gerente Editor', 'Gerente Operador') },

  // Comisiones (los gerentes además solo ven y solicitan sobre sus desarrollos).
  { id: 'comisiones.marcar_enganche', seccion: 'Comisiones', label: 'Marcar "Enganche pagado"', defecto: roles('Super Admin', 'Admin', 'Tesorería') },
  { id: 'comisiones.solicitar', seccion: 'Comisiones', label: 'Marcar "Comisión solicitada"', defecto: roles('Super Admin', 'Admin', 'Tesorería', 'Gerente Editor', 'Gerente Operador') },
  { id: 'comisiones.marcar_pagada', seccion: 'Comisiones', label: 'Marcar "Comisión pagada"', defecto: roles('Super Admin', 'Tesorería') },

  // Cobranza (Mesa de Control solo puede descargar la liquidación).
  { id: 'cobranza.agregar_pagos', seccion: 'Cobranza', label: 'Registrar pagos (enganche y abonos)', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Tesorería') },
  { id: 'cobranza.eliminar_pagos', seccion: 'Cobranza', label: 'Eliminar pagos', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Tesorería') },
  { id: 'cobranza.editar_montos', seccion: 'Cobranza', label: 'Editar liberación y cuotas condominales', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Tesorería') },
  { id: 'cobranza.capturar_recibido', seccion: 'Cobranza', label: 'Capturar lo recibido en bancos de las financieras (cuadre)', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Tesorería') },
  { id: 'cobranza.marcar_liquidacion', seccion: 'Cobranza', label: 'Marcar "Unidad cotejada"', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Tesorería') },
  { id: 'cobranza.descargar_liquidacion', seccion: 'Cobranza', label: 'Descargar la liquidación en PDF', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Tesorería', 'Mesa de Control') },

  // Titulación (Gerente Operador, de fábrica, solo ve).
  { id: 'titulacion.editar_seguimiento', seccion: 'Titulación', label: 'Editar fechas y casillas del seguimiento', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Mesa de Control', 'Titulación') },
  { id: 'titulacion.cargar_archivos', seccion: 'Titulación', label: 'Cargar archivos (avalúo, autorizaciones, carta de liberación, trámites)', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Mesa de Control', 'Titulación') },
  { id: 'titulacion.capturar_montos', seccion: 'Titulación', label: 'Capturar montos de Autorización financiera 1 y 2', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Mesa de Control', 'Titulación') },
  { id: 'titulacion.ver_liquidacion', seccion: 'Titulación', label: 'Ver y descargar la liquidación final / estado de cuenta de la unidad', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control', 'Titulación') },

  // Movimientos: qué tipos de movimiento puede registrar cada rol.
  { id: 'movimientos.registrar_apartado', seccion: 'Movimientos', label: 'Registrar Apartados', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control') },
  { id: 'movimientos.registrar_venta', seccion: 'Movimientos', label: 'Registrar Ventas', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control') },
  { id: 'movimientos.registrar_cancelacion', seccion: 'Movimientos', label: 'Registrar Cancelaciones', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control') },
  { id: 'movimientos.registrar_cambio_unidad', seccion: 'Movimientos', label: 'Registrar Cambios de unidad', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control') },
  { id: 'movimientos.registrar_post_venta', seccion: 'Movimientos', label: 'Registrar movimientos de Titulación y Cobranza', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control') },
  { id: 'movimientos.fuera_de_ventana', seccion: 'Movimientos', label: 'Cargar y editar movimientos fuera de la ventana de martes a lunes', defecto: (rol) => !['Gerente Editor', 'Gerente Operador', 'Mesa de Control'].includes(rol) },

  // Historial (los Gerentes y Mesa de Control, además, solo dentro de la ventana de martes a lunes).
  { id: 'historial.editar_movimientos', seccion: 'Historial', label: 'Editar movimientos', defecto: roles('Super Admin', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control') },
  { id: 'historial.cambiar_tipo', seccion: 'Historial', label: 'Cambiar el tipo de un movimiento (Apartado, Vendida, Cancelación…)', defecto: roles('Super Admin', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control') },
  { id: 'historial.marcar_comisionable', seccion: 'Historial', label: 'Marcar un movimiento como "Comisionable"', defecto: roles('Super Admin', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control') },
  { id: 'historial.eliminar_movimientos', seccion: 'Historial', label: 'Eliminar movimientos', defecto: roles('Super Admin', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control') },
  { id: 'historial.corregir_unidad', seccion: 'Historial', label: 'Corregir la unidad de un movimiento', defecto: roles('Super Admin') },
  { id: 'historial.configurar_ventana', seccion: 'Historial', label: 'Configurar la hora de cierre de la ventana', defecto: roles('Super Admin') },
  { id: 'historial.exportar', seccion: 'Historial', label: 'Exportar el historial', defecto: roles('Super Admin', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control') },

  // Contactos (cada asesor solo ve y trabaja sus propios contactos; eso no cambia).
  { id: 'contactos.crear', seccion: 'Contactos', label: 'Crear contactos', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Agente', 'Asesor Premium') },
  { id: 'contactos.elegir_asesor', seccion: 'Contactos', label: 'Elegir el asesor de ventas al crear un contacto', defecto: roles('Super Admin', 'Admin') },
  { id: 'contactos.editar_datos_personales', seccion: 'Contactos', label: 'Editar datos personales de un contacto', defecto: roles('Super Admin', 'Admin') },
  { id: 'contactos.eliminar', seccion: 'Contactos', label: 'Eliminar contactos', defecto: roles('Super Admin') },
  { id: 'contactos.exportar', seccion: 'Contactos', label: 'Exportar contactos', defecto: roles('Super Admin') },
  { id: 'contactos.importar_historico', seccion: 'Contactos', label: 'Importar histórico de contactos', defecto: roles('Super Admin') },
  { id: 'contactos.configurar_vigencia', seccion: 'Contactos', label: 'Configurar vigencia y alertas', defecto: roles('Super Admin') },

  // Negocios
  { id: 'negocios.crear', seccion: 'Negocios', label: 'Crear negocios', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Agente', 'Asesor Premium') },
  { id: 'negocios.editar', seccion: 'Negocios', label: 'Editar negocios', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Agente', 'Asesor Premium') },
  { id: 'negocios.cambiar_etapa', seccion: 'Negocios', label: 'Mover negocios de etapa', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Agente', 'Asesor Premium') },
  { id: 'negocios.eliminar', seccion: 'Negocios', label: 'Eliminar negocios', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Agente', 'Asesor Premium') },
  { id: 'negocios.reasignar_asesor', seccion: 'Negocios', label: 'Reasignar el asesor de un negocio', defecto: roles('Super Admin') },

  // Detalle de un contacto (cada asesor solo ve y trabaja los suyos).
  { id: 'contactos.editar_seguimiento', seccion: 'Contactos', label: 'Editar datos de seguimiento del contacto (estatus, presupuesto, etc.)', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Agente', 'Asesor Premium') },
  { id: 'contactos.agregar_notas', seccion: 'Contactos', label: 'Agregar notas a un contacto', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Agente', 'Asesor Premium') },
  { id: 'contactos.gestionar_tareas', seccion: 'Contactos', label: 'Crear y completar tareas de un contacto', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Agente', 'Asesor Premium') },
  { id: 'negocios.gestionar_tareas', seccion: 'Negocios', label: 'Crear, completar y eliminar tareas de un negocio', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Agente', 'Asesor Premium') },

  // Dashboard y Ranking
  { id: 'dashboard.descargar_reporte', seccion: 'Dashboard y Ranking', label: 'Descargar el reporte del Dashboard (PDF)', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador') },
  { id: 'ranking.alternar_visibilidad', seccion: 'Dashboard y Ranking', label: 'Mostrar u ocultar el Ranking para todos (interruptor del menú)', defecto: roles('Super Admin') },

  // Objetivos, Tendencias, Construcción
  { id: 'objetivos.editar_metas', seccion: 'Objetivos', label: 'Capturar y editar las metas (unidades y monto)', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor') },
  { id: 'tendencias.eliminar_registros', seccion: 'Tendencias', label: 'Eliminar registros de cotización de una unidad', defecto: roles('Super Admin') },
  { id: 'construccion.editar_avance', seccion: 'Construcción', label: 'Capturar el avance de obra (%)', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Construcción') },
  { id: 'construccion.marcar_dtu', seccion: 'Construcción', label: 'Marcar DTU', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Construcción') },
  { id: 'construccion.marcar_lista_avaluo', seccion: 'Construcción', label: 'Marcar "Lista para avalúo"', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Construcción') },
  { id: 'construccion.capturar_avance_obra', seccion: 'Construcción', label: 'Obra por torre: capturar el avance (%) de las partidas', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Construcción') },
  { id: 'construccion.editar_obra', seccion: 'Construcción', label: 'Obra por torre: editar catálogo, programa y fecha de arranque', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Construcción') },
  { id: 'construccion.editar_costos_obra', seccion: 'Construcción', label: 'Obra por torre: capturar precios, contratistas y contratos', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Construcción') },
  { id: 'construccion.registrar_pagos_obra', seccion: 'Construcción', label: 'Obra por torre: registrar pagos a contratistas', defecto: roles('Super Admin', 'Admin', 'Tesorería') },
  { id: 'construccion.fijar_tope_obra', seccion: 'Construcción', label: 'Obra por torre: fijar el tope de presupuesto', defecto: roles('Super Admin', 'Admin') },

  // Marketing (cada asesor solo trabaja sus propios leads; los Gerentes, los de sus desarrollos).
  { id: 'marketing.marcar_atendido', seccion: 'Marketing', label: 'Marcar un lead como atendido', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Agente', 'Asesor Premium') },
  { id: 'marketing.reasignar_leads', seccion: 'Marketing', label: 'Reasignar leads a otro asesor', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador') },
  { id: 'marketing.editar_guardias', seccion: 'Marketing', label: 'Editar el calendario de guardias', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador') },
  { id: 'marketing.gestionar_api', seccion: 'Marketing', label: 'Ver y administrar las llaves de API', defecto: roles('Super Admin', 'Admin', 'Sub Admin') },
  { id: 'marketing.ajustes', seccion: 'Marketing', label: 'Cambiar tiempo de reasignación automática, interruptor y horarios de los turnos', defecto: roles('Super Admin', 'Admin', 'Sub Admin') },
  { id: 'marketing.ver_resultados', seccion: 'Marketing', label: 'Ver el reporte de resultados (por campaña, formulario y asesor)', defecto: roles('Super Admin', 'Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador') },

  // Agentes (Gerente Operador da de alta a su equipo).
  { id: 'agentes.crear', seccion: 'Agentes', label: 'Agregar agentes', defecto: roles('Super Admin', 'Admin', 'Gerente Operador') },
  { id: 'agentes.editar', seccion: 'Agentes', label: 'Editar datos de un agente', defecto: roles('Super Admin', 'Admin', 'Gerente Operador') },
  { id: 'agentes.activar_desactivar', seccion: 'Agentes', label: 'Activar y desactivar agentes', defecto: roles('Super Admin', 'Admin', 'Gerente Operador') },
  { id: 'agentes.cambiar_contrasena', seccion: 'Agentes', label: 'Cambiar la contraseña de un agente', defecto: roles('Super Admin', 'Admin', 'Gerente Operador') },
  { id: 'agentes.importar', seccion: 'Agentes', label: 'Importar agentes desde Excel', defecto: roles('Super Admin', 'Admin', 'Gerente Operador') },
  { id: 'agentes.eliminar', seccion: 'Agentes', label: 'Eliminar agentes', defecto: roles('Super Admin') },
  { id: 'agentes.configurar_inactividad', seccion: 'Agentes', label: 'Configurar los días de inactividad', defecto: roles('Super Admin') },

  { id: 'planes.editar', seccion: 'Planes de pago', label: 'Crear, editar y eliminar planes de pago', defecto: roles('Super Admin', 'Admin') },
];

// Funciones que muestra el panel Permisos (las demás siguen existiendo para
// que puedeAccion() las evalúe, pero esta empresa no las usa).
export const ACCIONES_PANEL = ACCIONES.filter(a => !EMPRESA.seccionesAcciones || (EMPRESA.seccionesAcciones.includes(a.seccion) && !a.id.startsWith('ranking.')));

export const claveAccion = (id) => `accion.${id}`;

// El Super Admin siempre puede, salvo las acciones marcadas sinSuperAdmin
// (hoy dependen de ser responsable o de ser el asesor del expediente): para
// no cambiarle lo que ya hace, se rigen solo por su valor de fábrica.
export const puedeAccion = (rol, id, overrides = {}) => {
  const a = ACCIONES.find(x => x.id === id);
  if (rol === 'Super Admin' && !a?.sinSuperAdmin) return true;
  const ov = overrides?.[claveAccion(id)];
  if (ov !== undefined) return ov;
  return a ? a.defecto(rol) : false;
};
