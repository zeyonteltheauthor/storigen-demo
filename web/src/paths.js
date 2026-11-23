// Shared by the site Worker and its tests. Do not put named exports on index.js.
export const APP_PATH = "/grade-along/";

export function upstreamPath(pathname, search) {
  const q = search || "";
  if (pathname === "/" || pathname === "") return APP_PATH + q;
  if (pathname === "/demo" || pathname === "/demo/") return APP_PATH + q;
  if (
    pathname === "/test-score.js" ||
    pathname.startsWith("/samples/") ||
    pathname.startsWith("/vendor/")
  ) {
    return "/grade-along" + pathname + q;
  }
  return pathname + q;
}
