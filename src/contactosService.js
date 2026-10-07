import { supabase } from './supabase';

const ROLES_VER_TODOS = ['Super Admin', 'Admin', 'Sub Admin'];

export async function obtenerMiAgente() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, agente: null, rol: null };

  const { data, error } = await supabase
    .from('agentes')
    .select('*')
    .eq('correo', user.email)
    .single();

  if (error) throw error;

  return {
    user,
    agente: data || null,
    rol: data?.rol || 'Agente',
  };
}

export async function obtenerDesarrollos(miRol, miAgente, rolesVerTodos) {
  let query = supabase.from('desarrollos').select('*').eq('activo', true).order('nombre');

  // Solo Super Admin, Admin y Sub Admin ven todos los desarrollos
  if (!ROLES_VER_TODOS.includes(miRol)) {
    if (miAgente?.desarrollos?.length > 0) {
      query = query.in('nombre', miAgente.desarrollos);
    } else {
      // Sin desarrollos asignados, no ve ninguno
      return [];
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function obtenerContactos({
  miRol,
  miAgente,
  buscar,
  filtroMedio,
  filtroEstatus,
  filtroDesarrollo,
  pagina,
  porPagina,
}) {
  let query = supabase.from('contactos').select('*', { count: 'exact' });

  // Super Admin, Admin y Sub Admin ven todos
  if (ROLES_VER_TODOS.includes(miRol)) {
    // sin filtro de rol
  }
  // Agente solo ve sus propios contactos
  else if (miRol === 'Agente' || miRol === 'Asesor Premium') {
    if (miAgente?.correo) {
      query = query.eq('creado_por', miAgente.correo);
    } else {
      return { contactos: [], total: 0 };
    }
  }
  // Gerente Editor y Operador solo ven contactos de sus desarrollos asignados
  else if (miRol === 'Gerente Editor' || miRol === 'Gerente Operador') {
    if (miAgente?.desarrollos?.length > 0) {
      query = query.in('desarrollo', miAgente.desarrollos);
    } else {
      // Sin desarrollos asignados, no ve ningún contacto
      return { contactos: [], total: 0 };
    }
  }
  // Cualquier otro rol sin permisos claros
  else {
    return { contactos: [], total: 0 };
  }

  if (buscar) {
    query = query.or(`nombres.ilike.%${buscar}%,apellidos.ilike.%${buscar}%,correo.ilike.%${buscar}%`);
  }

  if (filtroMedio) query = query.eq('fuente_medio', filtroMedio);
  if (filtroEstatus) query = query.eq('estatus', filtroEstatus);
  if (filtroDesarrollo) query = query.eq('desarrollo', filtroDesarrollo);

  query = query
    .order('created_at', { ascending: false })
    .range(pagina * porPagina, (pagina + 1) * porPagina - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    contactos: data || [],
    total: count || 0,
  };
}

export async function crearContacto({ form, lada, miAgente }) {
  const ladaReal = lada === '+1CA' ? '+1' : lada;
  const telefonoCompleto = `${ladaReal} ${form.telefono}`;

  const { error } = await supabase.from('contactos').insert([{
    ...form,
    telefono: telefonoCompleto,
    creado_por: miAgente?.correo || '',
  }]);

  if (error) throw error;
  return true;
}

export async function eliminarContacto(id) {
  const { error } = await supabase.from('contactos').delete().eq('id', id);
  if (error) throw error;
  return true;
}