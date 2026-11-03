// Un plan de pago puede limitarse a ciertas torres dentro de su etapa
// (planes_pago.torres, ej. ['E']). Sin torres (null o vacío) aplica a todas.
// La torre de una unidad es el prefijo de letras de su número (E101 → E).
export const torreDeUnidad = (numero) => {
  const m = String(numero || '').trim().match(/^[A-Za-z]+/);
  return m ? m[0].toUpperCase() : '';
};

export const planAplicaAUnidad = (plan, unidad) => {
  const torres = plan?.torres;
  if (!torres || torres.length === 0) return true;
  return torres.includes(torreDeUnidad(unidad?.numero));
};
