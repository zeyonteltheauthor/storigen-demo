// Serves Grade Along at gradealong.com by proxying the existing GitHub Pages
// site. The zeyonteltheauthor.github.io/storigen-demo team link is left
// unchanged, so the passcode box stays there.
//
// "/" and "/demo" return the app HTML with 200 (no 302). A service worker
// registered at /sw.js has scope "/" and will fail Chrome navigations
// (ERR_FAILED) if it is given a redirected response for those paths.
//
// v26: relative assets like samples/*.jpg, test-score.js, and vendor/pdfjs
// resolve at the site root when the page is shown at / or /demo. Map those
// paths to /grade-along/... so the science sample (and test scoring) load.
import { upstreamPath } from "./paths.js";

const UPSTREAM = "https://zeyonteltheauthor.github.io/storigen-demo";

function proxyHeaders(request) {
  return {
    Accept: request.headers.get("Accept") || "*/*",
    "User-Agent": request.headers.get("User-Agent") || "GradeAlongSite"
  };
}

async function proxy(request, upstreamPathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed.", { status: 405 });
  }
  const res = await fetch(UPSTREAM + upstreamPathname, {
    method: request.method,
    redirect: "follow",
    headers: proxyHeaders(request)
  });
  const headers = new Headers(res.headers);
  headers.delete("Location");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(request.method === "HEAD" ? null : res.body, {
    status: res.status,
    statusText: res.statusText,
    headers
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    return proxy(request, upstreamPath(url.pathname, url.search));
  }
};
