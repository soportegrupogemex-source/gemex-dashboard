import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

// Ajustes de administración — nombres que firman la liquidación final de
// Cobranza. Se guardan en `configuracion` (clave/valor). El nombre del
// cliente NO se captura aquí: sale del expediente de la venta.
export const CLAVE_TITULADOR = 'liquidacion_titulador_nombre';
export const CLAVE_TESORERO = 'liquidacion_tesorero_nombre';

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export default function AjustesAdministracion() {
  const isMobile = useIsMobile();
  const [titulador, setTitulador] = useState('');
  const [tesorero, setTesorero] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    const { data } = await supabase.from('configuracion').select('clave, valor').in('clave', [CLAVE_TITULADOR, CLAVE_TESORERO]);
    (data || []).forEach(r => {
      if (r.clave === CLAVE_TITULADOR) setTitulador(r.valor || '');
      if (r.clave === CLAVE_TESORERO) setTesorero(r.valor || '');
    });
    setCargando(false);
  };

  const guardar = async () => {
    setGuardando(true); setMsg('');
    const { error } = await supabase.from('configuracion').upsert([
      { clave: CLAVE_TITULADOR, valor: titulador.trim() },
      { clave: CLAVE_TESORERO, valor: tesorero.trim() },
    ], { onConflict: 'clave' });
    setGuardando(false);
    if (error) { alert('No se pudo guardar: ' + error.message); return; }
    setMsg('✓ Guardado');
  };

  const inputStyle = { width: '100%', padding: '10px 12px', border: '0.5px solid #ddd', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' };

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem', maxWidth: '560px' }}>
      <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Ajustes de administración</h2>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '1.5rem' }}>Nombres que firman la liquidación final de Cobranza</div>

      {cargando ? (
        <div style={{ color: '#888', fontSize: '13px' }}>Cargando...</div>
      ) : (
        <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '1.25rem' }}>
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Nombre del titulador</label>
            <input value={titulador} onChange={e => { setTitulador(e.target.value); setMsg(''); }} placeholder="Nombre completo" style={inputStyle} />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Nombre del tesorero</label>
            <input value={tesorero} onChange={e => { setTesorero(e.target.value); setMsg(''); }} placeholder="Nombre completo" style={inputStyle} />
          </div>
          <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '14px' }}>
            El nombre del cliente no se captura aquí: sale del expediente de la venta.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={guardar} disabled={guardando}
              style={{ padding: '10px 20px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
            {msg && <span style={{ fontSize: '12px', color: '#27500A' }}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
