// Aplica la identidad de GMF al compilar (solo cuando REACT_APP_EMPRESA=gmf).
// Reescribe colores, título y tipografía EN LA COPIA que compila Vercel; en tu
// carpeta local solo corre si pones APLICAR_TEMA=1 (modifica archivos: úsalo en
// una copia del proyecto, no en el repositorio de trabajo).
const fs = require('fs');
const path = require('path');

if (process.env.REACT_APP_EMPRESA !== 'gmf') process.exit(0);
if (!process.env.VERCEL && process.env.APLICAR_TEMA !== '1') {
  console.log('[tema] GMF: omitido (no es Vercel y APLICAR_TEMA no es 1).');
  process.exit(0);
}

// Manual de identidad Grupo GMF: Midnight Ocean #113747 (menú y fondos oscuros),
// Amber Blaze #E65F00 (acento), Soft Sand #FFFCF6, IBM Plex Sans.
const COLORES = [
  [/#6B1524/gi, '#113747'],   // menú / fondos oscuros (Gemex: vino)
  [/#4A0F1A/gi, '#0C2733'],   // tarjeta de acceso, un tono más oscuro
  [/#C0203A/gi, '#E65F00'],   // acento, botones y activos (Gemex: rojo)
];

const raiz = path.join(__dirname, '..');
const recorrer = (dir, f) => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) recorrer(p, f); else f(p);
});

let archivos = 0;
recorrer(path.join(raiz, 'src'), p => {
  if (!/\.(js|css)$/.test(p)) return;
  let s = fs.readFileSync(p, 'utf8'); const o = s;
  COLORES.forEach(([re, nuevo]) => { s = s.replace(re, nuevo); });
  if (s !== o) { fs.writeFileSync(p, s); archivos++; }
});

// Tipografía: IBM Plex Sans (Light para texto, Medium para títulos).
const css = path.join(raiz, 'src', 'index.css');
fs.appendFileSync(css, `
body, button, input, select, textarea { font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
body { font-weight: 300; }
h1, h2, h3, strong, b, th { font-weight: 500; }
`);

const html = path.join(raiz, 'public', 'index.html');
let h = fs.readFileSync(html, 'utf8');
h = h.replace(/#C0203A/gi, '#113747')
  .replace('CRM de Grupo Gemex', 'CRM de Grupo GMF')
  .replace('<title>Grupo Gemex CRM</title>', '<title>Grupo GMF CRM</title>')
  .replace('</head>', '    <link rel="preconnect" href="https://fonts.googleapis.com">\n    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">\n  </head>');
fs.writeFileSync(html, h);

const man = path.join(raiz, 'public', 'manifest.json');
let m = fs.readFileSync(man, 'utf8')
  .replace('Gemex CRM', 'GMF CRM').replace('Grupo Gemex CRM', 'Grupo GMF CRM').replace(/#C0203A/gi, '#113747');
fs.writeFileSync(man, m);

console.log(`[tema] GMF aplicado en ${archivos} archivos.`);
