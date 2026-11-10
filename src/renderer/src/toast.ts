import './tokens.css';
import './toast.css';
import { TOAST_MS } from '../../shared/toast';

const logos = import.meta.glob<string>('./assets/logos/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

const el = (id: string) => document.getElementById(id) as HTMLElement;
const card = el('toast');
const chip = el('chip');
const glyph = el('glyph');
const small = el('small');
const main = el('main');
const action = el('action');
const drain = el('drain');

/** Remove and re-add so a toast that replaces one on screen replays it. */
function replay(node: HTMLElement, cls: string): void {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

function setPaused(paused: boolean): void {
  // decorative: main owns the clock, this only draws it
  drain.style.animationPlayState = paused ? 'paused' : 'running';
}

window.goetiaToast.onToast((t) => {
  document.documentElement.dataset.theme = t.theme;
  chip.style.background = t.color;
  glyph.style.setProperty('--glyph', `url("${logos[`./assets/logos/${t.serviceId}.svg`]}")`);
  // the filename is page-controlled: text only, never markup
  small.textContent = t.small;
  main.textContent = t.main;
  action.textContent = t.action ?? '';
  action.hidden = t.action === null;
  card.hidden = false;
  drain.style.animationDuration = `${TOAST_MS}ms`;
  replay(card, 'toast-drop');
  replay(drain, 'toast-drain');
  // a toast can land under a resting pointer, which never "enters"
  const hovered = card.matches(':hover');
  setPaused(hovered);
  if (hovered) window.goetiaToast.reply('enter');
});

card.addEventListener('mouseenter', () => {
  setPaused(true);
  window.goetiaToast.reply('enter');
});
card.addEventListener('mouseleave', () => {
  setPaused(false);
  window.goetiaToast.reply('leave');
});

// every click answers: the action reveals, anything else (the card's body,
// the shadow margin) dismisses, so a click never strands focus on this layer
document.addEventListener('click', (e) => {
  const onAction = !action.hidden && e.target instanceof Node && action.contains(e.target);
  window.goetiaToast.reply(onAction ? 'reveal' : 'dismiss');
});
