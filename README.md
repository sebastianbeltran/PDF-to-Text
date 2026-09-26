# PDF a Texto

Convierte archivos PDF a texto plano directamente en tu navegador. No se sube ningún archivo a internet: todo el procesamiento ocurre en tu computador.

## Características

- **PDFs digitales**: extrae el texto directamente (rápido).
- **PDFs escaneados**: usa OCR (reconocimiento óptico de caracteres) con Tesseract.js.
- **PDFs mixtos**: detecta automáticamente qué páginas tienen texto y cuáles son imágenes.
- Selector de idioma: Español, Inglés o Español+Inglés.
- Procesamiento en paralelo (varios workers) para documentos largos.
- Progreso en tiempo real con barra y tiempo estimado.
- Botón para detener y reanudar el proceso.
- Lista de estado por página con opción de reintentar páginas con error.
- Exporta como **.txt** o **.docx**.
- Modo claro y oscuro automático.
- Funciona en computador y en celular.

## Cómo usarla

1. Abre la aplicación en tu navegador.
2. Arrastra un PDF al área indicada, o haz clic en **Seleccionar archivo PDF**.
3. Elige el idioma del OCR si es necesario.
4. Espera a que se procesen las páginas (el texto aparece conforme se completan).
5. Copia el texto o descárgalo como `.txt` o `.docx`.

> **Primera vez**: Tesseract descarga los datos de idioma (~15 MB). Puede tardar un momento según tu conexión; las siguientes veces el navegador los tiene en caché.

## Tecnologías

| Librería | Versión | Uso |
|---|---|---|
| [PDF.js](https://mozilla.github.io/pdf.js/) | 3.11.174 | Leer PDFs y extraer texto |
| [Tesseract.js](https://tesseract.projectnaptha.com/) | 4.1.4 | OCR en el navegador |
| [docx](https://docx.js.org/) | 8.5.0 | Generar archivos .docx |

Sin servidor. Sin backend. Sin cookies. 100% estático.

## Privacidad

Ningún archivo sale de tu computador. Todo el procesamiento —extracción de texto y OCR— se ejecuta localmente en tu navegador. No hay analítica ni rastreo de ningún tipo.

## Desarrollar localmente

```bash
# Con Python (viene instalado en la mayoría de sistemas)
python -m http.server 8080

# Con Node.js
npx serve .

# Luego abre: http://localhost:8080
```

## Licencia

MIT
