import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { HOJAS_CONFIGURABLES, ROLES_CONFIGURABLES, MENU_MODULOS, ACCIONES_PANEL, clavePermiso, claveAccion, reglaPorDefecto } from './permisosMenu';

// Panel de permisos (solo Super Admin). Un interruptor por rol para:
//  1) cada sección del menú (¿la ve?) y
//  2) cada función dentro de las secciones (¿puede modificar eso?).
// Solo se guardan las diferencias contra las reglas de fábrica (tabla
// permisos_rol); si un interruptor vuelve a su valor de fábrica, su ajuste se
// borra. El Super Admin siempre puede todo.
//
// Roles nuevos: se crean aquí "basados en" un rol existente. Heredan su
// comportamiento y alcance de datos (la persona se guarda con ese rol base) y
// su propio nombre (agentes.rol_personalizado); sus interruptores arrancan
// igual que los del rol base y se ajustan por separado.
const CTX_DEFAULT = { equipo: 'Gemex', rankingBsVisible: true };
const ROLES_BASE_PERMITIDOS = ROLES_CONFIGURABLES; // todos menos Super Admin

export default function PanelPermisos({ miAgente }) {
  const [overrides, setOverrides] = useState({}); // `${rol}|${permiso}` -> bool
  const [rolesNuevos, setRolesNuevos] = useState([]); // { nombre, basado_en }
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState('');
  const [creando, setCreando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoBase, setNuevoBase] = useState('Agente');

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    const [{ data }, { data: roles }] = await Promise.all([
      supabase.from('permisos_rol').select('rol, permiso, habilitado'),
      supabase.from('roles_personalizados').select('nombre, basado_en').order('created_at'),
    ]);
    const m = {};
    (data || []).forEach(r => { m[`${r.rol}|${r.permiso}`] = r.habilitado; });
    setOverrides(m);
    setRolesNuevos(roles || []);
    setCargando(false);
  };

  const columnas = [...ROLES_CONFIGURABLES.map(r => ({ nombre: r, base: r, propio: false })), ...rolesNuevos.map(r => ({ nombre: r.nombre, base: r.basado_en, propio: true }))];

  // fila: { permiso, defecto(rolBase) }; col: { nombre, base }
  const efectivo = (col, fila) => {
    const ov = overrides[`${col.nombre}|${fila.permiso}`];
    return ov === undefined ? fila.defecto(col.base) : ov;
  };

  const alternar = async (col, fila) => {
    const llave = `${col.nombre}|${fila.permiso}`;
    const nuevo = !efectivo(col, fila);
    const esDefecto = nuevo === fila.defecto(col.base);
    setGuardando(llave);
    let error;
    if (esDefecto) {
      ({ error } = await supabase.from('permisos_rol').delete().eq('rol', col.nombre).eq('permiso', fila.permiso));
    } else {
      ({ error } = await supabase.from('permisos_rol').upsert(
        { rol: col.nombre, permiso: fila.permiso, habilitado: nuevo, actualizado_por: miAgente?.correo || null, updated_at: new Date().toISOString() },
        { onConflict: 'rol,permiso' }));
    }
    setGuardando('');
    if (error) { alert('No se pudo guardar: ' + error.message); return; }
    setOverrides(prev => {
      const n = { ...prev };
      if (esDefecto) delete n[llave]; else n[llave] = nuevo;
      return n;
    });
  };

  const restablecerRol = async (col) => {
    if (!window.confirm(`¿Regresar ${col.nombre} a los permisos de fábrica${col.propio ? ` (los de ${col.base})` : ''}?`)) return;
    const { error } = await supabase.from('permisos_rol').delete().eq('rol', col.nombre);
    if (error) { alert('No se pudo restablecer: ' + error.message); return; }
    setOverrides(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${col.nombre}|`))));
  };

  const crearRol = async () => {
    const nombre = nuevoNombre.replace(/\s+/g, ' ').trim();
    if (nombre.length < 3) { alert('Ponle un nombre al rol (al menos 3 letras).'); return; }
    const existentes = [...ROLES_CONFIGURABLES, 'Super Admin', ...rolesNuevos.map(r => r.nombre)].map(r => r.toLowerCase());
    if (existentes.includes(nombre.toLowerCase())) { alert('Ya existe un rol con ese nombre.'); return; }
    setCreando(true);
    const { error } = await supabase.from('roles_personalizados').insert({ nombre, basado_en: nuevoBase, creado_por: miAgente?.correo || null });
    setCreando(false);
    if (error) { alert('No se pudo crear el rol: ' + error.message); return; }
    setNuevoNombre('');
    setRolesNuevos(prev => [...prev, { nombre, basado_en: nuevoBase }]);
  };

  const eliminarRol = async (col) => {
    const { count } = await supabase.from('agentes').select('id', { count: 'exact', head: true }).eq('rol_personalizado', col.nombre);
    if (count > 0) { alert(`No se puede eliminar: ${count} persona${count !== 1 ? 's tienen' : ' tiene'} el rol "${col.nombre}". Cámbiales el rol en Agentes primero.`); return; }
    if (!window.confirm(`¿Eliminar el rol "${col.nombre}" y todos sus ajustes?`)) return;
    await supabase.from('permisos_rol').delete().eq('rol', col.nombre);
    const { error } = await supabase.from('roles_personalizados').delete().eq('nombre', col.nombre);
    if (error) { alert('No se pudo eliminar: ' + error.message); return; }
    setRolesNuevos(prev => prev.filter(r => r.nombre !== col.nombre));
    setOverrides(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${col.nombre}|`))));
  };

  const interruptor = (col, fila) => {
    const on = efectivo(col, fila);
    const llave = `${col.nombre}|${fila.permiso}`;
    const cambiado = overrides[llave] !== undefined;
    const alerta = fila.tipo === 'menu' && on && !fila.defecto(col.base);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
        <button onClick={() => alternar(col, fila)} disabled={guardando === llave} aria-label={`${fila.label} para ${col.nombre}`}
          style={{ width: '34px', height: '19px', borderRadius: '10px', border: 'none', background: on ? '#2E7D4F' : '#cfcfcf', position: 'relative', cursor: 'pointer', padding: 0, opacity: guardando === llave ? 0.5 : 1 }}>
          <span style={{ position: 'absolute', top: '2px', left: on ? '17px' : '2px', width: '15px', height: '15px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
        </button>
        <span style={{ fontSize: '9px', height: '10px', color: alerta ? '#B45309' : '#C0203A' }} title={alerta ? 'Este rol no tenía esta sección por defecto: verá los datos tal como la sección los muestra (puede ser toda la empresa).' : 'Distinto al valor de fábrica'}>
          {alerta ? '⚠' : cambiado ? '●' : ''}
        </span>
      </div>
    );
  };

  // Secciones del menú
  const gruposMenu = MENU_MODULOS.map(m => ({
    titulo: m.label,
    filas: HOJAS_CONFIGURABLES.filter(h => h.modulo === m.label).map(h => ({
      tipo: 'menu', label: h.label, permiso: clavePermiso(h.id), defecto: (rol) => reglaPorDefecto(rol, h.id, CTX_DEFAULT),
    })),
  })).filter(g => g.filas.length > 0);

  // Funciones dentro de cada sección
  const seccionesAcciones = [...new Set(ACCIONES_PANEL.map(a => a.seccion))];
  const gruposAcciones = seccionesAcciones.map(sec => ({
    titulo: sec,
    filas: ACCIONES_PANEL.filter(a => a.seccion === sec).map(a => ({ tipo: 'accion', label: a.label, permiso: claveAccion(a.id), defecto: a.defecto })),
  }));

  const celda = { padding: '8px 6px', textAlign: 'center', borderBottom: '0.5px solid #f0f0f0' };
  const colspan = columnas.length + 1;
  const cabeceraBloque = (texto) => (
    <tr><td colSpan={colspan} style={{ padding: '12px', background: '#1a1a2e', color: '#fff', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{texto}</td></tr>
  );
  const bloque = (g) => (
    <React.Fragment key={g.titulo}>
      <tr><td colSpan={colspan} style={{ padding: '8px 12px', background: '#f3f3f3', fontWeight: '700', color: '#555', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{g.titulo}</td></tr>
      {g.filas.map(f => (
        <tr key={f.permiso}>
          <td style={{ ...celda, textAlign: 'left', padding: '8px 12px', position: 'sticky', left: 0, background: '#fff', color: '#1a1a2e', fontWeight: '500', minWidth: '230px' }}>{f.label}</td>
          {columnas.map(col => <td key={col.nombre} style={celda}>{interruptor(col, f)}</td>)}
        </tr>
      ))}
    </React.Fragment>
  );

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ fontSize: '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Permisos</h2>
      <div style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}>
        Enciende o apaga lo que cada rol puede ver y hacer. El Super Admin siempre puede todo.
      </div>
      <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '12px', color: '#555', marginBottom: '8px' }}>
        <span><span style={{ color: '#C0203A' }}>●</span> Distinto al valor de fábrica</span>
        <span><span style={{ color: '#B45309' }}>⚠</span> Sección que ese rol no tenía: verá los datos como esa sección los muestra</span>
        <span>🔄 Los cambios se aplican cuando la persona recarga o vuelve a entrar</span>
      </div>
      <details style={{ marginBottom: '1rem', fontSize: '12px', color: '#666' }}>
        <summary style={{ cursor: 'pointer', color: '#3B82F6', fontWeight: '500' }}>Ver notas importantes</summary>
        <ul style={{ margin: '8px 0 0', paddingLeft: '20px', lineHeight: '1.7' }}>
          <li><strong>Alcance de datos:</strong> las restricciones por desarrollo, equipo o "solo lo mío" siguen aplicando aunque el interruptor esté encendido (por ejemplo, Mesa de Control solo opera Inventario en sus desarrollos).</li>
          <li><strong>Responsables de Expedientes:</strong> marcar "Expediente completo", enviar a Titulación y archivar también valen para las personas elegidas como Responsables en Expedientes, sin importar su rol.</li>
          <li><strong>Super Admin:</strong> esas tres funciones y "cargar de cualquier asesor" no se le dan automáticamente.</li>
          <li><strong>Inventario y Planes de pago:</strong> la base de datos solo deja modificarlos a Super Admin y Admin. Quitárselos a Admin funciona apagando el interruptor; si se los activas a otro rol verá los botones, pero el guardado será rechazado hasta ajustar la base.</li>
        </ul>
      </details>

      <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '12px 16px', marginBottom: '1rem', display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Crear un rol nuevo</div>
          <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} placeholder='Nombre del rol (ej. Coordinador)'
            style={{ padding: '8px 12px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', minWidth: '240px' }} />
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Basado en (hereda su alcance de datos)</div>
          <select value={nuevoBase} onChange={e => setNuevoBase(e.target.value)}
            style={{ padding: '8px 12px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '13px', background: '#fff' }}>
            {ROLES_BASE_PERMITIDOS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button onClick={crearRol} disabled={creando}
          style={{ padding: '9px 16px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
          {creando ? 'Creando...' : '+ Crear rol'}
        </button>
        <div style={{ fontSize: '11px', color: '#aaa', maxWidth: '420px' }}>
          El rol nuevo aparece como una columna que arranca con los valores de fábrica del rol base (no con los ajustes que le hayas hecho a ese rol); ajústalo y luego asígnalo a alguien en Agentes.
        </div>
      </div>

      {cargando ? <div style={{ color: '#888', fontSize: '13px' }}>Cargando...</div> : (
        <div style={{ overflowX: 'auto', background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '12px', minWidth: '100%' }}>
            <thead>
              <tr style={{ background: '#f9f9f9' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', position: 'sticky', left: 0, background: '#f9f9f9', minWidth: '230px' }}>&nbsp;</th>
                {columnas.map(col => (
                  <th key={col.nombre} style={{ padding: '8px 6px', textAlign: 'center', minWidth: '84px', fontWeight: '600', color: '#1a1a2e', background: col.propio ? '#F3F0FF' : undefined }}>
                    <div>{col.nombre}</div>
                    {col.propio && <div style={{ fontSize: '9px', color: '#8B5CF6', fontWeight: '400' }}>basado en {col.base}</div>}
                    <button onClick={() => restablecerRol(col)} style={{ marginTop: '4px', border: 'none', background: 'none', color: '#999', fontSize: '10px', cursor: 'pointer', textDecoration: 'underline' }}>restablecer</button>
                    {col.propio && <div><button onClick={() => eliminarRol(col)} style={{ border: 'none', background: 'none', color: '#C0392B', fontSize: '10px', cursor: 'pointer', textDecoration: 'underline' }}>eliminar rol</button></div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cabeceraBloque('Secciones del menú')}
              {gruposMenu.map(bloque)}
              {cabeceraBloque('Funciones dentro de cada sección')}
              {gruposAcciones.map(bloque)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
