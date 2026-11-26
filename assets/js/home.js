import { inserisciLogo } from './ui.js';

inserisciLogo(document.getElementById('navLogo'), { disegna: false });
inserisciLogo(document.getElementById('heroLogo'));
// i testi entrano dopo che il logo ha iniziato a disegnarsi
document.querySelectorAll('.hero .pop-section').forEach((el, i) => {
  el.style.setProperty('--pop-delay', `${550 + i * 90}ms`);
});
