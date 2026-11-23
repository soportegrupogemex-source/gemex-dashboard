import React, { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { supabase } from './supabase';
import { usePuede, PermisosContext } from './PermisosContext';
import { InputDinero } from './dinero';
import { enviarPush } from './enviarPush';
import { descargarRequisicionPdf } from './requisicionPdf';
import { EMPRESA } from './empresa';
import { traerTodo, useIsMobile, fechaCorta, hoyISO, $, Modal, btn, inp, lbl, nombreFrente, etiquetaAgrupacion } from './ObraTorres';

// Requisiciones de obra — dos tipos, los dos ligados a las partidas del Programa:
//  1) Pedido de materiales: lo pide Construcción para poder ejecutar (cualquier categoría de partida de una etapa abierta).
//  2) Requisición de pago (formato de la hoja oficial): la hace Compras después de cotizar, a un proveedor que Compras dio de alta.
//     Cada línea se carga a una partida.
//     - Dentro del presupuesto de cada partida: no necesita autorización, pasa directo a "por pagar" (Tesorería paga con comprobante).
//     - Si rebasa el presupuesto de alguna partida: queda "por autorizar" y la autorizan un Super Admin Y el Gerente de Construcción;
//       al autorizarse sube el presupuesto de esa partida (y de la etapa).
const ESTATUS = {
  solicitada: { txt: 'Por autorizar', fondo: '#FFF4E5', color: '#B45309' },
  autorizada: { txt: 'Por pagar', fondo: '#EFF6FF', color: '#1D4ED8' },
  pagada: { txt: 'Pagada', fondo: '#EAF3DE', color: '#27500A' },
  rechazada: { txt: 'Rechazada', fondo: '#FDECEC', color: '#C0392B' },
};
const ESTATUS_PEDIDO = {
  solicitada: { txt: 'Por cotizar', fondo: '#FFF4E5', color: '#B45309' },
  en_compra: { txt: 'En compra', fondo: '#EFF6FF', color: '#1D4ED8' },
  surtida: { txt: 'Surtido', fondo: '#EAF3DE', color: '#27500A' },
  cancelada: { txt: 'Cancelado', fondo: '#f3f3f5', color: '#888' },
};
const FORMAS = { cheque: 'Cheque', transferencia: 'Transferencia', efectivo: 'Efectivo' };
const NOMBRE_CAT = { mano_obra: 'Mano de obra', materiales: 'Materiales', subcontratos: 'Subcontratos', maquinaria: 'Maquinaria', indirectos: 'Indirectos' };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const letrasTorres = (cargos) => {  // Torre X o Manzana X -> X
  const nombres = [...new Set(cargos.map(c => c.obra_torres || c.prog_frentes).filter(Boolean).map(t => nombreFrente(t)))];
  return nombres.map(n => (/^(?:torre|manzana)\s+([A-Za-zÁÉÍÓÚÑ]+)$/i.exec(n)?.[1] || n).toUpperCase()).join(nombres.every(n => /^(?:torre|manzana)\s+\S+$/i.test(n)) ? '' : ', ');
};

// Descarga el PDF (para imprimir) de cualquier requisición: trae líneas, reparto y quién autorizó.
async function descargarPdfDeRequisicion(reqBase) {
  try {
    const [r, l, c] = await Promise.all([
      supabase.from('obra_requisiciones').select('*, desarrollos(nombre, estructura)').eq('id', reqBase.id).single(),
      supabase.from('obra_requisicion_lineas').select('*').eq('requisicion_id', reqBase.id).order('orden'),
      supabase.from('obra_requisicion_cargos').select('*, obra_torres(nombre, torre), prog_frentes(nombre)').eq('requisicion_id', reqBase.id),
    ]);
    const req = r.data || reqBase;
    let autorizo = '';
    if (req.autorizada_por) {
      const { data } = await supabase.from('agentes').select('nombre').ilike('correo', req.autorizada_por).limit(1);
      autorizo = data?.[0]?.nombre || req.autorizada_por.split('@')[0];
    }
    await descargarRequisicionPdf({ req, lineas: l.data || [], torres: letrasTorres(c.data || []), etiquetaTorres: req.desarrollos?.estructura === 'Horizontal' ? 'MANZANAS' : 'TORRES', desarrollo: req.desarrollos?.nombre, autorizo });
  } catch (e) { alert('No se pudo generar el PDF: ' + (e.message || e)); }
}

// Encabezado con el logo de la empresa, como en el formato impreso.
function EncabezadoLogo({ folio, titulo = 'REQUISICIÓN DE PAGO' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingBottom: 10, marginBottom: 12, borderBottom: '0.5px solid #eee' }}>
      <img src={`${process.env.PUBLIC_URL}/${EMPRESA.logo}`} alt={EMPRESA.nombre} style={{ height: 36, width: 'auto' }} />
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', letterSpacing: 0.5 }}>{titulo}</div>
        {folio && <div style={{ fontSize: 11, color: '#888' }}>Folio {folio}</div>}
      </div>
    </div>
  );
}

function Chip({ e, tipo = 'pago' }) {
  const s = (tipo === 'pago' ? ESTATUS : ESTATUS_PEDIDO)[e] || ESTATUS.solicitada;
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: s.fondo, color: s.color, whiteSpace: 'nowrap' }}>{s.txt}</span>;
}

async function correosDeRoles(roles) {
  const { data } = await supabase.from('agentes').select('correo').in('rol', roles).eq('activo', true);
  return (data || []).map(a => a.correo).filter(Boolean);
}

// Partidas del Programa agrupadas como "Torre · Etapa · Categoría" (solo de etapas abiertas)
function gruposDePartidas(cat, { desarrolloId } = {}) {
  const grupos = [];
  cat.frentes.filter(f => !desarrolloId || f.desarrollo_id === desarrolloId).forEach(f => {
    cat.etapas.filter(e => e.frente_id === f.id && e.estatus === 'abierta').sort((a, b) => a.orden - b.orden).forEach(e => {
      Object.keys(NOMBRE_CAT).forEach(c => {
        const lista = cat.partidas.filter(p => p.etapa_id === e.id && p.categoria === c);
        if (lista.length) grupos.push({ clave: `${e.id}-${c}`, label: `${nombreFrente(f)} · ${e.nombre} · ${NOMBRE_CAT[c]}`, lista });
      });
    });
  });
  return grupos;
}

// -------------------------------------------------------------------- Proveedores
function ModalProveedor({ prov, onCerrar, onGuardado }) {
  const [f, setF] = useState({ nombre: prov?.nombre || '', rfc: prov?.rfc || '', contacto: prov?.contacto || '', telefono: prov?.telefono || '', correo: prov?.correo || '', notas: prov?.notas || '', activo: prov ? prov.activo : true });
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    if (!f.nombre.trim()) { alert('Escribe el nombre o razón social del proveedor.'); return; }
    setGuardando(true);
    const fila = { nombre: f.nombre.trim(), rfc: f.rfc.trim().toUpperCase() || null, contacto: f.contacto.trim() || null, telefono: f.telefono.trim() || null, correo: f.correo.trim() || null, notas: f.notas.trim() || null, activo: f.activo };
    let error;
    if (prov) ({ error } = await supabase.from('obra_proveedores').update(fila).eq('id', prov.id));
    else { const { data: { user } } = await supabase.auth.getUser(); ({ error } = await supabase.from('obra_proveedores').insert({ ...fila, creado_por: user?.email || null })); }
    setGuardando(false);
    if (error) { alert(error.message.includes('uk') || error.message.includes('duplicate') ? 'Ya existe un proveedor con ese nombre.' : 'No se pudo guardar: ' + error.message); return; }
    onGuardado();
  };
  const campo = (k, label, props = {}) => (
    <div style={{ marginBottom: 8 }}>
      <label style={lbl}>{label}</label>
      <input value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} {...props} style={{ ...inp, width: '100%', padding: '8px 10px' }} />
    </div>
  );
  return (
    <Modal titulo={prov ? 'Editar proveedor' : 'Nuevo proveedor'} onCerrar={onCerrar} ancho={460}>
      {campo('nombre', 'Nombre o razón social')}
      {campo('rfc', 'RFC')}
      {campo('contacto', 'Contacto')}
      {campo('telefono', 'Teléfono')}
      {campo('correo', 'Correo')}
      {campo('notas', 'Notas')}
      {prov && <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}><input type="checkbox" checked={f.activo} onChange={e => setF({ ...f, activo: e.target.checked })} /> Activo (aparece al hacer requisiciones)</label>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={onCerrar} style={{ ...btn, flex: 1 }}>Cancelar</button>
        <button onClick={guardar} disabled={guardando} style={{ ...btn, flex: 1, background: '#1a1a2e', color: '#fff', border: 'none' }}>{guardando ? 'Guardando...' : 'Guardar'}</button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ Pedido de materiales
function FormPedido({ cat, onCerrar, onCreado }) {
  const [frenteId, setFrenteId] = useState('');
  const [etapaId, setEtapaId] = useState('');
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState([{ partida_id: '', cantidad: '', nota: '' }]);
  const [guardando, setGuardando] = useState(false);
  const etapas = cat.etapas.filter(e => e.frente_id === frenteId && e.estatus === 'abierta').sort((a, b) => a.orden - b.orden);
  const grupos = useMemo(() => {
    const g = [];
    Object.keys(NOMBRE_CAT).forEach(c => { const lista = cat.partidas.filter(p => p.etapa_id === etapaId && p.categoria === c); if (lista.length) g.push({ clave: c, label: NOMBRE_CAT[c], lista }); });
    return g;
  }, [cat.partidas, etapaId]);
  const setLinea = (i, k, v) => setLineas(ls => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const enviar = async () => {
    if (!etapaId) { alert('Elige la torre y la etapa.'); return; }
    if (lineas.some(l => !l.partida_id || !(Number(l.cantidad) > 0))) { alert('Cada renglón necesita partida y cantidad.'); return; }
    setGuardando(true);
    const { data, error } = await supabase.rpc('req_materiales_crear', { p_etapa: etapaId, p_notas: notas, p_lineas: lineas.map(l => ({ partida_id: l.partida_id, cantidad: Number(l.cantidad), nota: l.nota })) });
    if (error) { alert('No se pudo enviar el pedido: ' + error.message); setGuardando(false); return; }
    const f = cat.frentes.find(x => x.id === frenteId);
    enviarPush({ correos: await correosDeRoles(['Compras']), title: `Pedido de materiales #${data.folio}`, body: `${f ? nombreFrente(f) : ''} · ${etapas.find(e => e.id === etapaId)?.nombre || ''} · ${lineas.length} ${lineas.length === 1 ? 'partida' : 'partidas'}`, url: '/' });
    onCreado(data);
  };
  const celda = { ...inp, width: '100%' };
  return (
    <Modal titulo="Nuevo pedido de materiales" onCerrar={onCerrar} ancho={760}>
      <EncabezadoLogo titulo="PEDIDO DE MATERIALES" />
      <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Lo que Construcción necesita para ejecutar. Compras lo cotiza y hace la requisición de pago. Solo aparecen etapas abiertas.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 10 }}>
        <div><label style={lbl}>Torre</label>
          <select value={frenteId} onChange={e => { setFrenteId(e.target.value); setEtapaId(''); setLineas([{ partida_id: '', cantidad: '', nota: '' }]); }} style={celda}>
            <option value="">Selecciona...</option>{cat.frentes.map(f => <option key={f.id} value={f.id}>{nombreFrente(f)}</option>)}
          </select></div>
        <div><label style={lbl}>Etapa</label>
          <select value={etapaId} onChange={e => { setEtapaId(e.target.value); setLineas([{ partida_id: '', cantidad: '', nota: '' }]); }} disabled={!frenteId} style={celda}>
            <option value="">{frenteId && etapas.length === 0 ? 'Sin etapas abiertas' : 'Selecciona...'}</option>{etapas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select></div>
      </div>
      {frenteId && etapas.length === 0 && <div style={{ fontSize: 12, color: '#B45309', marginBottom: 8 }}>Esta torre no tiene etapas abiertas. Se abren en Programa.</div>}
      <div style={{ fontSize: 13, fontWeight: 700, margin: '8px 0 6px' }}>Partidas que se piden</div>
      {lineas.map((l, i) => {
        const par = cat.partidas.find(x => x.id === l.partida_id);
        return (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <select value={l.partida_id} onChange={e => setLinea(i, 'partida_id', e.target.value)} disabled={!etapaId} style={{ ...inp, flex: '1 1 280px' }}>
              <option value="">Partida…</option>
              {grupos.map(g => <optgroup key={g.clave} label={g.label}>{g.lista.map(x => <option key={x.id} value={x.id}>{x.descripcion}{x.unidad ? ` (${x.unidad})` : ''}</option>)}</optgroup>)}
            </select>
            <input type="number" min="0" placeholder="Cantidad" value={l.cantidad} onChange={e => setLinea(i, 'cantidad', e.target.value)} style={{ ...inp, width: 100, textAlign: 'right' }} />
            <span style={{ fontSize: 11, color: '#888', minWidth: 120 }}>{par ? `Presupuestado: ${Number(par.cantidad)} ${par.unidad || ''}` : ''}</span>
            <input placeholder="Nota" value={l.nota} onChange={e => setLinea(i, 'nota', e.target.value)} style={{ ...inp, flex: '1 1 140px' }} />
            {lineas.length > 1 && <button onClick={() => setLineas(ls => ls.filter((_, j) => j !== i))} style={{ ...btn, padding: '0 6px', color: '#C0392B' }}>×</button>}
          </div>
        );
      })}
      <button onClick={() => setLineas(ls => [...ls, { partida_id: '', cantidad: '', nota: '' }])} disabled={!etapaId} style={btn}>+ Partida</button>
      <label style={{ ...lbl, marginTop: 12 }}>Notas para Compras</label>
      <input value={notas} onChange={e => setNotas(e.target.value)} style={{ ...celda, marginBottom: 12 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCerrar} style={{ ...btn, flex: 1 }}>Cancelar</button>
        <button onClick={enviar} disabled={guardando} style={{ ...btn, flex: 1, background: '#C0203A', color: '#fff', border: 'none' }}>{guardando ? 'Enviando...' : 'Enviar pedido'}</button>
      </div>
    </Modal>
  );
}

function DetallePedido({ pedido, cat, puedeCompras, puedePedir, miCorreo, onCerrar, onCambio, onCrearPago }) {
  const [lineas, setLineas] = useState(null);
  const [pagos, setPagos] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    (async () => {
      const [l, r] = await Promise.all([
        supabase.from('req_materiales_lineas').select('*').eq('pedido_id', pedido.id).order('id'),
        supabase.from('obra_requisiciones').select('id, folio, estatus, total, razon_social').eq('pedido_id', pedido.id).order('folio'),
      ]);
      setLineas(l.data || []); setPagos(r.data || []);
    })();
  }, [pedido.id]);
  const estatus = async (nuevo, txt) => {
    if (!window.confirm(txt)) return;
    setOcupado(true);
    const { error } = await supabase.rpc('req_materiales_estatus', { p_id: pedido.id, p_estatus: nuevo });
    setOcupado(false);
    if (error) { alert(error.message); return; }
    onCambio();
  };
  const esMio = (pedido.solicitante || '').toLowerCase() === (miCorreo || '').toLowerCase();
  const etapa = cat.etapas.find(e => e.id === pedido.etapa_id);
  return (
    <Modal titulo={`Pedido de materiales #${pedido.folio}`} onCerrar={onCerrar} ancho={720}>
      <EncabezadoLogo folio={pedido.folio} titulo="PEDIDO DE MATERIALES" />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <Chip e={pedido.estatus} tipo="pedido" /><span style={{ fontSize: 12, color: '#888' }}>{fechaCorta(pedido.fecha)} · pidió {(pedido.solicitante || '').split('@')[0]} · {pedido.prog_frentes ? nombreFrente(pedido.prog_frentes) : ''} · {etapa?.nombre}</span>
      </div>
      {lineas === null ? <div style={{ color: '#888', fontSize: 12 }}>Cargando...</div> : (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, marginBottom: 8 }}>
          <thead><tr style={{ textAlign: 'left', color: '#666', fontSize: 11 }}><th>Categoría</th><th>Partida</th><th>Proveedor</th><th style={{ textAlign: 'right' }}>Se pide</th><th style={{ textAlign: 'right' }}>Presupuestado</th><th>Nota</th></tr></thead>
          <tbody>{lineas.map(l => {
            const p = cat.partidas.find(x => x.id === l.partida_id);
            return (
              <tr key={l.id} style={{ borderTop: '0.5px solid #f0f0f0' }}>
                <td>{p ? NOMBRE_CAT[p.categoria] : ''}</td><td>{p?.descripcion}</td><td>{cat.proveedores.find(x => x.id === p?.proveedor_id)?.nombre || '—'}</td>
                <td style={{ textAlign: 'right' }}>{Number(l.cantidad)} {p?.unidad || ''}</td>
                <td style={{ textAlign: 'right' }}>{p ? `${Number(p.cantidad)} ${p.unidad || ''}` : ''}</td><td>{l.nota}</td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
      {pedido.notas && <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}><b>Notas:</b> {pedido.notas}</div>}
      {pagos.length > 0 && (
        <div style={{ fontSize: 12, marginBottom: 8 }}><b>Requisiciones de pago de este pedido:</b>{' '}
          {pagos.map(r => <span key={r.id} style={{ marginRight: 10 }}>#{r.folio} · {r.razon_social} · {$(r.total)} <Chip e={r.estatus} /></span>)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {puedeCompras && ['solicitada', 'en_compra'].includes(pedido.estatus) && lineas && <button onClick={() => onCrearPago(pedido, lineas)} style={{ ...btn, background: '#1a1a2e', color: '#fff', border: 'none' }}>Crear requisición de pago</button>}
        {puedeCompras && ['solicitada', 'en_compra'].includes(pedido.estatus) && <button onClick={() => estatus('surtida', '¿Marcar el pedido como surtido?')} disabled={ocupado} style={btn}>Marcar surtido</button>}
        {pedido.estatus === 'solicitada' && (esMio || puedeCompras || puedePedir) && <button onClick={() => estatus('cancelada', '¿Cancelar el pedido?')} disabled={ocupado} style={{ ...btn, color: '#C0392B' }}>Cancelar pedido</button>}
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------- Requisición de pago
function FormPago({ cat, desdePedido, onCerrar, onCreada }) {
  const desarrollos = useMemo(() => {
    const m = new Map();
    cat.frentes.forEach(f => { if (f.desarrollo_id && !m.has(f.desarrollo_id)) m.set(f.desarrollo_id, f.desarrollos?.nombre || 'Proyecto'); });
    return [...m].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [cat.frentes]);
  const desarrolloInicial = desdePedido ? cat.frentes.find(f => f.id === desdePedido.pedido.frente_id)?.desarrollo_id || '' : (desarrollos.length === 1 ? desarrollos[0].id : '');
  const provInicial = desdePedido ? (desdePedido.lineas.map(l => cat.partidas.find(x => x.id === l.partida_id)?.proveedor_id).find(Boolean) || '') : '';
  const [f, setF] = useState({ desarrollo_id: desarrolloInicial, proveedor_id: provInicial, semana: '', periodo: '', categoria: 'edificacion', etapa: '', ubicacion: '', fiscal: 'no', factura: '', forma_pago: 'cheque', concepto: '', observaciones: '' });
  const [lineas, setLineas] = useState(() => desdePedido
    ? desdePedido.lineas.map(l => { const p = cat.partidas.find(x => x.id === l.partida_id); return { partida_id: l.partida_id, referencia: '', concepto: p?.descripcion || '', cantidad: String(Number(l.cantidad)), unidad: p?.unidad || '', precio: '' }; })
    : [{ partida_id: '', referencia: '', concepto: '', cantidad: '1', unidad: '', precio: '' }]);
  const [guardando, setGuardando] = useState(false);
  const etiq = etiquetaAgrupacion(cat.frentes.find(x => x.desarrollo_id === f.desarrollo_id)?.desarrollos?.estructura);
  const grupos = useMemo(() => gruposDePartidas(cat, { desarrolloId: f.desarrollo_id }), [cat, f.desarrollo_id]);
  const proveedores = cat.proveedores.filter(p => p.activo || p.id === f.proveedor_id);

  const importe = (l) => r2((Number(l.cantidad) || 0) * (Number(l.precio) || 0));
  const subtotal = lineas.reduce((t, l) => t + importe(l), 0);
  const iva = f.fiscal === 'si' ? r2(subtotal * 0.16) : 0;
  const total = r2(subtotal + iva);
  const setLinea = (i, k, v) => setLineas(ls => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const elegirPartida = (i, id) => {
    const p = cat.partidas.find(x => x.id === id);
    setLineas(ls => ls.map((l, j) => (j === i ? { ...l, partida_id: id, concepto: l.concepto || p?.descripcion || '', unidad: l.unidad || p?.unidad || '' } : l)));
    if (p?.proveedor_id && !f.proveedor_id) setF(x => ({ ...x, proveedor_id: p.proveedor_id }));
  };

  // El reparto sale de las líneas: cada partida absorbe sus líneas (con su parte del IVA)
  const cargos = useMemo(() => {
    const m = new Map();
    let acum = 0;
    lineas.forEach((l) => {
      if (!l.partida_id) return;
      const v = r2(importe(l) * (f.fiscal === 'si' ? 1.16 : 1));
      m.set(l.partida_id, r2((m.get(l.partida_id) || 0) + v)); acum = r2(acum + v);
    });
    const ult = [...lineas].reverse().find(l => l.partida_id);
    if (ult && Math.abs(acum - total) > 0 && Math.abs(acum - total) < 0.1) m.set(ult.partida_id, r2(m.get(ult.partida_id) + (total - acum)));
    return [...m].map(([partida_id, monto]) => ({ partida_id, monto }));
  }, [lineas, f.fiscal, total]); // eslint-disable-line react-hooks/exhaustive-deps
  const analisis = cargos.map(c => {
    const p = cat.partidas.find(x => x.id === c.partida_id);
    const pres = (Number(p?.cantidad) || 0) * (Number(p?.precio) || 0) + (Number(p?.ampliado) || 0);
    const comp = cat.comprometido.get(c.partida_id) || 0;
    return { ...c, p, pres, comp, exceso: r2(comp + c.monto - pres) };
  });
  const rebasa = analisis.some(a => a.exceso > 0.005);

  const enviar = async () => {
    if (!f.desarrollo_id) { alert('Elige el proyecto.'); return; }
    if (!f.proveedor_id) { alert('Elige el proveedor (si no está, se da de alta en la sección Proveedores).'); return; }
    if (!f.concepto.trim()) { alert('Escribe el concepto.'); return; }
    if (lineas.some(l => !l.partida_id || !(Number(l.cantidad) > 0) || l.precio === '' || !(Number(l.precio) >= 0))) { alert('Cada línea necesita partida, cantidad y precio cotizado.'); return; }
    if (!(total > 0)) { alert('El total debe ser mayor a cero.'); return; }
    if (rebasa && !window.confirm('Esta requisición rebasa el presupuesto de al menos una partida. Quedará por autorizar y necesita la aprobación de un Super Admin y del Gerente de Construcción. ¿Enviarla?')) return;
    setGuardando(true);
    const { data, error } = await supabase.rpc('obra_crear_requisicion', {
      p_cab: { ...f, fiscal: f.fiscal === 'si', semana: f.semana === '' ? null : Number(f.semana), pedido_id: desdePedido?.pedido.id || null },
      p_lineas: lineas.map(l => ({ partida: cat.partidas.find(x => x.id === l.partida_id)?.descripcion || '', partida_id: l.partida_id, referencia: l.referencia, concepto: l.concepto, cantidad: Number(l.cantidad), unidad: l.unidad, precio_unitario: Number(l.precio) })),
      p_cargos: cargos,
    });
    if (error) { alert('No se pudo crear: ' + error.message); setGuardando(false); return; }
    const aviso = data.rebasa
      ? { roles: ['Gerente de Construcción', 'Super Admin'], title: `Requisición #${data.folio} rebasa el presupuesto`, body: `${data.razon_social} · ${$(data.total)} · necesita tu autorización` }
      : { roles: ['Tesorería'], title: `Requisición #${data.folio} por pagar`, body: `${data.razon_social} · ${$(data.total)} · dentro de presupuesto` };
    enviarPush({ correos: await correosDeRoles(aviso.roles), title: aviso.title, body: aviso.body, url: '/' });
    onCreada(data);
  };

  const celda = { ...inp, width: '100%' };
  return (
    <Modal titulo="Nueva requisición de pago" onCerrar={onCerrar} ancho={900}>
      <EncabezadoLogo />
      {desdePedido && <div style={{ fontSize: 12, color: '#1D4ED8', background: '#EFF6FF', padding: '6px 10px', borderRadius: 8, marginBottom: 10 }}>Armada desde el pedido de materiales #{desdePedido.pedido.folio}. Captura el precio cotizado de cada línea.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8, marginBottom: 10 }}>
        <div><label style={lbl}>Proyecto</label>
          <select value={f.desarrollo_id} onChange={e => { setF({ ...f, desarrollo_id: e.target.value }); setLineas(ls => ls.map(l => ({ ...l, partida_id: '' }))); }} disabled={!!desdePedido} style={celda}>
            <option value="">Selecciona...</option>{desarrollos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select></div>
        <div style={{ gridColumn: 'span 2' }}><label style={lbl}>Proveedor (a quién se paga)</label>
          <select value={f.proveedor_id} onChange={e => setF({ ...f, proveedor_id: e.target.value })} style={celda}>
            <option value="">{cat.proveedores.length === 0 ? 'No hay proveedores: Compras los da de alta en Proveedores' : 'Selecciona...'}</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.rfc ? ` · ${p.rfc}` : ''}</option>)}
          </select></div>
        <div><label style={lbl}>Categoría</label>
          <select value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })} style={celda}><option value="edificacion">Edificación</option><option value="indirectos">Indirectos</option></select></div>
        <div><label style={lbl}>Semana</label><input type="number" value={f.semana} onChange={e => setF({ ...f, semana: e.target.value })} style={celda} /></div>
        <div><label style={lbl}>Periodo</label><input value={f.periodo} onChange={e => setF({ ...f, periodo: e.target.value })} style={celda} /></div>
        <div><label style={lbl}>Etapa (opcional)</label><input value={f.etapa} onChange={e => setF({ ...f, etapa: e.target.value })} placeholder="Etapa 1" style={celda} /></div>
        <div><label style={lbl}>Ubicación</label><input value={f.ubicacion} onChange={e => setF({ ...f, ubicacion: e.target.value })} placeholder="Tlaquepaque" style={celda} /></div>
        <div><label style={lbl}>Fiscal</label>
          <select value={f.fiscal} onChange={e => setF({ ...f, fiscal: e.target.value })} style={celda}><option value="no">No</option><option value="si">Sí (IVA 16%)</option></select></div>
        <div><label style={lbl}>Nº de factura</label><input value={f.factura} onChange={e => setF({ ...f, factura: e.target.value })} placeholder="Pendiente" style={celda} /></div>
        <div><label style={lbl}>Forma de pago</label>
          <select value={f.forma_pago} onChange={e => setF({ ...f, forma_pago: e.target.value })} style={celda}>{Object.entries(FORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div style={{ gridColumn: 'span 2' }}><label style={lbl}>Concepto</label><input value={f.concepto} onChange={e => setF({ ...f, concepto: e.target.value })} placeholder="Puertas, pastas MO, gasolina…" style={celda} /></div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, margin: '12px 0 2px' }}>Líneas cotizadas</div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>{`Cada línea se carga a una partida del Programa (solo de etapas abiertas). Una misma requisición puede cubrir varias ${etiq.toLowerCase()}s.`}</div>
      {!f.desarrollo_id ? <div style={{ fontSize: 12, color: '#888' }}>Elige primero el proyecto.</div> : grupos.length === 0 ? <div style={{ fontSize: 12, color: '#B45309' }}>Este proyecto no tiene etapas abiertas con partidas. Se abren en Programa.</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820 }}>
            <thead><tr style={{ fontSize: 11, color: '#666', textAlign: 'left' }}>
              <th style={{ padding: '2px 4px', minWidth: 230 }}>Partida del Programa</th><th>Referencia</th><th>Concepto</th><th style={{ width: 70 }}>Cantidad</th><th style={{ width: 70 }}>Unidad</th><th style={{ width: 110 }}>P.U. cotizado</th><th style={{ width: 100, textAlign: 'right' }}>Importe</th><th style={{ width: 24 }} />
            </tr></thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={i}>
                  <td style={{ padding: 2 }}>
                    <select value={l.partida_id} onChange={e => elegirPartida(i, e.target.value)} style={celda}>
                      <option value="">Selecciona...</option>
                      {grupos.map(g => <optgroup key={g.clave} label={g.label}>{g.lista.map(x => <option key={x.id} value={x.id}>{x.descripcion}</option>)}</optgroup>)}
                    </select></td>
                  <td style={{ padding: 2 }}><input value={l.referencia} onChange={e => setLinea(i, 'referencia', e.target.value)} placeholder="Cotización" style={celda} /></td>
                  <td style={{ padding: 2 }}><input value={l.concepto} onChange={e => setLinea(i, 'concepto', e.target.value)} style={celda} /></td>
                  <td style={{ padding: 2 }}><input type="number" value={l.cantidad} onChange={e => setLinea(i, 'cantidad', e.target.value)} style={{ ...celda, textAlign: 'right' }} /></td>
                  <td style={{ padding: 2 }}><input value={l.unidad} onChange={e => setLinea(i, 'unidad', e.target.value.toUpperCase())} style={celda} /></td>
                  <td style={{ padding: 2 }}><InputDinero value={l.precio} onChange={e => setLinea(i, 'precio', e.target.value)} style={{ ...celda, textAlign: 'right' }} /></td>
                  <td style={{ padding: 2, textAlign: 'right', fontSize: 12 }}>{$(importe(l))}</td>
                  <td>{lineas.length > 1 && <button onClick={() => setLineas(ls => ls.filter((_, j) => j !== i))} style={{ ...btn, padding: '0 6px', color: '#C0392B' }}>×</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
        <button onClick={() => setLineas(ls => [...ls, { partida_id: '', referencia: '', concepto: '', cantidad: '1', unidad: '', precio: '' }])} style={btn}>+ Línea</button>
        <div style={{ fontSize: 12, textAlign: 'right', lineHeight: 1.7 }}>
          <div>Subtotal <b>{$(subtotal)}</b></div>
          <div>IVA <b>{f.fiscal === 'si' ? $(iva) : '—'}</b></div>
          <div style={{ fontSize: 14 }}>Total <b>{$(total)}</b></div>
        </div>
      </div>

      {analisis.length > 0 && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: rebasa ? '#FFF4E5' : '#F2F8EC', border: `0.5px solid ${rebasa ? '#F5D9A8' : '#CFE3BE'}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: rebasa ? '#B45309' : '#27500A', marginBottom: 4 }}>
            {rebasa ? 'Rebasa el presupuesto: necesitará la autorización de un Super Admin y del Gerente de Construcción' : 'Dentro del presupuesto: pasa directo a Tesorería, sin autorización'}
          </div>
          {analisis.map(a => (
            <div key={a.partida_id} style={{ fontSize: 11, color: '#555', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 240px' }}>{a.p?.descripcion}</span>
              <span>presupuesto {$(a.pres)}</span><span>ya cargado {$(a.comp)}</span><span>esta requisición {$(a.monto)}</span>
              <b style={{ color: a.exceso > 0.005 ? '#C0392B' : '#27500A' }}>{a.exceso > 0.005 ? `rebasa ${$(a.exceso)}` : `quedan ${$(-a.exceso)}`}</b>
            </div>
          ))}
        </div>
      )}

      <label style={{ ...lbl, marginTop: 12 }}>Observaciones</label>
      <input value={f.observaciones} onChange={e => setF({ ...f, observaciones: e.target.value })} style={{ ...celda, marginBottom: 12 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCerrar} style={{ ...btn, flex: 1 }}>Cancelar</button>
        <button onClick={enviar} disabled={guardando} style={{ ...btn, flex: 1, background: '#C0203A', color: '#fff', border: 'none' }}>{guardando ? 'Enviando...' : 'Crear requisición'}</button>
      </div>
    </Modal>
  );
}

function DetalleRequisicion({ req, puedeAutorizarRebasa, puedePagar, miCorreo, miRol, onCerrar, onCambio }) {
  const [lineas, setLineas] = useState(null);
  const [cargos, setCargos] = useState([]);
  const [fecha, setFecha] = useState(hoyISO());
  const [archivo, setArchivo] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [autorizo, setAutorizo] = useState('');

  useEffect(() => {
    (async () => {
      const [l, c] = await Promise.all([
        supabase.from('obra_requisicion_lineas').select('*').eq('requisicion_id', req.id).order('orden'),
        supabase.from('obra_requisicion_cargos').select('*, obra_torres(nombre, torre), prog_frentes(nombre), prog_partidas(descripcion, categoria, prog_etapas(nombre)), obra_conceptos(descripcion, categoria), obra_contratos(concepto, obra_contratistas(nombre))').eq('requisicion_id', req.id),
      ]);
      setLineas(l.data || []); setCargos(c.data || []);
      if (req.autorizada_por) {
        const { data } = await supabase.from('agentes').select('nombre').ilike('correo', req.autorizada_por).limit(1);
        setAutorizo(data?.[0]?.nombre || req.autorizada_por.split('@')[0]);
      }
    })();
  }, [req.id, req.autorizada_por]);

  const solicitanteCorreo = (req.solicitante || '').toLowerCase();
  const rpc = async (nombre, args, mensajeError) => {
    setOcupado(true);
    const { data, error } = await supabase.rpc(nombre, args);
    setOcupado(false);
    if (error) { alert(mensajeError + ': ' + error.message); return null; }
    return data;
  };
  const autorizar = async () => {
    if (!window.confirm(`¿Autorizar que la requisición #${req.folio} rebase el presupuesto por ${$((req.rebasa_detalle || []).reduce((t, d) => t + Number(d.exceso || 0), 0))}?`)) return;
    const r = await rpc('req_autorizar_rebasa', { p_id: req.id, p_autorizar: true, p_motivo: null }, 'No se pudo autorizar');
    if (!r) return;
    if (r.estatus === 'autorizada') enviarPush({ correos: [...await correosDeRoles(['Tesorería']), solicitanteCorreo].filter(Boolean), title: `Requisición #${req.folio} autorizada`, body: `${req.razon_social} · ${$(req.total)} · lista para pagar`, url: '/' });
    else enviarPush({ correos: await correosDeRoles(miRol === 'Super Admin' ? ['Gerente de Construcción'] : ['Super Admin']), title: `Requisición #${req.folio} espera tu autorización`, body: `${req.razon_social} · ${$(req.total)} · rebasa el presupuesto`, url: '/' });
    onCambio();
  };
  const rechazar = async () => {
    const motivo = window.prompt('Motivo del rechazo:', '');
    if (!motivo || !motivo.trim()) return;
    if (await rpc('req_autorizar_rebasa', { p_id: req.id, p_autorizar: false, p_motivo: motivo }, 'No se pudo rechazar')) {
      enviarPush({ correos: [solicitanteCorreo].filter(Boolean), title: `Requisición #${req.folio} rechazada`, body: motivo.trim(), url: '/' });
      onCambio();
    }
  };
  const pagar = async () => {
    if (!archivo) { alert('Sube el comprobante de pago.'); return; }
    setOcupado(true);
    const path = `requisiciones/${req.folio}/${Date.now()}-${archivo.name.replace(/[^A-Za-z0-9._-]+/g, '_')}`;
    const { error: eu } = await supabase.storage.from('obra').upload(path, archivo);
    if (eu) { alert('No se pudo subir el comprobante: ' + eu.message); setOcupado(false); return; }
    const { error } = await supabase.rpc('obra_pagar_requisicion', { p_id: req.id, p_fecha: fecha, p_comprobante: path });
    setOcupado(false);
    if (error) { await supabase.storage.from('obra').remove([path]); alert('No se pudo registrar el pago: ' + error.message); return; }
    enviarPush({ correos: [solicitanteCorreo].filter(Boolean), title: `Requisición #${req.folio} pagada`, body: `${req.razon_social} · ${$(req.total)}`, url: '/' });
    onCambio();
  };
  const eliminar = async () => {
    if (!window.confirm(`¿Eliminar la requisición #${req.folio}?`)) return;
    if (await rpc('obra_eliminar_requisicion', { p_id: req.id }, 'No se pudo eliminar') !== null) onCambio();
  };
  const verComprobante = async () => {
    const { data } = await supabase.storage.from('obra').createSignedUrl(req.comprobante_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };
  const pdf = () => descargarRequisicionPdf({ req, lineas: lineas || [], torres: letrasTorres(cargos), etiquetaTorres: req.desarrollos?.estructura === 'Horizontal' ? 'MANZANAS' : 'TORRES', desarrollo: req.desarrollos?.nombre, autorizo });

  const nombreDe = (correo) => (correo || '').split('@')[0];
  const yaAutorice = miRol === 'Super Admin' ? !!req.aut_super_por : !!req.aut_gerente_por;
  const dato = (k, v) => v ? <div style={{ minWidth: 150 }}><div style={{ fontSize: 10, color: '#888' }}>{k}</div><div style={{ fontSize: 12, fontWeight: 600 }}>{v}</div></div> : null;
  return (
    <Modal titulo={`Requisición #${req.folio}`} onCerrar={onCerrar} ancho={780}>
      <EncabezadoLogo folio={req.folio} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <Chip e={req.estatus} />{req.rebasa && <span style={{ fontSize: 10, color: '#B45309', background: '#FFF4E5', padding: '2px 8px', borderRadius: 20 }}>Rebasó el presupuesto</span>}
        <span style={{ fontSize: 12, color: '#888' }}>{fechaCorta(req.fecha)} · hizo {nombreDe(req.solicitante)}</span>
        <button onClick={pdf} disabled={!lineas} style={{ ...btn, marginLeft: 'auto', fontWeight: 600 }}>Descargar PDF para imprimir</button>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        {dato('Proyecto', req.desarrollos?.nombre)}{dato(req.desarrollos?.estructura === 'Horizontal' ? 'Manzanas' : 'Torres', letrasTorres(cargos))}{dato('Categoría', req.categoria === 'indirectos' ? 'Indirectos' : 'Edificación')}
        {dato('Semana', req.semana)}{dato('Periodo', req.periodo)}{dato('Etapa', req.etapa)}{dato('Ubicación', req.ubicacion)}
        {dato('Fiscal', req.fiscal ? 'Sí' : 'No')}{dato('Nº factura', req.factura || 'Pendiente')}{dato('Forma de pago', FORMAS[req.forma_pago])}
        {dato('Proveedor', req.razon_social)}{dato('Concepto', req.concepto)}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Líneas</div>
      {lineas === null ? <div style={{ color: '#888', fontSize: 12 }}>Cargando...</div> : (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, marginBottom: 6 }}>
          <thead><tr style={{ textAlign: 'left', color: '#666', fontSize: 11 }}><th>Partida</th><th>Referencia</th><th>Concepto</th><th style={{ textAlign: 'right' }}>Cant.</th><th>Unidad</th><th style={{ textAlign: 'right' }}>P.U.</th><th style={{ textAlign: 'right' }}>Importe</th></tr></thead>
          <tbody>{lineas.map(l => (
            <tr key={l.id} style={{ borderTop: '0.5px solid #f0f0f0' }}><td>{l.partida}</td><td>{l.referencia}</td><td>{l.concepto}</td><td style={{ textAlign: 'right' }}>{Number(l.cantidad)}</td><td>{l.unidad}</td><td style={{ textAlign: 'right' }}>{$(l.precio_unitario)}</td><td style={{ textAlign: 'right' }}>{$(l.importe)}</td></tr>
          ))}</tbody>
        </table>
      )}
      <div style={{ textAlign: 'right', fontSize: 12, lineHeight: 1.7, marginBottom: 10 }}>
        Subtotal <b>{$(req.subtotal)}</b>{req.fiscal && <> · IVA <b>{$(req.iva)}</b></>} · Total <b style={{ fontSize: 14 }}>{$(req.total)}</b>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Se carga a</div>
      {cargos.map(c => (
        <div key={c.id} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '3px 0', borderTop: '0.5px solid #f3f3f3', flexWrap: 'wrap' }}>
          <b style={{ width: 90 }}>{c.prog_frentes ? nombreFrente(c.prog_frentes) : c.obra_torres ? nombreFrente(c.obra_torres) : ''}</b>
          <span style={{ flex: 1, color: '#555' }}>{c.prog_partidas ? `${c.prog_partidas.prog_etapas?.nombre || ''} · ${NOMBRE_CAT[c.prog_partidas.categoria]} · ${c.prog_partidas.descripcion}` : c.obra_conceptos ? `${NOMBRE_CAT[c.obra_conceptos.categoria]} · ${c.obra_conceptos.descripcion}` : `Mano de obra · ${c.obra_contratos?.obra_contratistas?.nombre || ''}`}</span>
          <b>{$(c.monto)}</b>
        </div>
      ))}
      {req.observaciones && <div style={{ fontSize: 12, color: '#555', marginTop: 8 }}><b>Observaciones:</b> {req.observaciones}</div>}

      {req.rebasa && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: '#FFF4E5', border: '0.5px solid #F5D9A8' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#B45309', marginBottom: 4 }}>Rebasa el presupuesto de estas partidas</div>
          {(req.rebasa_detalle || []).map((d, i) => (
            <div key={i} style={{ fontSize: 11, color: '#555', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 220px' }}>{d.etapa} · {d.descripcion}</span><span>presupuesto {$(d.presupuesto)}</span><span>ya cargado {$(d.comprometido)}</span><span>esta requisición {$(d.solicitado)}</span><b style={{ color: '#C0392B' }}>rebasa {$(d.exceso)}</b>
            </div>
          ))}
          <div style={{ fontSize: 12, marginTop: 8 }}>
            Gerente de Construcción: <b>{req.aut_gerente_por ? `autorizó (${nombreDe(req.aut_gerente_por)})` : 'pendiente'}</b>{' · '}
            Super Admin: <b>{req.aut_super_por ? `autorizó (${nombreDe(req.aut_super_por)})` : 'pendiente'}</b>
          </div>
          <div style={{ fontSize: 11, color: '#888' }}>Se necesitan las dos autorizaciones. Al completarse, sube el presupuesto de esas partidas y la requisición pasa a pagar.</div>
        </div>
      )}
      {req.estatus === 'rechazada' && <div style={{ fontSize: 12, color: '#C0392B', marginTop: 8 }}><b>Rechazada por {nombreDe(req.autorizada_por)}:</b> {req.rechazo_motivo}</div>}
      {req.autorizada_por && req.estatus !== 'rechazada' && <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>Autorizada: {req.autorizada_por}</div>}
      {req.estatus === 'pagada' && (
        <div style={{ fontSize: 12, marginTop: 6 }}>Pagada el {fechaCorta(req.fecha_pago)} por {nombreDe(req.pagada_por)}. <button onClick={verComprobante} style={{ ...btn, padding: '2px 8px', color: '#3B82F6' }}>Comprobante</button></div>
      )}

      {req.estatus === 'solicitada' && req.rebasa && puedeAutorizarRebasa && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={rechazar} disabled={ocupado} style={{ ...btn, flex: 1, color: '#C0392B' }}>Rechazar</button>
          <button onClick={autorizar} disabled={ocupado || yaAutorice} style={{ ...btn, flex: 1, background: '#1a1a2e', color: '#fff', border: 'none', opacity: yaAutorice ? 0.5 : 1 }}>{yaAutorice ? 'Ya autorizaste' : 'Autorizar'}</button>
        </div>
      )}
      {req.estatus === 'autorizada' && puedePagar && (
        <div style={{ marginTop: 14, padding: 10, background: '#f7f7f9', borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Registrar pago</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp} />
            <input type="file" accept="image/*,application/pdf" onChange={e => setArchivo(e.target.files?.[0] || null)} style={{ fontSize: 12 }} />
            <button onClick={pagar} disabled={ocupado} style={{ ...btn, background: '#1a1a2e', color: '#fff', border: 'none', marginLeft: 'auto' }}>{ocupado ? 'Registrando...' : 'Registrar pago'}</button>
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Al registrar el pago queda como pagado en cada partida y en la etapa del Programa.</div>
        </div>
      )}
      {req.estatus !== 'pagada' && solicitanteCorreo === (miCorreo || '').toLowerCase() && (
        <button onClick={eliminar} disabled={ocupado} style={{ ...btn, color: '#C0392B', marginTop: 10 }}>Eliminar requisición</button>
      )}
    </Modal>
  );
}

// -------------------------------------------------------------------- Página
export default function ObraRequisiciones() {
  const puede = usePuede();
  const { rol: miRol } = useContext(PermisosContext);
  const puedePedir = puede('construccion.req_materiales_solicitar');
  const puedeCompras = puede('construccion.solicitar_requisiciones');
  const puedeAutorizarRebasa = puede('construccion.req_autorizar_rebasa');
  const puedePagar = puede('construccion.registrar_pagos_obra');
  const isMobile = useIsMobile();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [reqs, setReqs] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [cargosPorReq, setCargosPorReq] = useState(new Map());
  const [cat, setCat] = useState({ frentes: [], etapas: [], partidas: [], comprometido: new Map(), proveedores: [] });
  const [seccion, setSeccion] = useState(puedePedir && !puedeCompras ? 'pedidos' : 'pagos');
  const [tab, setTab] = useState('pendientes');
  const [tabPedido, setTabPedido] = useState('abiertos');
  const [busca, setBusca] = useState('');
  const [abierta, setAbierta] = useState(null);
  const [pedidoAbierto, setPedidoAbierto] = useState(null);
  const [nueva, setNueva] = useState(null); // null | { desdePedido? }
  const [nuevoPedido, setNuevoPedido] = useState(false);
  const [provModal, setProvModal] = useState(null); // null | {} (nuevo) | proveedor (editar)
  const [miCorreo, setMiCorreo] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const [rs, cg, frentes, etapas, partidas, cargosProg, peds, proveedores, { data: { user } }] = await Promise.all([
        traerTodo(() => supabase.from('obra_requisiciones').select('*, desarrollos(nombre, estructura)').order('folio', { ascending: false })),
        traerTodo(() => supabase.from('obra_requisicion_cargos').select('requisicion_id, obra_torres(nombre, torre), prog_frentes(nombre)').order('id')),
        traerTodo(() => supabase.from('prog_frentes').select('id, desarrollo_id, nombre, desarrollos(nombre, estructura)').order('created_at')),
        traerTodo(() => supabase.from('prog_etapas').select('id, frente_id, nombre, estatus, orden').order('orden')),
        traerTodo(() => supabase.from('prog_partidas').select('id, etapa_id, categoria, descripcion, unidad, cantidad, precio, ampliado, proveedor_id, orden').order('orden')),
        traerTodo(() => supabase.from('obra_requisicion_cargos').select('prog_partida_id, monto, obra_requisiciones!inner(estatus)').not('prog_partida_id', 'is', null).order('id')),
        traerTodo(() => supabase.from('req_materiales').select('*, prog_frentes(nombre)').order('folio', { ascending: false })),
        traerTodo(() => supabase.from('obra_proveedores').select('*').order('nombre')),
        supabase.auth.getUser(),
      ]);
      setReqs(rs); setPedidos(peds);
      const m = new Map(); cg.forEach(c => { if (!m.has(c.requisicion_id)) m.set(c.requisicion_id, []); m.get(c.requisicion_id).push(c); }); setCargosPorReq(m);
      const comprometido = new Map();
      cargosProg.forEach(k => { if (['solicitada', 'autorizada', 'pagada'].includes(k.obra_requisiciones?.estatus)) comprometido.set(k.prog_partida_id, (comprometido.get(k.prog_partida_id) || 0) + Number(k.monto || 0)); });
      setCat({ frentes, etapas, partidas, comprometido, proveedores });
      setMiCorreo(user?.email || '');
    } catch (e) { setError(e.message || String(e)); }
    setCargando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const cuenta = (e) => reqs.filter(r => r.estatus === e).length;
  const tabs = [['pendientes', 'Por autorizar', cuenta('solicitada')], ['porpagar', 'Por pagar', cuenta('autorizada')], ['pagadas', 'Pagadas', cuenta('pagada')], ['rechazadas', 'Rechazadas', cuenta('rechazada')], ['todas', 'Todas', reqs.length]];
  const filtro = { pendientes: 'solicitada', porpagar: 'autorizada', pagadas: 'pagada', rechazadas: 'rechazada' }[tab];
  const q = busca.trim().toLowerCase();
  const lista = reqs.filter(r => (!filtro || r.estatus === filtro) && (!q || `${r.folio} ${r.razon_social} ${r.concepto} ${r.desarrollos?.nombre || ''}`.toLowerCase().includes(q)));
  const abiertaActual = abierta ? reqs.find(r => r.id === abierta) : null;

  const tabsPedido = [['abiertos', 'Abiertos', pedidos.filter(p => ['solicitada', 'en_compra'].includes(p.estatus)).length], ['surtidos', 'Surtidos', pedidos.filter(p => p.estatus === 'surtida').length], ['cancelados', 'Cancelados', pedidos.filter(p => p.estatus === 'cancelada').length], ['todos', 'Todos', pedidos.length]];
  const listaPedidos = pedidos.filter(p => (tabPedido === 'todos' || (tabPedido === 'abiertos' && ['solicitada', 'en_compra'].includes(p.estatus)) || (tabPedido === 'surtidos' && p.estatus === 'surtida') || (tabPedido === 'cancelados' && p.estatus === 'cancelada'))
    && (!q || `${p.folio} ${p.prog_frentes?.nombre || ''} ${p.notas || ''}`.toLowerCase().includes(q)));
  const pedidoActual = pedidoAbierto ? pedidos.find(p => p.id === pedidoAbierto) : null;
  const listaProv = cat.proveedores.filter(p => !q || `${p.nombre} ${p.rfc || ''} ${p.contacto || ''}`.toLowerCase().includes(q));

  const estiloTab = (activo) => ({ padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', fontWeight: activo ? 600 : 400, color: activo ? '#1a1a2e' : '#888', borderBottom: activo ? '2px solid #1a1a2e' : '2px solid transparent' });
  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Requisiciones</h2>
          <div style={{ fontSize: '12px', color: '#888' }}>Construcción pide los materiales; Compras cotiza y hace la requisición de pago a un proveedor. Dentro del presupuesto paga Tesorería directo; si rebasa una partida la autorizan un Super Admin y el Gerente de Construcción.</div>
        </div>
        {seccion === 'pedidos' && puedePedir && <button onClick={() => setNuevoPedido(true)} style={{ ...btn, background: '#C0203A', color: '#fff', border: 'none' }}>+ Nuevo pedido de materiales</button>}
        {seccion === 'pagos' && puedeCompras && <button onClick={() => setNueva({})} style={{ ...btn, background: '#C0203A', color: '#fff', border: 'none' }}>+ Nueva requisición de pago</button>}
        {seccion === 'proveedores' && puedeCompras && <button onClick={() => setProvModal({})} style={{ ...btn, background: '#C0203A', color: '#fff', border: 'none' }}>+ Nuevo proveedor</button>}
      </div>
      {error && <div style={{ padding: '10px 14px', background: '#FDECEC', color: '#C0392B', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>No se pudo cargar: {error}</div>}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {[['pedidos', 'Pedidos de materiales'], ['pagos', 'Requisiciones de pago'], ['proveedores', 'Proveedores']].map(([k, l]) => (
          <button key={k} onClick={() => setSeccion(k)} style={{ ...btn, padding: '7px 14px', background: seccion === k ? '#1a1a2e' : '#fff', color: seccion === k ? '#fff' : '#555', border: seccion === k ? 'none' : btn.border }}>{l}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e0e0e0', marginBottom: 12, overflowX: 'auto', alignItems: 'center' }}>
        {seccion === 'pagos' && tabs.map(([k, l, n]) => <button key={k} onClick={() => setTab(k)} style={estiloTab(tab === k)}>{l} <span style={{ color: '#aaa', fontWeight: 400 }}>{n}</span></button>)}
        {seccion === 'pedidos' && tabsPedido.map(([k, l, n]) => <button key={k} onClick={() => setTabPedido(k)} style={estiloTab(tabPedido === k)}>{l} <span style={{ color: '#aaa', fontWeight: 400 }}>{n}</span></button>)}
        {seccion === 'proveedores' && <span style={{ ...estiloTab(true), cursor: 'default' }}>{cat.proveedores.length} {cat.proveedores.length === 1 ? 'proveedor' : 'proveedores'}</span>}
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar…" style={{ ...inp, marginLeft: 'auto', width: 200, marginBottom: 4 }} />
      </div>

      {cargando ? <div style={{ color: '#888', fontSize: 13 }}>Cargando...</div> : seccion === 'pagos' ? (
        lista.length === 0 ? <div style={{ color: '#888', fontSize: 13 }}>No hay requisiciones de pago en esta vista.</div> : (
          <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, overflow: 'hidden' }}>
            {lista.map((r, i) => (
              <div key={r.id} onClick={() => setAbierta(r.id)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', cursor: 'pointer', flexWrap: 'wrap', borderTop: i ? '0.5px solid #f0f0f0' : 'none' }}>
                <b style={{ width: 44, fontSize: 13 }}>#{r.folio}</b>
                <span style={{ width: 56, fontSize: 12, color: '#888' }}>{fechaCorta(r.fecha)}</span>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.razon_social}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{r.concepto} · {r.desarrollos?.nombre}{(cargosPorReq.get(r.id) || []).length > 0 ? ` · ${r.desarrollos?.estructura === 'Horizontal' ? 'Manzanas' : 'Torres'} ${letrasTorres(cargosPorReq.get(r.id))}` : ''}</div>
                </div>
                {r.rebasa && <span style={{ fontSize: 10, color: '#B45309', background: '#FFF4E5', padding: '2px 8px', borderRadius: 20 }}>Rebasa</span>}
                {r.fiscal ? <span style={{ fontSize: 10, color: '#3B82F6', background: '#EFF6FF', padding: '2px 8px', borderRadius: 20 }}>Fiscal</span> : <span style={{ fontSize: 10, color: '#888', background: '#f3f3f5', padding: '2px 8px', borderRadius: 20 }}>No fiscal</span>}
                <b style={{ width: 110, textAlign: 'right', fontSize: 13 }}>{$(r.total)}</b>
                <Chip e={r.estatus} />
                <button title="Descargar PDF para imprimir" onClick={(e) => { e.stopPropagation(); descargarPdfDeRequisicion(r); }} style={{ ...btn, padding: '3px 8px', fontSize: 11 }}>PDF</button>
              </div>
            ))}
          </div>
        )
      ) : seccion === 'pedidos' ? (
        listaPedidos.length === 0 ? <div style={{ color: '#888', fontSize: 13 }}>No hay pedidos de materiales en esta vista.</div> : (
          <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, overflow: 'hidden' }}>
            {listaPedidos.map((p, i) => (
              <div key={p.id} onClick={() => setPedidoAbierto(p.id)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', cursor: 'pointer', flexWrap: 'wrap', borderTop: i ? '0.5px solid #f0f0f0' : 'none' }}>
                <b style={{ width: 44, fontSize: 13 }}>#{p.folio}</b>
                <span style={{ width: 56, fontSize: 12, color: '#888' }}>{fechaCorta(p.fecha)}</span>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{p.prog_frentes ? nombreFrente(p.prog_frentes) : ''} · {cat.etapas.find(e => e.id === p.etapa_id)?.nombre || ''}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>Pidió {(p.solicitante || '').split('@')[0]}{p.notas ? ` · ${p.notas}` : ''}</div>
                </div>
                <Chip e={p.estatus} tipo="pedido" />
              </div>
            ))}
          </div>
        )
      ) : (
        listaProv.length === 0 ? <div style={{ color: '#888', fontSize: 13 }}>{cat.proveedores.length === 0 ? 'Todavía no hay proveedores. Compras los da de alta con "Nuevo proveedor" y luego los asigna a las partidas en Programa.' : 'Sin resultados.'}</div> : (
          <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, overflow: 'hidden' }}>
            {listaProv.map((p, i) => {
              const nPart = cat.partidas.filter(x => x.proveedor_id === p.id).length;
              return (
                <div key={p.id} onClick={() => puedeCompras && setProvModal(p)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', cursor: puedeCompras ? 'pointer' : 'default', flexWrap: 'wrap', borderTop: i ? '0.5px solid #f0f0f0' : 'none', opacity: p.activo ? 1 : 0.55 }}>
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{p.nombre}{!p.activo && <span style={{ fontSize: 10, color: '#888', marginLeft: 8 }}>Inactivo</span>}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{[p.rfc, p.contacto, p.telefono, p.correo].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</div>
                  </div>
                  <span style={{ fontSize: 11, color: '#555' }}>{nPart} {nPart === 1 ? 'partida asignada' : 'partidas asignadas'}</span>
                </div>
              );
            })}
          </div>
        )
      )}

      {nuevoPedido && <FormPedido cat={cat} onCerrar={() => setNuevoPedido(false)} onCreado={() => { setNuevoPedido(false); setTabPedido('abiertos'); cargar(); }} />}
      {nueva && <FormPago cat={cat} desdePedido={nueva.desdePedido} onCerrar={() => setNueva(null)}
        onCreada={(nuevaReq) => { setNueva(null); setSeccion('pagos'); setTab(nuevaReq?.estatus === 'autorizada' ? 'porpagar' : 'pendientes'); cargar(); if (nuevaReq?.id) descargarPdfDeRequisicion(nuevaReq); }} />}
      {provModal && <ModalProveedor prov={provModal.id ? provModal : null} onCerrar={() => setProvModal(null)} onGuardado={() => { setProvModal(null); cargar(); }} />}
      {abiertaActual && <DetalleRequisicion req={abiertaActual} puedeAutorizarRebasa={puedeAutorizarRebasa} puedePagar={puedePagar} miCorreo={miCorreo} miRol={miRol} onCerrar={() => setAbierta(null)} onCambio={() => { setAbierta(null); cargar(); }} />}
      {pedidoActual && <DetallePedido pedido={pedidoActual} cat={cat} puedeCompras={puedeCompras} puedePedir={puedePedir} miCorreo={miCorreo} onCerrar={() => setPedidoAbierto(null)} onCambio={() => { setPedidoAbierto(null); cargar(); }}
        onCrearPago={(pedido, lineas) => { setPedidoAbierto(null); setNueva({ desdePedido: { pedido, lineas } }); }} />}
    </div>
  );
}
