import Tether from './tether.js';

const $ = selector => document.querySelector(selector);

const toolbar = Tether.mountAll($('.toolbar'), { gap: 28 });
const help = new Tether($('#help'), {
  content: $('#rules').content.cloneNode(true),
  placement: 'right',
  interactive: true,
});
const card = new Tether($('#card'), { content: 'I follow the card', open: true, gap: 44 });

// Drag the card inside the playground; the pinned tip trails behind it.
const area = $('#playground');
const el = $('#card');
let pos = { x: 0, y: 0 };
const place = () => {
  const max = { x: area.clientWidth - el.offsetWidth, y: area.clientHeight - el.offsetHeight };
  pos = { x: Math.max(0, Math.min(max.x, pos.x)), y: Math.max(0, Math.min(max.y, pos.y)) };
  el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  card.reposition();
};
const center = () => {
  pos = { x: (area.clientWidth - el.offsetWidth) / 2, y: (area.clientHeight - el.offsetHeight) / 2 + 30 };
  place();
};
center();
addEventListener('resize', place);

let drag = null;
el.addEventListener('pointerdown', event => {
  drag = { x: event.clientX - pos.x, y: event.clientY - pos.y };
  el.setPointerCapture(event.pointerId);
  el.classList.add('is-dragging');
});
el.addEventListener('pointermove', event => {
  if (!drag) return;
  pos = { x: event.clientX - drag.x, y: event.clientY - drag.y };
  place();
});
const stop = () => { drag = null; el.classList.remove('is-dragging'); };
el.addEventListener('pointerup', stop);
el.addEventListener('pointercancel', stop);
el.addEventListener('keydown', event => {
  const step = event.shiftKey ? 60 : 20;
  const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
  if (!move) return;
  event.preventDefault();
  pos = { x: pos.x + move[0], y: pos.y + move[1] };
  place();
});

const all = [...toolbar, help, card];
$('#placement').addEventListener('change', event => card.configure({ placement: event.target.value }));
$('#gap').addEventListener('input', event => {
  $('#gap-out').textContent = `${event.target.value} px`;
  card.configure({ gap: Number(event.target.value) });
});
for (const key of ['stiffness', 'damping']) {
  $(`#${key}`).addEventListener('input', event => {
    $(`#${key}-out`).textContent = event.target.value;
    all.forEach(tip => tip.configure({ [key]: Number(event.target.value) }));
  });
}
