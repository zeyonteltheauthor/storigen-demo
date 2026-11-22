// Serves Grade Along at gradealong.com by proxying the existing GitHub Pages
// site. The zeyonteltheauthor.github.io/storigen-demo team link is left
// unchanged, so the passcode box stays there.
//
// "/" and "/demo" return the app HTML with 200 (no 302). A service worker
// registered at /sw.js has scope "/" and will fail Chrome navigations
// (ERR_FAILED) if it is given a redirected response for those paths.
const UPSTREAM = "https://zeyonteltheauthor.github.io/storigen-demo";
const APP_PATH = "/grade-along/";

function proxyHeaders(request) {
  return {
    Accept: request.headers.get("Accept") || "*/*",
    "User-Agent": request.headers.get("User-Agent") || "GradeAlongSite"
  };
}

async function proxy(request, upstreamPath) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed.", { status: 405 });
  }
  const res = await fetch(UPSTREAM + upstreamPath, {
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
    if (url.pathname === "/" || url.pathname === "") {
      // Keep ?team=1, ?demo, and other query flags on the URL the visitor typed.
      return proxy(request, APP_PATH + url.search);
    }
    if (url.pathname === "/demo" || url.pathname === "/demo/") {
      // Demo mode is detected from the /demo path in the page script.
      return proxy(request, APP_PATH);
    }
    return proxy(request, url.pathname + url.search);
  }
};
