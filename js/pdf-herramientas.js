(function () {
  'use strict';

  const { PDFDocument, degrees } = PDFLib;

  // ───── Helpers ─────

  function descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function setStatus(el, msg, tipo) {
    el.textContent = msg;
    el.className = 'status-herramienta' + (tipo ? ' status-' + tipo : '');
    el.style.display = msg ? '' : 'none';
  }

  function conectarZonaDrop(zonaId, inputId, btnId, onArchivos) {
    const zona  = document.getElementById(zonaId);
    const input = document.getElementById(inputId);
    const btn   = document.getElementById(btnId);
    zona.addEventListener('click',   e => { if (!e.target.closest('button')) input.click(); });
    btn.addEventListener('click',    ()  => input.click());
    zona.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    zona.addEventListener('dragover',  e => { e.preventDefault(); zona.classList.add('encima'); });
    zona.addEventListener('dragleave', ()  => zona.classList.remove('encima'));
    zona.addEventListener('drop', e => { e.preventDefault(); zona.classList.remove('encima'); onArchivos(e.dataTransfer.files); });
    input.addEventListener('change', () => { onArchivos(input.files); input.value = ''; });
  }

  // ═══════════════════════════════════════════
  // ROTAR PÁGINAS
  // ═══════════════════════════════════════════

  const infoRotar      = document.getElementById('info-rotar');
  const controlesRotar = document.getElementById('controles-rotar');
  const listaRotar     = document.getElementById('lista-rotar');
  const btnGuardarRotar = document.getElementById('btn-guardar-rotar');
  const statusRotar    = document.getElementById('status-rotar');

  let archivoRotar = null;
  let rotaciones   = [];

  conectarZonaDrop('zona-rotar', 'input-rotar', 'btn-sel-rotar', archivos => {
    const f = Array.from(archivos).find(f => f.type === 'application/pdf');
    if (f) cargarRotar(f);
  });

  async function cargarRotar(file) {
    setStatus(statusRotar, 'Leyendo PDF…', 'info');
    try {
      const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      archivoRotar = file;
      rotaciones = doc.getPages().map(p => p.getRotation().angle);
      renderListaRotar();
      infoRotar.textContent = `${file.name} — ${rotaciones.length} página${rotaciones.length !== 1 ? 's' : ''}`;
      infoRotar.style.display = '';
      controlesRotar.style.display = '';
      btnGuardarRotar.disabled = false;
      setStatus(statusRotar, '');
    } catch {
      setStatus(statusRotar, 'No se pudo leer el PDF.', 'error');
    }
  }

  function renderListaRotar() {
    listaRotar.innerHTML = '';
    rotaciones.forEach((ang, i) => {
      const div = document.createElement('div');
      div.className = 'pagina-rotar';
      div.innerHTML = `
        <span class="pagina-rotar-num">Pág. ${i + 1}</span>
        <span class="pagina-rotar-angulo" id="ang-${i}">${ang}°</span>
        <div class="pagina-rotar-btns">
          <button class="btn btn-secundario btn-sm" data-i="${i}" data-r="-90" title="90° izquierda">↺ 90°</button>
          <button class="btn btn-secundario btn-sm" data-i="${i}" data-r="90"  title="90° derecha">↻ 90°</button>
          <button class="btn btn-secundario btn-sm" data-i="${i}" data-r="180" title="180°">↕ 180°</button>
        </div>`;
      listaRotar.appendChild(div);
    });
  }

  listaRotar.addEventListener('click', e => {
    const btn = e.target.closest('[data-r]');
    if (!btn) return;
    const i = parseInt(btn.dataset.i);
    rotaciones[i] = ((rotaciones[i] + parseInt(btn.dataset.r)) % 360 + 360) % 360;
    document.getElementById(`ang-${i}`).textContent = rotaciones[i] + '°';
  });

  document.getElementById('btn-rotar-todo-izq').addEventListener('click', () => {
    rotaciones = rotaciones.map(a => ((a - 90) % 360 + 360) % 360);
    renderListaRotar();
  });
  document.getElementById('btn-rotar-todo-der').addEventListener('click', () => {
    rotaciones = rotaciones.map(a => (a + 90) % 360);
    renderListaRotar();
  });
  document.getElementById('btn-rotar-todo-180').addEventListener('click', () => {
    rotaciones = rotaciones.map(a => (a + 180) % 360);
    renderListaRotar();
  });

  btnGuardarRotar.addEventListener('click', async () => {
    if (!archivoRotar) return;
    btnGuardarRotar.disabled = true;
    setStatus(statusRotar, 'Guardando…', 'info');
    try {
      const doc = await PDFDocument.load(await archivoRotar.arrayBuffer(), { ignoreEncryption: true });
      doc.getPages().forEach((page, i) => page.setRotation(degrees(rotaciones[i])));
      descargarBlob(new Blob([await doc.save()], { type: 'application/pdf' }),
        archivoRotar.name.replace(/\.pdf$/i, '') + '_rotado.pdf');
      setStatus(statusRotar, 'PDF guardado.', 'ok');
    } catch (e) {
      setStatus(statusRotar, 'Error: ' + e.message, 'error');
    } finally {
      btnGuardarRotar.disabled = false;
    }
  });

  // ═══════════════════════════════════════════
  // IMÁGENES → PDF
  // ═══════════════════════════════════════════

  const listaImgPDF  = document.getElementById('lista-img-pdf');
  const btnCrearPDF  = document.getElementById('btn-crear-pdf');
  const statusImgPDF = document.getElementById('status-img-pdf');
  const selTamanoPag = document.getElementById('sel-tamano-pag');

  let imagenesParaPDF = [];

  conectarZonaDrop('zona-img-pdf', 'input-img-pdf', 'btn-sel-img-pdf', archivos => {
    Array.from(archivos).filter(f => f.type.startsWith('image/')).forEach(f => imagenesParaPDF.push(f));
    renderListaImgPDF();
  });

  function renderListaImgPDF() {
    listaImgPDF.innerHTML = '';
    imagenesParaPDF.forEach((f, i) => {
      const div = document.createElement('div');
      div.className = 'archivo-img';
      const prev = document.createElement('img');
      prev.className = 'archivo-img-preview';
      const url = URL.createObjectURL(f);
      prev.src = url;
      prev.onload = () => URL.revokeObjectURL(url);
      div.appendChild(prev);
      div.insertAdjacentHTML('beforeend', `
        <span class="archivo-img-nombre" title="${f.name}">${f.name}</span>
        <div class="archivo-img-acciones">
          <button class="btn btn-secundario btn-sm" data-i="${i}" data-a="subir"
                  ${i === 0 ? 'disabled' : ''} title="Subir">↑</button>
          <button class="btn btn-secundario btn-sm" data-i="${i}" data-a="bajar"
                  ${i === imagenesParaPDF.length - 1 ? 'disabled' : ''} title="Bajar">↓</button>
          <button class="btn btn-peligro btn-sm" data-i="${i}" data-a="quitar" title="Quitar">✕</button>
        </div>`);
      listaImgPDF.appendChild(div);
    });
    listaImgPDF.style.display = imagenesParaPDF.length ? '' : 'none';
    btnCrearPDF.disabled = !imagenesParaPDF.length;
  }

  listaImgPDF.addEventListener('click', e => {
    const btn = e.target.closest('[data-a]');
    if (!btn) return;
    const i = parseInt(btn.dataset.i);
    if      (btn.dataset.a === 'subir'  && i > 0)                           [imagenesParaPDF[i-1], imagenesParaPDF[i]]   = [imagenesParaPDF[i], imagenesParaPDF[i-1]];
    else if (btn.dataset.a === 'bajar'  && i < imagenesParaPDF.length - 1)  [imagenesParaPDF[i], imagenesParaPDF[i+1]] = [imagenesParaPDF[i+1], imagenesParaPDF[i]];
    else if (btn.dataset.a === 'quitar')                                      imagenesParaPDF.splice(i, 1);
    renderListaImgPDF();
  });

  btnCrearPDF.addEventListener('click', async () => {
    if (!imagenesParaPDF.length) return;
    btnCrearPDF.disabled = true;
    try {
      const doc = await PDFDocument.create();
      const tamano = selTamanoPag.value;
      for (let idx = 0; idx < imagenesParaPDF.length; idx++) {
        setStatus(statusImgPDF, `Procesando imagen ${idx + 1} de ${imagenesParaPDF.length}…`, 'info');
        const { bytes, tipo, w, h } = await cargarImagenParaPDF(imagenesParaPDF[idx]);
        const img = tipo === 'jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
        const imgW = w, imgH = h;
        let pageW, pageH;
        if      (tamano === 'a4')     { pageW = 595.28; pageH = 841.89; }
        else if (tamano === 'a4l')    { pageW = 841.89; pageH = 595.28; }
        else if (tamano === 'letter') { pageW = 612;    pageH = 792;    }
        else                          { pageW = imgW;   pageH = imgH;   }
        const page = doc.addPage([pageW, pageH]);
        if (tamano === 'auto') {
          page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
        } else {
          const scale = Math.min(pageW / imgW, pageH / imgH);
          const dw = imgW * scale, dh = imgH * scale;
          page.drawImage(img, { x: (pageW - dw) / 2, y: (pageH - dh) / 2, width: dw, height: dh });
        }
      }
      descargarBlob(new Blob([await doc.save()], { type: 'application/pdf' }), 'imagenes.pdf');
      setStatus(statusImgPDF, `PDF creado con ${imagenesParaPDF.length} página${imagenesParaPDF.length !== 1 ? 's' : ''}.`, 'ok');
    } catch (e) {
      setStatus(statusImgPDF, 'Error: ' + e.message, 'error');
    } finally {
      btnCrearPDF.disabled = !imagenesParaPDF.length;
    }
  });

  function cargarImagenParaPDF(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (file.type === 'image/jpeg') {
          file.arrayBuffer().then(bytes => { URL.revokeObjectURL(url); resolve({ bytes, tipo: 'jpeg', w, h }); });
        } else {
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          canvas.toBlob(blob => blob.arrayBuffer().then(bytes => resolve({ bytes, tipo: 'png', w, h })), 'image/png');
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`No se pudo cargar ${file.name}`)); };
      img.src = url;
    });
  }

  // ═══════════════════════════════════════════
  // PDF → IMÁGENES
  // ═══════════════════════════════════════════

  const infoPDFImg     = document.getElementById('info-pdf-img');
  const selEscala      = document.getElementById('sel-escala');
  const selFmtImg      = document.getElementById('sel-fmt-img');
  const inputRangoImg  = document.getElementById('input-rango-img');
  const btnExportarImgs = document.getElementById('btn-exportar-imgs');
  const statusPDFImg   = document.getElementById('status-pdf-img');

  let archivoPDFImg   = null;
  let totalPagsPDFImg = 0;

  conectarZonaDrop('zona-pdf-img', 'input-pdf-img', 'btn-sel-pdf-img', archivos => {
    const f = Array.from(archivos).find(f => f.type === 'application/pdf');
    if (f) cargarPDFImg(f);
  });

  async function cargarPDFImg(file) {
    setStatus(statusPDFImg, 'Leyendo PDF…', 'info');
    try {
      const url = URL.createObjectURL(file);
      const pdf = await pdfjsLib.getDocument(url).promise;
      URL.revokeObjectURL(url);
      archivoPDFImg = file;
      totalPagsPDFImg = pdf.numPages;
      infoPDFImg.textContent = `${file.name} — ${totalPagsPDFImg} página${totalPagsPDFImg !== 1 ? 's' : ''}`;
      infoPDFImg.style.display = '';
      btnExportarImgs.disabled = false;
      setStatus(statusPDFImg, '');
    } catch {
      setStatus(statusPDFImg, 'No se pudo leer el PDF.', 'error');
    }
  }

  btnExportarImgs.addEventListener('click', async () => {
    if (!archivoPDFImg) return;
    const rangoStr = inputRangoImg.value.trim();
    let paginas;
    if (rangoStr) {
      try { paginas = parseRangoSimple(rangoStr, totalPagsPDFImg); }
      catch (e) { setStatus(statusPDFImg, e.message, 'error'); return; }
    } else {
      paginas = Array.from({ length: totalPagsPDFImg }, (_, i) => i + 1);
    }

    btnExportarImgs.disabled = true;
    const escala   = parseFloat(selEscala.value);
    const formato  = selFmtImg.value;
    const ext      = formato === 'image/jpeg' ? 'jpg' : 'png';
    const baseName = archivoPDFImg.name.replace(/\.pdf$/i, '');

    try {
      const url = URL.createObjectURL(archivoPDFImg);
      const pdf = await pdfjsLib.getDocument(url).promise;
      URL.revokeObjectURL(url);

      if (paginas.length === 1) {
        setStatus(statusPDFImg, 'Renderizando…', 'info');
        const blob = await renderPaginaBlob(pdf, paginas[0], escala, formato);
        descargarBlob(blob, `${baseName}_pag${paginas[0]}.${ext}`);
        setStatus(statusPDFImg, 'Imagen descargada.', 'ok');
      } else {
        const zip = new JSZip();
        for (let j = 0; j < paginas.length; j++) {
          const num = paginas[j];
          setStatus(statusPDFImg, `Renderizando página ${num} (${j + 1}/${paginas.length})…`, 'info');
          const blob = await renderPaginaBlob(pdf, num, escala, formato);
          zip.file(`${baseName}_pag${String(num).padStart(4, '0')}.${ext}`, await blob.arrayBuffer());
        }
        descargarBlob(await zip.generateAsync({ type: 'blob' }), `${baseName}_imagenes.zip`);
        setStatus(statusPDFImg, `${paginas.length} imágenes descargadas en ZIP.`, 'ok');
      }
    } catch (e) {
      setStatus(statusPDFImg, 'Error: ' + e.message, 'error');
    } finally {
      btnExportarImgs.disabled = false;
    }
  });

  async function renderPaginaBlob(pdf, pageNum, escala, formato) {
    const page     = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: escala });
    const canvas   = document.createElement('canvas');
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return new Promise(resolve => canvas.toBlob(resolve, formato, formato === 'image/jpeg' ? 0.92 : undefined));
  }

  function parseRangoSimple(str, total) {
    const m = str.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`Rango inválido: "${str}". Usa formato 2-8 o 3.`);
    const desde = parseInt(m[1], 10);
    const hasta  = m[2] ? parseInt(m[2], 10) : desde;
    if (desde < 1 || hasta < desde) throw new Error(`Rango inválido: "${str}".`);
    if (hasta > total) throw new Error(`"${str}" excede el total de ${total} páginas.`);
    const pags = [];
    for (let p = desde; p <= hasta; p++) pags.push(p);
    return pags;
  }

  // ═══════════════════════════════════════════
  // EDITAR PÁGINAS (reorganizar + eliminar)
  // ═══════════════════════════════════════════

  const infoEditar      = document.getElementById('info-editar');
  const ayudaEditar     = document.getElementById('ayuda-editar');
  const gridEditar      = document.getElementById('grid-editar');
  const btnGuardarEditar = document.getElementById('btn-guardar-editar');
  const statusEditar    = document.getElementById('status-editar');

  let archivoEditar = null;
  let pdfJSEditar   = null;
  let pdfJSUrl      = null;
  let ordenPaginas  = [];
  let thumbObserver = null;
  let dragSrcIdx    = null;

  conectarZonaDrop('zona-editar', 'input-editar', 'btn-sel-editar', archivos => {
    const f = Array.from(archivos).find(f => f.type === 'application/pdf');
    if (f) cargarEditar(f);
  });

  async function cargarEditar(file) {
    setStatus(statusEditar, 'Cargando PDF…', 'info');
    try {
      if (pdfJSUrl) URL.revokeObjectURL(pdfJSUrl);
      pdfJSUrl    = URL.createObjectURL(file);
      pdfJSEditar = await pdfjsLib.getDocument(pdfJSUrl).promise;
      archivoEditar = file;
      const n = pdfJSEditar.numPages;
      ordenPaginas = Array.from({ length: n }, (_, i) => i);
      renderGridEditar();
      infoEditar.textContent = `${file.name} — ${n} página${n !== 1 ? 's' : ''}`;
      infoEditar.style.display = '';
      ayudaEditar.style.display = '';
      btnGuardarEditar.disabled = false;
      setStatus(statusEditar, '');
    } catch {
      setStatus(statusEditar, 'No se pudo leer el PDF.', 'error');
    }
  }

  function renderGridEditar() {
    gridEditar.innerHTML = '';
    if (thumbObserver) thumbObserver.disconnect();

    thumbObserver = new IntersectionObserver(entries => {
      entries.forEach(async entry => {
        if (!entry.isIntersecting || entry.target.dataset.rendered) return;
        entry.target.dataset.rendered = '1';
        const origIdx = parseInt(entry.target.dataset.orig);
        try {
          const page     = await pdfJSEditar.getPage(origIdx + 1);
          const viewport = page.getViewport({ scale: 0.3 });
          const canvas   = entry.target.querySelector('canvas');
          canvas.width   = viewport.width;
          canvas.height  = viewport.height;
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        } catch { /* ignorar errores de renderizado individual */ }
      });
    }, { root: gridEditar, rootMargin: '150px' });

    ordenPaginas.forEach((origIdx, displayIdx) => {
      const item = document.createElement('div');
      item.className   = 'thumb-item';
      item.dataset.display = displayIdx;
      item.dataset.orig    = origIdx;
      item.draggable = true;
      item.innerHTML = `<canvas></canvas>
        <span class="thumb-num">${origIdx + 1}</span>
        <button class="thumb-delete" title="Eliminar página">✕</button>`;

      item.addEventListener('dragstart', () => {
        dragSrcIdx = parseInt(item.dataset.display);
        item.classList.add('arrastrando');
      });
      item.addEventListener('dragend', () => {
        document.querySelectorAll('.thumb-item').forEach(el =>
          el.classList.remove('arrastrando', 'drop-encima'));
      });
      item.addEventListener('dragover', e => {
        e.preventDefault();
        document.querySelectorAll('.thumb-item').forEach(el => el.classList.remove('drop-encima'));
        item.classList.add('drop-encima');
      });
      item.addEventListener('dragleave', () => item.classList.remove('drop-encima'));
      item.addEventListener('drop', e => {
        e.preventDefault();
        item.classList.remove('drop-encima');
        if (dragSrcIdx === null) return;
        const targetIdx = parseInt(item.dataset.display);
        if (dragSrcIdx === targetIdx) return;
        const [moved] = ordenPaginas.splice(dragSrcIdx, 1);
        const insertAt = targetIdx > dragSrcIdx ? targetIdx - 1 : targetIdx;
        ordenPaginas.splice(insertAt, 0, moved);
        renderGridEditar();
      });

      item.querySelector('.thumb-delete').addEventListener('click', e => {
        e.stopPropagation();
        ordenPaginas.splice(parseInt(item.dataset.display), 1);
        renderGridEditar();
      });

      gridEditar.appendChild(item);
      thumbObserver.observe(item);
    });

    gridEditar.style.display = ordenPaginas.length ? '' : 'none';
  }

  btnGuardarEditar.addEventListener('click', async () => {
    if (!archivoEditar || !ordenPaginas.length) return;
    btnGuardarEditar.disabled = true;
    setStatus(statusEditar, 'Generando PDF…', 'info');
    try {
      const srcDoc = await PDFDocument.load(await archivoEditar.arrayBuffer(), { ignoreEncryption: true });
      const nuevo  = await PDFDocument.create();
      const copias = await nuevo.copyPages(srcDoc, ordenPaginas);
      copias.forEach(p => nuevo.addPage(p));
      descargarBlob(new Blob([await nuevo.save()], { type: 'application/pdf' }),
        archivoEditar.name.replace(/\.pdf$/i, '') + '_editado.pdf');
      setStatus(statusEditar, `PDF guardado (${ordenPaginas.length} páginas).`, 'ok');
    } catch (e) {
      setStatus(statusEditar, 'Error: ' + e.message, 'error');
    } finally {
      btnGuardarEditar.disabled = false;
    }
  });

})();
