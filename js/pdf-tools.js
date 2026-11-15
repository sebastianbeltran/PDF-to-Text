(function () {
  'use strict';

  const { PDFDocument } = PDFLib;

  // ───── Tab switching ─────

  const tabs    = document.querySelectorAll('.tab');
  const paneles = document.querySelectorAll('.panel-tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => { t.classList.remove('activa'); t.setAttribute('aria-selected', 'false'); });
      paneles.forEach(p => { p.hidden = true; });
      tab.classList.add('activa');
      tab.setAttribute('aria-selected', 'true');
      document.getElementById(tab.dataset.panel).hidden = false;
    });
    tab.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tab.click(); }
    });
  });

  // ───── Helpers ─────

  function descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function setStatus(el, msg, tipo) {
    el.textContent = msg;
    el.className   = 'status-herramienta' + (tipo ? ' status-' + tipo : '');
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
    zona.addEventListener('drop', e => {
      e.preventDefault();
      zona.classList.remove('encima');
      onArchivos(e.dataTransfer.files);
    });
    input.addEventListener('change', () => { onArchivos(input.files); input.value = ''; });
  }

  // ───── DIVIDIR ─────

  const infoPaginasDividir = document.getElementById('info-paginas-dividir');
  const rangosContainer    = document.getElementById('rangos-container');
  const listaRangos        = document.getElementById('lista-rangos');
  const btnAgregarRango    = document.getElementById('btn-agregar-rango');
  const btnDividir         = document.getElementById('btn-dividir');
  const statusDividir      = document.getElementById('status-dividir');

  let archivoDividir   = null;
  let totalPagsDividir = 0;

  conectarZonaDrop('zona-dividir', 'input-dividir', 'btn-sel-dividir', archivos => {
    const f = Array.from(archivos).find(f => f.type === 'application/pdf');
    if (f) cargarDividir(f);
  });

  async function cargarDividir(file) {
    setStatus(statusDividir, 'Leyendo PDF…', 'info');
    try {
      const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      archivoDividir   = file;
      totalPagsDividir = doc.getPageCount();
      listaRangos.innerHTML = '';
      agregarFilaRango();
      rangosContainer.style.display = '';
      infoPaginasDividir.textContent = `${file.name} — ${totalPagsDividir} página${totalPagsDividir !== 1 ? 's' : ''}`;
      infoPaginasDividir.style.display = '';
      btnDividir.disabled = false;
      setStatus(statusDividir, '');
    } catch {
      setStatus(statusDividir, 'No se pudo leer el PDF.', 'error');
    }
  }

  function agregarFilaRango() {
    const idx = listaRangos.children.length;
    const div = document.createElement('div');
    div.className = 'fila-rango';
    div.innerHTML = `
      <span class="rango-label">Parte ${idx + 1}</span>
      <span class="rango-sep">Pág.</span>
      <input type="number" class="input-num rango-desde" min="1" max="${totalPagsDividir || 9999}"
             value="1" aria-label="Página inicio" />
      <span class="rango-sep">—</span>
      <input type="number" class="input-num rango-hasta" min="1" max="${totalPagsDividir || 9999}"
             value="${totalPagsDividir || 1}" aria-label="Página fin" />
      <button class="btn btn-peligro btn-sm btn-quitar-rango" type="button" title="Quitar rango">✕</button>`;
    div.querySelector('.btn-quitar-rango').addEventListener('click', () => {
      div.remove();
      actualizarEtiquetas();
    });
    listaRangos.appendChild(div);
    actualizarEtiquetas();
  }

  function actualizarEtiquetas() {
    Array.from(listaRangos.children).forEach((fila, i) => {
      fila.querySelector('.rango-label').textContent = `Parte ${i + 1}`;
    });
  }

  btnAgregarRango.addEventListener('click', agregarFilaRango);

  btnDividir.addEventListener('click', async () => {
    if (!archivoDividir) return;
    const filas = Array.from(listaRangos.querySelectorAll('.fila-rango'));
    if (!filas.length) { setStatus(statusDividir, 'Agrega al menos un rango.', 'error'); return; }

    let rangos;
    try {
      rangos = filas.map((fila, i) => {
        const desde = parseInt(fila.querySelector('.rango-desde').value, 10);
        const hasta  = parseInt(fila.querySelector('.rango-hasta').value, 10);
        if (isNaN(desde) || isNaN(hasta))  throw new Error(`Parte ${i + 1}: ingresa números válidos.`);
        if (desde < 1)                      throw new Error(`Parte ${i + 1}: la página inicial debe ser al menos 1.`);
        if (hasta < desde)                  throw new Error(`Parte ${i + 1}: la página final no puede ser menor a la inicial.`);
        if (hasta > totalPagsDividir)       throw new Error(`Parte ${i + 1}: la página ${hasta} excede el total (${totalPagsDividir}).`);
        const pags = [];
        for (let p = desde; p <= hasta; p++) pags.push(p);
        return pags;
      });
    } catch (e) {
      setStatus(statusDividir, e.message, 'error');
      return;
    }

    btnDividir.disabled = true;
    setStatus(statusDividir, 'Generando PDF(s)…', 'info');

    try {
      const srcDoc = await PDFDocument.load(await archivoDividir.arrayBuffer(), { ignoreEncryption: true });

      if (rangos.length === 1) {
        const nuevo  = await PDFDocument.create();
        const copias = await nuevo.copyPages(srcDoc, rangos[0].map(p => p - 1));
        copias.forEach(p => nuevo.addPage(p));
        descargarBlob(new Blob([await nuevo.save()], { type: 'application/pdf' }),
          nombreParte(archivoDividir.name, 1));
        setStatus(statusDividir, 'PDF descargado.', 'ok');
      } else {
        setStatus(statusDividir, `Generando ${rangos.length} partes…`, 'info');
        const zip = new JSZip();
        for (let i = 0; i < rangos.length; i++) {
          const nuevo  = await PDFDocument.create();
          const copias = await nuevo.copyPages(srcDoc, rangos[i].map(p => p - 1));
          copias.forEach(p => nuevo.addPage(p));
          zip.file(nombreParte(archivoDividir.name, i + 1), await nuevo.save());
        }
        descargarBlob(await zip.generateAsync({ type: 'blob' }),
          archivoDividir.name.replace(/\.pdf$/i, '') + '_partes.zip');
        setStatus(statusDividir, `${rangos.length} partes descargadas en ZIP.`, 'ok');
      }
    } catch (e) {
      setStatus(statusDividir, 'Error: ' + e.message, 'error');
    } finally {
      btnDividir.disabled = false;
    }
  });

  function nombreParte(original, i) {
    return original.replace(/\.pdf$/i, '') + `_parte_${i}.pdf`;
  }

  // ───── UNIR ─────

  const listaUnir  = document.getElementById('lista-unir');
  const btnUnir    = document.getElementById('btn-unir');
  const statusUnir = document.getElementById('status-unir');

  let archivosUnir = [];

  conectarZonaDrop('zona-unir', 'input-unir', 'btn-sel-unir', archivos => {
    Array.from(archivos)
      .filter(f => f.type === 'application/pdf')
      .forEach(f => archivosUnir.push(f));
    renderListaUnir();
  });

  function renderListaUnir() {
    listaUnir.innerHTML = '';
    archivosUnir.forEach((f, i) => {
      const div = document.createElement('div');
      div.className = 'archivo-unir';
      div.innerHTML = `
        <span class="archivo-unir-num">${i + 1}</span>
        <span class="archivo-unir-nombre" title="${f.name}">${f.name}</span>
        <div class="archivo-unir-acciones">
          <button class="btn btn-secundario btn-sm" data-i="${i}" data-a="subir"
                  ${i === 0 ? 'disabled' : ''} title="Subir">↑</button>
          <button class="btn btn-secundario btn-sm" data-i="${i}" data-a="bajar"
                  ${i === archivosUnir.length - 1 ? 'disabled' : ''} title="Bajar">↓</button>
          <button class="btn btn-peligro btn-sm" data-i="${i}" data-a="quitar" title="Quitar">✕</button>
        </div>`;
      listaUnir.appendChild(div);
    });
    listaUnir.style.display = archivosUnir.length ? '' : 'none';
    btnUnir.disabled = archivosUnir.length < 2;
  }

  listaUnir.addEventListener('click', e => {
    const btn = e.target.closest('[data-a]');
    if (!btn) return;
    const i = parseInt(btn.dataset.i, 10);
    if      (btn.dataset.a === 'subir'  && i > 0)                        [archivosUnir[i - 1], archivosUnir[i]]     = [archivosUnir[i], archivosUnir[i - 1]];
    else if (btn.dataset.a === 'bajar'  && i < archivosUnir.length - 1)  [archivosUnir[i], archivosUnir[i + 1]]     = [archivosUnir[i + 1], archivosUnir[i]];
    else if (btn.dataset.a === 'quitar')                                   archivosUnir.splice(i, 1);
    renderListaUnir();
  });

  btnUnir.addEventListener('click', async () => {
    if (archivosUnir.length < 2) return;
    btnUnir.disabled = true;
    setStatus(statusUnir, 'Uniendo PDFs…', 'info');
    try {
      const merged = await PDFDocument.create();
      for (const f of archivosUnir) {
        const doc  = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
        const pags = await merged.copyPages(doc, [...Array(doc.getPageCount()).keys()]);
        pags.forEach(p => merged.addPage(p));
      }
      descargarBlob(new Blob([await merged.save()], { type: 'application/pdf' }), 'unido.pdf');
      setStatus(statusUnir, `Listo — ${archivosUnir.length} PDFs unidos.`, 'ok');
    } catch (e) {
      setStatus(statusUnir, 'Error: ' + e.message, 'error');
    } finally {
      btnUnir.disabled = archivosUnir.length < 2;
    }
  });

})();
