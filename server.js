// Servidor mínimo para los paneles ST de MP Ascensores.
// Sirve los HTML estáticos (como antes hacía "serve") y añade una API muy
// simple para los 3 indicadores de empresa (Índice de frecuencia PRL,
// EBITDA SIM 2026, Facturación Servicenter 2026) que hasta ahora se
// introducían a mano en el navegador y se perdían al recargar.
//
// GET  /api/company-data   -> devuelve los últimos valores guardados (lo usa objetivos-st-2026.html)
// POST /api/company-data   -> guarda/actualiza un valor (lo usa el flujo de n8n tras cada respuesta de formulario)
//                              requiere cabecera x-api-key = variable de entorno API_KEY

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'company-data.json');
const API_KEY = process.env.API_KEY || '';

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    return {};
  }
}

function writeData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

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

// Estáticos: sirve objetivos-st-2026.html, calidad-tickets-mp.html, index.html,
// formulario-datos-empresa.html, etc. exactamente igual que antes con "serve".
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de paneles ST escuchando en el puerto ${PORT}`);
});
