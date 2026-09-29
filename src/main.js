import './style.css';
import { startClockSync } from './lib.js';

startClockSync();

const route = location.hash.replace(/^#\/?/, '').toLowerCase();
const app = document.getElementById('app');

if (route.startsWith('host')) {
  document.body.classList.add('mode-host');
  import('./host.js').then((m) => m.mountHost(app));
} else if (route.startsWith('view')) {
  document.body.classList.add('mode-view');
  import('./view.js').then((m) => m.mountView(app));
} else {
  document.body.classList.add('mode-player');
  import('./player.js').then((m) => m.mountPlayer(app));
}

window.addEventListener('hashchange', () => location.reload());
