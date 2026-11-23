// v26: grade-along-web maps / and /demo plus relative sample assets to /grade-along/.
import assert from "node:assert/strict";
import { upstreamPath } from "../web/src/paths.js";

let n = 0;
const ok = (name, c) => { assert.ok(c, name); n++; console.log("PASS", name); };

ok("/ -> /grade-along/", upstreamPath("/", "") === "/grade-along/");
ok("/ keeps query flags", upstreamPath("/", "?demo=1") === "/grade-along/?demo=1");
ok("/demo -> /grade-along/", upstreamPath("/demo", "") === "/grade-along/");
ok("/demo/ -> /grade-along/", upstreamPath("/demo/", "") === "/grade-along/");
ok("root sample jpg maps to /grade-along/samples/...", upstreamPath("/samples/maya-science-check.jpg", "") === "/grade-along/samples/maya-science-check.jpg");
ok("nico sample maps too", upstreamPath("/samples/nico-science-check.jpg", "") === "/grade-along/samples/nico-science-check.jpg");
ok("test-score.js maps", upstreamPath("/test-score.js", "") === "/grade-along/test-score.js");
ok("vendor/pdfjs maps", upstreamPath("/vendor/pdfjs/pdf.min.mjs", "") === "/grade-along/vendor/pdfjs/pdf.min.mjs");
ok("/grade-along/ samples stay put", upstreamPath("/grade-along/samples/maya-science-check.jpg", "") === "/grade-along/samples/maya-science-check.jpg");
ok("other paths unchanged", upstreamPath("/fonts.css", "") === "/fonts.css" && upstreamPath("/sw.js", "?v=1") === "/sw.js?v=1");

console.log(`\n${n} passed`);
