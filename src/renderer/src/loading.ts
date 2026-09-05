import './tokens.css';
import './loading.css';
import './portal.css';

const captionEl = document.getElementById('caption');

window.goetiaLoading.onState(({ theme, caption }) => {
  document.documentElement.dataset.theme = theme;
  if (captionEl) captionEl.textContent = caption;
});
