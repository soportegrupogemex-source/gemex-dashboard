import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';
import { InputDinero } from './dinero';
import { usePuede } from './PermisosContext';

const ESTATUS_OPCIONES = ['Prospecto', 'Prospecto Calificado', 'Cliente', 'No interesado'];
const MEDIO_OPCIONES = ['Autogeneración', 'Mensaje WhatsApp', 'Campañas digitales', 'Referido', 'Portal inmobiliario', 'Showroom'];
const TIEMPO_COMPRA_OPCIONES = ['Inmediato', '1 a 3 meses', '3 a 6 meses', '6 a 12 meses', 'Más de 1 año'];
const TIPO_COMPRA_OPCIONES = ['Contado', 'Crédito hipotecario', 'Infonavit', 'Fovissste'];
const RAZON_NO_COMPRA = ['Precio alto', 'Ya compró otro', 'Sin financiamiento', 'No le gustó', 'Sin respuesta'];

// FIX: mismas etapas que Negocios.js (no se exportan de ahí, así que se
// replican aquí para poder mostrar/mover la etapa desde el detalle del contacto)
const ETAPAS = [
  { id: 'Leads', color: '#0EA5E9' },
  { id: 'Cotización', color: '#F59E0B' },
  { id: 'Cita', color: '#3B82F6' },
  { id: 'Seguimiento', color: '#8B5CF6' },
  { id: 'Apartado', color: '#EC4899' },
  { id: 'Venta', color: '#10B981' },
  { id: 'Escritura', color: '#6366F1' },
  { id: 'Cobranza', color: '#14B8A6' },
  { id: 'Cierre perdido', color: '#EF4444' },
];

const LADAS = [
  { code: '+52', flag: '🇲🇽', abbr: 'MX', country: 'México' },
  { code: '+1', flag: '🇺🇸', abbr: 'US', country: 'Estados Unidos' },
  { code: '+1CA', flag: '🇨🇦', abbr: 'CA', country: 'Canadá' },
  { code: '+54', flag: '🇦🇷', abbr: 'AR', country: 'Argentina' },
  { code: '+55', flag: '🇧🇷', abbr: 'BR', country: 'Brasil' },
  { code: '+56', flag: '🇨🇱', abbr: 'CL', country: 'Chile' },
  { code: '+57', flag: '🇨🇴', abbr: 'CO', country: 'Colombia' },
  { code: '+51', flag: '🇵🇪', abbr: 'PE', country: 'Perú' },
  { code: '+58', flag: '🇻🇪', abbr: 'VE', country: 'Venezuela' },
  { code: '+502', flag: '🇬🇹', abbr: 'GT', country: 'Guatemala' },
  { code: '+503', flag: '🇸🇻', abbr: 'SV', country: 'El Salvador' },
  { code: '+504', flag: '🇭🇳', abbr: 'HN', country: 'Honduras' },
  { code: '+505', flag: '🇳🇮', abbr: 'NI', country: 'Nicaragua' },
  { code: '+506', flag: '🇨🇷', abbr: 'CR', country: 'Costa Rica' },
  { code: '+507', flag: '🇵🇦', abbr: 'PA', country: 'Panamá' },
  { code: '+53', flag: '🇨🇺', abbr: 'CU', country: 'Cuba' },
  { code: '+1809', flag: '🇩🇴', abbr: 'DO', country: 'Rep. Dominicana' },
  { code: '+598', flag: '🇺🇾', abbr: 'UY', country: 'Uruguay' },
  { code: '+591', flag: '🇧🇴', abbr: 'BO', country: 'Bolivia' },
  { code: '+593', flag: '🇪🇨', abbr: 'EC', country: 'Ecuador' },
  { code: '+595', flag: '🇵🇾', abbr: 'PY', country: 'Paraguay' },
  { code: '+34', flag: '🇪🇸', abbr: 'ES', country: 'España' },
  { code: '+44', flag: '🇬🇧', abbr: 'GB', country: 'Reino Unido' },
  { code: '+33', flag: '🇫🇷', abbr: 'FR', country: 'Francia' },
  { code: '+49', flag: '🇩🇪', abbr: 'DE', country: 'Alemania' },
  { code: '+39', flag: '🇮🇹', abbr: 'IT', country: 'Italia' },
  { code: '+31', flag: '🇳🇱', abbr: 'NL', country: 'Países Bajos' },
  { code: '+32', flag: '🇧🇪', abbr: 'BE', country: 'Bélgica' },
  { code: '+41', flag: '🇨🇭', abbr: 'CH', country: 'Suiza' },
  { code: '+43', flag: '🇦🇹', abbr: 'AT', country: 'Austria' },
  { code: '+351', flag: '🇵🇹', abbr: 'PT', country: 'Portugal' },
  { code: '+7', flag: '🇷🇺', abbr: 'RU', country: 'Rusia' },
  { code: '+81', flag: '🇯🇵', abbr: 'JP', country: 'Japón' },
  { code: '+82', flag: '🇰🇷', abbr: 'KR', country: 'Corea del Sur' },
  { code: '+86', flag: '🇨🇳', abbr: 'CN', country: 'China' },
  { code: '+91', flag: '🇮🇳', abbr: 'IN', country: 'India' },
  { code: '+61', flag: '🇦🇺', abbr: 'AU', country: 'Australia' },
  { code: '+64', flag: '🇳🇿', abbr: 'NZ', country: 'Nueva Zelanda' },
  { code: '+27', flag: '🇿🇦', abbr: 'ZA', country: 'Sudáfrica' },
  { code: '+20', flag: '🇪🇬', abbr: 'EG', country: 'Egipto' },
  { code: '+971', flag: '🇦🇪', abbr: 'AE', country: 'Emiratos Árabes' },
  { code: '+966', flag: '🇸🇦', abbr: 'SA', country: 'Arabia Saudita' },
  { code: '+972', flag: '🇮🇱', abbr: 'IL', country: 'Israel' },
  { code: '+90', flag: '🇹🇷', abbr: 'TR', country: 'Turquía' },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

function parseTelefono(tel) {
  if (!tel) return { lada: '+52', numero: '' };
  const t = tel.trim();
  const sorted = [...LADAS].sort((a, b) => b.code.length - a.code.length);
  for (const l of sorted) {
    const code = l.code === '+1CA' ? '+1' : l.code;
    if (t.startsWith(code + ' ')) return { lada: l.code, numero: t.slice(code.length + 1) };
  }
  return { lada: '+52', numero: t };
}

function LadaDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = LADAS.find(l => l.code === value) || LADAS[0];
  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: '20px', lineHeight: 1 }}>{selected.flag}</span>
        <span style={{ color: '#444', fontWeight: '500' }}>{selected.abbr}</span>
        <span style={{ color: '#bbb', fontSize: '10px' }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 9999, background: '#fff', border: '0.5px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto', minWidth: '230px' }}>
          {LADAS.map(l => (
            <button key={l.code} type="button" onClick={() => { onChange(l.code); setOpen(false); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: 'none', background: l.code === value ? '#f5f5f5' : 'transparent', cursor: 'pointer', fontSize: '13px', textAlign: 'left' }}>
              <span style={{ fontSize: '18px' }}>{l.flag}</span>
              <span style={{ fontWeight: '500', color: '#333', width: '28px' }}>{l.abbr}</span>
              <span style={{ color: '#aaa', fontSize: '12px', width: '38px' }}>{l.code === '+1CA' ? '+1' : l.code}</span>
              <span style={{ color: '#888', fontSize: '12px' }}>{l.country}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function fechaHoraActual() {
  return new Date().toLocaleString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// FIX: bug de 6 horas — antes se mostraba el texto crudo de created_at
// (guardado en UTC) sin convertirlo a la hora local del dispositivo,
// tomando solo los primeros 16 caracteres del string. new Date(x) +
// toLocaleString sí hace la conversión correcta a la hora local real.
function fmtFechaCorta(fecha) {
  if (!fecha) return '';
  return new Date(fecha).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
}

// FIX: regresa la nueva fecha para que quien la llame pueda actualizar el
// estado local del contacto EN PANTALLA de inmediato, sin depender de
// recargar la página — antes solo se actualizaba la base de datos, y la
// vista se quedaba mostrando el estado viejo hasta el siguiente refresh.
async function reiniciarVigencia(contactoId) {
  const nuevaFecha = new Date().toISOString();
  await supabase.from('contactos').update({ ultima_actividad: nuevaFecha, vigencia_activa: true }).eq('id', contactoId);
  return nuevaFecha;
}

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;

const btnPrimary = { background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '500', display: 'flex', alignItems: 'center' };
const btnOutline = { background: '#fff', color: '#333', border: '0.5px solid #ddd', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' };
const ACCENT = '#C0203A';

// FIX: PanelActividad se mueve FUERA del componente principal para que no se
// recree en cada render. Esto evita que el textarea/input de notas y tareas
// pierda el foco después de cada tecla.
function PanelActividad({
  isMobile, activeTab, setActiveTab,
  actividad, notas, tareas,
  nota, setNota, tarea, setTarea,
  fechaTarea, setFechaTarea, horaTarea, setHoraTarea,
  handleAgregarNota, handleAgregarTarea, handleToggleTarea,
}) {
  const puede = usePuede();
  return (
    <div style={{ background: '#fff', borderRadius: '12px', border: '0.5px solid #e0e0e0', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: isMobile ? 'auto' : '400px' }}>
      <div style={{ display: 'flex', borderBottom: '0.5px solid #e0e0e0', flexShrink: 0 }}>
        {['actividad', 'tareas', 'notas'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ flex: 1, padding: isMobile ? '14px 8px' : '12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: isMobile ? '14px' : '13px', fontWeight: activeTab === tab ? '600' : '400', color: activeTab === tab ? ACCENT : '#888', borderBottom: activeTab === tab ? `2px solid ${ACCENT}` : '2px solid transparent' }}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
      <div style={{ padding: '1rem', overflowY: 'auto', flex: 1, maxHeight: isMobile ? '400px' : 'none' }}>
        {activeTab === 'actividad' && (
          <div>
            {actividad.length === 0 && <div style={{ fontSize: '13px', color: '#aaa', textAlign: 'center', padding: '1rem' }}>Sin actividad aún</div>}
            {actividad.map((a, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '0.5px solid #f0f0f0', fontSize: '13px', gap: '8px' }}>
                <span style={{ color: '#333' }}>{a.texto}</span>
                <span style={{ color: '#aaa', fontSize: '11px', whiteSpace: 'nowrap' }}>{a.fecha}</span>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'notas' && (
          <div>
            {puede('contactos.agregar_notas') && <div style={{ marginBottom: '12px' }}>
              <textarea value={nota} onChange={e => setNota(e.target.value)} placeholder='Escribe una nota...' rows={3}
                style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px', boxSizing: 'border-box', resize: 'vertical' }} />
              <button onClick={handleAgregarNota} style={{ ...btnPrimary, marginTop: '6px', width: '100%', justifyContent: 'center', padding: '12px' }}>Agregar nota</button>
            </div>}
            {notas.length === 0 && <div style={{ fontSize: '13px', color: '#aaa', textAlign: 'center', padding: '1rem' }}>Sin notas aún</div>}
            {notas.map((n, i) => (
              <div key={n.id || i} style={{ padding: '10px', background: '#f9f9f9', borderRadius: '8px', marginBottom: '8px', fontSize: '13px' }}>
                <div style={{ color: '#333' }}>{n.texto}</div>
                <div style={{ color: '#aaa', fontSize: '11px', marginTop: '4px' }}>{fmtFechaCorta(n.created_at)}</div>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'tareas' && (
          <div>
            {puede('contactos.gestionar_tareas') && <div style={{ marginBottom: '12px' }}>
              <input value={tarea} onChange={e => setTarea(e.target.value)} placeholder='Nueva tarea...'
                onKeyDown={e => e.key === 'Enter' && handleAgregarTarea()}
                style={{ width: '100%', padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px', boxSizing: 'border-box', marginBottom: '8px' }} />
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input type='date' value={fechaTarea} onChange={e => setFechaTarea(e.target.value)}
                  style={{ flex: 1, padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px' }} />
                <input type='time' value={horaTarea} onChange={e => setHoraTarea(e.target.value)}
                  style={{ flex: 1, padding: '10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px' }} />
              </div>
              <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '8px' }}>Fecha y hora son opcionales — si las pones, te llega un aviso 5 minutos antes y al llegar la hora.</div>
              <button onClick={handleAgregarTarea} style={{ ...btnPrimary, width: '100%', justifyContent: 'center', padding: '12px' }}>Agregar tarea</button>
            </div>}
            {tareas.length === 0 && <div style={{ fontSize: '13px', color: '#aaa', textAlign: 'center', padding: '1rem' }}>Sin tareas aún</div>}
            {tareas.map((t, i) => {
              const vencida = t.fecha_hora && !t.completada && new Date(t.fecha_hora) < new Date();
              return (
                <div key={t.id || i} style={{ padding: '10px', background: '#f9f9f9', borderRadius: '8px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <input type='checkbox' disabled={!puede('contactos.gestionar_tareas')} checked={t.completada} onChange={() => handleToggleTarea(t)} style={{ marginTop: '3px', width: '18px', height: '18px', flexShrink: 0 }} />
                    <span style={{ fontSize: isMobile ? '14px' : '13px', color: '#333', textDecoration: t.completada ? 'line-through' : 'none', flex: 1 }}>{t.texto}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: vencida ? '#A32D2D' : '#aaa', marginTop: '6px', paddingLeft: '28px' }}>
                    {t.fecha_hora ? (
                      <>{vencida ? '⚠️ Vencida — ' : '🔔 '}{new Date(t.fecha_hora).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</>
                    ) : fmtFechaCorta(t.created_at)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// FIX: Secciones también movidas fuera del componente principal por la misma razón.
function SeccionPersonal({ isMobile, contacto, upd, campo, lada, setLada, numeroTel, setNumeroTel, editable }) {
  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: isMobile ? '1.25rem' : '1.5rem', marginBottom: '12px', border: '0.5px solid #e0e0e0' }}>
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}>
        DATOS PERSONALES
        {!editable && <span style={{ fontSize: '10px', color: '#aaa', fontWeight: '400', textTransform: 'none' }}>· Solo Admin puede editar estos datos</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
        {campo('Nombre', 'nombres', 'text', !editable)}
        {campo('Apellidos', 'apellidos', 'text', !editable)}
        {campo('Correo', 'correo', 'email', !editable)}
        <div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Teléfono</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <div style={{ opacity: editable ? 1 : 0.6, pointerEvents: editable ? 'auto' : 'none' }}>
              <LadaDropdown value={lada} onChange={setLada} />
            </div>
            <input type="tel" value={numeroTel}
              onChange={e => setNumeroTel(e.target.value.replace(/\D/g, '').slice(0, 10))}
              readOnly={!editable}
              placeholder="10 dígitos"
              style={{ flex: 1, padding: isMobile ? '10px' : '8px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px', minWidth: 0, background: editable ? '#fff' : '#f9f9f9', color: editable ? '#000' : '#888' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SeccionProducto({ isMobile, contacto, upd, campo, dropdownField, desarrollos, agentes }) {
  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: isMobile ? '1.25rem' : '1.5rem', marginBottom: '12px', border: '0.5px solid #e0e0e0' }}>
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px', fontWeight: '500' }}>DATOS DE PRODUCTO</div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Desarrollo</div>
          <select value={contacto.desarrollo || ''} onChange={e => upd('desarrollo', e.target.value)}
            style={{ width: '100%', padding: isMobile ? '10px' : '8px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px', background: '#fff' }}>
            <option value=''>Selecciona...</option>
            {desarrollos.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
          </select>
        </div>
        {campo('Presupuesto', 'presupuesto', 'dinero')}
        <div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Asesor de ventas</div>
          <select value={contacto.asesor_ventas || ''} onChange={e => upd('asesor_ventas', e.target.value)}
            style={{ width: '100%', padding: isMobile ? '10px' : '8px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px', background: '#fff' }}>
            <option value=''>Selecciona un asesor...</option>
            {agentes.map(a => <option key={a.id} value={`${a.nombre} ${a.apellidos}`.trim()}>{a.nombre} {a.apellidos}</option>)}
          </select>
        </div>
        {dropdownField('Fuente de medio', 'fuente_medio', MEDIO_OPCIONES)}
      </div>
    </div>
  );
}

function SeccionVenta({ isMobile, dropdownField }) {
  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: isMobile ? '1.25rem' : '1.5rem', marginBottom: '12px', border: '0.5px solid #e0e0e0' }}>
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px', fontWeight: '500' }}>DATOS DE VENTA</div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
        {dropdownField('Estatus', 'estatus', ESTATUS_OPCIONES)}
        {dropdownField('Tiempo de compra', 'tiempo_compra', TIEMPO_COMPRA_OPCIONES)}
        {dropdownField('Tipo de compra', 'tipo_compra', TIPO_COMPRA_OPCIONES)}
        {dropdownField('Razón de no compra', 'razon_no_compra', RAZON_NO_COMPRA)}
      </div>
    </div>
  );
}

// FIX: nueva sección — muestra el negocio ligado a este contacto (si existe)
// con su etapa actual y botones para moverla, igual que en Negocios.js.
// Si el contacto no tiene negocio todavía, ofrece crearlo con un click.
function SeccionNegocio({ isMobile, contacto, negocio, loadingNegocio, onCrearNegocio, onCambiarEtapa, creandoNegocio }) {
  const puede = usePuede();
  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: isMobile ? '1.25rem' : '1.5rem', marginBottom: '12px', border: '0.5px solid #e0e0e0' }}>
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px', fontWeight: '500' }}>NEGOCIO</div>
      {loadingNegocio ? (
        <div style={{ fontSize: '13px', color: '#aaa', padding: '0.5rem 0' }}>Cargando...</div>
      ) : !negocio ? (
        <div>
          <div style={{ fontSize: '13px', color: '#888', marginBottom: '12px' }}>
            Este contacto todavía no tiene un negocio en seguimiento.
          </div>
          {puede('negocios.crear') && <button onClick={onCrearNegocio} disabled={creandoNegocio} style={btnPrimary}>
            {creandoNegocio ? 'Creando...' : '+ Crear negocio'}
          </button>}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#1a1a2e' }}>{negocio.nombre}</div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: ETAPAS.find(e => e.id === negocio.etapa)?.color }}>{fmt(negocio.valor)}</div>
          </div>
          <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', marginBottom: '14px',
            background: ETAPAS.find(e => e.id === negocio.etapa)?.color + '20',
            color: ETAPAS.find(e => e.id === negocio.etapa)?.color }}>
            {negocio.etapa}
          </div>
          {puede('negocios.cambiar_etapa') && <><div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>MOVER A ETAPA</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {ETAPAS.filter(e => e.id !== negocio.etapa).map(e => (
              <button key={e.id} onClick={() => onCambiarEtapa(e.id)}
                style={{ padding: '6px 14px', borderRadius: '20px', border: `0.5px solid ${e.color}`, background: 'transparent', color: e.color, fontSize: '13px', cursor: 'pointer' }}>
                {e.id}
              </button>
            ))}
          </div></>}
        </div>
      )}
    </div>
  );
}

export default function DetalleContacto({ contactoId, onBack, miAgente, miRol }) {
  const isMobile = useIsMobile();
  const [contacto, setContacto] = useState(null);
  const [desarrollos, setDesarrollos] = useState([]);
  const [agentes, setAgentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  const [activeTab, setActiveTab] = useState('actividad');
  const [nota, setNota] = useState('');
  const [tarea, setTarea] = useState('');
  const [fechaTarea, setFechaTarea] = useState('');
  const [horaTarea, setHoraTarea] = useState('');
  const [notas, setNotas] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [actividad, setActividad] = useState([]);
  const [lada, setLada] = useState('+52');
  const [numeroTel, setNumeroTel] = useState('');
  const [seccionActiva, setSeccionActiva] = useState('personal'); // para móvil
  const [negocio, setNegocio] = useState(null);
  const [loadingNegocio, setLoadingNegocio] = useState(true);
  const [creandoNegocio, setCreandoNegocio] = useState(false);

  useEffect(() => {
    cargarContacto();
    cargarDesarrollos();
    cargarAgentes();
    cargarNotasYTareas();
    cargarNegocio();
  }, [contactoId]);

  const cargarContacto = async () => {
    setLoading(true);
    const { data } = await supabase.from('contactos').select('*').eq('id', contactoId).single();
    setContacto(data);
    const { lada: l, numero: n } = parseTelefono(data?.telefono);
    setLada(l); setNumeroTel(n);
    setLoading(false);
    if (data?.created_at) setActividad([{ texto: `Contacto ${data.nombres}: creado`, fecha: data.created_at?.slice(0, 10) }]);
  };

  const cargarNotasYTareas = async () => {
    const { data: notasData } = await supabase.from('contacto_notas').select('*').eq('contacto_id', contactoId).order('created_at', { ascending: false });
    setNotas(notasData || []);
    const { data: tareasData } = await supabase.from('contacto_tareas').select('*').eq('contacto_id', contactoId).order('created_at', { ascending: false });
    setTareas(tareasData || []);
    const { data: actData } = await supabase.from('contacto_actividad').select('*').eq('contacto_id', contactoId).order('created_at', { ascending: false });
    if (actData?.length > 0) setActividad(actData.map(a => ({ texto: a.texto, fecha: fmtFechaCorta(a.created_at) })));
  };

  const registrarActividad = async (texto) => {
    await supabase.from('contacto_actividad').insert([{ contacto_id: contactoId, texto, created_at: new Date().toISOString() }]);
    setActividad(prev => [{ texto, fecha: fechaHoraActual() }, ...prev]);
  };

  const cargarDesarrollos = async () => {
    const { data } = await supabase.from('desarrollos').select('id, nombre').eq('activo', true).order('nombre');
    setDesarrollos(data || []);
  };

  // FIX: se agrega 'correo' al select — se necesita para poder ligar el
  // negocio (asesor_correo) al elegir el asesor de ventas por nombre.
  const cargarAgentes = async () => {
    const { data } = await supabase.from('agentes').select('id, nombre, apellidos, correo').eq('activo', true).order('nombre');
    setAgentes(data || []);
  };

  // FIX: carga el negocio más reciente ligado a este contacto (si existe)
  const cargarNegocio = async () => {
    setLoadingNegocio(true);
    const { data } = await supabase.from('negocios').select('*').eq('contacto_id', contactoId).order('created_at', { ascending: false }).limit(1);
    setNegocio(data && data.length > 0 ? data[0] : null);
    setLoadingNegocio(false);
  };

  // FIX: solo Super Admin/Admin pueden editar los datos personales del contacto
  const puede = usePuede();
  const puedeEditarPersonal = puede('contactos.editar_datos_personales');
  const puedeEditarSeg = puede('contactos.editar_seguimiento');

  const handleGuardar = async () => {
    if (!puedeEditarSeg && !puedeEditarPersonal) return; // respaldo de seguridad
    setGuardando(true);
    const ladaReal = lada === '+1CA' ? '+1' : lada;
    // FIX: si el asesor marca el contacto como "No interesado", se libera
    // de inmediato (vigencia_activa = false) — igual que cuando se vence
    // por tiempo — para que otro asesor lo pueda retomar.
    const esNoInteresado = contacto.estatus === 'No interesado';
    const payload = { ...contacto, telefono: `${ladaReal} ${numeroTel}` };
    if (esNoInteresado) payload.vigencia_activa = false;
    const { error } = await supabase.from('contactos').update(payload).eq('id', contactoId);
    setGuardando(false);
    if (error) setMsg('Error al guardar');
    else {
      setMsg('Guardado correctamente');
      await registrarActividad(esNoInteresado ? 'Contacto marcado como No interesado' : 'Contacto actualizado');
      if (esNoInteresado) setContacto(c => ({ ...c, vigencia_activa: false }));
    }
    setTimeout(() => setMsg(''), 3000);
  };

  const handleAgregarNota = async () => {
    if (!puede('contactos.agregar_notas')) return;
    if (!nota.trim()) return;
    const texto = nota.trim();
    const { data, error } = await supabase.from('contacto_notas').insert([{ contacto_id: contactoId, texto, created_at: new Date().toISOString() }]).select().single();
    if (!error) {
      setNotas(prev => [data, ...prev]);
      await registrarActividad(`Nota agregada: "${texto}"`);
      const nuevaFecha = await reiniciarVigencia(contactoId);
      setContacto(c => ({ ...c, vigencia_activa: true, ultima_actividad: nuevaFecha }));
      setNota(''); setActiveTab('notas');
    }
  };

  const handleAgregarTarea = async () => {
    if (!puede('contactos.gestionar_tareas')) return;
    if (!tarea.trim()) return;
    const texto = tarea.trim();
    const payload = { contacto_id: contactoId, texto, completada: false, created_at: new Date().toISOString() };
    // FIX: fecha/hora son opcionales — si se capturan, se guarda también
    // el correo del asesor (para saber a quién avisarle) y arrancan los
    // avisos en false, para que el Edge Function "revisar-tareas" sepa
    // que todavía no le ha avisado a nadie de esta tarea.
    if (fechaTarea && horaTarea) {
      payload.fecha_hora = new Date(`${fechaTarea}T${horaTarea}`).toISOString();
      payload.agente_correo = miAgente?.correo || '';
      payload.aviso_5min_enviado = false;
      payload.aviso_hora_enviado = false;
    }
    const { data, error } = await supabase.from('contacto_tareas').insert([payload]).select().single();
    if (!error) {
      setTareas(prev => [data, ...prev]);
      await registrarActividad(`Tarea agregada: "${texto}"`);
      const nuevaFecha = await reiniciarVigencia(contactoId);
      setContacto(c => ({ ...c, vigencia_activa: true, ultima_actividad: nuevaFecha }));
      setTarea(''); setFechaTarea(''); setHoraTarea(''); setActiveTab('tareas');
    }
  };

  const handleToggleTarea = async (t) => {
    if (!puede('contactos.gestionar_tareas')) return;
    const nuevoEstado = !t.completada;
    await supabase.from('contacto_tareas').update({ completada: nuevoEstado }).eq('id', t.id);
    setTareas(prev => prev.map(x => x.id === t.id ? { ...x, completada: nuevoEstado } : x));
    await registrarActividad(`Tarea "${t.texto}" marcada como ${nuevoEstado ? 'completada' : 'pendiente'}`);
    const nuevaFecha = await reiniciarVigencia(contactoId);
    setContacto(c => ({ ...c, vigencia_activa: true, ultima_actividad: nuevaFecha }));
  };

  // FIX: crea un negocio nuevo ligado a este contacto, con los datos que
  // ya tiene el contacto (nombre, desarrollo, asesor). Etapa inicial: Cotización.
  const handleCrearNegocio = async () => {
    if (!puede('negocios.crear')) return;
    setCreandoNegocio(true);
    const agenteMatch = agentes.find(a => `${a.nombre} ${a.apellidos}`.trim() === contacto.asesor_ventas);
    const payload = {
      nombre: `${contacto.nombres} ${contacto.apellidos}`.trim(),
      contacto_id: contactoId,
      valor: 0,
      etapa: 'Cotización',
      desarrollo: contacto.desarrollo || null,
      asesor_ventas: contacto.asesor_ventas || '',
      asesor_correo: agenteMatch?.correo || '',
      creado_por: agenteMatch?.correo || miAgente?.correo || '',
    };
    const { data, error } = await supabase.from('negocios').insert([payload]).select().single();
    setCreandoNegocio(false);
    if (!error) {
      setNegocio(data);
      await registrarActividad('Negocio creado');
    }
  };

  const handleCambiarEtapaNegocio = async (nuevaEtapa) => {
    if (!puede('negocios.cambiar_etapa')) return;
    await supabase.from('negocios').update({ etapa: nuevaEtapa }).eq('id', negocio.id);
    setNegocio(prev => ({ ...prev, etapa: nuevaEtapa }));
    await registrarActividad(`Negocio movido a etapa: ${nuevaEtapa}`);
  };

  const upd = (key, valor) => setContacto(c => ({ ...c, [key]: valor }));

  const campo = (label, key, type = 'text', readOnly = false) => (
    <div key={key}>
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>{label}</div>
      {React.createElement(type === 'dinero' ? InputDinero : 'input', { type, value: contacto[key] || '', onChange: e => upd(key, e.target.value),
        readOnly,
        style: { width: '100%', padding: isMobile ? '10px' : '8px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px', boxSizing: 'border-box', background: readOnly ? '#f9f9f9' : '#fff', color: readOnly ? '#888' : '#000' } })}
    </div>
  );

  const dropdownField = (label, key, opciones) => (
    <div key={key}>
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>{label}</div>
      <select value={contacto[key] || ''} onChange={e => upd(key, e.target.value)}
        style={{ width: '100%', padding: isMobile ? '10px' : '8px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: isMobile ? '14px' : '13px', background: '#fff' }}>
        <option value=''>Elige una opción...</option>
        {opciones.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  if (loading) return <div style={{ padding: '2rem', color: '#888' }}>Cargando...</div>;
  if (!contacto) return <div style={{ padding: '2rem', color: '#888' }}>Contacto no encontrado</div>;

  return (
    <div style={{ padding: isMobile ? '0' : '2rem', background: '#f5f5f5', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ background: isMobile ? '#fff' : 'transparent', padding: isMobile ? '1rem' : '0', marginBottom: isMobile ? '0' : '1.5rem', borderBottom: isMobile ? '0.5px solid #f0f0f0' : 'none', position: isMobile ? 'sticky' : 'static', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: ACCENT, display: 'flex', alignItems: 'center', gap: '4px' }}>
            ← {isMobile ? 'Volver' : 'Volver a Contactos'}
          </button>
          {!isMobile && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setActiveTab('notas')} style={btnOutline}>+ Nota</button>
              <button onClick={() => setActiveTab('tareas')} style={btnOutline}>+ Tarea</button>
              {(puedeEditarSeg || puedeEditarPersonal) && <button onClick={handleGuardar} disabled={guardando} style={btnPrimary}>
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </button>}
            </div>
          )}
        </div>
        {!isMobile && (
          <div style={{ marginTop: '1rem' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>
              {contacto.nombres} {contacto.apellidos}
            </h2>
            <div style={{ fontSize: '13px', color: '#888' }}>{contacto.desarrollo || ''}</div>
          </div>
        )}
      </div>

      {/* Nombre en móvil */}
      {isMobile && (
        <div style={{ padding: '1rem', background: '#f5f5f5' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1a1a2e', marginBottom: '2px' }}>
            {contacto.nombres} {contacto.apellidos}
          </h2>
          <div style={{ fontSize: '13px', color: '#888' }}>{contacto.desarrollo || ''}</div>
        </div>
      )}

      {msg && (
        <div style={{ margin: isMobile ? '0 1rem 1rem' : '0 0 1rem', padding: '10px', borderRadius: '8px', background: msg.includes('Error') ? '#FCEBEB' : '#EAF3DE', color: msg.includes('Error') ? '#A32D2D' : '#27500A', fontSize: '13px' }}>
          {msg}
        </div>
      )}

      {/* Layout móvil: tabs para secciones */}
      {isMobile ? (
        <div style={{ padding: '0 1rem 1rem' }}>
          {/* Tabs de sección */}
          <div style={{ display: 'flex', background: '#fff', borderRadius: '10px', padding: '4px', marginBottom: '12px', border: '0.5px solid #e0e0e0', gap: '4px', overflowX: 'auto' }}>
            {[['personal', 'Personal'], ['producto', 'Producto'], ['venta', 'Venta'], ['negocio', 'Negocio'], ['actividad', 'Actividad']].map(([key, label]) => (
              <button key={key} onClick={() => setSeccionActiva(key)}
                style={{ flex: 1, padding: '8px 4px', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: seccionActiva === key ? '600' : '400', background: seccionActiva === key ? '#C0203A' : 'transparent', color: seccionActiva === key ? '#fff' : '#888', whiteSpace: 'nowrap' }}>
                {label}
              </button>
            ))}
          </div>

          {seccionActiva === 'personal' && (
            <SeccionPersonal isMobile={isMobile} contacto={contacto} upd={upd} campo={campo} lada={lada} setLada={setLada} numeroTel={numeroTel} setNumeroTel={setNumeroTel} editable={puedeEditarPersonal} />
          )}
          {seccionActiva === 'producto' && (
            <SeccionProducto isMobile={isMobile} contacto={contacto} upd={upd} campo={campo} dropdownField={dropdownField} desarrollos={desarrollos} agentes={agentes} />
          )}
          {seccionActiva === 'venta' && (
            <SeccionVenta isMobile={isMobile} dropdownField={dropdownField} />
          )}
          {seccionActiva === 'negocio' && (
            <SeccionNegocio isMobile={isMobile} contacto={contacto} negocio={negocio} loadingNegocio={loadingNegocio} onCrearNegocio={handleCrearNegocio} onCambiarEtapa={handleCambiarEtapaNegocio} creandoNegocio={creandoNegocio} />
          )}
          {seccionActiva === 'actividad' && (
            <PanelActividad
              isMobile={isMobile} activeTab={activeTab} setActiveTab={setActiveTab}
              actividad={actividad} notas={notas} tareas={tareas}
              nota={nota} setNota={setNota} tarea={tarea} setTarea={setTarea}
              fechaTarea={fechaTarea} setFechaTarea={setFechaTarea} horaTarea={horaTarea} setHoraTarea={setHoraTarea}
              handleAgregarNota={handleAgregarNota} handleAgregarTarea={handleAgregarTarea} handleToggleTarea={handleToggleTarea}
            />
          )}

          {/* Botón guardar fijo en móvil */}
          {seccionActiva !== 'actividad' && seccionActiva !== 'negocio' && (
            (puedeEditarSeg || puedeEditarPersonal) && <div style={{ position: 'sticky', bottom: '1rem', marginTop: '12px' }}>
              <button onClick={handleGuardar} disabled={guardando}
                style={{ ...btnPrimary, width: '100%', justifyContent: 'center', padding: '16px', fontSize: '15px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Layout desktop: 2 columnas */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '16px' }}>
          <div>
            <SeccionPersonal isMobile={isMobile} contacto={contacto} upd={upd} campo={campo} lada={lada} setLada={setLada} numeroTel={numeroTel} setNumeroTel={setNumeroTel} editable={puedeEditarPersonal} />
            <SeccionProducto isMobile={isMobile} contacto={contacto} upd={upd} campo={campo} dropdownField={dropdownField} desarrollos={desarrollos} agentes={agentes} />
            <SeccionVenta isMobile={isMobile} dropdownField={dropdownField} />
            <SeccionNegocio isMobile={isMobile} contacto={contacto} negocio={negocio} loadingNegocio={loadingNegocio} onCrearNegocio={handleCrearNegocio} onCambiarEtapa={handleCambiarEtapaNegocio} creandoNegocio={creandoNegocio} />
          </div>
          <PanelActividad
            isMobile={isMobile} activeTab={activeTab} setActiveTab={setActiveTab}
            actividad={actividad} notas={notas} tareas={tareas}
            nota={nota} setNota={setNota} tarea={tarea} setTarea={setTarea}
              fechaTarea={fechaTarea} setFechaTarea={setFechaTarea} horaTarea={horaTarea} setHoraTarea={setHoraTarea}
            handleAgregarNota={handleAgregarNota} handleAgregarTarea={handleAgregarTarea} handleToggleTarea={handleToggleTarea}
          />
        </div>
      )}
    </div>
  );
}