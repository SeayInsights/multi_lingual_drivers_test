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

let activeRender = null;

export function startRouter(viewEl, { onNavigate } = {}) {
  const render = () => {
    const path = currentPath();
    const view = routes.get(path) ?? notFound;
    viewEl.innerHTML = view(path);
    viewEl.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    onNavigate?.(path);
  };
  activeRender = render;
  window.addEventListener("hashchange", render);
  render();
}

/** Re-render the current view in place (e.g. after a language-mode change). */
export function rerender() {
  activeRender?.();
}
