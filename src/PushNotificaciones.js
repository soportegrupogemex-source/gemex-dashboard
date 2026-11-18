import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { pushEsCompatible, estaSuscrito, activarNotificaciones, desactivarNotificaciones } from './push';

// FIX: tarjeta para activar/desactivar notificaciones push del CRM.
// Insertar en Mi cuenta así: <PushNotificaciones miAgente={miAgente} />
export default function PushNotificaciones({ miAgente }) {
  const [compatible, setCompatible] = useState(true);
  const [suscrito, setSuscrito] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setCompatible(pushEsCompatible());
    estaSuscrito().then(setSuscrito);
  }, []);

  const handleActivar = async () => {
    setCargando(true); setMsg('');
    const res = await activarNotificaciones(supabase, miAgente?.correo);
    setCargando(false);
    if (res.ok) { setSuscrito(true); setMsg('Notificaciones activadas en este dispositivo'); }
    else setMsg('Error: ' + res.error);
  };

  const handleDesactivar = async () => {
    setCargando(true); setMsg('');
    await desactivarNotificaciones(supabase);
    setCargando(false);
    setSuscrito(false);
    setMsg('Notificaciones desactivadas en este dispositivo');
  };

  return (
    <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '1.5rem', marginBottom: '1rem' }}>
      <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '6px' }}>Notificaciones</div>
      <div style={{ fontSize: '13px', color: '#888', marginBottom: '14px' }}>
        {compatible
          ? 'Recibe avisos en este dispositivo cuando tengas expedientes por revisar, documentos rechazados, o interés cruzado en un contacto tuyo.'
          : 'Este navegador no soporta notificaciones push. En iPhone, agrega el CRM a tu pantalla de inicio desde Safari (Compartir → Agregar a inicio) y ábrelo desde ahí para poder activarlas.'}
      </div>
      {compatible && (
        <button onClick={suscrito ? handleDesactivar : handleActivar} disabled={cargando}
          style={{ padding: '10px 18px', background: suscrito ? '#FCEBEB' : '#C0203A', color: suscrito ? '#A32D2D' : '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
          {cargando ? 'Un momento...' : suscrito ? 'Desactivar en este dispositivo' : 'Activar notificaciones'}
        </button>
      )}
      {msg && <div style={{ fontSize: '12px', marginTop: '10px', color: msg.startsWith('Error') ? '#A32D2D' : '#27500A' }}>{msg}</div>}
    </div>
  );
}
