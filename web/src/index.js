// Serves Grade Along at gradealong.com by proxying the existing GitHub Pages
// site. The zeyonteltheauthor.github.io/storigen-demo team link is left
// unchanged, so the passcode box stays there.
const UPSTREAM = "https://zeyonteltheauthor.github.io/storigen-demo";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "") {
      return Response.redirect(new URL("/grade-along/", url).href, 302);
    }
    const upstream = UPSTREAM + url.pathname + url.search;
    const init = {
      method: request.method,
      redirect: "manual",
      headers: {
        Accept: request.headers.get("Accept") || "*/*",
        "User-Agent": request.headers.get("User-Agent") || "GradeAlongSite"
      }
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed.", { status: 405 });
    }
    const res = await fetch(upstream, init);
    const headers = new Headers(res.headers);
    const loc = headers.get("Location");
    if (loc && loc.includes("zeyonteltheauthor.github.io/storigen-demo")) {
      headers.set("Location", loc.replace("https://zeyonteltheauthor.github.io/storigen-demo", url.origin));
    }
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(res.body, { status: res.status, headers });
  }
};
