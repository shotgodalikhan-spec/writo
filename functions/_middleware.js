// Sends visitors of the old address to the new one, keeping the path.
export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname === "writo-1z1.pages.dev" || url.hostname.endsWith(".writo-1z1.pages.dev")) {
    url.hostname = "getwrito.pages.dev";
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
