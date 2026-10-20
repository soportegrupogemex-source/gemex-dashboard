// Empresa a la que sirve esta instalación del CRM. Se decide al compilar con
// REACT_APP_EMPRESA ('gemex' por omisión o 'gmf'): mismo código, cada empresa
// en su propio proyecto de Vercel y su propia base de datos de Supabase.
// Colores y tipografía de GMF se aplican al compilar (scripts/aplicar-tema.js).
const EMPRESAS = {
  gemex: {
    id: 'gemex',
    nombre: 'Grupo Gemex',
    nombreCorto: 'Gemex',
    titulo: 'Grupo Gemex CRM',
    logo: 'logo-gemex.jpg',
    logoCompacto: 'logo-gemex.jpg',
    logoSobreOscuro: false,
    colorMenu: '#6B1524',
    // null = todas las pantallas
    hojas: null,
    rolesOcultos: [],
    seccionesAcciones: null,
  },
  gmf: {
    id: 'gmf',
    nombre: 'Grupo GMF',
    nombreCorto: 'GMF',
    titulo: 'Grupo GMF CRM',
    logo: 'logo-gmf.png',
    logoCompacto: 'logo-gmf-iso.png',
    // El logo de GMF es blanco con transparencia: solo se ve sobre fondo oscuro.
    logoSobreOscuro: true,
    colorMenu: '#113747',
    hojas: ['dashboard_dir', 'contactos', 'desarrollos', 'negocios', 'expedientes', 'movimientos', 'historial', 'comisiones', 'agentes'],
    // Roles de módulos que GMF no usa.
    rolesOcultos: ['Construcción', 'Titulación'],
    // Secciones del panel Permisos que sí aplican a GMF.
    seccionesAcciones: ['Inventario', 'Desarrollos', 'Planes', 'Expedientes', 'Comisiones', 'Movimientos', 'Historial', 'Contactos', 'Negocios', 'Dashboard', 'Agentes'],
  },
};

export const EMPRESA = EMPRESAS[process.env.REACT_APP_EMPRESA] || EMPRESAS.gemex;
export const esGemex = EMPRESA.id === 'gemex';
