import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export default function Cotizador({ unidad, unidades: unidadesMultiple, desarrollo, onClose }) {
  const [planes, setPlanes] = useState([]);
  const [contactos, setContactos] = useState([]);
  const [buscarContacto, setBuscarContacto] = useState('');
  const [showContactos, setShowContactos] = useState(false);
  const [contactoSeleccionado, setContactoSeleccionado] = useState(null);
  const [asesor, setAsesor] = useState({ nombre: '', celular: '', email: '' });
  const [generando, setGenerando] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  // FIX: datos bancarios específicos de la torre/etapa de la unidad, si
  // existen — se usan en vez del dato general del desarrollo.
  const [datosBancariosTorre, setDatosBancariosTorre] = useState(null);
  const cotizacionRef = useRef();
  const contenedorRef = useRef();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const listaUnidades = unidadesMultiple?.length > 0 ? unidadesMultiple : (unidad ? [unidad] : []);
  const esComparacion = listaUnidades.length > 1;

  useEffect(() => { cargarPlanes(); cargarAsesor(); cargarContactos(); cargarDatosBancariosTorre(); }, []);

  // FIX: registra en `cotizaciones_log` cada unidad de la cotización,
  // pero solo cuando hay un contacto asignado y la cotización se
  // descarga o se reenvía — antes se contaba con solo ABRIR el
  // cotizador, sin contacto ni acción real, lo que inflaba el conteo en
  // Tendencias con unidades que un agente abrió para mirar precios pero
  // nunca llegó a enviar a nadie.
  const registrarLog = async () => {
    if (!contactoSeleccionado) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let agenteNombre = '';
      const agenteCorreo = user?.email || '';
      if (user) {
        const { data } = await supabase.from('agentes').select('nombre, apellidos').eq('correo', user.email).single();
        if (data) agenteNombre = `${data.nombre || ''} ${data.apellidos || ''}`.trim();
      }
      const filas = listaUnidades.map(u => ({
        agente_correo: agenteCorreo,
        agente_nombre: agenteNombre,
        desarrollo_id: desarrollo.id,
        desarrollo_nombre: desarrollo.nombre,
        unidad_id: u.id,
        unidad_numero: u.numero,
        tipologia: u.tipologia || null,
        nivel: u.nivel || null,
        precio_lista: u.precio_lista || null,
        contacto_id: contactoSeleccionado.id,
        contacto_nombre: `${contactoSeleccionado.nombres} ${contactoSeleccionado.apellidos}`.trim(),
      }));
      if (filas.length > 0) await supabase.from('cotizaciones_log').insert(filas);
      await crearNegociosCotizacion(agenteCorreo, agenteNombre);
    } catch (err) {
      // el log nunca debe bloquear la cotización si falla
    }
  };

  // FIX: además del log, cada unidad cotizada (con contacto asignado) crea
  // su propio negocio en la etapa "Cotización" — uno por combinación
  // contacto+unidad, para no duplicar si ya existe (aunque haya avanzado
  // a otra etapa, no se toca: esto solo CREA, nunca revierte etapa).
  const crearNegociosCotizacion = async (agenteCorreo, agenteNombre) => {
    const unidadIds = listaUnidades.map(u => u.id).filter(Boolean);
    if (unidadIds.length === 0) return;
    const { data: existentes } = await supabase.from('negocios')
      .select('unidad_id')
      .eq('contacto_id', contactoSeleccionado.id)
      .in('unidad_id', unidadIds);
    const yaExisten = new Set((existentes || []).map(n => n.unidad_id));
    const nombreContacto = `${contactoSeleccionado.nombres} ${contactoSeleccionado.apellidos}`.trim();
    const nuevos = listaUnidades.filter(u => u.id && !yaExisten.has(u.id)).map(u => ({
      nombre: nombreContacto,
      contacto_id: contactoSeleccionado.id,
      valor: u.precio_lista || 0,
      etapa: 'Cotización',
      desarrollo: desarrollo.nombre,
      unidad_id: u.id,
      unidad_numero: u.numero,
      fuente_medio: contactoSeleccionado.fuente_medio || null,
      asesor_ventas: agenteNombre,
      asesor_correo: agenteCorreo,
      creado_por: agenteCorreo,
    }));
    if (nuevos.length > 0) await supabase.from('negocios').insert(nuevos);
  };

  const cargarPlanes = async () => {
    // FIX: si el desarrollo tiene torres/etapas, solo trae los planes
    // asociados a la torre/etapa de la unidad que se está cotizando
    let query = supabase.from('planes_pago').select('*').eq('desarrollo_id', desarrollo.id).eq('activo', true);
    const u = listaUnidades[0];
    if (desarrollo.tiene_etapas && u?.estructura) {
      query = query.eq('estructura', u.estructura);
    }
    const { data } = await query.order('created_at');
    setPlanes(data || []);
  };

  // FIX: busca en desarrollo_estructuras si la torre/etapa de la unidad
  // tiene su propia cuenta bancaria configurada. Solo aplica en
  // cotización individual (no en comparación, porque ahí puede haber
  // unidades de varias torres distintas a la vez).
  const cargarDatosBancariosTorre = async () => {
    const u = listaUnidades[0];
    if (!desarrollo.tiene_etapas || !u?.estructura || listaUnidades.length > 1) { setDatosBancariosTorre(null); return; }
    const { data } = await supabase.from('desarrollo_estructuras')
      .select('datos_bancarios').eq('desarrollo_id', desarrollo.id).eq('nombre', u.estructura).limit(1);
    const valor = data && data.length > 0 ? data[0].datos_bancarios : null;
    setDatosBancariosTorre(valor && valor.trim() ? valor : null);
  };

  // FIX: antes traía TODOS los contactos sin importar el rol — un Agente
  // podía ver (y elegir) contactos de otros asesores al cotizar, lo cual
  // es una fuga de información de clientes. Ahora la consulta misma trae
  // solo lo que corresponde: Agente/Desarrollador → los suyos; Gerente →
  // los de su equipo/proyectos a cargo; Super Admin/Admin/Sub Admin → todos.
  const cargarContactos = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setContactos([]); return; }
    const { data: miAgenteData } = await supabase.from('agentes')
      .select('rol, nombre, apellidos, correo, desarrollos_cargo, agentes_cargo')
      .eq('correo', user.email).single();
    if (!miAgenteData) { setContactos([]); return; }

    const rol = miAgenteData.rol;
    const correo = miAgenteData.correo;
    const nombreCompleto = `${miAgenteData.nombre || ''} ${miAgenteData.apellidos || ''}`.trim();
    const cargo = miAgenteData.desarrollos_cargo || [];
    const ROLES_VER_TODOS = ['Super Admin', 'Admin', 'Sub Admin'];

    let query = supabase.from('contactos').select('id, nombres, apellidos, correo, telefono, fuente_medio').order('nombres');

    if (ROLES_VER_TODOS.includes(rol)) {
      // sin filtro — ve todos
    } else if (rol === 'Mesa de Control') {
      const agentesCargoCorreos = miAgenteData.agentes_cargo || [];
      const { data: equipo } = agentesCargoCorreos.length > 0
        ? await supabase.from('agentes').select('nombre, apellidos').in('correo', agentesCargoCorreos)
        : { data: [] };
      const nombresEquipo = (equipo || []).map(a => `${a.nombre} ${a.apellidos}`.trim());
      const nombresFiltro = [nombreCompleto, ...nombresEquipo].filter(Boolean);
      query = nombresFiltro.length > 0
        ? query.or(`creado_por.eq.${correo},asesor_ventas.in.(${nombresFiltro.map(n => `"${n}"`).join(',')})`)
        : query.eq('creado_por', correo);
      if (cargo.length > 0) query = query.in('desarrollo', cargo);
    } else if (rol === 'Gerente Editor' || rol === 'Gerente Operador') {
      query = cargo.length > 0
        ? query.or(`creado_por.eq.${correo},desarrollo.in.(${cargo.map(d => `"${d}"`).join(',')})`)
        : query.eq('creado_por', correo);
    } else {
      // Agente, Desarrollador, o cualquier otro rol: solo lo suyo
      query = query.or(`creado_por.eq.${correo},asesor_ventas.eq.${nombreCompleto}`);
    }

    const { data } = await query;
    setContactos(data || []);
  };

  const cargarAsesor = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('agentes').select('nombre, apellidos, telefono, correo').eq('correo', user.email).single();
      if (data) {
        setAsesor({ nombre: `${data.nombre || ''} ${data.apellidos || ''}`.trim(), celular: data.telefono || '', email: data.correo || user.email });
      } else {
        setAsesor(a => ({ ...a, email: user.email }));
      }
    }
  };

  const calcularPlan = (plan, precio) => {
    const precioConPreventa = precio * (1 - plan.descuento_preventa / 100);
    const precioConDescuento = precioConPreventa * (1 - plan.descuento_plan / 100);
    const enganche = precioConDescuento * plan.enganche / 100;
    const duranteObra = precioConDescuento * plan.durante_obra / 100;
    const restoPorc = 100 - plan.enganche - plan.durante_obra;
    const resto = precioConDescuento * restoPorc / 100;
    const mensualidad = plan.meses_plan > 0 ? duranteObra / plan.meses_plan : 0;
    const ahorro = precio - precioConDescuento;
    return { precioConDescuento, enganche, duranteObra, mensualidad, ahorro, entrega: resto, restoPorc };
  };

  const generarPDFBlob = async () => {
    setShowContactos(false);
    const elemento = cotizacionRef.current;
    const contenedor = contenedorRef.current;

    // Quitar temporalmente la escala para capturar en tamaño real
    const transformOriginal = contenedor ? contenedor.style.transform : '';
    const widthOriginal = contenedor ? contenedor.style.width : '';
    const heightOriginal = contenedor ? contenedor.style.height : '';

    if (contenedor) {
      contenedor.style.transform = 'none';
      contenedor.style.width = 'auto';
      contenedor.style.height = 'auto';
    }

    // Pequeña pausa para que el DOM se actualice
    await new Promise(r => setTimeout(r, 100));

    const canvas = await html2canvas(elemento, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF(esComparacion ? 'l' : 'p', 'mm', 'letter');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

    // Restaurar escala
    if (contenedor) {
      contenedor.style.transform = transformOriginal;
      contenedor.style.width = widthOriginal;
      contenedor.style.height = heightOriginal;
    }

    const nombreArchivo = esComparacion
      ? `Comparacion_${desarrollo.nombre}_${listaUnidades.map(u => u.numero).join('-')}.pdf`
      : `Cotizacion_${desarrollo.nombre}_${listaUnidades[0].numero}.pdf`;

    return { blob: pdf.output('blob'), nombre: nombreArchivo };
  };

  const handleDescargar = async () => {
    setGenerando(true);
    const { blob, nombre } = await generarPDFBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
    await registrarLog();
    setGenerando(false);
  };

  const handleCompartir = async () => {
    setCompartiendo(true);
    const { blob, nombre } = await generarPDFBlob();
    const file = new File([blob], nombre, { type: 'application/pdf' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: nombre });
        await registrarLog();
      } catch (err) {
        if (err.name !== 'AbortError') {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = nombre;
          a.click();
          URL.revokeObjectURL(url);
          await registrarLog();
        }
        // AbortError: el usuario canceló el share sheet, no se cuenta como reenvío
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
      await registrarLog();
    }
    setCompartiendo(false);
  };

  const contactosFiltrados = contactos.filter(c =>
    !buscarContacto || `${c.nombres} ${c.apellidos}`.toLowerCase().includes(buscarContacto.toLowerCase()) ||
    c.correo?.toLowerCase().includes(buscarContacto.toLowerCase())
  );

  const fmt = (n) => `$${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
  const fechaActual = new Date().toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const fila = (label, valor) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '3px' }}>
      <span style={{ color: '#555' }}>{label}</span>
      <span style={{ fontWeight: '600' }}>{valor}</span>
    </div>
  );

  const anchoDoc = esComparacion ? 1056 : 816;
  const escala = isMobile ? (window.innerWidth - 32) / anchoDoc : 1;

  const renderComparacion = () => (
    <div ref={cotizacionRef} style={{
      background: '#fff', width: '1056px', minHeight: '816px', padding: '32px',
      boxSizing: 'border-box', fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '2px solid #1a1a2e' }}>
        <div>
          {desarrollo.logo_url
            ? <img src={desarrollo.logo_url} alt={desarrollo.nombre} style={{ maxHeight: '60px', maxWidth: '160px', objectFit: 'contain' }} />
            : <div style={{ fontSize: '22px', fontWeight: '900', color: '#1a1a2e' }}>{desarrollo.nombre}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a2e' }}>Comparación de unidades</div>
          {contactoSeleccionado && (
            <div style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>
              Para: {contactoSeleccionado.nombres} {contactoSeleccionado.apellidos}
            </div>
          )}
          <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>{fechaActual}</div>
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '20px' }}>
        <thead>
          <tr style={{ background: '#1a1a2e', color: '#fff' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '600' }}>Característica</th>
            {listaUnidades.map(u => (
              <th key={u.id} style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '600' }}>Unidad {u.numero}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ['Tipología', u => u.tipologia],
            ['Nivel', u => u.nivel],
            ['m² Interior', u => `${u.m2_interior} m²`],
            ['m² Terraza', u => `${u.m2_terraza} m²`],
            ['m² Total', u => `${u.m2_total} m²`],
            ['Recámaras', u => u.recamaras],
            ['Baños', u => u.banos],
            ['Estacionamiento', u => u.estacionamiento],
            ['Precio Lista', u => fmt(u.precio_lista)],
            ['Precio por m²', u => fmt(u.precio_m2)],
            ['Estatus', u => u.estatus],
          ].map(([label, getter], i) => (
            <tr key={label} style={{ background: i % 2 === 0 ? '#f9f9f9' : '#fff' }}>
              <td style={{ padding: '6px 12px', fontWeight: '500', color: '#333' }}>{label}</td>
              {listaUnidades.map(u => (
                <td key={u.id} style={{ padding: '6px 12px', textAlign: 'center', color: '#333' }}>{getter(u) || '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {planes.length > 0 && (
        <div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#1a1a2e', marginBottom: '12px' }}>Opciones de pago por unidad</div>
          <div style={{ display: 'flex', gap: '16px' }}>
            {listaUnidades.map(u => (
              <div key={u.id} style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#1a1a2e', marginBottom: '8px', textAlign: 'center', background: '#f0f0f0', padding: '6px', borderRadius: '4px' }}>
                  Unidad {u.numero} — {fmt(u.precio_lista)}
                </div>
                {planes.map(plan => {
                  const calc = calcularPlan(plan, u.precio_lista || 0);
                  return (
                    <div key={plan.id} style={{ border: '1px solid #ddd', borderRadius: '6px', marginBottom: '8px', overflow: 'hidden' }}>
                      <div style={{ background: '#1a1a2e', color: '#fff', padding: '5px 8px', fontSize: '10px', fontWeight: '700', textAlign: 'center' }}>
                        {plan.nombre.toUpperCase()}
                      </div>
                      <div style={{ padding: '8px' }}>
                        {fila('Precio con descuento:', fmt(calc.precioConDescuento))}
                        {fila('Ahorro:', fmt(calc.ahorro))}
                        {fila(`Enganche (${plan.enganche}%):`, fmt(calc.enganche))}
                        {fila(`Durante obra (${plan.durante_obra}%):`, fmt(calc.duranteObra))}
                        {plan.meses_plan > 0 && fila(`${plan.meses_plan} mensualidades:`, fmt(calc.mensualidad))}
                        {fila(`A la entrega (${calc.restoPorc}%):`, fmt(calc.entrega))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#888' }}>
        <div><strong>Asesor:</strong> {asesor.nombre} | {asesor.celular} | {asesor.email}</div>
        <div style={{ maxWidth: '400px', textAlign: 'right', lineHeight: '1.4' }}>
          Todos los precios y áreas son estimados. Válido por 24 horas a partir de: {fechaActual}
        </div>
      </div>
    </div>
  );

  const renderIndividual = () => {
    const u = listaUnidades[0];
    const precio = u?.precio_lista || 0;
    const detalles = u?.detalles ? u.detalles.split('\n').filter(d => d.trim()) : [];
    // FIX: prioriza la cuenta bancaria de la torre/etapa de la unidad;
    // si no hay una configurada específicamente, cae al dato general
    // del desarrollo (comportamiento igual al de antes).
    const datosBancariosMostrar = datosBancariosTorre || desarrollo.datos_bancarios;
    return (
      <div ref={cotizacionRef} style={{
        background: '#fff', width: '816px', height: '1056px', padding: '36px',
        boxSizing: 'border-box', display: 'flex', gap: '28px',
        fontFamily: 'Arial, sans-serif', position: 'relative'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            {desarrollo.logo_url
              ? <img src={desarrollo.logo_url} alt={desarrollo.nombre} style={{ maxHeight: '80px', maxWidth: '180px', objectFit: 'contain' }} />
              : <div style={{ fontSize: '24px', fontWeight: '900', color: '#1a1a2e', letterSpacing: '3px' }}>{desarrollo.nombre}</div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #ddd' }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#333' }}>Tipo: {u?.tipologia}</div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#888' }}>Precio Lista:</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#333' }}>{fmt(precio)} MXN</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: '10px', color: '#333', marginBottom: '14px' }}>
            <div style={{ width: '50%', boxSizing: 'border-box', paddingBottom: '3px' }}>No. UNIDAD: {u?.numero}</div>
            <div style={{ width: '50%', boxSizing: 'border-box', paddingBottom: '3px' }}>M² UNIDAD: {u?.m2_interior}</div>
            <div style={{ width: '50%', boxSizing: 'border-box', paddingBottom: '3px' }}>NIVEL: {u?.nivel}</div>
            <div style={{ width: '50%', boxSizing: 'border-box', paddingBottom: '3px' }}>M² TERRAZA: {u?.m2_terraza}</div>
            <div style={{ width: '50%', boxSizing: 'border-box', paddingBottom: '3px' }}>RECÁMARAS: {u?.recamaras}</div>
            <div style={{ width: '50%', boxSizing: 'border-box', paddingBottom: '3px' }}>BODEGA: {u?.m2_bodega}</div>
            <div style={{ width: '50%', boxSizing: 'border-box', paddingBottom: '3px' }}>SUP TOTAL: {u?.m2_total} M²</div>
            <div style={{ width: '50%', boxSizing: 'border-box', paddingBottom: '3px' }}>CAJONES: {u?.estacionamiento}</div>
            <div style={{ width: '50%', boxSizing: 'border-box', paddingBottom: '3px' }}>PRECIO POR M²: {fmt(u?.precio_m2)}</div>
          </div>
          {detalles.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#333', marginBottom: '5px' }}>DETALLES DE LA UNIDAD:</div>
              {detalles.map((d, i) => <div key={i} style={{ fontSize: '10px', color: '#444', marginBottom: '2px' }}>{d}</div>)}
            </div>
          )}
          <div style={{ marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid #ddd' }}>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '4px' }}>Cotización dirigida a:</div>
            <div style={{ fontSize: '11px', color: '#333', lineHeight: '1.7' }}>
              <div>NOMBRE: {contactoSeleccionado ? `${contactoSeleccionado.nombres} ${contactoSeleccionado.apellidos}` : ''}</div>
              {contactoSeleccionado?.telefono && <div>TELÉFONO: {contactoSeleccionado.telefono}</div>}
              {contactoSeleccionado?.correo && <div>EMAIL: {contactoSeleccionado.correo}</div>}
            </div>
          </div>
          {datosBancariosMostrar && (
            <div style={{ marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid #ddd' }}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '4px' }}>Cuenta para depositar</div>
              <div style={{ fontSize: '10px', color: '#444', whiteSpace: 'pre-line', lineHeight: '1.6' }}>{datosBancariosMostrar}</div>
            </div>
          )}
          <div style={{ marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid #ddd' }}>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '4px' }}>Datos del asesor:</div>
            <div style={{ fontSize: '10px', color: '#444', lineHeight: '1.8' }}>
              <div>Nombre: {asesor.nombre}</div>
              <div>Celular: {asesor.celular}</div>
              <div>Email: {asesor.email}</div>
            </div>
          </div>
          <div style={{ fontSize: '9px', color: '#888', lineHeight: '1.5', textAlign: 'justify' }}>
            Todos los precios y áreas descritas en la presente cotización son estimados. Los valores y condiciones de esta Propuesta están sujetos a modificación sin previo aviso. Esta propuesta es valida por 24 horas apartir de la siguiente fecha: {fechaActual}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '14px', textAlign: 'center' }}>Opciones de pago</div>
          {planes.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#888', textAlign: 'center', padding: '2rem' }}>No hay planes activos configurados</div>
          ) : planes.map((plan) => {
            const calc = calcularPlan(plan, precio);
            return (
              <div key={plan.id} style={{ border: '1px solid #ddd', borderRadius: '6px', marginBottom: '12px', overflow: 'hidden' }}>
                <div style={{ background: '#1a1a2e', color: '#fff', padding: '8px', textAlign: 'center', fontSize: '11px', fontWeight: '700', letterSpacing: '1px' }}>
                  {plan.nombre.toUpperCase()}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  {fila('Precio descuento Plan:', fmt(calc.precioConDescuento))}
                  {fila('Total ahorro:', fmt(calc.ahorro))}
                  {fila(`Enganche(${plan.enganche}%):`, fmt(calc.enganche))}
                  {fila(`Durante la obra(${plan.durante_obra}%):`, fmt(calc.duranteObra))}
                  {plan.meses_plan > 0 && fila(`${plan.meses_plan} mensualidades de:`, fmt(calc.mensualidad))}
                  {fila(`A la entrega(${calc.restoPorc}%):`, fmt(calc.entrega))}
                </div>
              </div>
            );
          })}
          {desarrollo.apartado > 0 && (
            <div style={{ fontSize: '11px', color: '#555', marginTop: '8px' }}>Apartado {fmt(desarrollo.apartado)} Pesos MXN</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, overflowY: 'auto', padding: '1rem' }}
      onClick={() => setShowContactos(false)}>
      <div style={{ maxWidth: esComparacion ? '1100px' : '860px', margin: '0 auto' }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <input
                value={contactoSeleccionado ? `${contactoSeleccionado.nombres} ${contactoSeleccionado.apellidos}` : buscarContacto}
                onChange={e => { setBuscarContacto(e.target.value); setContactoSeleccionado(null); setShowContactos(true); }}
                onFocus={() => setShowContactos(true)}
                placeholder='Buscar contacto...'
                style={{ padding: '10px 12px', border: 'none', borderRadius: '6px', fontSize: '14px', width: isMobile ? '100%' : '200px', boxSizing: 'border-box' }} />
              {showContactos && (
                <div style={{ position: 'absolute', top: '44px', left: 0, background: '#fff', border: '0.5px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100, width: '280px', maxHeight: '200px', overflowY: 'auto' }}>
                  {contactosFiltrados.length === 0 ? (
                    <div style={{ padding: '12px', fontSize: '13px', color: '#888' }}>Sin resultados</div>
                  ) : contactosFiltrados.map(c => (
                    <button key={c.id} onClick={() => { setContactoSeleccionado(c); setBuscarContacto(''); setShowContactos(false); }}
                      style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '0.5px solid #f0f0f0' }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: '#333' }}>{c.nombres} {c.apellidos}</div>
                      <div style={{ fontSize: '11px', color: '#888' }}>{c.correo}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!isMobile && (
              <>
                <input value={asesor.nombre} readOnly
                  style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', fontSize: '13px', width: '160px', background: 'rgba(255,255,255,0.85)', cursor: 'default', color: '#333' }} />
                <input value={asesor.celular} readOnly
                  style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', fontSize: '13px', width: '120px', background: 'rgba(255,255,255,0.85)', cursor: 'default', color: '#333' }} />
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleDescargar} disabled={generando || compartiendo}
              style={{ padding: isMobile ? '12px 16px' : '8px 16px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: isMobile ? '14px' : '13px' }}>
              {generando ? 'Generando...' : '⬇ Descargar PDF'}
            </button>
            <button onClick={handleCompartir} disabled={generando || compartiendo}
              style={{ padding: isMobile ? '12px 16px' : '8px 16px', background: '#2E7D4F', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: isMobile ? '14px' : '13px' }}>
              {compartiendo ? 'Generando...' : '↗ Compartir'}
            </button>
            <button onClick={onClose}
              style={{ padding: isMobile ? '12px 16px' : '8px 16px', background: '#fff', color: '#333', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: isMobile ? '14px' : '13px' }}>
              × Cerrar
            </button>
          </div>
        </div>

        {/* Contenedor con escala para vista móvil */}
        <div
          ref={contenedorRef}
          style={{
            transformOrigin: 'top left',
            transform: isMobile ? `scale(${escala})` : 'none',
            width: isMobile ? `${anchoDoc}px` : '100%',
            height: isMobile ? `${(esComparacion ? 816 : 1056) * escala}px` : 'auto',
            overflow: 'visible',
          }}>
          {esComparacion ? renderComparacion() : renderIndividual()}
        </div>
      </div>
    </div>
  );
}