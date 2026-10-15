// Permisos del menú (sidebar). Las reglas "de fábrica" por rol viven aquí y el
// Super Admin puede sobrescribirlas desde el panel Permisos: la tabla
// `permisos_rol` solo guarda las diferencias (rol, 'menu.<pantalla>', true/false).
// El Super Admin siempre ve todo y no se le puede quitar nada.

// Sidebar en 4 módulos. Los ids de las pantallas (hojas) no cambian, solo
// cómo se agrupan. Un módulo con una sola hoja visible para el rol se
// muestra como botón directo.
export const MENU_MODULOS = [
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
    { id: 'construccion', label: 'Construcción', icon: 'construccion' },
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

// Pantallas que antes vivían dentro de "Dirección": su acceso se sigue
// decidiendo con el permiso 'direccion' + el filtro por rol de abajo.
export const HOJAS_DIRECCION = ['dashboard_dir', 'movimientos', 'historial', 'titulacion', 'cobranza', 'comisiones', 'ajustes_admin', 'construccion', 'objetivos', 'tendencias_producto', 'buyer_persona'];

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
  'Desarrollador': ['contactos', 'desarrollos', 'direccion'],
  // Roles de un solo módulo — solo entran a su propia pantalla.
  'Construcción': ['direccion'],
  'Tesorería': ['direccion'],
  'Titulación': ['direccion'],
};

// Roles que se pueden configurar en el panel (Super Admin siempre tiene todo).
export const ROLES_CONFIGURABLES = ['Admin', 'Sub Admin', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control', 'Agente', 'Asesor Premium', 'Desarrollador', 'Construcción', 'Tesorería', 'Titulación'];

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
    if (id === 'dashboard' && miRol === 'Desarrollador') return false;
    if (id === 'dashboard' && miRol !== 'Super Admin' && !ctx.rankingBsVisible) return false;
    return true;
  }
  if (!menuPermitido.includes('direccion')) return false;
  if (id === 'ajustes_admin') return miRol === 'Super Admin';
  // Mesa de Control entra a Cobranza solo para ver y descargar la liquidación (PDF).
  if (id === 'cobranza' && miRol === 'Mesa de Control') return true;
  // Comisiones: los permisos finos (quién marca qué) se limitan dentro de la pantalla.
  if (id === 'comisiones') return ['Super Admin', 'Admin', 'Tesorería', 'Gerente Editor', 'Gerente Operador', 'Mesa de Control'].includes(miRol);
  if (miRol === 'Desarrollador') return id === 'dashboard_dir';
  // Mesa de Control revisa Movimientos, Historial y Titulación.
  if (miRol === 'Mesa de Control') return id === 'movimientos' || id === 'historial' || id === 'titulacion';
  // Construcción y Tesorería son roles de un solo módulo.
  if (miRol === 'Construcción') return id === 'construccion';
  if (miRol === 'Tesorería') return id === 'cobranza';
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

  { id: 'planes.editar', seccion: 'Planes de pago', label: 'Crear, editar y eliminar planes de pago', defecto: roles('Super Admin', 'Admin') },
];

export const claveAccion = (id) => `accion.${id}`;

export const puedeAccion = (rol, id, overrides = {}) => {
  if (rol === 'Super Admin') return true;
  const ov = overrides?.[claveAccion(id)];
  if (ov !== undefined) return ov;
  const a = ACCIONES.find(x => x.id === id);
  return a ? a.defecto(rol) : false;
};
