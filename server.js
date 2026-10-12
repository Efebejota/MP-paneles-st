// Servidor mínimo para los paneles ST de MP Ascensores.
// Sirve los HTML estáticos (como antes hacía "serve") y añade una API muy
// simple para los 3 indicadores de empresa (Índice de frecuencia PRL,
// EBITDA SIM 2026, Facturación Servicenter 2026) que hasta ahora se
// introducían a mano en el navegador y se perdían al recargar.
//
// GET  /api/company-data   -> devuelve los últimos valores guardados (lo usa objetivos-st-2026.html)
// POST /api/company-data   -> guarda/actualiza un valor (lo usa el flujo de n8n tras cada respuesta de formulario)
//                              requiere cabecera x-api-key = variable de entorno API_KEY
// GET  /api/individual-data -> datos manuales por técnico (lápiz ✎ en la ficha de cada técnico)
// POST /api/individual-data -> guarda un dato manual { nombreExcel, indicador_id, valor } (x-api-key = API_KEY)
// GET  /zt/api/tecnicos | /zt/api/stats | /zt/api/stats/range
//                           -> intermediario hacia zendesk-tecnicos (que desde el 11 oct 2026 exige llave).
//                              El servidor añade la cabecera X-Acceso con la variable ZT_ACCESO; la llave
//                              nunca llega al navegador ni al HTML (el repo es público).
//
// Variables de entorno:
//   API_KEY    clave de escritura (n8n + guardados manuales desde el panel)
//   ZT_ACCESO  llave de acceso a zendesk-tecnicos (rol admin), generada con generar-accesos.js
//   ZT_URL     opcional, por defecto https://zendesk-tecnicos-production.up.railway.app
//   DATA_DIR   opcional, carpeta de datos persistentes (por defecto ./data)

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'company-data.json');
const INDIVIDUAL_FILE = path.join(DATA_DIR, 'individual-data.json');
const API_KEY = process.env.API_KEY || '';
const ZT_URL = (process.env.ZT_URL || 'https://zendesk-tecnicos-production.up.railway.app').replace(/\/+$/, '');
const ZT_ACCESO = process.env.ZT_ACCESO || '';

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return {};
  }
}

function writeJson(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

const readData = () => readJson(DATA_FILE);
const writeData = data => writeJson(DATA_FILE, data);

app.get('/health', (req, res) => res.json({ ok: true }));

// Lectura pública (la llama el propio panel desde el navegador, mismo origen)
app.get('/api/company-data', (req, res) => {
  res.json(readData());
});

// Escritura protegida (la llama n8n tras recibir y validar cada respuesta del formulario)
app.post('/api/company-data', (req, res) => {
  if (!API_KEY || req.get('x-api-key') !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { indicador_id, mes, valorMes, acumulado, respondidoPor } = req.body || {};

  if (!indicador_id || !mes) {
    return res.status(400).json({ error: 'faltan indicador_id o mes (formato YYYY-MM)' });
  }

  const data = readData();
  data[indicador_id] = data[indicador_id] || { historico: {} };
  data[indicador_id].historico[mes] = {
    valorMes: valorMes !== undefined ? Number(valorMes) : null,
    acumulado: acumulado !== undefined ? Number(acumulado) : null,
    respondidoPor: respondidoPor || null,
    actualizadoEn: new Date().toISOString(),
  };
  data[indicador_id].ultimoMes = mes;

  writeData(data);
  res.json({ ok: true, indicador_id, mes });
});

// ---------------------------------------------------------------------------
// Datos manuales por técnico (lápiz ✎ en objetivos-st-2026.html)
// Formato guardado: { "<nombreExcel>": { "<indicador_id>": { valor, actualizadoEn } } }
// ---------------------------------------------------------------------------
app.get('/api/individual-data', (req, res) => {
  res.json(readJson(INDIVIDUAL_FILE));
});

app.post('/api/individual-data', (req, res) => {
  if (!API_KEY || req.get('x-api-key') !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { nombreExcel, indicador_id, valor } = req.body || {};
  if (!nombreExcel || !indicador_id) {
    return res.status(400).json({ error: 'faltan nombreExcel o indicador_id' });
  }

  const num = valor === null || valor === undefined || valor === '' ? null : Number(valor);
  if (num !== null && !Number.isFinite(num)) {
    return res.status(400).json({ error: 'valor no numérico' });
  }

  const data = readJson(INDIVIDUAL_FILE);
  data[nombreExcel] = data[nombreExcel] || {};
  data[nombreExcel][indicador_id] = { valor: num, actualizadoEn: new Date().toISOString() };
  writeJson(INDIVIDUAL_FILE, data);
  res.json({ ok: true, nombreExcel, indicador_id, valor: num });
});

// ---------------------------------------------------------------------------
// Intermediario hacia zendesk-tecnicos (solo lectura, solo estas 3 rutas)
// ---------------------------------------------------------------------------
const ZT_RUTAS = new Set(['/api/tecnicos', '/api/stats', '/api/stats/range']);

app.get(/^\/zt(\/api\/.*)$/, async (req, res) => {
  const ruta = req.params[0];
  if (!ZT_RUTAS.has(ruta)) return res.status(404).json({ error: 'ruta no permitida' });
  if (!ZT_ACCESO) return res.status(500).json({ error: 'falta la variable ZT_ACCESO en Railway' });

  const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  try {
    const r = await fetch(ZT_URL + ruta + qs, {
      headers: { 'X-Acceso': ZT_ACCESO, Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(60000),
    });
    const body = await r.text();
    res.status(r.status);
    res.set('Content-Type', r.headers.get('content-type') || 'application/json');
    res.set('Cache-Control', 'no-store');
    res.send(body);
  } catch (err) {
    console.error('Error llamando a zendesk-tecnicos:', err.message);
    res.status(502).json({ error: 'zendesk-tecnicos no responde' });
  }
});

// Estáticos: sirve objetivos-st-2026.html, calidad-tickets-mp.html, index.html,
// formulario-datos-empresa.html, etc. exactamente igual que antes con "serve".
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de paneles ST escuchando en el puerto ${PORT}`);
});
