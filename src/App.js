import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import Contactos from './contactos';
import Desarrollos from './Desarrollos';
import Agentes from './Agentes';
import Negocios from './Negocios';
import Movimientos from './Movimientos';
import Objetivos from './Objetivos';
import PushNotificaciones from './PushNotificaciones';
import TendenciasProducto from './TendenciasProducto';
import BuyerPersona from './BuyerPersona';
import HistorialMovimientos from './HistorialMovimientos';
import DashboardDireccion from './DashboardDireccion';
import Expedientes from './Expedientes';
import Titulacion from './Titulacion';
import Cobranza from './Cobranza';
import Construccion from './Construccion';
// Iconos de línea (lucide-react) en lugar de emojis en todo el sidebar.
import {
  Trophy, Contact, Briefcase, Building2, Users, Folder,
  Target, Building, LineChart,
  ArrowLeftRight, FileText, ShieldCheck, Settings, LogOut, Flame, UserCheck, ClipboardCheck, Banknote, HardHat,
} from 'lucide-react';

const MENU_COMPLETO = [
  { id: 'dashboard', label: 'Ranking Gemex', icon: 'dashboard' },
  { id: 'contactos', label: 'Contactos', icon: 'contactos' },
  { id: 'negocios', label: 'Negocios', icon: 'negocios' },
  { id: 'desarrollos', label: 'Desarrollos', icon: 'desarrollos' },
  { id: 'agentes', label: 'Agentes', icon: 'agentes' },
  { id: 'expedientes', label: 'Expedientes', icon: 'expedientes' },
  { id: 'direccion', label: 'Dirección', icon: 'direccion', submenu: [
    { id: 'dashboard_dir', label: 'Dashboard', icon: 'dashboard_dir' },
    { id: 'movimientos', label: 'Movimientos', icon: 'movimientos' },
    { id: 'historial', label: 'Historial', icon: 'historial' },
    { id: 'titulacion', label: 'Titulación', icon: 'titulacion' },
    { id: 'cobranza', label: 'Cobranza', icon: 'cobranza' },
    { id: 'construccion', label: 'Construcción', icon: 'construccion' },
    { id: 'objetivos', label: 'Objetivos', icon: 'objetivos' },
    { id: 'tendencias_producto', label: 'Tendencias', icon: 'tendencias_producto' },
    { id: 'buyer_persona', label: 'Buyer Persona', icon: 'buyer_persona' },
  ]},
];

const MENU_POR_ROL = {
  'Super Admin': ['dashboard', 'contactos', 'negocios', 'desarrollos', 'agentes', 'expedientes', 'direccion'],
  'Admin':       ['dashboard', 'contactos', 'negocios', 'desarrollos', 'agentes', 'expedientes', 'direccion'],
  'Sub Admin':   ['dashboard', 'contactos', 'negocios', 'desarrollos', 'agentes', 'expedientes', 'direccion'],
  'Gerente Editor':   ['dashboard', 'contactos', 'negocios', 'desarrollos', 'expedientes', 'direccion'],
  'Gerente Operador': ['dashboard', 'contactos', 'negocios', 'desarrollos', 'expedientes', 'direccion'],
  // Mesa de Control — revisa expedientes de TODA la empresa (sin
  // restricción de desarrollo/equipo, a diferencia de los demás Gerentes).
  // Sin Ranking Gemex, Contactos, Agentes ni Negocios. Dentro de Dirección
  // solo ve Movimientos, Historial y Titulación (se filtra en
  // submenuFiltrado más abajo).
  'Mesa de Control':  ['desarrollos', 'expedientes', 'direccion'],
  'Agente':      ['dashboard', 'contactos', 'negocios', 'desarrollos', 'expedientes'],
  'Desarrollador': ['contactos', 'desarrollos', 'direccion'],
  // FIX: roles de un solo módulo — solo entran a Dirección y ahí solo ven
  // su propia pantalla (se filtra en submenuFiltrado más abajo), igual
  // que Mesa de Control con Movimientos/Historial.
  'Construcción': ['direccion'],
  'Tesorería': ['direccion'],
};

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  const [isTablet, setIsTablet] = React.useState(window.innerWidth >= 768 && window.innerWidth < 1024);
  React.useEffect(() => {
    const handler = () => {
      setIsMobile(window.innerWidth < 768);
      setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return { isMobile, isTablet, isSmall: isMobile || isTablet };
}

// Logo de Grupo Gemex (public/logo-gemex.jpg — fondo rojo #C0203A, texto blanco).
function LogoGemex({ small = false }) {
  return (
    <img
      src={process.env.PUBLIC_URL + '/logo-gemex.jpg'}
      alt="Grupo Gemex"
      style={{ height: small ? '32px' : '38px', width: 'auto', verticalAlign: 'middle', borderRadius: '4px' }}
    />
  );
}

// Iconos de línea (lucide-react) reemplazando emojis. size=18 y color
// heredado (currentColor) para que respeten el color activo/inactivo del
// botón que los contiene.
const MENU_ICONS = {
  dashboard: <Trophy size={18} />,
  contactos: <Contact size={18} />,
  negocios: <Briefcase size={18} />,
  desarrollos: <Building2 size={18} />,
  agentes: <Users size={18} />,
  expedientes: <Folder size={18} />,
  direccion: <Building size={18} />,
  movimientos: <ArrowLeftRight size={18} />,
  dashboard_dir: <LineChart size={18} />,
  historial: <FileText size={18} />,
  titulacion: <ClipboardCheck size={18} />,
  cobranza: <Banknote size={18} />,
  construccion: <HardHat size={18} />,
  objetivos: <Target size={18} />,
  tendencias_producto: <Flame size={18} />,
  buyer_persona: <UserCheck size={18} />,
};

function Sidebar({ active, onNav, onLogout, miAgente, miRol, isOpen, onClose, isMobile, showAviso, onToggleAviso, rankingBsVisible, onToggleRankingBs, expedientesRechazados }) {
  // FIX: "Dirección" (y cualquier submenú) inicia cerrado por defecto en
  // vez de abierto. Antes: useState('direccion').
  const [submenuAbierto, setSubmenuAbierto] = React.useState(null);
  const menuPermitido = MENU_POR_ROL[miRol] || [];
  const menuVisible = MENU_COMPLETO.filter(item => {
    if (!menuPermitido.includes(item.id)) return false;
    if (item.id === 'dashboard' && miRol === 'Agente' && miAgente?.equipo !== 'Gemex') return false;
    if (item.id === 'dashboard' && miRol === 'Desarrollador') return false;
    if (item.id === 'dashboard' && miRol !== 'Super Admin' && !rankingBsVisible) return false;
    return true;
  });
  const nombre = miAgente ? `${miAgente.nombre || ''} ${miAgente.apellidos || ''}`.trim() : '';
  const handleNav = (id) => { onNav(id); if (isMobile) onClose(); };
  if (isMobile && !isOpen) return null;

  return (
    <>
      {isMobile && isOpen && (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 998 }} />
      )}
      <div style={{ width: '240px', height: '100dvh', background: '#6B1524', display: 'flex', flexDirection: 'column', flexShrink: 0, position: isMobile ? 'fixed' : 'sticky', top: 0, left: 0, zIndex: 999, overflowY: 'auto', boxShadow: isMobile ? '4px 0 20px rgba(0,0,0,0.3)' : 'none', transition: 'transform 0.25s ease' }}>
        <div style={{ padding: '20px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <LogoGemex />
          {isMobile && <button onClick={onClose} style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#888', fontSize: '22px', cursor: 'pointer', padding: '4px' }}>✕</button>}
        </div>
        {nombre && (
          <div style={{ padding: '12px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>Bienvenido,</div>
            <div style={{ fontSize: '13px', color: '#ccc', fontWeight: '500', marginTop: '2px' }}>{nombre}</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '1px' }}>
              {miAgente?.equipo === 'Gemex' && miAgente?.codigo_agente ? miAgente.codigo_agente : miRol}
            </div>
          </div>
        )}
        <nav style={{ flex: 1, padding: '12px 8px' }}>
          {menuVisible.map(item => {
            const tieneSubmenu = item.submenu?.length > 0;
            const estaAbierto = submenuAbierto === item.id;
            const submenuActivo = item.submenu?.some(s => s.id === active);
            const isActive = active === item.id || submenuActivo;
            const submenuFiltrado = (item.submenu || []).filter(s => {
              if (miRol === 'Desarrollador') return s.id === 'dashboard_dir';
              // FIX: Mesa de Control entra a revisar Movimientos, Historial
              // y Titulación (también se encargan de ese módulo) — sin
              // Dashboard, Cobranza, Objetivos, Tendencias ni Buyer Persona
              // (a diferencia de los demás Gerentes).
              if (miRol === 'Mesa de Control') return s.id === 'movimientos' || s.id === 'historial' || s.id === 'titulacion';
              // FIX: Construcción y Tesorería son roles de un solo módulo
              // — dentro de Dirección solo ven su propia pantalla.
              if (miRol === 'Construcción') return s.id === 'construccion';
              if (miRol === 'Tesorería') return s.id === 'cobranza';
              if (s.id === 'historial') return miRol === 'Super Admin' || miRol === 'Gerente Editor' || miRol === 'Gerente Operador';
              if (s.id === 'tendencias_producto') return miRol === 'Super Admin' || miRol === 'Gerente Editor' || miRol === 'Gerente Operador';
              if (s.id === 'buyer_persona') return miRol === 'Super Admin' || miRol === 'Admin' || miRol === 'Gerente Editor' || miRol === 'Gerente Operador';
              return true;
            });
            return (
              <div key={item.id}>
                <button onClick={() => { if (tieneSubmenu) setSubmenuAbierto(estaAbierto ? null : item.id); else handleNav(item.id); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', marginBottom: '2px', fontSize: '14px', background: isActive && !tieneSubmenu ? '#fff' : tieneSubmenu && estaAbierto ? 'rgba(255,255,255,0.08)' : 'transparent', color: isActive && !tieneSubmenu ? '#C0203A' : '#aaa', textAlign: 'left', fontWeight: isActive ? '600' : '400', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                      {MENU_ICONS[item.icon]}
                      {item.id === 'expedientes' && expedientesRechazados > 0 && (
                        <span style={{ position: 'absolute', top: '-3px', right: '-4px', width: '9px', height: '9px', borderRadius: '50%', background: '#E53935', border: '1.5px solid #6B1524' }} />
                      )}
                    </span>
                    {item.label}
                  </div>
                  {tieneSubmenu && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)' }}>{estaAbierto ? '▾' : '▸'}</span>}
                  {item.id === 'dashboard' && miRol === 'Super Admin' && (
                    <span onClick={e => { e.stopPropagation(); onToggleRankingBs(); }}
                      title={rankingBsVisible ? 'Visible para todos — click para ocultar' : 'Oculto para los demás roles — click para mostrar'}
                      style={{ width: '32px', height: '18px', borderRadius: '10px', background: rankingBsVisible ? '#2E7D4F' : '#444', position: 'relative', flexShrink: 0, cursor: 'pointer' }}>
                      <span style={{ position: 'absolute', top: '2px', left: rankingBsVisible ? '16px' : '2px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                    </span>
                  )}
                </button>
                {tieneSubmenu && estaAbierto && (
                  <div style={{ paddingLeft: '12px', marginBottom: '4px' }}>
                    {submenuFiltrado.map(sub => (
                      <button key={sub.id} onClick={() => handleNav(sub.id)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', marginBottom: '2px', fontSize: '14px', background: active === sub.id ? '#fff' : 'transparent', color: active === sub.id ? '#C0203A' : '#888', textAlign: 'left', fontWeight: active === sub.id ? '600' : '400' }}>
                        <span style={{ display: 'flex', alignItems: 'center' }}>{MENU_ICONS[sub.icon]}</span>
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div style={{ padding: '12px 8px', borderTop: '0.5px solid rgba(255,255,255,0.08)' }}>
          <button onClick={onToggleAviso}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', marginBottom: '2px', fontSize: '14px', background: showAviso ? 'rgba(255,255,255,0.1)' : 'transparent', color: showAviso ? '#fff' : '#aaa', textAlign: 'left' }}>
            <span style={{ display: 'flex', alignItems: 'center' }}><ShieldCheck size={18} /></span>
            Aviso de Privacidad
          </button>
          <button onClick={() => handleNav('micuenta')}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', marginBottom: '2px', fontSize: '14px', background: active === 'micuenta' ? '#fff' : 'transparent', color: active === 'micuenta' ? '#C0203A' : '#aaa', textAlign: 'left' }}>
            <span style={{ display: 'flex', alignItems: 'center' }}><Settings size={18} /></span>
            Mi cuenta
          </button>
          <button onClick={onLogout}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 12px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '14px', textAlign: 'left' }}>
            <span style={{ display: 'flex', alignItems: 'center' }}><LogOut size={18} /></span>
            Cerrar sesión
          </button>
        </div>
      </div>
    </>
  );
}

function TopBar({ onMenuOpen, miAgente }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 100, background: '#6B1524', padding: '0 16px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
      <button onClick={onMenuOpen} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '22px', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center' }}>☰</button>
      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}><LogoGemex small /></div>
      <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px', fontWeight: '600' }}>
        {miAgente?.nombre?.[0]?.toUpperCase() || '?'}
      </div>
    </div>
  );
}

function Dashboard() {
  const [movimientos, setMovimientos] = React.useState([]);
  const [agentesBS, setAgentesBS] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [anioSel, setAnioSel] = React.useState(new Date().getFullYear());
  const { isMobile } = useIsMobile();

  React.useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    setLoading(true);
    const [{ data: movData }, { data: agData }] = await Promise.all([
      supabase.from('movimientos').select('*').order('created_at', { ascending: true }),
      supabase.from('agentes').select('*').eq('equipo', 'Gemex').eq('activo', true).not('codigo_agente', 'is', null).neq('codigo_agente', ''),
    ]);
    setMovimientos(movData || []);
    setAgentesBS(agData || []);
    setLoading(false);
  };

  const aniosDisponibles = [...new Set(movimientos.map(m => new Date(m.created_at).getFullYear()))].sort((a,b) => b-a);
  const movsAnio = movimientos.filter(m => new Date(m.created_at).getFullYear() === anioSel);

  const ranking = agentesBS.map(agente => {
    const nombreCompleto = `${agente.nombre} ${agente.apellidos}`.trim();
    const totalAnio = movsAnio.filter(m => m.tipo === 'Vendida' && m.vendedor === nombreCompleto).length;
    return { codigo: agente.codigo_agente, totalAnio };
  })
  .filter(a => a.totalAnio > 0)
  .sort((a, b) => b.totalAnio - a.totalAnio);

  const COLORES_RANKING = ['#10B981','#3B82F6','#F59E0B','#8B5CF6','#EF4444','#EC4899','#14B8A6','#F97316'];

  const medallaIcon = (i) => {
    if (i === 0) return '🥇';
    if (i === 1) return '🥈';
    if (i === 2) return '🥉';
    return `${i + 1}°`;
  };

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Trophy size={28} color="#1a1a2e" />
          <div>
            <h2 style={{ fontSize: isMobile ? '17px' : '22px', fontWeight: '700', color: '#1a1a2e', margin: 0 }}>Ranking Gemex</h2>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Ventas acumuladas por agente · {anioSel}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#888' }}>Año:</span>
          <select value={anioSel} onChange={e => setAnioSel(parseInt(e.target.value))}
            style={{ padding: '6px 10px', border: '0.5px solid #ddd', borderRadius: '6px', fontSize: '13px', background: '#fff' }}>
            {(aniosDisponibles.length > 0 ? aniosDisponibles : [new Date().getFullYear()]).map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#888' }}>Cargando...</div>
      ) : ranking.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#aaa', fontSize: '14px' }}>
          Sin ventas registradas en {anioSel}
        </div>
      ) : (
        <>
          {!isMobile && ranking.length >= 1 && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '1.5rem', alignItems: 'flex-end' }}>
              {ranking[1] ? (
                <div style={{ flex: 1, background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', borderTop: '3px solid #C0C0C0' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>🥈</div>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#e0e0e0', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontWeight: '700', color: '#666', fontSize: '13px' }}>{ranking[1].codigo}</span>
                  </div>
                  <div style={{ fontWeight: '700', fontSize: '16px', color: '#1a1a2e' }}>{ranking[1].codigo}</div>
                  <div style={{ fontSize: '36px', fontWeight: '700', color: '#3B82F6', marginTop: '8px' }}>{ranking[1].totalAnio}</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>ventas</div>
                </div>
              ) : <div style={{ flex: 1 }} />}

              <div style={{ flex: 1, background: '#1a1a2e', borderRadius: '12px', padding: '2rem', textAlign: 'center', borderTop: '3px solid #FFD700', transform: 'scale(1.05)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>🥇</div>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#333', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontWeight: '700', color: '#fff', fontSize: '14px' }}>{ranking[0].codigo}</span>
                </div>
                <div style={{ fontWeight: '700', fontSize: '18px', color: '#fff' }}>{ranking[0].codigo}</div>
                <div style={{ fontSize: '44px', fontWeight: '700', color: '#10B981', marginTop: '10px' }}>{ranking[0].totalAnio}</div>
                <div style={{ fontSize: '12px', color: '#aaa' }}>ventas</div>
              </div>

              {ranking[2] ? (
                <div style={{ flex: 1, background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', borderTop: '3px solid #CD7F32' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>🥉</div>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#e0e0e0', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontWeight: '700', color: '#666', fontSize: '13px' }}>{ranking[2].codigo}</span>
                  </div>
                  <div style={{ fontWeight: '700', fontSize: '16px', color: '#1a1a2e' }}>{ranking[2].codigo}</div>
                  <div style={{ fontSize: '36px', fontWeight: '700', color: '#F59E0B', marginTop: '8px' }}>{ranking[2].totalAnio}</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>ventas</div>
                </div>
              ) : <div style={{ flex: 1 }} />}
            </div>
          )}

          <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '0.5px solid #e0e0e0' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: '600', color: '#555', width: '48px' }}>#</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '600', color: '#555' }}>Agente</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: '600', color: '#555' }}>Ventas del año</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((ag, i) => {
                  const color = COLORES_RANKING[i % COLORES_RANKING.length];
                  return (
                    <tr key={i} style={{ borderBottom: '0.5px solid #f0f0f0', background: i === 0 ? '#f9fffe' : 'transparent' }}>
                      <td style={{ padding: '14px 16px', fontSize: '20px', textAlign: 'center' }}>{medallaIcon(i)}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#888' }}>{ag.codigo}</span>
                          </div>
                          <div style={{ fontWeight: '600', color: '#1a1a2e', fontSize: '15px' }}>{ag.codigo}</div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '700', fontSize: '24px', color }}>{ag.totalAnio}</td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: '1px solid #e0e0e0', background: '#fafafa' }}>
                  <td></td>
                  <td style={{ padding: '12px 16px', fontWeight: '700', color: '#555' }}>TOTAL</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: '#1a1a2e', fontSize: '24px' }}>
                    {ranking.reduce((s, ag) => s + ag.totalAnio, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// FIX: la Edge Function crear-usuario también sirve para que un agente
// pueda auto-repararse: si su propia cuenta de Auth no coincide con el
// correo guardado (huérfana / duplicada de una importación vieja), se
// intenta el mismo cambio de contraseña vía la función administrativa
// (con paginación completa) en vez de solo el método de sesión propia,
// que puede quedar en un estado raro si la cuenta activa no es "la buena".
const EDGE_CREAR_USUARIO = `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/crear-usuario`;
const ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

function MiCuenta({ user, miRol }) {
  const [agente, setAgente] = useState(null);
  const [form, setForm] = useState({ nombre: '', apellidos: '', telefono: '', whatsapp: '' });
  const [passNueva, setPassNueva] = useState('');
  const [passConfirm, setPassConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [msgPass, setMsgPass] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cambiandoPass, setCambiandoPass] = useState(false);
  const { isMobile } = useIsMobile();
  const puedeEditar = miRol === 'Super Admin';

  useEffect(() => { cargarAgente(); }, []);

  const cargarAgente = async () => {
    const { data } = await supabase.from('agentes').select('*').eq('correo', user.email).single();
    if (data) { setAgente(data); setForm({ nombre: data.nombre || '', apellidos: data.apellidos || '', telefono: data.telefono || '', whatsapp: data.whatsapp || '' }); }
  };

  const handleGuardar = async () => {
    if (!puedeEditar) return;
    setGuardando(true);
    await supabase.from('agentes').update(form).eq('correo', user.email);
    setGuardando(false);
    setMsg('Datos actualizados correctamente');
    setTimeout(() => setMsg(''), 3000);
    cargarAgente();
  };

  // FIX: antes solo usaba supabase.auth.updateUser (sesión propia). Si la
  // sesión activa por alguna razón queda ligada a una cuenta distinta a
  // la "buena" (por el caos de cuentas huérfanas/duplicadas que veníamos
  // arrastrando), esto podía cambiar la contraseña de la cuenta
  // equivocada, dejando al agente sin poder entrar con la nueva. Ahora,
  // si el método de sesión falla, se intenta también vía la Edge Function
  // administrativa (que ya busca por correo con paginación completa),
  // como respaldo.
  const handleCambiarPass = async () => {
    setMsgPass('');
    if (!passNueva || passNueva.length < 6) { setMsgPass('Mínimo 6 caracteres'); return; }
    if (passNueva !== passConfirm) { setMsgPass('Las contraseñas no coinciden'); return; }
    setCambiandoPass(true);

    const { error } = await supabase.auth.updateUser({ password: passNueva });

    if (error) {
      // Respaldo: intentar por correo vía la Edge Function administrativa
      try {
        const res = await fetch(EDGE_CREAR_USUARIO, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
          body: JSON.stringify({ action: 'cambiar_password', email: user.email, password: passNueva })
        });
        const result = await res.json();
        if (result.error) {
          setMsgPass('Error al cambiar contraseña: ' + result.error);
          setCambiandoPass(false);
          return;
        }
      } catch (err) {
        setMsgPass('Error al cambiar contraseña');
        setCambiandoPass(false);
        return;
      }
    }

    setCambiandoPass(false);
    setMsgPass('Contraseña actualizada');
    setPassNueva(''); setPassConfirm('');
    setTimeout(() => setMsgPass(''), 3000);
  };

  const campo = (label, key) => (
    <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '0.5px solid #f0f0f0' }}>
      <span style={{ width: '140px', fontSize: '13px', color: '#666', flexShrink: 0 }}>{label}</span>
      <input value={form[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })} readOnly={!puedeEditar}
        style={{ flex: 1, border: 'none', borderBottom: !puedeEditar ? 'none' : '0.5px solid #ccc', padding: '4px 0', fontSize: '13px', background: 'transparent', outline: 'none', color: !puedeEditar ? '#333' : '#111', cursor: !puedeEditar ? 'default' : 'text' }} />
    </div>
  );

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
      <h2 style={{ fontSize: isMobile ? '17px' : '20px', fontWeight: '500', color: '#1a1a2e', marginBottom: '1.5rem' }}>Mi cuenta</h2>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', maxWidth: '900px' }}>
        <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: isMobile ? '1.25rem' : '2rem' }}>
          <div style={{ fontSize: '11px', color: '#888', fontWeight: '500', marginBottom: '1.5rem' }}>PERFIL</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '0.5px solid #f0f0f0' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', overflow: 'hidden', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {agente?.foto_url ? <img src={agente.foto_url} alt="foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '20px', fontWeight: '600', color: '#888' }}>{(form.nombre?.[0] || '').toUpperCase()}{(form.apellidos?.[0] || '').toUpperCase()}</span>}
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '600', color: '#1a1a2e' }}>{form.nombre} {form.apellidos}</div>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>{agente?.rol}</div>
              <div style={{ fontSize: '12px', color: '#888' }}>{agente?.equipo}</div>
            </div>
          </div>
          {campo('Nombre', 'nombre')}
          {campo('Apellidos', 'apellidos')}
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '0.5px solid #f0f0f0' }}>
            <span style={{ width: '140px', fontSize: '13px', color: '#666', flexShrink: 0 }}>Correo</span>
            <span style={{ fontSize: '13px', color: '#333', wordBreak: 'break-all' }}>{user.email}</span>
          </div>
          {campo('Teléfono', 'telefono')}
          {campo('WhatsApp', 'whatsapp')}
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '0.5px solid #f0f0f0' }}>
            <span style={{ width: '140px', fontSize: '13px', color: '#666', flexShrink: 0 }}>Rol</span>
            <span style={{ fontSize: '13px', color: '#333' }}>{agente?.rol || '—'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0' }}>
            <span style={{ width: '140px', fontSize: '13px', color: '#666', flexShrink: 0 }}>Equipo</span>
            <span style={{ fontSize: '13px', color: '#333' }}>{agente?.equipo || '—'}</span>
          </div>
          {msg && <div style={{ marginTop: '12px', padding: '10px', borderRadius: '8px', background: '#EAF3DE', color: '#27500A', fontSize: '13px' }}>{msg}</div>}
          {puedeEditar && (
            <button onClick={handleGuardar} disabled={guardando}
              style={{ marginTop: '1.5rem', padding: '12px 24px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', width: '100%' }}>
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          )}
        </div>
        <PushNotificaciones correo={user.email} />
        <div style={{ background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: '12px', padding: isMobile ? '1.25rem' : '2rem', alignSelf: 'flex-start' }}>
          <div style={{ fontSize: '11px', color: '#888', fontWeight: '500', marginBottom: '1.5rem' }}>CAMBIAR CONTRASEÑA</div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '0.5px solid #f0f0f0' }}>
            <span style={{ width: '140px', fontSize: '13px', color: '#666', flexShrink: 0 }}>Nueva contraseña</span>
            <input type='password' value={passNueva} onChange={e => setPassNueva(e.target.value)}
              style={{ flex: 1, border: 'none', borderBottom: '0.5px solid #ccc', padding: '4px 0', fontSize: '13px', background: 'transparent', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '0.5px solid #f0f0f0' }}>
            <span style={{ width: '140px', fontSize: '13px', color: '#666', flexShrink: 0 }}>Confirmar</span>
            <input type='password' value={passConfirm} onChange={e => setPassConfirm(e.target.value)}
              style={{ flex: 1, border: 'none', borderBottom: '0.5px solid #ccc', padding: '4px 0', fontSize: '13px', background: 'transparent', outline: 'none' }} />
          </div>
          {msgPass && (
            <div style={{ marginTop: '12px', padding: '10px', borderRadius: '8px', fontSize: '13px',
              background: msgPass.includes('Error') || msgPass.includes('coinciden') || msgPass.includes('Mínimo') ? '#FCEBEB' : '#EAF3DE',
              color: msgPass.includes('Error') || msgPass.includes('coinciden') || msgPass.includes('Mínimo') ? '#A32D2D' : '#27500A' }}>
              {msgPass}
            </div>
          )}
          <button onClick={handleCambiarPass} disabled={cambiandoPass}
            style={{ marginTop: '1.5rem', padding: '12px 24px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', width: '100%' }}>
            {cambiandoPass ? 'Actualizando...' : 'Actualizar contraseña'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError('Correo o contraseña incorrectos');
    } else if (data?.user) {
      await supabase.from('agentes').update({ last_sign_in: new Date().toISOString() }).eq('correo', email);
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#6B1524', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#4A0F1A', padding: '2rem', borderRadius: '12px', border: '0.5px solid rgba(255,255,255,0.1)', width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <LogoGemex />
          <p style={{ fontSize: '13px', color: '#666', marginTop: '12px' }}>Inicia sesión para continuar</p>
        </div>
        {error && <div style={{ background: '#3a1a1a', color: '#ff8080', padding: '10px', borderRadius: '8px', fontSize: '13px', marginBottom: '1rem' }}>{error}</div>}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Correo</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width: '100%', padding: '12px', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box', background: '#6B1524', color: '#fff' }}
              placeholder="tu@email.com" />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: '100%', padding: '12px', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '15px', boxSizing: 'border-box', background: '#6B1524', color: '#fff' }}
              placeholder="••••••••" />
          </div>
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '14px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

function AvisoPrivacidadModal({ onClose }) {
  const { isMobile } = useIsMobile();
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: isMobile ? '1.25rem 1.5rem' : '1.5rem 2rem', borderBottom: '0.5px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: '#1a1a2e' }}>Aviso de Privacidad</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888' }}>×</button>
        </div>
        <div style={{ padding: isMobile ? '1.25rem 1.5rem' : '1.5rem 2rem', overflowY: 'auto', fontSize: '13px', lineHeight: '1.7', color: '#333' }}>
          <p>De acuerdo a lo previsto en la "Ley Federal de Protección de Datos Personales en Posesión de los Particulares", declara [RAZÓN SOCIAL DE GRUPO GEMEX], ser una sociedad legalmente constituida de conformidad con las leyes mexicanas, con domicilio en: [DOMICILIO DE GRUPO GEMEX], es responsable de recabar sus datos personales, del uso que se le dé a los mismos y de su protección.</p>
          <p>Su información personal será utilizada para proveerle de servicios ó de bienes que solicite, ó bien para identificarlo en cualquier tipo de relación jurídica ó de negocios entre Usted y nosotros, además para informarle sobre cambios en los mismos y evaluar la calidad del servicio que le brindamos.</p>
          <p>Para las finalidades antes mencionadas, requerimos obtener entre otros, los siguientes datos personales: <strong>[nombre completo y apellidos], [nacionalidad], [domicilio y teléfono particulares], [ocupación, domicilio y teléfono del lugar de trabajo], [ingresos mensuales], [estado civil], [régimen matrimonial]</strong> y de su Cónyuge: <strong>[nombre completo y apellidos], [ocupación, domicilio y teléfono del lugar de trabajo e ingresos mensuales]</strong>; manifestando que no se le pedirán datos personales catalogados como sensibles, según la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.</p>
          <p>Para ejercitar sus derechos de acceder, rectificar y cancelar sus datos personales, así como de oponerse al tratamiento de los mismos o revocar el consentimiento que para tal fin nos haya otorgado, lo podrá hacer a través de los procedimientos que hemos implementado. Para conocer dichos procedimientos, los requisitos y plazos, se puede poner en contacto con nuestro Departamento Jurídico Corporativo, en el domicilio señalado en este documento.</p>
          <p>Asimismo, le informamos que sus datos personales pueden ser transferidos y tratados dentro y fuera del país, por personas distintas a esta empresa. En ese sentido, su información puede ser compartida con personas físicas o morales, con las cuales tenemos algún tipo de relación jurídica o de negocios como <strong>[entidades inmobiliarias, de corretaje, financieras, hipotecarias, e instituciones de vivienda]</strong>, para <strong>[fines mercadológicos, de factoraje, financieros, crediticios e hipotecarios]</strong>, a efecto de proveerle adecuadamente los servicios y productos que ha solicitado, o bien para entablar cualquier tipo de relación jurídica o de negocios. Se entenderá que ha otorgado su consentimiento si usted no manifiesta su oposición para que sus datos personales sean transferidos al presentarle el presente aviso de privacidad.</p>

          <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginTop: '1.5rem', marginBottom: '0.5rem' }}>ACUERDO DE CONFIDENCIALIDAD</h4>
          <p>La información a la que tendrán acceso es estrictamente confidencial y de uso exclusivo para los fines autorizados por [RAZÓN SOCIAL DE GRUPO GEMEX], al aceptar el acceso reconocen y comprometen a:</p>
          <ul style={{ paddingLeft: '20px', margin: '0 0 1rem' }}>
            <li>No distribuir, copiar ni reproducir dicha información por ningún medio digital o físico, sin la autorización expresa de [RAZÓN SOCIAL DE GRUPO GEMEX].</li>
            <li>Proteger la información contra cualquier uso indebido, pérdida, alteración o acceso no autorizado.</li>
            <li>Informar de inmediato en caso de detectar un uso indebido o sospecha de vulneración de la confidencialidad.</li>
          </ul>
          <p>El incumplimiento de estas obligaciones podrá dar lugar a responsabilidades legales incluyendo sanciones conforme a la normativa aplicable.</p>
        </div>
        <div style={{ padding: isMobile ? '1rem 1.5rem' : '1.25rem 2rem', borderTop: '0.5px solid #f0f0f0', flexShrink: 0 }}>
          <button onClick={onClose} style={{ width: '100%', padding: '12px', background: '#C0203A', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState('desarrollos');
  const [miAgente, setMiAgente] = useState(null);
  const [miRol, setMiRol] = useState('Agente');
  const [rankingBsVisible, setRankingBsVisible] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAviso, setShowAviso] = useState(false);
  // FIX: aviso automático al entrar al CRM si tengo documentos de
  // expedientes rechazados pendientes de volver a subir.
  const [expedientesRechazados, setExpedientesRechazados] = useState(0);
  const { isMobile } = useIsMobile();

  const cargarExpedientesRechazados = async (correo) => {
    if (!correo) { setExpedientesRechazados(0); return; }
    const { count } = await supabase.from('expediente_documentos')
      .select('*', { count: 'exact', head: true })
      .eq('subido_por', correo).eq('estado_revision', 'rechazado');
    setExpedientesRechazados(count || 0);
  };

  // FIX BUG RANKING BS: si la tabla `configuracion` no tiene una policy de
  // RLS que permita SELECT a todos los roles autenticados, Supabase no
  // regresa error — simplemente entrega `data: []` en silencio (RLS
  // filtra filas, no lanza excepción). Antes, cuando `data` venía vacío,
  // el código asumía `true` (visible) por default, así que cualquier
  // agente sin permiso de lectura sobre `configuracion` veía Ranking BS
  // aunque el Super Admin lo hubiera apagado. Ahora: (1) se loguea el
  // error si existe, (2) el default cuando no hay dato pasa de `true` a
  // `false` (más seguro — oculto por default en vez de expuesto).
  // FIX DE FONDO (ejecutar en Supabase SQL Editor):
  //   create policy "Todos los autenticados pueden leer configuracion"
  //   on configuracion for select to authenticated using (true);
  const cargarConfigRankingBs = async () => {
    const { data, error } = await supabase.from('configuracion').select('valor').eq('clave', 'ranking_bs_visible').limit(1);
    if (error) console.error('Error leyendo configuracion (revisar RLS):', error);
    setRankingBsVisible(data && data.length > 0 ? data[0].valor === 'true' : false);
  };

  const handleToggleRankingBs = async () => {
    const nuevoValor = !rankingBsVisible;
    setRankingBsVisible(nuevoValor);
    const { error } = await supabase.from('configuracion').upsert({ clave: 'ranking_bs_visible', valor: String(nuevoValor) }, { onConflict: 'clave' });
    if (error) {
      alert('No se pudo guardar el cambio en el servidor: ' + error.message);
      setRankingBsVisible(!nuevoValor);
    }
  };

  const cargarAgente = async (email, esPrimerLogin = false) => {
    const { data } = await supabase.from('agentes').select('*').eq('correo', email).single();
    setMiAgente(data || null);
    setMiRol(data?.rol || 'Agente');
    cargarExpedientesRechazados(data?.correo);
    if (esPrimerLogin) {
      if (data?.rol === 'Desarrollador') {
        setActivePage('dashboard_dir');
      } else if (data?.rol === 'Construcción') {
        setActivePage('construccion');
      } else if (data?.rol === 'Tesorería') {
        setActivePage('cobranza');
      } else if (data?.rol === 'Agente' && data?.equipo === 'Gemex') {
        // FIX: mismo fallback seguro (false) que cargarConfigRankingBs +
        // log de error si la lectura falla por RLS.
        const { data: config, error } = await supabase.from('configuracion').select('valor').eq('clave', 'ranking_bs_visible').limit(1);
        if (error) console.error('Error leyendo configuracion (revisar RLS):', error);
        const visible = config && config.length > 0 ? config[0].valor === 'true' : false;
        setActivePage(visible ? 'dashboard' : 'desarrollos');
      } else {
        setActivePage('desarrollos');
      }
    }
  };

  useEffect(() => {
    cargarConfigRankingBs();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session) cargarAgente(session.user.email, false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        const yaEstabaLogueado = sessionStorage.getItem('gemex_logueado') === '1';
        if (!yaEstabaLogueado) { sessionStorage.setItem('gemex_logueado', '1'); cargarAgente(session.user.email, true); }
        else cargarAgente(session.user.email, false);
      } else { sessionStorage.removeItem('gemex_logueado'); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        if (miRol === 'Agente' && miAgente?.equipo !== 'Gemex') return <Desarrollos miRol={miRol} miAgente={miAgente} />;
        if (miRol === 'Mesa de Control') return <Desarrollos miRol={miRol} miAgente={miAgente} />;
        if (miRol !== 'Super Admin' && !rankingBsVisible) return <Desarrollos miRol={miRol} miAgente={miAgente} />;
        return <Dashboard />;
      case 'contactos': return <Contactos />;
      case 'negocios': return <Negocios />;
      case 'desarrollos': return <Desarrollos miRol={miRol} miAgente={miAgente} />;
      case 'agentes': return <Agentes />;
      case 'expedientes': return <Expedientes miRol={miRol} miAgente={miAgente} />;
      case 'movimientos': return <Movimientos />;
      case 'dashboard_dir': return <DashboardDireccion miRol={miRol} miAgente={miAgente} />;
      case 'historial': return (miRol === 'Super Admin' || miRol === 'Gerente Editor' || miRol === 'Gerente Operador' || miRol === 'Mesa de Control') ? <HistorialMovimientos miRol={miRol} miAgente={miAgente} /> : <Desarrollos miRol={miRol} miAgente={miAgente} />;
      case 'objetivos': return <Objetivos miRol={miRol} miAgente={miAgente} />;
      case 'titulacion': return <Titulacion miRol={miRol} miAgente={miAgente} />;
      case 'cobranza': return <Cobranza miRol={miRol} miAgente={miAgente} />;
      case 'construccion': return <Construccion />;
      case 'tendencias_producto': return (miRol === 'Super Admin' || miRol === 'Gerente Editor' || miRol === 'Gerente Operador') ? <TendenciasProducto miRol={miRol} miAgente={miAgente} /> : <Desarrollos miRol={miRol} miAgente={miAgente} />;
      case 'buyer_persona':
        return (miRol === 'Super Admin' || miRol === 'Admin' || miRol === 'Gerente Editor' || miRol === 'Gerente Operador')
          ? <BuyerPersona miRol={miRol} miAgente={miAgente} />
          : <Desarrollos miRol={miRol} miAgente={miAgente} />;
      case 'micuenta': return <MiCuenta user={session.user} miRol={miRol} />;
      default: return <Desarrollos miRol={miRol} miAgente={miAgente} />;
    }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
      <div style={{ textAlign: 'center' }}><LogoGemex small /><div style={{ marginTop: '12px', fontSize: '13px', color: '#888' }}>Cargando...</div></div>
    </div>
  );
  if (!session) return <Login />;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f5f5f5' }}>
      <Sidebar
        active={activePage} onNav={setActivePage}
        onLogout={() => supabase.auth.signOut()}
        miAgente={miAgente} miRol={miRol}
        isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)}
        isMobile={isMobile}
        showAviso={showAviso}
        onToggleAviso={() => setShowAviso(o => !o)}
        rankingBsVisible={rankingBsVisible}
        onToggleRankingBs={handleToggleRankingBs}
        expedientesRechazados={expedientesRechazados}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {isMobile && <TopBar onMenuOpen={() => setSidebarOpen(true)} miAgente={miAgente} />}
        <main style={{ flex: 1, overflow: 'auto' }}>
          {renderPage()}
        </main>
      </div>
      {showAviso && <AvisoPrivacidadModal onClose={() => setShowAviso(false)} />}
    </div>
  );
}

export default App;