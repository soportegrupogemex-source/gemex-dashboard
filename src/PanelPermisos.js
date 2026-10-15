import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { HOJAS_CONFIGURABLES, ROLES_CONFIGURABLES, MENU_MODULOS, ACCIONES, clavePermiso, claveAccion, reglaPorDefecto } from './permisosMenu';

// Panel de permisos (solo Super Admin). Un interruptor por rol para:
//  1) cada sección del menú (¿la ve?) y
//  2) cada función dentro de las secciones (¿puede modificar eso?).
// Solo se guardan las diferencias contra las reglas de fábrica (tabla
// permisos_rol); si un interruptor vuelve a su valor de fábrica, su ajuste se
// borra. El Super Admin siempre puede todo.
const CTX_DEFAULT = { equipo: 'Gemex', rankingBsVisible: true };

export default function PanelPermisos({ miAgente }) {
  const [overrides, setOverrides] = useState({}); // `${rol}|${permiso}` -> bool
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState('');

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    const { data } = await supabase.from('permisos_rol').select('rol, permiso, habilitado');
    const m = {};
    (data || []).forEach(r => { m[`${r.rol}|${r.permiso}`] = r.habilitado; });
    setOverrides(m);
    setCargando(false);
  };

  // fila: { permiso, defecto(rol) }
  const efectivo = (rol, fila) => {
    const ov = overrides[`${rol}|${fila.permiso}`];
    return ov === undefined ? fila.defecto(rol) : ov;
  };

  const alternar = async (rol, fila) => {
    const llave = `${rol}|${fila.permiso}`;
    const nuevo = !efectivo(rol, fila);
    const esDefecto = nuevo === fila.defecto(rol);
    setGuardando(llave);
    let error;
    if (esDefecto) {
      ({ error } = await supabase.from('permisos_rol').delete().eq('rol', rol).eq('permiso', fila.permiso));
    } else {
      ({ error } = await supabase.from('permisos_rol').upsert(
        { rol, permiso: fila.permiso, habilitado: nuevo, actualizado_por: miAgente?.correo || null, updated_at: new Date().toISOString() },
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

  const restablecerRol = async (rol) => {
    if (!window.confirm(`¿Regresar ${rol} a los permisos de fábrica?`)) return;
    const { error } = await supabase.from('permisos_rol').delete().eq('rol', rol);
    if (error) { alert('No se pudo restablecer: ' + error.message); return; }
    setOverrides(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${rol}|`))));
  };

  const interruptor = (rol, fila) => {
    const on = efectivo(rol, fila);
    const llave = `${rol}|${fila.permiso}`;
    const cambiado = overrides[llave] !== undefined;
    const alerta = fila.tipo === 'menu' && on && !fila.defecto(rol);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
        <button onClick={() => alternar(rol, fila)} disabled={guardando === llave} aria-label={`${fila.label} para ${rol}`}
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
  const seccionesAcciones = [...new Set(ACCIONES.map(a => a.seccion))];
  const gruposAcciones = seccionesAcciones.map(sec => ({
    titulo: sec,
    filas: ACCIONES.filter(a => a.seccion === sec).map(a => ({ tipo: 'accion', label: a.label, permiso: claveAccion(a.id), defecto: a.defecto })),
  }));

  const celda = { padding: '8px 6px', textAlign: 'center', borderBottom: '0.5px solid #f0f0f0' };
  const colspan = ROLES_CONFIGURABLES.length + 1;
  const cabeceraBloque = (texto) => (
    <tr><td colSpan={colspan} style={{ padding: '12px', background: '#1a1a2e', color: '#fff', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{texto}</td></tr>
  );
  const bloque = (g) => (
    <React.Fragment key={g.titulo}>
      <tr><td colSpan={colspan} style={{ padding: '8px 12px', background: '#f3f3f3', fontWeight: '700', color: '#555', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{g.titulo}</td></tr>
      {g.filas.map(f => (
        <tr key={f.permiso}>
          <td style={{ ...celda, textAlign: 'left', padding: '8px 12px', position: 'sticky', left: 0, background: '#fff', color: '#1a1a2e', fontWeight: '500', minWidth: '230px' }}>{f.label}</td>
          {ROLES_CONFIGURABLES.map(rol => <td key={rol} style={celda}>{interruptor(rol, f)}</td>)}
        </tr>
      ))}
    </React.Fragment>
  );

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ fontSize: '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Permisos</h2>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Qué secciones ve cada rol y qué puede modificar dentro de ellas. El Super Admin siempre puede todo.</div>
      <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '1rem' }}>
        ● distinto al valor de fábrica · ⚠ sección que ese rol no tenía por defecto: al activarla verá los datos como la sección los muestra, y algunas no limitan por desarrollo o equipo para ese rol. Las restricciones por desarrollo o equipo (por ejemplo Mesa de Control solo en sus desarrollos) siguen aplicando aunque el interruptor esté encendido. Los cambios se aplican cuando la persona recarga o vuelve a iniciar sesión. Las funciones de Expedientes, Comisiones, Cobranza y demás módulos se irán agregando aquí.
        IMPORTANTE: hoy la base de datos solo permite modificar Inventario y Planes de pago a Super Admin y Admin. Si le activas esas funciones a otro rol verá los botones, pero el guardado será rechazado hasta que se ajuste la base. Para quitárselas a Admin, apagar el interruptor basta.
      </div>
      {cargando ? <div style={{ color: '#888', fontSize: '13px' }}>Cargando...</div> : (
        <div style={{ overflowX: 'auto', background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '12px', minWidth: '100%' }}>
            <thead>
              <tr style={{ background: '#f9f9f9' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', position: 'sticky', left: 0, background: '#f9f9f9', minWidth: '230px' }}>&nbsp;</th>
                {ROLES_CONFIGURABLES.map(rol => (
                  <th key={rol} style={{ padding: '8px 6px', textAlign: 'center', minWidth: '84px', fontWeight: '600', color: '#1a1a2e' }}>
                    <div>{rol}</div>
                    <button onClick={() => restablecerRol(rol)} style={{ marginTop: '4px', border: 'none', background: 'none', color: '#999', fontSize: '10px', cursor: 'pointer', textDecoration: 'underline' }}>restablecer</button>
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
