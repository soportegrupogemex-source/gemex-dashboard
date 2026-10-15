import React, { useRef, useLayoutEffect } from 'react';

// Formato de dinero de toda la app: signo $, comas de miles y centavos solo
// cuando el importe los tiene (o siempre, con { centavos: true }).
export const fmtDinero = (n, { centavos = false } = {}) => {
  const v = Number(n || 0);
  const conCentavos = centavos || Math.round(Math.abs(v) * 100) % 100 !== 0;
  const dec = conCentavos ? 2 : 0;
  return `$${v.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
};

const limpiar = (txt) => {
  let t = String(txt ?? '').replace(/[^\d.]/g, '');
  const i = t.indexOf('.');
  if (i >= 0) t = t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, '').slice(0, 2);
  return t;
};

const conComas = (raw) => {
  if (raw === '') return '';
  const [ent, dec] = raw.split('.');
  const e = ent.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec !== undefined ? `${e || '0'}.${dec}` : e;
};

// Campo de importe: muestra comas de miles mientras se escribe y acepta hasta
// 2 decimales. Es un reemplazo directo de <input type="number">: el valor
// que recibe/entrega es el número "limpio" (ej. "1234567.5") y onChange se
// llama con { target: { value } }, así que los handlers existentes sirven igual.
export function InputDinero({ value, onChange, min, max, step, type, ...rest }) {
  const ref = useRef(null);
  const caret = useRef(null);
  const mostrado = conComas(limpiar(value));

  useLayoutEffect(() => {
    if (caret.current != null && ref.current && document.activeElement === ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current);
    }
    caret.current = null;
  });

  const handleChange = (e) => {
    const txt = e.target.value;
    const pos = e.target.selectionStart ?? txt.length;
    const antes = txt.slice(0, pos).replace(/[^\d.]/g, '').length;
    const nuevo = limpiar(txt);
    const nuevoMostrado = conComas(nuevo);
    let cuenta = 0;
    let nuevaPos = nuevoMostrado.length;
    for (let i = 0; i < nuevoMostrado.length; i++) {
      if (cuenta === antes) { nuevaPos = i; break; }
      if (/[\d.]/.test(nuevoMostrado[i])) cuenta++;
    }
    caret.current = nuevaPos;
    if (onChange) onChange({ target: { value: nuevo } });
  };

  return <input {...rest} ref={ref} type="text" inputMode="decimal" autoComplete="off" value={mostrado} onChange={handleChange} />;
}
