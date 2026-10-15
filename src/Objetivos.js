import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { InputDinero } from './dinero';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const fmt = (n) => `$${Number(n||0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
// FIX: roles de gerente que solo deben ver sus propios desarrollos a cargo
const ROLES_GERENTE = ['Gerente Editor', 'Gerente Operador'];

// FIX: se agregan metas de Titulación y Cobranza además de Ventas —
// cada tipo tiene su propio par de columnas (unidades, monto) en la
// tabla `objetivos`. Un selector cambia cuál se edita/muestra en la
// misma grilla de desarrollo x mes, para no saturar cada celda con 6
// números a la vez.
const TIPOS_META = [
  { id: 'ventas', label: 'Ventas', colUnidades: 'meta_unidades', colMonto: 'meta_monto' },
  { id: 'titulacion', label: 'Titulación', colUnidades: 'meta_titulacion_unidades', colMonto: 'meta_titulacion_monto' },
  { id: 'cobranza', label: 'Cobranza', colUnidades: 'meta_cobranza_unidades', colMonto: 'meta_cobranza_monto' },
];

export default function Objetivos({ miRol, miAgente }) {
  const [desarrollos, setDesarrollos] = useState([]);
  const [objetivos, setObjetivos] = useState([]);
  const [año, setAño] = useState(new Date().getFullYear());
  const [tipoMeta, setTipoMeta] = useState('ventas');
  const [editando, setEditando] = useState(null); // { desarrolloId, mes }
  const [formEdit, setFormEdit] = useState({ unidades: 0, monto: 0 });
  const [guardando, setGuardando] = useState(false);

  const tipo = TIPOS_META.find(t => t.id === tipoMeta);

  useEffect(() => { cargarDesarrollos(); }, []);
  useEffect(() => { cargarObjetivos(); }, [año]);

  const cargarDesarrollos = async () => {
    const { data } = await supabase.from('desarrollos').select('id, nombre').eq('activo', true).order('nombre');
    setDesarrollos(data || []);
  };

  const cargarObjetivos = async () => {
    const { data } = await supabase.from('objetivos').select('*').eq('año', año);
    setObjetivos(data || []);
  };

  // FIX BUG DE VISIBILIDAD: antes esta pantalla no recibía miRol/miAgente
  // en absoluto — cualquier Gerente veía la tabla completa de TODOS los
  // desarrollos y las metas de sus compañeros. Ahora, si el rol es
  // Gerente Editor/Operador, se limita a sus desarrollos_cargo — igual
  // que ya hace DashboardDireccion.js.
  const desarrollosPermitidos = ROLES_GERENTE.includes(miRol)
    ? desarrollos.filter(d => (miAgente?.desarrollos_cargo || []).includes(d.nombre))
    : desarrollos;
  const idsPermitidos = desarrollosPermitidos.map(d => d.id);

  // FIX: los totales (por mes, por desarrollo, general) ahora se calculan
  // solo sobre los objetivos de desarrollos permitidos — antes sumaban
  // los de TODOS los desarrollos aunque la tabla solo mostrara los propios,
  // así que el "Total" filtrado igual reflejaba números de toda la empresa.
  const objetivosVisibles = objetivos.filter(o => idsPermitidos.includes(o.desarrollo_id));

  const getObjetivo = (desarrolloId, mes) =>
    objetivosVisibles.find(o => o.desarrollo_id === desarrolloId && o.mes === mes);

  const handleEditar = (desarrolloId, mes) => {
    const obj = getObjetivo(desarrolloId, mes);
    setFormEdit({ unidades: obj?.[tipo.colUnidades] || 0, monto: obj?.[tipo.colMonto] || 0 });
    setEditando({ desarrolloId, mes });
  };

  const handleGuardar = async (desarrolloId, mes, desarrolloNombre) => {
    setGuardando(true);
    const existing = getObjetivo(desarrolloId, mes);
    const payload = { [tipo.colUnidades]: formEdit.unidades, [tipo.colMonto]: formEdit.monto };
    if (existing) {
      await supabase.from('objetivos').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('objetivos').insert([{
        año, mes, desarrollo_id: desarrolloId,
        desarrollo_nombre: desarrolloNombre,
        ...payload
      }]);
    }
    setGuardando(false);
    setEditando(null);
    cargarObjetivos();
  };

  // Totales por mes
  const totalMes = (mes) => ({
    unidades: objetivosVisibles.filter(o => o.mes === mes).reduce((s, o) => s + (o[tipo.colUnidades] || 0), 0),
    monto: objetivosVisibles.filter(o => o.mes === mes).reduce((s, o) => s + (o[tipo.colMonto] || 0), 0),
  });

  // Totales por desarrollo
  const totalDesarrollo = (desarrolloId) => ({
    unidades: objetivosVisibles.filter(o => o.desarrollo_id === desarrolloId).reduce((s, o) => s + (o[tipo.colUnidades] || 0), 0),
    monto: objetivosVisibles.filter(o => o.desarrollo_id === desarrolloId).reduce((s, o) => s + (o[tipo.colMonto] || 0), 0),
  });

  // Total general
  const totalGeneral = {
    unidades: objetivosVisibles.reduce((s, o) => s + (o[tipo.colUnidades] || 0), 0),
    monto: objetivosVisibles.reduce((s, o) => s + (o[tipo.colMonto] || 0), 0),
  };

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Objetivos Anuales {año}</h2>
          <div style={{ fontSize: '13px', color: '#888' }}>Define las metas de {tipo.label.toLowerCase()} por proyecto y mes</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={() => setAño(a => a - 1)} style={btnOutline}>← {año - 1}</button>
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', padding: '0 8px' }}>{año}</span>
          <button onClick={() => setAño(a => a + 1)} style={btnOutline}>{año + 1} →</button>
        </div>
      </div>

      {/* Selector de tipo de meta */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '1.5rem' }}>
        {TIPOS_META.map(t => (
          <button key={t.id} onClick={() => { setTipoMeta(t.id); setEditando(null); }}
            style={{ padding: '8px 18px', borderRadius: '20px', border: '0.5px solid', fontSize: '13px', cursor: 'pointer', fontWeight: '600',
              background: tipoMeta === t.id ? '#C0203A' : '#fff', color: tipoMeta === t.id ? '#fff' : '#666', borderColor: tipoMeta === t.id ? '#C0203A' : '#ddd' }}>
            {t.label}
          </button>
        ))}
      </div>

      {ROLES_GERENTE.includes(miRol) && desarrollosPermitidos.length === 0 && (
        <div style={{ padding: '12px 16px', background: '#FFF8E1', color: '#856404', borderRadius: '8px', fontSize: '13px', marginBottom: '1rem' }}>
          No tienes desarrollos asignados todavía.
        </div>
      )}

      {/* Tabla */}
      <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '1400px' }}>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '0.5px solid #e0e0e0' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '600', color: '#333', position: 'sticky', left: 0, background: '#fafafa', minWidth: '160px' }}>Desarrollo</th>
              {MESES.map(m => (
                <th key={m} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500', color: '#555', minWidth: '110px' }}>
                <div>{m}</div>
                <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: '10px', color: '#aaa', marginTop: '4px', fontWeight: '400' }}>
                  <span>Unidades</span>
                  <span>Monto</span>
                </div>
              </th>
              ))}
              <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '600', color: '#333', minWidth: '120px' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {desarrollosPermitidos.map(d => (
              <tr key={d.id} style={{ borderBottom: '0.5px solid #f0f0f0' }}>
                <td style={{ padding: '12px 16px', fontWeight: '500', color: '#1a1a2e', position: 'sticky', left: 0, background: '#fff' }}>
                  {d.nombre}
                </td>
                {MESES.map((mes, i) => {
                  const obj = getObjetivo(d.id, i + 1);
                  const isEdit = editando?.desarrolloId === d.id && editando?.mes === i + 1;
                  return (
                    <td key={i} style={{ padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                      {isEdit ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <input type='number' value={formEdit.unidades}
                            onChange={e => setFormEdit({ ...formEdit, unidades: parseInt(e.target.value) || 0 })}
                            placeholder='Unidades'
                            style={{ width: '80px', padding: '4px 6px', border: '1px solid #C0203A', borderRadius: '4px', fontSize: '11px', textAlign: 'center' }} />
                          <InputDinero value={formEdit.monto}
                            onChange={e => setFormEdit({ ...formEdit, monto: parseFloat(e.target.value) || 0 })}
                            placeholder='Monto'
                            style={{ width: '80px', padding: '4px 6px', border: '1px solid #C0203A', borderRadius: '4px', fontSize: '11px', textAlign: 'center' }} />
                          <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                            <button onClick={() => handleGuardar(d.id, i + 1, d.nombre)} disabled={guardando}
                              style={{ padding: '2px 8px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                              ✓
                            </button>
                            <button onClick={() => setEditando(null)}
                              style={{ padding: '2px 8px', background: '#f0f0f0', color: '#333', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div onClick={() => handleEditar(d.id, i + 1)} style={{ cursor: 'pointer', padding: '4px', borderRadius: '6px', transition: 'background 0.1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          {obj && (obj[tipo.colUnidades] > 0 || obj[tipo.colMonto] > 0) ? (
                            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', gap: '4px' }}>
                              <div style={{ textAlign: 'center' }}>
                                <div style={{ fontWeight: '700', color: '#1a1a2e', fontSize: '13px' }}>{obj[tipo.colUnidades] || 0}</div>
                                <div style={{ fontSize: '9px', color: '#aaa' }}>ud</div>
                              </div>
                              <div style={{ width: '1px', height: '24px', background: '#e0e0e0' }} />
                              <div style={{ textAlign: 'center' }}>
                                <div style={{ fontWeight: '600', color: '#555', fontSize: '11px' }}>{fmt(obj[tipo.colMonto])}</div>
                                <div style={{ fontSize: '9px', color: '#aaa' }}>monto</div>
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: '#ddd', fontSize: '11px' }}>+ Meta</span>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
                {/* Total desarrollo */}
                <td style={{ padding: '12px', textAlign: 'center', background: '#f9f9f9', fontWeight: '600' }}>
                  <div style={{ color: '#1a1a2e' }}>{totalDesarrollo(d.id).unidades} ud</div>
                  <div style={{ fontSize: '10px', color: '#888' }}>{fmt(totalDesarrollo(d.id).monto)}</div>
                </td>
              </tr>
            ))}

            {/* Fila totales por mes */}
            <tr style={{ borderTop: '2px solid #e0e0e0', background: '#f0f0f0' }}>
              <td style={{ padding: '12px 16px', fontWeight: '700', color: '#1a1a2e', position: 'sticky', left: 0, background: '#f0f0f0' }}>Total</td>
              {MESES.map((mes, i) => {
                const t = totalMes(i + 1);
                return (
                  <td key={i} style={{ padding: '8px', textAlign: 'center' }}>
                    {t.unidades > 0 || t.monto > 0 ? (
                      <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: '700', color: '#1a1a2e' }}>{t.unidades}</div>
                          <div style={{ fontSize: '9px', color: '#aaa' }}>ud</div>
                        </div>
                        <div style={{ width: '1px', background: '#ddd' }} />
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: '600', color: '#555', fontSize: '10px' }}>{fmt(t.monto)}</div>
                          <div style={{ fontSize: '9px', color: '#aaa' }}>monto</div>
                        </div>
                      </div>
                    ) : <span style={{ color: '#ccc' }}>—</span>}
                  </td>
                );
              })}
              <td style={{ padding: '12px', textAlign: 'center', background: '#e0e0e0', fontWeight: '700' }}>
                <div style={{ color: '#1a1a2e' }}>{totalGeneral.unidades} ud</div>
                <div style={{ fontSize: '10px', color: '#555' }}>{fmt(totalGeneral.monto)}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Consolidado */}
      <div style={{ marginTop: '16px', background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>TOTAL META UNIDADES · {tipo.label.toUpperCase()} {año}</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a2e' }}>{totalGeneral.unidades}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>TOTAL META MONTO · {tipo.label.toUpperCase()} {año}</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a2e' }}>{fmt(totalGeneral.monto)}</div>
        </div>
      </div>
    </div>
  );
}

const btnOutline = { background: '#fff', color: '#333', border: '0.5px solid #ddd', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer' };
