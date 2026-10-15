import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { HOJAS_CONFIGURABLES, ROLES_CONFIGURABLES, MENU_MODULOS, clavePermiso, reglaPorDefecto } from './permisosMenu';

// Panel de permisos (solo Super Admin): un interruptor por rol y por pantalla
// del menú. Solo se guardan las diferencias contra las reglas de fábrica
// (tabla permisos_rol); si un interruptor vuelve a su valor de fábrica, su
// ajuste se borra. El Super Admin siempre ve todo.
const CTX_DEFAULT = { equipo: 'Gemex', rankingBsVisible: true };

export default function Permisos({ miAgente }) {
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

  const porDefecto = (rol, hojaId) => reglaPorDefecto(rol, hojaId, CTX_DEFAULT);
  const efectivo = (rol, hojaId) => {
    const ov = overrides[`${rol}|${clavePermiso(hojaId)}`];
    return ov === undefined ? porDefecto(rol, hojaId) : ov;
  };

  const alternar = async (rol, hojaId) => {
    const permiso = clavePermiso(hojaId);
    const nuevo = !efectivo(rol, hojaId);
    const llave = `${rol}|${permiso}`;
    setGuardando(llave);
    let error;
    if (nuevo === porDefecto(rol, hojaId)) {
      ({ error } = await supabase.from('permisos_rol').delete().eq('rol', rol).eq('permiso', permiso));
    } else {
      ({ error } = await supabase.from('permisos_rol').upsert(
        { rol, permiso, habilitado: nuevo, actualizado_por: miAgente?.correo || null, updated_at: new Date().toISOString() },
        { onConflict: 'rol,permiso' }));
    }
    setGuardando('');
    if (error) { alert('No se pudo guardar: ' + error.message); return; }
    setOverrides(prev => {
      const n = { ...prev };
      if (nuevo === porDefecto(rol, hojaId)) delete n[llave]; else n[llave] = nuevo;
      return n;
    });
  };

  const restablecerRol = async (rol) => {
    if (!window.confirm(`¿Regresar ${rol} a los permisos de fábrica?`)) return;
    const { error } = await supabase.from('permisos_rol').delete().eq('rol', rol);
    if (error) { alert('No se pudo restablecer: ' + error.message); return; }
    setOverrides(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${rol}|`))));
  };

  const interruptor = (rol, h) => {
    const on = efectivo(rol, h.id);
    const llave = `${rol}|${clavePermiso(h.id)}`;
    const cambiado = overrides[llave] !== undefined;
    const alerta = on && !porDefecto(rol, h.id);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
        <button onClick={() => alternar(rol, h.id)} disabled={guardando === llave} aria-label={`${h.label} para ${rol}`}
          style={{ width: '34px', height: '19px', borderRadius: '10px', border: 'none', background: on ? '#2E7D4F' : '#cfcfcf', position: 'relative', cursor: 'pointer', padding: 0, opacity: guardando === llave ? 0.5 : 1 }}>
          <span style={{ position: 'absolute', top: '2px', left: on ? '17px' : '2px', width: '15px', height: '15px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
        </button>
        <span style={{ fontSize: '9px', height: '10px', color: alerta ? '#B45309' : '#C0203A' }} title={alerta ? 'Este rol no tenía esta sección por defecto: verá los datos tal como la sección los muestra (puede ser toda la empresa).' : 'Distinto al valor de fábrica'}>
          {alerta ? '⚠' : cambiado ? '●' : ''}
        </span>
      </div>
    );
  };

  const modulos = MENU_MODULOS.map(m => ({ nombre: m.label, hojas: HOJAS_CONFIGURABLES.filter(h => h.modulo === m.label) })).filter(m => m.hojas.length > 0);
  const celda = { padding: '8px 6px', textAlign: 'center', borderBottom: '0.5px solid #f0f0f0' };

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ fontSize: '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Permisos</h2>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Qué secciones del menú ve cada rol. El Super Admin siempre ve todo.</div>
      <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '1rem' }}>
        ● distinto al valor de fábrica · ⚠ sección que ese rol no tenía por defecto: al activarla verá los datos como la sección los muestra, y algunas no limitan por desarrollo o equipo para ese rol. Los cambios se aplican cuando la persona recarga o vuelve a iniciar sesión. Por ahora controlan lo que se ve en el menú; las funciones dentro de cada sección llegan en la siguiente fase.
      </div>
      {cargando ? <div style={{ color: '#888', fontSize: '13px' }}>Cargando...</div> : (
        <div style={{ overflowX: 'auto', background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '12px', minWidth: '100%' }}>
            <thead>
              <tr style={{ background: '#f9f9f9' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', position: 'sticky', left: 0, background: '#f9f9f9', minWidth: '170px' }}>Sección</th>
                {ROLES_CONFIGURABLES.map(rol => (
                  <th key={rol} style={{ padding: '8px 6px', textAlign: 'center', minWidth: '84px', fontWeight: '600', color: '#1a1a2e' }}>
                    <div>{rol}</div>
                    <button onClick={() => restablecerRol(rol)} style={{ marginTop: '4px', border: 'none', background: 'none', color: '#999', fontSize: '10px', cursor: 'pointer', textDecoration: 'underline' }}>restablecer</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modulos.map(m => (
                <React.Fragment key={m.nombre}>
                  <tr><td colSpan={ROLES_CONFIGURABLES.length + 1} style={{ padding: '8px 12px', background: '#f3f3f3', fontWeight: '700', color: '#555', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.nombre}</td></tr>
                  {m.hojas.map(h => (
                    <tr key={h.id}>
                      <td style={{ ...celda, textAlign: 'left', padding: '8px 12px', position: 'sticky', left: 0, background: '#fff', color: '#1a1a2e', fontWeight: '500' }}>{h.label}</td>
                      {ROLES_CONFIGURABLES.map(rol => <td key={rol} style={celda}>{interruptor(rol, h)}</td>)}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
