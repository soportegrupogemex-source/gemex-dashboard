import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from './supabase';
import { usePuede } from './PermisosContext';
import { InputDinero } from './dinero';
import { enviarPush } from './enviarPush';
import { descargarRequisicionPdf } from './requisicionPdf';
import { EMPRESA } from './empresa';
import { traerTodo, useIsMobile, fechaCorta, hoyISO, $, Modal, btn, inp, lbl, nombreFrente } from './ObraTorres';

// Requisiciones de pago de obra (formato de la hoja oficial): Construcción solicita, Dirección Administrativa
// autoriza y Tesorería paga con comprobante. Al pagarse, cada parte se carga a la torre y al concepto de
// presupuesto (o al contrato de mano de obra) que indicó quien solicitó.
const ESTATUS = {
  solicitada: { txt: 'Por autorizar', fondo: '#FFF4E5', color: '#B45309' },
  autorizada: { txt: 'Por pagar', fondo: '#EFF6FF', color: '#1D4ED8' },
  pagada: { txt: 'Pagada', fondo: '#EAF3DE', color: '#27500A' },
  rechazada: { txt: 'Rechazada', fondo: '#FDECEC', color: '#C0392B' },
};
const FORMAS = { cheque: 'Cheque', transferencia: 'Transferencia', efectivo: 'Efectivo' };
const NOMBRE_CAT = { materiales: 'Materiales', subcontratos: 'Subcontratos', maquinaria: 'Maquinaria', indirectos: 'Indirectos' };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const letrasTorres = (cargos) => {
  const nombres = [...new Set(cargos.map(c => c.obra_torres).filter(Boolean).map(t => nombreFrente(t)))];
  return nombres.map(n => (/^torre\s+([A-Za-zÁÉÍÓÚÑ]+)$/i.exec(n)?.[1] || n).toUpperCase()).join(nombres.every(n => /^torre\s+\S+$/i.test(n)) ? '' : ', ');
};

// Encabezado con el logo de la empresa, como en el formato impreso.
function EncabezadoLogo({ folio }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingBottom: 10, marginBottom: 12, borderBottom: '0.5px solid #eee' }}>
      <img src={`${process.env.PUBLIC_URL}/${EMPRESA.logo}`} alt={EMPRESA.nombre} style={{ height: 36, width: 'auto' }} />
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', letterSpacing: 0.5 }}>REQUISICIÓN DE PAGO</div>
        {folio && <div style={{ fontSize: 11, color: '#888' }}>Folio {folio}</div>}
      </div>
    </div>
  );
}

function Chip({ e }) {
  const s = ESTATUS[e];
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: s.fondo, color: s.color, whiteSpace: 'nowrap' }}>{s.txt}</span>;
}

async function correosDeRoles(roles) {
  const { data } = await supabase.from('agentes').select('correo').in('rol', roles).eq('activo', true);
  return (data || []).map(a => a.correo).filter(Boolean);
}

// ---------------------------------------------------------------- Formulario
function FormRequisicion({ torres, conceptos, contratos, contratistas, gastadoPorConcepto, onCerrar, onCreada }) {
  const desarrollos = useMemo(() => {
    const m = new Map();
    torres.forEach(t => { if (t.desarrollo_id && !m.has(t.desarrollo_id)) m.set(t.desarrollo_id, t.desarrollos?.nombre || 'Proyecto'); });
    return [...m].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [torres]);
  const [f, setF] = useState({ desarrollo_id: desarrollos.length === 1 ? desarrollos[0].id : '', semana: '', periodo: '', categoria: 'edificacion', etapa: '', ubicacion: '', fiscal: 'no', factura: '', forma_pago: 'cheque', concepto: '', razon_social: '', observaciones: '' });
  const [lineas, setLineas] = useState([{ partida: '', referencia: '', concepto: '', cantidad: '1', unidad: '', precio: '' }]);
  const [cargos, setCargos] = useState([{ torre_id: '', destino: '', monto: '' }]);
  const [guardando, setGuardando] = useState(false);

  const frentes = torres.filter(t => t.desarrollo_id === f.desarrollo_id);
  const subtotal = lineas.reduce((t, l) => t + r2((Number(l.cantidad) || 0) * (Number(l.precio) || 0)), 0);
  const iva = f.fiscal === 'si' ? r2(subtotal * 0.16) : 0;
  const total = r2(subtotal + iva);
  const sumaCargos = r2(cargos.reduce((t, c) => t + (Number(c.monto) || 0), 0));
  const cuadra = Math.abs(sumaCargos - total) <= 0.01 && total > 0;

  const setLinea = (i, k, v) => setLineas(ls => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const setCargo = (i, k, v) => setCargos(cs => cs.map((c, j) => (j === i ? { ...c, [k]: v, ...(k === 'torre_id' ? { destino: '' } : {}) } : c)));
  const repartir = () => {
    const n = cargos.length || 1; const base = r2(total / n);
    setCargos(cs => cs.map((c, i) => ({ ...c, monto: String(i === n - 1 ? r2(total - base * (n - 1)) : base) })));
  };
  const opciones = (torreId) => {
    const ks = contratos.filter(c => c.torre_id === torreId);
    const cs = conceptos.filter(c => c.torre_id === torreId);
    return { ks, cs };
  };
  const aviso = (c) => {
    if (!c.destino.startsWith('c:') || !(Number(c.monto) > 0)) return '';
    const con = conceptos.find(x => x.id === c.destino.slice(2)); if (!con) return '';
    const pres = (Number(con.cantidad) || 0) * (Number(con.precio_unitario) || 0);
    const rest = pres - (gastadoPorConcepto.get(con.id) || 0);
    return Number(c.monto) > rest + 0.01 ? `Rebasa el presupuesto de "${con.descripcion}" (quedan ${$(Math.max(rest, 0))})` : '';
  };

  const enviar = async () => {
    if (!f.desarrollo_id) { alert('Elige el proyecto.'); return; }
    if (!f.razon_social.trim() || !f.concepto.trim()) { alert('Escribe la razón social y el concepto.'); return; }
    if (lineas.some(l => !(Number(l.cantidad) > 0) || !(Number(l.precio) >= 0) || l.precio === '')) { alert('Cada línea necesita cantidad y precio unitario.'); return; }
    if (cargos.some(c => !c.torre_id || !c.destino || !(Number(c.monto) > 0))) { alert('Cada parte del reparto necesita torre, destino y monto.'); return; }
    if (!cuadra) { alert(`El reparto suma ${$(sumaCargos)} y la requisición es de ${$(total)}. Deben coincidir.`); return; }
    setGuardando(true);
    const { data, error } = await supabase.rpc('obra_crear_requisicion', {
      p_cab: { ...f, fiscal: f.fiscal === 'si', semana: f.semana === '' ? null : Number(f.semana) },
      p_lineas: lineas.map(l => ({ partida: l.partida, referencia: l.referencia, concepto: l.concepto, cantidad: Number(l.cantidad), unidad: l.unidad, precio_unitario: Number(l.precio) })),
      p_cargos: cargos.map(c => ({ torre_id: c.torre_id, monto: Number(c.monto), concepto_id: c.destino.startsWith('c:') ? c.destino.slice(2) : null, contrato_id: c.destino.startsWith('k:') ? c.destino.slice(2) : null })),
    });
    if (error) { alert('No se pudo solicitar: ' + error.message); setGuardando(false); return; }
    enviarPush({ correos: await correosDeRoles(['Super Admin', 'Admin']), title: `Requisición #${data.folio} por autorizar`, body: `${data.razon_social} · ${$(data.total)} · ${data.concepto}`, url: '/' });
    onCreada();
  };

  const celda = { ...inp, width: '100%' };
  return (
    <Modal titulo="Nueva requisición de pago" onCerrar={onCerrar} ancho={860}>
      <EncabezadoLogo />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8, marginBottom: 10 }}>
        <div><label style={lbl}>Proyecto</label>
          <select value={f.desarrollo_id} onChange={e => { setF({ ...f, desarrollo_id: e.target.value }); setCargos(cs => cs.map(c => ({ ...c, torre_id: '', destino: '' }))); }} style={celda}>
            <option value="">Selecciona...</option>{desarrollos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
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
        <div style={{ gridColumn: 'span 2' }}><label style={lbl}>Razón social (a quién se paga)</label><input value={f.razon_social} onChange={e => setF({ ...f, razon_social: e.target.value })} style={celda} /></div>
        <div style={{ gridColumn: 'span 2' }}><label style={lbl}>Concepto</label><input value={f.concepto} onChange={e => setF({ ...f, concepto: e.target.value })} placeholder="Puertas, pastas MO, gasolina…" style={celda} /></div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, margin: '12px 0 6px' }}>Líneas</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
          <thead><tr style={{ fontSize: 11, color: '#666', textAlign: 'left' }}>
            <th style={{ padding: '2px 4px' }}>Partida</th><th>Referencia</th><th>Concepto</th><th style={{ width: 70 }}>Cantidad</th><th style={{ width: 70 }}>Unidad</th><th style={{ width: 110 }}>P.U.</th><th style={{ width: 100, textAlign: 'right' }}>Importe</th><th style={{ width: 24 }} />
          </tr></thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td style={{ padding: 2 }}><input value={l.partida} onChange={e => setLinea(i, 'partida', e.target.value)} style={celda} /></td>
                <td style={{ padding: 2 }}><input value={l.referencia} onChange={e => setLinea(i, 'referencia', e.target.value)} style={celda} /></td>
                <td style={{ padding: 2 }}><input value={l.concepto} onChange={e => setLinea(i, 'concepto', e.target.value)} style={celda} /></td>
                <td style={{ padding: 2 }}><input type="number" value={l.cantidad} onChange={e => setLinea(i, 'cantidad', e.target.value)} style={{ ...celda, textAlign: 'right' }} /></td>
                <td style={{ padding: 2 }}><input value={l.unidad} onChange={e => setLinea(i, 'unidad', e.target.value.toUpperCase())} style={celda} /></td>
                <td style={{ padding: 2 }}><InputDinero value={l.precio} onChange={e => setLinea(i, 'precio', e.target.value)} style={{ ...celda, textAlign: 'right' }} /></td>
                <td style={{ padding: 2, textAlign: 'right', fontSize: 12 }}>{$(r2((Number(l.cantidad) || 0) * (Number(l.precio) || 0)))}</td>
                <td>{lineas.length > 1 && <button onClick={() => setLineas(ls => ls.filter((_, j) => j !== i))} style={{ ...btn, padding: '0 6px', color: '#C0392B' }}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
        <button onClick={() => setLineas(ls => [...ls, { partida: '', referencia: '', concepto: '', cantidad: '1', unidad: '', precio: '' }])} style={btn}>+ Línea</button>
        <div style={{ fontSize: 12, textAlign: 'right', lineHeight: 1.7 }}>
          <div>Subtotal <b>{$(subtotal)}</b></div>
          <div>IVA <b>{f.fiscal === 'si' ? $(iva) : '—'}</b></div>
          <div style={{ fontSize: 14 }}>Total <b>{$(total)}</b></div>
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, margin: '14px 0 2px' }}>A qué torre se carga</div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Cada torre absorbe lo que le corresponde: indica la torre, el concepto de presupuesto (o el contrato de mano de obra) y el monto. La suma debe ser igual al total.</div>
      {f.desarrollo_id === '' ? <div style={{ fontSize: 12, color: '#888' }}>Elige primero el proyecto.</div> : frentes.length === 0 ? <div style={{ fontSize: 12, color: '#888' }}>Este proyecto aún no tiene torres cargadas en Programa.</div> : (
        <>
          {cargos.map((c, i) => {
            const { ks, cs } = opciones(c.torre_id);
            const av = aviso(c);
            return (
              <div key={i} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={c.torre_id} onChange={e => setCargo(i, 'torre_id', e.target.value)} style={{ ...inp, width: 150 }}>
                    <option value="">Torre...</option>{frentes.map(t => <option key={t.id} value={t.id}>{nombreFrente(t)}</option>)}
                  </select>
                  <select value={c.destino} onChange={e => setCargo(i, 'destino', e.target.value)} disabled={!c.torre_id} style={{ ...inp, flex: '1 1 260px' }}>
                    <option value="">Cargar a…</option>
                    {ks.length > 0 && <optgroup label="Mano de obra (contratos)">{ks.map(k => <option key={k.id} value={`k:${k.id}`}>{contratistas.find(x => x.id === k.contratista_id)?.nombre || 'Contratista'}{k.concepto ? ` · ${k.concepto}` : ''}</option>)}</optgroup>}
                    {Object.entries(NOMBRE_CAT).map(([k, nombre]) => {
                      const lista = cs.filter(x => x.categoria === k);
                      return lista.length > 0 && <optgroup key={k} label={nombre}>{lista.map(x => <option key={x.id} value={`c:${x.id}`}>{x.descripcion}</option>)}</optgroup>;
                    })}
                  </select>
                  <InputDinero value={c.monto} onChange={e => setCargo(i, 'monto', e.target.value)} placeholder="Monto" style={{ ...inp, width: 130, textAlign: 'right' }} />
                  {cargos.length > 1 && <button onClick={() => setCargos(cs2 => cs2.filter((_, j) => j !== i))} style={{ ...btn, padding: '0 6px', color: '#C0392B' }}>×</button>}
                </div>
                {c.torre_id && ks.length === 0 && cs.length === 0 && <div style={{ fontSize: 11, color: '#B45309' }}>Esta torre aún no tiene conceptos ni contratos: créalos en Programa → Presupuesto o Costos.</div>}
                {av && <div style={{ fontSize: 11, color: '#B45309' }}>⚠ {av}. Se puede solicitar igual; quien autoriza lo verá.</div>}
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setCargos(cs => [...cs, { torre_id: '', destino: '', monto: '' }])} style={btn}>+ Torre</button>
            <button onClick={repartir} disabled={total <= 0} style={btn}>Repartir parejo</button>
            <span style={{ fontSize: 12, color: cuadra ? '#27500A' : '#C0392B' }}>Reparto {$(sumaCargos)} de {$(total)}{cuadra ? ' ✓' : ''}</span>
          </div>
        </>
      )}

      <label style={{ ...lbl, marginTop: 12 }}>Observaciones</label>
      <input value={f.observaciones} onChange={e => setF({ ...f, observaciones: e.target.value })} style={{ ...celda, marginBottom: 12 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCerrar} style={{ ...btn, flex: 1 }}>Cancelar</button>
        <button onClick={enviar} disabled={guardando} style={{ ...btn, flex: 1, background: '#C0203A', color: '#fff', border: 'none' }}>{guardando ? 'Enviando...' : 'Solicitar'}</button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------- Detalle
function DetalleRequisicion({ req, puedeAutorizar, puedePagar, miCorreo, onCerrar, onCambio }) {
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
        supabase.from('obra_requisicion_cargos').select('*, obra_torres(nombre, torre), obra_conceptos(descripcion, categoria), obra_contratos(concepto, obra_contratistas(nombre))').eq('requisicion_id', req.id),
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
    if (!window.confirm(`¿Autorizar la requisición #${req.folio} por ${$(req.total)}?`)) return;
    if (await rpc('obra_resolver_requisicion', { p_id: req.id, p_autorizar: true }, 'No se pudo autorizar')) {
      enviarPush({ correos: [...await correosDeRoles(['Tesorería']), solicitanteCorreo].filter(Boolean), title: `Requisición #${req.folio} autorizada`, body: `${req.razon_social} · ${$(req.total)} · lista para pagar`, url: '/' });
      onCambio();
    }
  };
  const rechazar = async () => {
    const motivo = window.prompt('Motivo del rechazo:', '');
    if (!motivo || !motivo.trim()) return;
    if (await rpc('obra_resolver_requisicion', { p_id: req.id, p_autorizar: false, p_motivo: motivo }, 'No se pudo rechazar')) {
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
  const pdf = () => descargarRequisicionPdf({ req, lineas: lineas || [], torres: letrasTorres(cargos), desarrollo: req.desarrollos?.nombre, autorizo });

  const dato = (k, v) => v ? <div style={{ minWidth: 150 }}><div style={{ fontSize: 10, color: '#888' }}>{k}</div><div style={{ fontSize: 12, fontWeight: 600 }}>{v}</div></div> : null;
  return (
    <Modal titulo={`Requisición #${req.folio}`} onCerrar={onCerrar} ancho={780}>
      <EncabezadoLogo folio={req.folio} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <Chip e={req.estatus} /><span style={{ fontSize: 12, color: '#888' }}>{fechaCorta(req.fecha)} · solicita {(req.solicitante || '').split('@')[0]}</span>
        <button onClick={pdf} disabled={!lineas} style={{ ...btn, marginLeft: 'auto' }}>PDF</button>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        {dato('Proyecto', req.desarrollos?.nombre)}{dato('Torres', letrasTorres(cargos))}{dato('Categoría', req.categoria === 'indirectos' ? 'Indirectos' : 'Edificación')}
        {dato('Semana', req.semana)}{dato('Periodo', req.periodo)}{dato('Etapa', req.etapa)}{dato('Ubicación', req.ubicacion)}
        {dato('Fiscal', req.fiscal ? 'Sí' : 'No')}{dato('Nº factura', req.factura || 'Pendiente')}{dato('Forma de pago', FORMAS[req.forma_pago])}
        {dato('Razón social', req.razon_social)}{dato('Concepto', req.concepto)}
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
          <b style={{ width: 90 }}>{c.obra_torres ? nombreFrente(c.obra_torres) : ''}</b>
          <span style={{ flex: 1, color: '#555' }}>{c.obra_conceptos ? `${NOMBRE_CAT[c.obra_conceptos.categoria]} · ${c.obra_conceptos.descripcion}` : `Mano de obra · ${c.obra_contratos?.obra_contratistas?.nombre || ''}${c.obra_contratos?.concepto ? ' · ' + c.obra_contratos.concepto : ''}`}</span>
          <b>{$(c.monto)}</b>
        </div>
      ))}
      {req.observaciones && <div style={{ fontSize: 12, color: '#555', marginTop: 8 }}><b>Observaciones:</b> {req.observaciones}</div>}
      {req.estatus === 'rechazada' && <div style={{ fontSize: 12, color: '#C0392B', marginTop: 8 }}><b>Rechazada por {(req.autorizada_por || '').split('@')[0]}:</b> {req.rechazo_motivo}</div>}
      {req.autorizada_por && req.estatus !== 'rechazada' && <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>Autorizada por {req.autorizada_por}</div>}
      {req.estatus === 'pagada' && (
        <div style={{ fontSize: 12, marginTop: 6 }}>Pagada el {fechaCorta(req.fecha_pago)} por {(req.pagada_por || '').split('@')[0]}. <button onClick={verComprobante} style={{ ...btn, padding: '2px 8px', color: '#3B82F6' }}>📎 Comprobante</button></div>
      )}

      {req.estatus === 'solicitada' && puedeAutorizar && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={rechazar} disabled={ocupado} style={{ ...btn, flex: 1, color: '#C0392B' }}>Rechazar</button>
          <button onClick={autorizar} disabled={ocupado} style={{ ...btn, flex: 1, background: '#1a1a2e', color: '#fff', border: 'none' }}>Autorizar</button>
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
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Al registrar el pago se carga a cada torre, concepto o contrato indicado y baja del presupuesto disponible.</div>
        </div>
      )}
      {(req.estatus === 'solicitada' || req.estatus === 'rechazada') && (solicitanteCorreo === (miCorreo || '').toLowerCase() || puedeAutorizar) && (
        <button onClick={eliminar} disabled={ocupado} style={{ ...btn, color: '#C0392B', marginTop: 10 }}>Eliminar requisición</button>
      )}
    </Modal>
  );
}

// -------------------------------------------------------------------- Página
export default function ObraRequisiciones() {
  const puede = usePuede();
  const puedeSolicitar = puede('construccion.solicitar_requisiciones');
  const puedeAutorizar = puede('construccion.autorizar_requisiciones');
  const puedePagar = puede('construccion.registrar_pagos_obra');
  const isMobile = useIsMobile();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [reqs, setReqs] = useState([]);
  const [cargosPorReq, setCargosPorReq] = useState(new Map());
  const [catalogo, setCatalogo] = useState({ torres: [], conceptos: [], contratos: [], contratistas: [], gastado: new Map() });
  const [tab, setTab] = useState('pendientes');
  const [busca, setBusca] = useState('');
  const [abierta, setAbierta] = useState(null);
  const [nueva, setNueva] = useState(false);
  const [miCorreo, setMiCorreo] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const [rs, cg, torres, conceptos, contratos, contratistas, gastos, { data: { user } }] = await Promise.all([
        traerTodo(() => supabase.from('obra_requisiciones').select('*, desarrollos(nombre)').order('folio', { ascending: false })),
        traerTodo(() => supabase.from('obra_requisicion_cargos').select('requisicion_id, obra_torres(nombre, torre)').order('id')),
        traerTodo(() => supabase.from('obra_torres').select('id, desarrollo_id, torre, nombre, desarrollos(nombre)').eq('es_plantilla', false).order('created_at')),
        traerTodo(() => supabase.from('obra_conceptos').select('id, torre_id, categoria, descripcion, cantidad, precio_unitario').order('orden')),
        traerTodo(() => supabase.from('obra_contratos').select('id, torre_id, contratista_id, concepto').order('created_at')),
        traerTodo(() => supabase.from('obra_contratistas').select('id, nombre').order('nombre')),
        traerTodo(() => supabase.from('obra_gastos').select('concepto_id, monto').order('id')),
        supabase.auth.getUser(),
      ]);
      setReqs(rs);
      const m = new Map(); cg.forEach(c => { if (!m.has(c.requisicion_id)) m.set(c.requisicion_id, []); m.get(c.requisicion_id).push(c); }); setCargosPorReq(m);
      const gastado = new Map(); gastos.forEach(g => gastado.set(g.concepto_id, (gastado.get(g.concepto_id) || 0) + Number(g.monto || 0)));
      setCatalogo({ torres, conceptos, contratos, contratistas, gastado });
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

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '4px' }}>Requisiciones de pago</h2>
          <div style={{ fontSize: '12px', color: '#888' }}>Construcción solicita, Dirección Administrativa autoriza y Tesorería paga con comprobante. Lo pagado se carga al presupuesto de cada torre.</div>
        </div>
        {puedeSolicitar && <button onClick={() => setNueva(true)} style={{ ...btn, background: '#C0203A', color: '#fff', border: 'none' }}>+ Nueva requisición</button>}
      </div>
      {error && <div style={{ padding: '10px 14px', background: '#FDECEC', color: '#C0392B', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>No se pudo cargar: {error}</div>}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e0e0e0', marginBottom: 12, overflowX: 'auto', alignItems: 'center' }}>
        {tabs.map(([k, l, n]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', fontWeight: tab === k ? 600 : 400, color: tab === k ? '#1a1a2e' : '#888', borderBottom: tab === k ? '2px solid #1a1a2e' : '2px solid transparent' }}>{l} <span style={{ color: '#aaa', fontWeight: 400 }}>{n}</span></button>
        ))}
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar folio, proveedor, concepto…" style={{ ...inp, marginLeft: 'auto', width: 230, marginBottom: 4 }} />
      </div>
      {cargando ? <div style={{ color: '#888', fontSize: 13 }}>Cargando...</div> : lista.length === 0 ? (
        <div style={{ color: '#888', fontSize: 13 }}>No hay requisiciones en esta vista.</div>
      ) : (
        <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, overflow: 'hidden' }}>
          {lista.map((r, i) => (
            <div key={r.id} onClick={() => setAbierta(r.id)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', cursor: 'pointer', flexWrap: 'wrap', borderTop: i ? '0.5px solid #f0f0f0' : 'none' }}>
              <b style={{ width: 44, fontSize: 13 }}>#{r.folio}</b>
              <span style={{ width: 56, fontSize: 12, color: '#888' }}>{fechaCorta(r.fecha)}</span>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.razon_social}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{r.concepto} · {r.desarrollos?.nombre}{(cargosPorReq.get(r.id) || []).length > 0 ? ` · Torres ${letrasTorres(cargosPorReq.get(r.id))}` : ''}</div>
              </div>
              {r.fiscal ? <span style={{ fontSize: 10, color: '#3B82F6', background: '#EFF6FF', padding: '2px 8px', borderRadius: 20 }}>Fiscal</span> : <span style={{ fontSize: 10, color: '#888', background: '#f3f3f5', padding: '2px 8px', borderRadius: 20 }}>No fiscal</span>}
              <b style={{ width: 110, textAlign: 'right', fontSize: 13 }}>{$(r.total)}</b>
              <Chip e={r.estatus} />
            </div>
          ))}
        </div>
      )}
      {nueva && <FormRequisicion torres={catalogo.torres} conceptos={catalogo.conceptos} contratos={catalogo.contratos} contratistas={catalogo.contratistas} gastadoPorConcepto={catalogo.gastado}
        onCerrar={() => setNueva(false)} onCreada={() => { setNueva(false); setTab('pendientes'); cargar(); }} />}
      {abiertaActual && <DetalleRequisicion req={abiertaActual} puedeAutorizar={puedeAutorizar} puedePagar={puedePagar} miCorreo={miCorreo} onCerrar={() => setAbierta(null)} onCambio={() => { setAbierta(null); cargar(); }} />}
    </div>
  );
}
