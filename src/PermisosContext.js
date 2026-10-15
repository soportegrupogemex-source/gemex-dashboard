import { createContext, useContext } from 'react';
import { puedeAccion } from './permisosMenu';

// Lo provee App: rol de quien está usando el sistema + los ajustes que el
// Super Admin hizo a ese rol. Las pantallas piden permisos con usePuede().
export const PermisosContext = createContext({ rol: '', overrides: {} });

export const usePuede = () => {
  const { rol, overrides } = useContext(PermisosContext);
  return (id) => puedeAccion(rol, id, overrides);
};
