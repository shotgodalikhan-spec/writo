// Sends visitors of the old address to the new one, keeping the path.
const OLD_HOST = "writo-1z1.pages.dev";
const NEW_HOST = "getwrito.pages.dev";

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname === OLD_HOST || url.hostname.endsWith("." + OLD_HOST)) {
    url.hostname = NEW_HOST;
    // An old page still open on the old address calls /api/* on its own origin.
    // A redirect there points to another origin, the browser blocks it (CORS)
    // and the visitor only sees "Failed to fetch". Answer directly instead,
    // with a message the old page can show.
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({
        error: "Writo has moved to https://" + NEW_HOST + " . Please open that address and try again. Your free check was not used.",
        moved: "https://" + NEW_HOST + "/",
      }), { status: 410, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    }
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
