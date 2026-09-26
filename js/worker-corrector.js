'use strict';

// Corrector ortográfico que corre en un Web Worker separado
// Usa el diccionario .dic de hunspell (palabras base en español)

const LETRAS = 'aábcdeéfghiíjklmnñoópqrstuúüvwxyz';
let diccionario = null;      // Set con palabras base válidas
const cache     = new Map(); // Caché de correcciones ya calculadas

async function cargarDiccionario() {
  const resp = await fetch('https://cdn.jsdelivr.net/npm/dictionary-es@3.2.3/index.dic');
  const texto = await resp.text();
  // Cada línea: "palabra/FLAGS" — solo tomamos la palabra base
  diccionario = new Set(
    texto.split('\n').slice(1)
      .map(l => l.split('/')[0].toLowerCase().trim())
      .filter(w => w.length >= 2)
  );
}

// Busca una corrección a distancia de edición 1
function correccionD1(lower) {
  // 1. Sustituciones (caso más común en OCR: un carácter mal leído)
  for (let i = 0; i < lower.length; i++) {
    for (const c of LETRAS) {
      if (c === lower[i]) continue;
      const cand = lower.slice(0, i) + c + lower.slice(i + 1);
      if (diccionario.has(cand)) return cand;
    }
  }
  // 2. Supresiones (carácter de más)
  for (let i = 0; i < lower.length; i++) {
    const cand = lower.slice(0, i) + lower.slice(i + 1);
    if (diccionario.has(cand)) return cand;
  }
  // 3. Transposiciones (dos letras intercambiadas)
  for (let i = 0; i < lower.length - 1; i++) {
    const cand = lower.slice(0, i) + lower[i + 1] + lower[i] + lower.slice(i + 2);
    if (diccionario.has(cand)) return cand;
  }
  // 4. Inserciones (carácter faltante)
  for (let i = 0; i <= lower.length; i++) {
    for (const c of LETRAS) {
      const cand = lower.slice(0, i) + c + lower.slice(i);
      if (diccionario.has(cand)) return cand;
    }
  }
  return null;
}

function corregirPalabra(palabra) {
  const lower = palabra.toLowerCase();

  // Revisar caché primero
  if (cache.has(lower)) {
    const cached = cache.get(lower);
    if (cached === null) return palabra; // ya era correcta
    return esCapitalizada(palabra) ? capitalizar(cached) : cached;
  }

  // Si ya está en el diccionario, no tocar
  if (diccionario.has(lower)) {
    cache.set(lower, null);
    return palabra;
  }

  const corr = correccionD1(lower);
  cache.set(lower, corr);
  if (!corr) return palabra;
  return esCapitalizada(palabra) ? capitalizar(corr) : corr;
}

function esCapitalizada(p) {
  return p.length > 0 && p[0] >= 'A' && p[0] <= 'Z';
}
function capitalizar(p) {
  return p.length === 0 ? p : p[0].toUpperCase() + p.slice(1);
}

function corregirTexto(texto) {
  // Solo corregir palabras de 4-18 letras (evitar siglas, números, etc.)
  return texto.replace(/\b[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]{4,18}\b/g, corregirPalabra);
}

// ─── Interfaz con el hilo principal ─────────────────────────

self.onmessage = async function(e) {
  const { tipo, id, texto } = e.data;

  if (tipo === 'cargar') {
    try {
      await cargarDiccionario();
      self.postMessage({ tipo: 'listo' });
    } catch (err) {
      self.postMessage({ tipo: 'error', msg: err.message });
    }
    return;
  }

  if (tipo === 'corregir') {
    const resultado = diccionario ? corregirTexto(texto) : texto;
    self.postMessage({ tipo: 'resultado', id, texto: resultado });
  }
};
