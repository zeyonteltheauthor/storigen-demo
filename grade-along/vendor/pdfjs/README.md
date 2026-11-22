# pdf.js (vendored)

Mozilla pdf.js `pdfjs-dist` 6.5.438, legacy build (Apache-2.0, see LICENSE; decoder licenses in `wasm/`).
Used by Grade Along to turn scanned PDF pages into pictures on the teacher's device. Not loaded from a CDN.

Files: `pdf.min.mjs`, `pdf.worker.min.mjs`, and the JBIG2 / OpenJPEG / QCMS decoders in `wasm/` (scanned papers often store handwriting as JBIG2).
To update: `npm i pdfjs-dist@<version>` and copy the same files from `legacy/build/` and `wasm/`.
