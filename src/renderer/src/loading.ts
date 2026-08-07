import './tokens.css';
import './loading.css';

const caption = document.getElementById('caption');

window.goetiaLoading.onState(({ theme, serviceName }) => {
  document.documentElement.dataset.theme = theme;
  if (caption) caption.textContent = `Waking ${serviceName}…`;
});
