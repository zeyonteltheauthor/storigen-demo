# grade-along-web

Serves Grade Along at gradealong.com by proxying https://zeyonteltheauthor.github.io/storigen-demo. The github.io team link is left unchanged so the passcode box stays there.

`/` and `/demo` (and `/demo/`) return the `/grade-along/` HTML with HTTP 200. They do not 302. A service worker registered at `/sw.js` has scope `/`; Chrome fails navigations with ERR_FAILED if that worker is given a redirected response. Query flags on `/` such as `?team=1` and `?demo` are preserved. `/demo` turns on public demo mode from the path. `/grade-along/` continues to work. Relative assets (`../fonts.css`, `../sw.js`) resolve at `/`, `/demo`, and `/grade-along/`.

When the app HTML is shown at `/` or `/demo`, the browser requests relative assets such as `samples/maya-science-check.jpg`, `test-score.js`, and `vendor/pdfjs/` from the site root. v26 maps `/samples/*`, `/test-score.js`, and `/vendor/*` to `/grade-along` plus the same path, so those files load. `/grade-along/` continues to work as before.
