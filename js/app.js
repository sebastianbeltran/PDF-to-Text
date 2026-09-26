/* ============================================================
   PDF a Texto — app.js
   Toda la lógica: carga de PDF, extracción de texto, OCR,
   gestión de workers, progreso y exportación.
   ============================================================ */

'use strict';

// ─── Configuración de PDF.js ────────────────────────────────
// Le indicamos dónde está el worker (desde jsDelivr, misma versión)
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

// ─── Constantes ─────────────────────────────────────────────
const UMBRAL_TEXTO    = 25;   // caracteres sin espacios para considerar página digital
const ESCALA_RENDER   = 2.5;  // factor de escala para renderizar canvas (≈180 DPI)
const MAX_LADO        = 3000; // píxeles máximos en el lado más largo
const NUM_WORKERS     = Math.min(4, Math.max(2, Math.floor((navigator.hardwareConcurrency || 4) / 2)));

// ─── Estado global ──────────────────────────────────────────
let pdfDoc         = null;   // documento PDF cargado
let nombreArchivo  = '';      // nombre original del archivo
let totalPaginas   = 0;
let paginas        = [];      // array de objetos {indice, tipo, estado, texto}
let detenido       = false;
let workerPool     = [];      // workers de Tesseract reutilizables
let colaPendiente  = [];      // cola de índices de páginas a procesar por OCR
let procesandoAhora = new Set(); // índices procesándose en este momento
let inicioProceso  = 0;
let paginasListas  = 0;
let idiomaOCR      = 'spa+eng';
let forzarOCR      = false;
let separadores    = true;

// ─── Referencias al DOM ─────────────────────────────────────
const zonaArrastrar      = document.getElementById('zona-arrastrar');
const inputArchivo       = document.getElementById('input-archivo');
const btnSeleccionar     = document.getElementById('btn-seleccionar');
const selectorIdioma     = document.getElementById('selector-idioma');
const chkForzarOCR       = document.getElementById('chk-forzar-ocr');
const chkSeparadores     = document.getElementById('chk-separadores');
const zonaError          = document.getElementById('zona-error');
const avisoDescarga      = document.getElementById('aviso-descarga');
const seccionProgreso    = document.getElementById('seccion-progreso');
const barraRelleno       = document.getElementById('barra-relleno');
const barraAria          = document.getElementById('barra-aria');
const txtProgreso        = document.getElementById('txt-progreso');
const txtTiempo          = document.getElementById('txt-tiempo');
const txtPaginaActual    = document.getElementById('txt-pagina-actual');
const txtWorkers         = document.getElementById('txt-workers');
const btnDetener         = document.getElementById('btn-detener');
const btnContinuar       = document.getElementById('btn-continuar');
const contenedorPreview  = document.getElementById('contenedor-preview');
const canvasPreview      = document.getElementById('canvas-preview');
const seccionPaginas     = document.getElementById('seccion-paginas');
const listaPaginas       = document.getElementById('lista-paginas');
const seccionResultado   = document.getElementById('seccion-resultado');
const textoResultado     = document.getElementById('texto-resultado');
const btnCopiar          = document.getElementById('btn-copiar');
const btnDescargarTxt    = document.getElementById('btn-descargar-txt');
const btnDescargarDocx   = document.getElementById('btn-descargar-docx');
const btnNuevo           = document.getElementById('btn-nuevo');
const txtContador        = document.getElementById('txt-contador');

// ─── Utilidades ─────────────────────────────────────────────

function mostrarError(msg) {
  zonaError.textContent = msg;
  zonaError.style.display = 'block';
}

function ocultarError() {
  zonaError.style.display = 'none';
}

function formatearTiempo(segundos) {
  if (segundos < 60) return `${Math.round(segundos)}s`;
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return `${m}m ${s}s`;
}

function contarPalabras(txt) {
  return txt.trim().split(/\s+/).filter(Boolean).length;
}

// ─── Eventos de arrastrar y soltar ──────────────────────────

zonaArrastrar.addEventListener('dragover', (e) => {
  e.preventDefault();
  zonaArrastrar.classList.add('encima');
});
zonaArrastrar.addEventListener('dragleave', () => {
  zonaArrastrar.classList.remove('encima');
});
zonaArrastrar.addEventListener('drop', (e) => {
  e.preventDefault();
  zonaArrastrar.classList.remove('encima');
  const archivo = e.dataTransfer.files[0];
  if (archivo) manejarArchivo(archivo);
});
zonaArrastrar.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') inputArchivo.click();
});
btnSeleccionar.addEventListener('click', (e) => {
  e.stopPropagation();
  inputArchivo.click();
});
zonaArrastrar.addEventListener('click', (e) => {
  if (e.target === btnSeleccionar) return;
  inputArchivo.click();
});
inputArchivo.addEventListener('change', () => {
  if (inputArchivo.files[0]) manejarArchivo(inputArchivo.files[0]);
});

// Opciones
selectorIdioma.addEventListener('change', () => { idiomaOCR = selectorIdioma.value; });
chkForzarOCR.addEventListener('change', () => { forzarOCR = chkForzarOCR.checked; });
chkSeparadores.addEventListener('change', () => {
  separadores = chkSeparadores.checked;
  reconstruirTexto();
  actualizarContador();
});

btnDetener.addEventListener('click', detener);
btnContinuar.addEventListener('click', reanudar);
btnNuevo.addEventListener('click', reiniciar);
btnCopiar.addEventListener('click', copiarTexto);
btnDescargarTxt.addEventListener('click', descargarTxt);
btnDescargarDocx.addEventListener('click', descargarDocx);

// ─── Manejo del archivo ─────────────────────────────────────

async function manejarArchivo(archivo) {
  ocultarError();

  if (!archivo.name.toLowerCase().endsWith('.pdf') && archivo.type !== 'application/pdf') {
    mostrarError('❌ El archivo seleccionado no es un PDF. Por favor elige un archivo .pdf');
    return;
  }

  nombreArchivo = archivo.name.replace(/\.pdf$/i, '');
  idiomaOCR  = selectorIdioma.value;
  forzarOCR  = chkForzarOCR.checked;
  separadores = chkSeparadores.checked;

  let arrayBuffer;
  try {
    arrayBuffer = await archivo.arrayBuffer();
  } catch {
    mostrarError('❌ No se pudo leer el archivo. Intenta de nuevo.');
    return;
  }

  try {
    await cargarPDF(arrayBuffer);
  } catch (err) {
    manejarErrorPDF(err);
  }
}

function manejarErrorPDF(err) {
  const msg = (err && err.message) ? err.message.toLowerCase() : '';
  if (msg.includes('password') || msg.includes('encrypted')) {
    mostrarError('🔒 Este PDF está protegido con contraseña. No se puede procesar.');
  } else if (msg.includes('invalid') || msg.includes('corrupt') || msg.includes('damaged')) {
    mostrarError('⚠️ El archivo PDF parece estar dañado o es inválido.');
  } else if (msg.includes('memory') || err instanceof RangeError) {
    mostrarError('💾 Memoria insuficiente para procesar este PDF. Intenta con un archivo más pequeño.');
  } else {
    mostrarError(`❌ Error al abrir el PDF: ${err && err.message ? err.message : 'Error desconocido'}`);
  }
}

// ─── Carga del PDF ──────────────────────────────────────────

async function cargarPDF(buffer) {
  const loadingTask = pdfjsLib.getDocument({ data: buffer, useSystemFonts: true });
  pdfDoc = await loadingTask.promise;

  totalPaginas = pdfDoc.numPages;
  paginasListas = 0;
  detenido = false;

  // Inicializar array de páginas
  paginas = Array.from({ length: totalPaginas }, (_, i) => ({
    indice: i + 1,  // 1-based
    tipo:   'desconocido',
    estado: 'pendiente',
    texto:  ''
  }));

  // Mostrar secciones
  seccionProgreso.style.display  = 'block';
  seccionPaginas.style.display   = 'block';
  seccionResultado.style.display = 'block';
  textoResultado.value = '';
  listaPaginas.innerHTML = '';

  // Crear elementos de la lista de páginas
  for (let i = 1; i <= totalPaginas; i++) {
    const item = document.createElement('div');
    item.className = 'pagina-item';
    item.role = 'listitem';
    item.id = `pag-item-${i}`;
    item.innerHTML = `
      <span class="pagina-num">Pág. ${i}</span>
      <span class="estado-badge estado-procesando" id="pag-estado-${i}">Pendiente</span>
    `;
    listaPaginas.appendChild(item);
  }

  inicioProceso = Date.now();
  actualizarBarra(0);
  txtProgreso.textContent = `Analizando ${totalPaginas} páginas…`;
  txtWorkers.textContent = `Workers OCR: ${NUM_WORKERS}`;
  btnDetener.style.display = '';
  btnContinuar.style.display = 'none';

  // Si hay OCR, avisar de la posible descarga de datos de idioma
  avisoDescarga.style.display = 'block';

  await iniciarWorkers();
  await procesarTodasLasPaginas();
}

// ─── Pool de workers Tesseract ──────────────────────────────

async function iniciarWorkers() {
  // Destruir workers anteriores si los hay
  for (const w of workerPool) {
    try { await w.terminate(); } catch { /* ignorar */ }
  }
  workerPool = [];

  // Crear N workers en paralelo
  const promesas = Array.from({ length: NUM_WORKERS }, async () => {
    const w = await Tesseract.createWorker(idiomaOCR, 1, {
      // logger desactivado para no saturar la consola
      logger: () => {}
    });
    return w;
  });

  workerPool = await Promise.all(promesas);
  avisoDescarga.style.display = 'none'; // ya descargaron
}

// ─── Procesamiento principal ─────────────────────────────────

async function procesarTodasLasPaginas() {
  // Paso 1: extraer texto digital de todas las páginas (rápido)
  // Procesar en lotes para no saturar memoria
  const LOTE = 10;
  for (let i = 1; i <= totalPaginas; i += LOTE) {
    if (detenido) break;
    const fin = Math.min(i + LOTE - 1, totalPaginas);
    await Promise.all(
      Array.from({ length: fin - i + 1 }, (_, k) => analizarPaginaTexto(i + k))
    );
  }

  if (detenido) return;

  // Paso 2: OCR en paralelo usando el pool de workers
  colaPendiente = paginas
    .filter(p => p.tipo === 'ocr' && p.estado === 'pendiente')
    .map(p => p.indice);

  if (colaPendiente.length === 0) {
    finalizarProceso();
    return;
  }

  // Asignar un trabajo a cada worker y dejar que la cola fluya
  const tareas = workerPool.map(worker => procesarDesdeCola(worker));
  await Promise.all(tareas);

  if (!detenido) finalizarProceso();
}

// Cada worker consume de la cola hasta que esté vacía
async function procesarDesdeCola(worker) {
  while (colaPendiente.length > 0 && !detenido) {
    const idx = colaPendiente.shift();
    if (idx === undefined) break;
    procesandoAhora.add(idx);
    await procesarPaginaOCR(idx, worker);
    procesandoAhora.delete(idx);
  }
}

// ─── Análisis de texto digital ──────────────────────────────

async function analizarPaginaTexto(numPagina) {
  const info = paginas[numPagina - 1];
  actualizarEstadoPagina(numPagina, 'procesando', 'Analizando…');

  try {
    const page    = await pdfDoc.getPage(numPagina);
    const content = await page.getTextContent();
    const textoRaw = content.items.map(it => it.str).join(' ');
    const sinEspacios = textoRaw.replace(/\s/g, '');

    if (!forzarOCR && sinEspacios.length >= UMBRAL_TEXTO) {
      // Página digital: usar el texto extraído directamente
      info.tipo   = 'digital';
      info.estado = 'lista';
      info.texto  = limpiarTexto(textoRaw);
      actualizarEstadoPagina(numPagina, 'lista', 'Texto directo');
      marcarPaginaLista(numPagina);
    } else {
      // Página escaneada (o forzar OCR): encolar para OCR
      info.tipo   = 'ocr';
      info.estado = 'pendiente';
      actualizarEstadoPagina(numPagina, 'ocr', 'Escaneada');
    }
  } catch (err) {
    info.estado = 'error';
    info.error  = err.message;
    actualizarEstadoPagina(numPagina, 'error', 'Error');
    console.error(`Error analizando página ${numPagina}:`, err);
  }
}

// ─── OCR de una página ──────────────────────────────────────

async function procesarPaginaOCR(numPagina, worker) {
  if (detenido) return;
  const info = paginas[numPagina - 1];
  info.estado = 'procesando';
  actualizarEstadoPagina(numPagina, 'procesando', 'OCR…');
  txtPaginaActual.textContent = `Procesando pág. ${numPagina}`;

  let canvas = null;
  try {
    canvas = await renderizarPaginaACanvas(numPagina);

    // Mostrar preview (solo la primera en procesarse)
    if (procesandoAhora.size <= 1) mostrarPreview(canvas);

    const { data: { text } } = await worker.recognize(canvas);
    info.texto  = limpiarTexto(text);
    info.estado = 'lista';
    actualizarEstadoPagina(numPagina, 'lista', 'Escaneada ✓');
    marcarPaginaLista(numPagina);
  } catch (err) {
    const msgErr = (err && err.message) ? err.message : '';
    if (msgErr.toLowerCase().includes('memory') || err instanceof RangeError) {
      info.estado = 'error';
      info.error  = 'Memoria insuficiente';
      actualizarEstadoPagina(numPagina, 'error', 'Sin memoria');
      mostrarError(`💾 Sin memoria al procesar la página ${numPagina}. Puedes reintentarla.`);
    } else {
      info.estado = 'error';
      info.error  = msgErr || 'Error desconocido';
      actualizarEstadoPagina(numPagina, 'error', 'Error');
    }
    console.error(`Error en OCR página ${numPagina}:`, err);
  } finally {
    // Liberar canvas inmediatamente para no acumular memoria
    if (canvas) {
      canvas.width  = 0;
      canvas.height = 0;
    }
    canvas = null;
  }
}

// ─── Renderizado de página a canvas ─────────────────────────

async function renderizarPaginaACanvas(numPagina) {
  const page     = await pdfDoc.getPage(numPagina);
  const viewport = page.getViewport({ scale: 1 });

  // Calcular escala para que ningún lado supere MAX_LADO
  let escala = ESCALA_RENDER;
  const ladoMaximoActual = Math.max(viewport.width, viewport.height) * escala;
  if (ladoMaximoActual > MAX_LADO) {
    escala = MAX_LADO / Math.max(viewport.width, viewport.height);
  }

  const vp = page.getViewport({ scale: escala });
  const canvas = document.createElement('canvas');
  canvas.width  = Math.round(vp.width);
  canvas.height = Math.round(vp.height);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  await page.render({ canvasContext: ctx, viewport: vp }).promise;

  return canvas;
}

// ─── Preview ────────────────────────────────────────────────

function mostrarPreview(canvas) {
  contenedorPreview.style.display = 'block';
  const ctx = canvasPreview.getContext('2d');
  // Escalar al tamaño del elemento de preview
  const maxW = canvasPreview.parentElement.clientWidth || 400;
  const ratio = maxW / canvas.width;
  canvasPreview.width  = Math.round(canvas.width  * ratio);
  canvasPreview.height = Math.round(canvas.height * ratio);
  ctx.drawImage(canvas, 0, 0, canvasPreview.width, canvasPreview.height);
}

// ─── Actualización de UI ─────────────────────────────────────

function actualizarEstadoPagina(numPagina, clase, texto) {
  const el = document.getElementById(`pag-estado-${numPagina}`);
  if (!el) return;
  el.className = `estado-badge estado-${clase}`;
  el.textContent = texto;

  // Botón de reintentar en caso de error
  const item = document.getElementById(`pag-item-${numPagina}`);
  if (!item) return;
  const btnReintento = item.querySelector('.btn-reintentar');
  if (clase === 'error') {
    if (!btnReintento) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-secundario btn-reintentar';
      btn.textContent = '↩ Reintentar';
      btn.type = 'button';
      btn.setAttribute('aria-label', `Reintentar página ${numPagina}`);
      btn.addEventListener('click', () => reintentarPagina(numPagina));
      item.appendChild(btn);
    }
  } else if (btnReintento) {
    btnReintento.remove();
  }
}

function marcarPaginaLista(numPagina) {
  paginasListas++;
  reconstruirTexto();
  actualizarBarra(paginasListas / totalPaginas);
  actualizarContador();
  actualizarTiempoEstimado();
}

function actualizarBarra(fraccion) {
  const pct = Math.round(fraccion * 100);
  barraRelleno.style.width = `${pct}%`;
  barraAria.setAttribute('aria-valuenow', pct);
  txtProgreso.textContent = `${paginasListas} de ${totalPaginas} páginas completadas`;
}

function actualizarTiempoEstimado() {
  if (paginasListas === 0) return;
  const transcurrido = (Date.now() - inicioProceso) / 1000;
  const porPagina = transcurrido / paginasListas;
  const restantes = totalPaginas - paginasListas;
  if (restantes <= 0) { txtTiempo.textContent = ''; return; }
  const estimado = restantes * porPagina;
  txtTiempo.textContent = `Tiempo estimado restante: ${formatearTiempo(estimado)}`;
}

function actualizarContador() {
  const texto = textoResultado.value;
  const palabras = contarPalabras(texto);
  txtContador.textContent = `${paginasListas}/${totalPaginas} pág. · ${palabras.toLocaleString('es')} palabras`;
}

// Reconstruye el textarea respetando el orden correcto de páginas
function reconstruirTexto() {
  const partes = paginas
    .filter(p => p.estado === 'lista')
    .sort((a, b) => a.indice - b.indice)
    .map(p => {
      if (separadores) return `— Página ${p.indice} —\n${p.texto}`;
      return p.texto;
    });
  textoResultado.value = partes.join('\n\n');
}

// ─── Limpieza de texto ──────────────────────────────────────

function limpiarTexto(txt) {
  return txt
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')       // espacios antes de salto de línea
    .replace(/\n{3,}/g, '\n\n')       // más de 2 líneas vacías → 2
    .trim();
}

// ─── Detener y reanudar ─────────────────────────────────────

function detener() {
  detenido = true;
  btnDetener.style.display   = 'none';
  btnContinuar.style.display = '';
  txtProgreso.textContent    = 'Procesamiento detenido. El texto ya extraído se conserva.';
  txtTiempo.textContent      = '';
  txtPaginaActual.textContent = '';
  contenedorPreview.style.display = 'none';
}

async function reanudar() {
  if (!pdfDoc) return;
  detenido = false;
  btnContinuar.style.display = 'none';
  btnDetener.style.display   = '';
  txtProgreso.textContent    = 'Reanudando…';

  // Reencolar las páginas OCR que quedaron pendientes o en error
  colaPendiente = paginas
    .filter(p => (p.tipo === 'ocr' || forzarOCR) && (p.estado === 'pendiente' || p.estado === 'error'))
    .map(p => { p.estado = 'pendiente'; return p.indice; });

  if (colaPendiente.length === 0) {
    finalizarProceso();
    return;
  }

  // Reinicializar workers (el idioma puede haber cambiado)
  await iniciarWorkers();
  const tareas = workerPool.map(worker => procesarDesdeCola(worker));
  await Promise.all(tareas);

  if (!detenido) finalizarProceso();
}

// ─── Reintentar una página con error ────────────────────────

async function reintentarPagina(numPagina) {
  const info = paginas[numPagina - 1];
  if (info.estado === 'procesando') return;
  info.estado = 'pendiente';
  actualizarEstadoPagina(numPagina, 'procesando', 'OCR…');

  // Usar el primer worker disponible
  if (workerPool.length === 0) await iniciarWorkers();
  const worker = workerPool[0];
  await procesarPaginaOCR(numPagina, worker);
}

// ─── Finalización ────────────────────────────────────────────

async function finalizarProceso() {
  txtProgreso.textContent = `✅ Proceso completado — ${totalPaginas} páginas`;
  txtTiempo.textContent   = '';
  txtPaginaActual.textContent = '';
  btnDetener.style.display   = 'none';
  btnContinuar.style.display = 'none';
  contenedorPreview.style.display = 'none';
  actualizarBarra(1);
  actualizarContador();

  // Liberar workers
  for (const w of workerPool) {
    try { await w.terminate(); } catch { /* ignorar */ }
  }
  workerPool = [];
}

// ─── Reiniciar todo ─────────────────────────────────────────

function reiniciar() {
  pdfDoc = null;
  paginas = [];
  colaPendiente = [];
  procesandoAhora.clear();
  paginasListas = 0;
  detenido = false;

  seccionProgreso.style.display  = 'none';
  seccionPaginas.style.display   = 'none';
  seccionResultado.style.display = 'none';
  contenedorPreview.style.display = 'none';
  listaPaginas.innerHTML = '';
  textoResultado.value   = '';
  ocultarError();
  inputArchivo.value = '';
}

// ─── Copiar texto ───────────────────────────────────────────

async function copiarTexto() {
  const texto = textoResultado.value;
  if (!texto) return;
  try {
    await navigator.clipboard.writeText(texto);
    const original = btnCopiar.textContent;
    btnCopiar.textContent = '✅ Copiado';
    setTimeout(() => { btnCopiar.textContent = original; }, 1800);
  } catch {
    // Fallback para navegadores sin Clipboard API
    textoResultado.select();
    document.execCommand('copy');
  }
}

// ─── Descargar .txt ─────────────────────────────────────────

function descargarTxt() {
  const texto = textoResultado.value;
  if (!texto) return;
  const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
  descargarBlob(blob, `${nombreArchivo}.txt`);
}

// ─── Descargar .docx ────────────────────────────────────────

async function descargarDocx() {
  if (!textoResultado.value) return;
  btnDescargarDocx.disabled = true;
  btnDescargarDocx.innerHTML = '<span class="spinner"></span> Generando…';

  try {
    const { Document, Packer, Paragraph, TextRun, PageBreak } = docx;

    const children = [];

    // Una sección por página del PDF, con salto de página entre ellas
    const paginasListas_ = paginas.filter(p => p.estado === 'lista').sort((a,b) => a.indice - b.indice);

    paginasListas_.forEach((pag, i) => {
      // Separador opcional como título
      if (separadores) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `— Página ${pag.indice} —`, bold: true })]
        }));
      }

      // Cada línea no vacía → párrafo
      const lineas = pag.texto.split('\n');
      for (const linea of lineas) {
        children.push(new Paragraph({
          children: [new TextRun(linea)]
        }));
      }

      // Salto de página entre páginas del PDF (no al final)
      if (i < paginasListas_.length - 1) {
        children.push(new Paragraph({
          children: [new PageBreak()]
        }));
      }
    });

    const doc = new Document({
      sections: [{ children }]
    });

    const buffer = await Packer.toBlob(doc);
    descargarBlob(buffer, `${nombreArchivo}.docx`);
  } catch (err) {
    mostrarError(`❌ Error generando el archivo .docx: ${err.message || err}`);
    console.error(err);
  } finally {
    btnDescargarDocx.disabled = false;
    btnDescargarDocx.textContent = '⬇ Descargar .docx';
  }
}

// ─── Helper: descargar blob ──────────────────────────────────

function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}
