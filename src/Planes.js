import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

// FIX: antes este componente no recibía miRol/miAgente en absoluto —
// cualquiera que llegara a esta pantalla (por ejemplo un Agente, si
// alguna vez se le mostrara el botón "Planes") podía editar/eliminar
// planes de pago sin ningún candado. Ahora solo puede editar/agregar/
// eliminar Super Admin o Admin (Mesa de Control ya no: los planes
// mueven el precio final, así que quedan solo para ellos).
export default function Planes({ desarrollo, onBack, miRol, miAgente }) {
  const [planes, setPlanes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  // FIX: selector de torre/etapa, igual que en Inventario
  const [estructuraSel, setEstructuraSel] = useState(desarrollo.tiene_etapas ? `${desarrollo.tipo_estructura} 1` : null);

  const puedeEditar = miRol === 'Super Admin' || miRol === 'Admin';

  useEffect(() => {
    // Si no tiene etapas, carga directo. Si tiene etapas, espera a que
    // estructuraSel tenga valor (ya viene con default arriba).
    if (!desarrollo.tiene_etapas || estructuraSel) cargarPlanes();
  }, [estructuraSel]);

  const cargarPlanes = async () => {
    setLoading(true);
    let query = supabase.from('planes_pago').select('*').eq('desarrollo_id', desarrollo.id);
    // FIX: si el desarrollo tiene torres/etapas, solo trae los planes de la torre seleccionada
    if (desarrollo.tiene_etapas) query = query.eq('estructura', estructuraSel);
    const { data } = await query.order('created_at');
    setPlanes(data || []);
    setLoading(false);
  };

  const handleAgregar = async () => {
    if (!puedeEditar) return; // FIX: respaldo de seguridad
    const nuevo = {
      desarrollo_id: desarrollo.id,
      nombre: `Plan ${planes.length + 1}`,
      activo: false,
      descuento_preventa: 0,
      descuento_plan: 0,
      enganche: 0,
      durante_obra: 0,
      meses_plan: 0,
      // FIX: el plan queda asociado a la torre/etapa seleccionada (o null si el desarrollo no tiene etapas)
      estructura: desarrollo.tiene_etapas ? estructuraSel : null
    };
    await supabase.from('planes_pago').insert([nuevo]);
    cargarPlanes();
  };

  const handleEliminar = async (id) => {
    if (!puedeEditar) return; // FIX: respaldo de seguridad
    if (!window.confirm('¿Eliminar este plan?')) return;
    await supabase.from('planes_pago').delete().eq('id', id);
    cargarPlanes();
  };

  const handleCambio = (id, campo, valor) => {
    if (!puedeEditar) return; // FIX: respaldo de seguridad
    setPlanes(prev => prev.map(p => p.id === id ? { ...p, [campo]: valor } : p));
  };

  const handleGuardar = async (plan) => {
    if (!puedeEditar) return; // FIX: respaldo de seguridad
    setGuardando(true);
    await supabase.from('planes_pago').update({
      nombre: plan.nombre,
      activo: plan.activo,
      descuento_preventa: plan.descuento_preventa,
      descuento_plan: plan.descuento_plan,
      enganche: plan.enganche,
      durante_obra: plan.durante_obra,
      meses_plan: plan.meses_plan
    }).eq('id', plan.id);
    setGuardando(false);
  };

  const inp = (plan, label, campo, type = 'number') => (
    <div style={{ flex: 1 }}>
      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>{label}</label>
      <input type={type} value={plan[campo]} onChange={e => handleCambio(plan.id, campo, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
        readOnly={!puedeEditar}
        style={{ width: '100%', padding: '8px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', background: puedeEditar ? '#fff' : '#f9f9f9', color: puedeEditar ? '#000' : '#888' }} />
    </div>
  );

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#C0203A' }}>
          ← Volver a Desarrollos
        </button>
        {puedeEditar && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleAgregar} style={btnOutline}>+ Agregar nuevo plan</button>
          </div>
        )}
      </div>

      <h2 style={{ fontSize: '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>{desarrollo.nombre}</h2>
      <div style={{ fontSize: '13px', color: '#888', marginBottom: '1rem' }}>
        Planes de pago{estructuraSel ? ` — ${estructuraSel}` : ''}
      </div>

      {/* FIX: selector de torre/etapa — misma lógica que Inventario.js */}
      {desarrollo.tiene_etapas && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {Array.from({ length: desarrollo.num_estructuras || 1 }, (_, i) => {
            const nombre = `${desarrollo.tipo_estructura} ${i + 1}`;
            return (
              <button key={i} onClick={() => setEstructuraSel(nombre)}
                style={{ padding: '6px 16px', borderRadius: '20px', border: '0.5px solid', cursor: 'pointer', fontSize: '13px',
                  background: estructuraSel === nombre ? '#C0203A' : '#fff',
                  color: estructuraSel === nombre ? '#fff' : '#666',
                  borderColor: estructuraSel === nombre ? '#C0203A' : '#ddd' }}>
                {nombre}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#888' }}>Cargando...</div>
      ) : planes.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>
          Sin planes de pago{estructuraSel ? ` para ${estructuraSel}` : ''}. {puedeEditar ? 'Agrega uno.' : ''}
        </div>
      ) : (
        planes.map((plan, i) => (
          <div key={plan.id} style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '1.5rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '15px', fontWeight: '500', color: '#1a1a2e' }}>Plan de pagos {i + 1}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#666', cursor: puedeEditar ? 'pointer' : 'default' }}>
                  <input type='checkbox' checked={plan.activo} disabled={!puedeEditar} onChange={e => handleCambio(plan.id, 'activo', e.target.checked)} />
                  Activar
                </label>
              </div>
              {puedeEditar && (
                <button onClick={() => handleEliminar(plan.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53935', fontSize: '13px' }}>
                  Eliminar plan
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
              {inp(plan, 'Nombre', 'nombre', 'text')}
              {inp(plan, '% Descuento Preventa', 'descuento_preventa')}
              {inp(plan, '% Descuento Plan', 'descuento_plan')}
              {inp(plan, '% Enganche', 'enganche')}
              {inp(plan, '% Durante la obra', 'durante_obra')}
              {inp(plan, `Meses plan ${i + 1}`, 'meses_plan')}
            </div>

            <div style={{ background: '#f9f9f9', borderRadius: '8px', padding: '12px', fontSize: '12px', color: '#666', marginBottom: '12px' }}>
              <div style={{ fontWeight: '500', marginBottom: '4px', color: '#333' }}>Vista previa (sobre precio de ejemplo $1,000,000)</div>
              <div>Enganche ({plan.enganche}%): ${((1000000 * (1 - plan.descuento_plan / 100)) * plan.enganche / 100).toLocaleString('es-MX', { maximumFractionDigits: 0 })}</div>
              <div>Durante la obra ({plan.durante_obra}%): ${((1000000 * (1 - plan.descuento_plan / 100)) * plan.durante_obra / 100).toLocaleString('es-MX', { maximumFractionDigits: 0 })}</div>
              {plan.meses_plan > 0 && <div>Mensualidades ({plan.meses_plan} meses): ${((1000000 * (1 - plan.descuento_plan / 100)) * (100 - plan.enganche - plan.durante_obra) / 100 / plan.meses_plan).toLocaleString('es-MX', { maximumFractionDigits: 0 })}/mes</div>}
            </div>

            {puedeEditar && (
              <button onClick={() => handleGuardar(plan)} disabled={guardando} style={{ ...btnPrimary, padding: '8px 24px' }}>
                {guardando ? 'Guardando...' : 'Guardar plan'}
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

const btnPrimary = { background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' };
const btnOutline = { background: '#fff', color: '#333', border: '0.5px solid #ddd', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' };