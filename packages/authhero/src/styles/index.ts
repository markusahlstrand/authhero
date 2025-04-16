import './tailwind.css';
import { tailwindCss } from './tailwind';

export { tailwindCss };

// This function can be used to inject the Tailwind CSS into the DOM
// when filesystem access is not available (e.g., Cloudflare Workers)
export function injectTailwindCSS() {
  if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.innerHTML = tailwindCss;
    style.setAttribute('data-authhero-tailwind', '');
    document.head.appendChild(style);
  }
}

export default { tailwindCss, injectTailwindCSS };