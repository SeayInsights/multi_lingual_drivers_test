/**
 * Hash router — #/home, #/study, #/signs, #/test, #/progress.
 * Works at any base path (GitHub Pages repo subpath safe).
 */
const routes = new Map();
let notFound = () => "<p>404</p>";

export function register(path, render) {
  routes.set(path, render);
}

export function setNotFound(render) {
  notFound = render;
}

export function currentPath() {
  const h = location.hash.replace(/^#/, "");
  return h === "" || h === "/" ? "/home" : h;
}

export function navigate(path) {
  location.hash = `#${path}`;
}

export function startRouter(viewEl, { onNavigate } = {}) {
  const render = () => {
    const path = currentPath();
    const view = routes.get(path) ?? notFound;
    viewEl.innerHTML = view(path);
    viewEl.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    onNavigate?.(path);
  };
  window.addEventListener("hashchange", render);
  render();
}
