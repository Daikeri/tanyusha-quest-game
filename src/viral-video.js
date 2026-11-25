const frames = [
  'Никита дома', 'Вход в центр', 'Съёмка', 'Монтаж', 'Готовый ролик', 'Кот',
];
const frameOrder = [4, 1, 6, 3, 5, 2];
const titles = [
  'Обзор «Что в моей сумочке?»',
  '«Я тебя могну» — видеоурок',
  'Когда надоело скучать дома',
  'Как снять свой первый ролик в Ямолод',
];
const emotionalEdits = ['1,3,4,5', '1,2,4,5', '2,3,4,5'];
const mentorLine = 'Получилось здорово! Но представь, что этот ролик увидит человек, который никогда не слышал о «Ямолод». Поймёт ли он, куда ему прийти и чем там можно заняться?';

function restore(storageKey) {
  const initial = {stage: 1, edit: [], title: ''};
  if (!storageKey) return initial;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if ([1, 2, 3].includes(saved?.stage) && Array.isArray(saved.edit) && saved.edit.length <= 4 &&
        new Set(saved.edit).size === saved.edit.length && saved.edit.every(id => Number.isInteger(id) && frames[id - 1]) &&
        (saved.title === '' || titles.includes(saved.title))) return saved;
  } catch { /* Storage can be unavailable in a private browsing session. */ }
  return initial;
}

export function activityTime(remaining) {
  const seconds = Math.ceil(Math.max(0, remaining) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function mountViralVideo(root, {storageKey, canEdit = () => true} = {}) {
  const state = restore(storageKey);
  let editable = false;
  let drag = null;
  root.innerHTML = `
    <div class="video-feedback" role="status"></div>
    <fieldset class="video-editor">
      <legend></legend>
      <p class="video-brief"></p>
      <blockquote class="video-mentor" hidden><strong>Лера</strong><p></p></blockquote>
      <h3>Кадры</h3><div class="video-frames"></div>
      <h3>Монтажная дорожка <small></small></h3>
      <div class="video-timeline" aria-label="Монтажная дорожка"></div>
      <h3>Заголовок</h3><div class="video-titles"></div>
      <div class="video-actions">
        <button type="button" class="secondary-button video-reset">Сбросить монтаж</button>
        <button type="button" class="primary-button video-check">Проверить</button>
      </div>
    </fieldset>`;
  const field = root.querySelector('fieldset');
  const feedback = root.querySelector('.video-feedback');
  const palette = root.querySelector('.video-frames');
  const timeline = root.querySelector('.video-timeline');
  const check = root.querySelector('.video-check');
  const reset = root.querySelector('.video-reset');
  const mentor = root.querySelector('.video-mentor');
  const buttons = new Map();
  const radioButtons = titles.map(title => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'video-title';
    label.append(input, title);
    root.querySelector('.video-titles').append(label);
    input.addEventListener('change', () => change(() => { state.title = title; }));
    return input;
  });
  for (const id of frameOrder) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary-button';
    button.textContent = frames[id - 1];
    button.addEventListener('click', () => {
      if (state.edit.length < 4 && !state.edit.includes(id)) change(() => state.edit.push(id));
    });
    palette.append(button);
    buttons.set(id, button);
  }

  function change(update, message = '') {
    if (!editable || !canEdit() || state.stage === 3) return;
    update();
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* The current edit is still available. */ }
    }
    feedback.textContent = message;
    renderEdit();
  }
  function reorder(index, target) {
    if (target < 0 || target >= state.edit.length || index === target) return;
    change(() => state.edit.splice(target, 0, state.edit.splice(index, 1)[0]));
  }
  function renderEdit() {
    field.hidden = state.stage === 3;
    if (field.hidden) {
      feedback.textContent = 'Оба монтажа готовы. Ждите продолжения на общем экране.';
      return;
    }
    const first = state.stage === 1;
    field.querySelector('legend').textContent = first ? '1 / 2 · Эмоциональный ролик' : '2 / 2 · Информационный ролик';
    root.querySelector('.video-brief').textContent = first
      ? 'Соберите историю о том, как подросток нашёл интересное занятие.'
      : 'Адаптируйте монтаж и заголовок для тех, кто впервые слышит о «Ямолод».';
    mentor.hidden = first;
    mentor.querySelector('p').textContent = mentorLine;
    field.querySelector('small').textContent = `${state.edit.length}/4`;
    for (const [id, button] of buttons) button.disabled = state.edit.length === 4 || state.edit.includes(id);
    radioButtons.forEach((input, index) => { input.checked = state.title === titles[index]; });
    check.disabled = state.edit.length !== 4 || !state.title;
    reset.disabled = !state.edit.length && !state.title;
    const active = document.activeElement;
    const focusedAction = timeline.contains(active) ? active.dataset.action : null;
    const focusedIndex = timeline.contains(active) ? Number(active.closest('[data-slot]').dataset.slot) : null;
    timeline.replaceChildren();
    for (let index = 0; index < 4; index++) {
      const id = state.edit[index];
      const slot = document.createElement('div');
      slot.className = 'video-slot';
      slot.dataset.slot = index;
      const name = document.createElement('span');
      name.textContent = id ? `${index + 1}. ${frames[id - 1]}` : `${index + 1}. Пусто`;
      name.className = id ? 'video-slot-name video-draggable' : 'video-slot-name';
      slot.append(name);
      if (id) {
        const controls = document.createElement('div');
        controls.className = 'video-slot-controls';
        const actions = [
          ['left', '←', 'Сдвинуть влево', index === 0, () => reorder(index, index - 1)],
          ['right', '→', 'Сдвинуть вправо', index === state.edit.length - 1, () => reorder(index, index + 1)],
          ['remove', '×', 'Убрать', false, () => change(() => state.edit.splice(index, 1))],
        ];
        for (const [action, symbol, label, disabled, run] of actions) {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.action = action;
          button.textContent = symbol;
          button.setAttribute('aria-label', `${label} · ${frames[id - 1]}`);
          button.disabled = disabled;
          button.addEventListener('click', run);
          controls.append(button);
        }
        slot.append(controls);
      }
      timeline.append(slot);
    }
    if (focusedAction) {
      const slot = timeline.children[Math.min(focusedIndex, state.edit.length - 1)];
      (slot?.querySelector(`[data-action="${focusedAction}"]:enabled`) || slot?.querySelector('button:enabled') ||
        palette.querySelector('button:enabled'))?.focus({preventScroll: true});
    }
  }

  timeline.addEventListener('pointerdown', event => {
    if (!editable || !event.isPrimary || event.button !== 0 || !event.target.closest('.video-draggable')) return;
    drag = {pointer: event.pointerId, index: Number(event.target.closest('[data-slot]').dataset.slot)};
    timeline.setPointerCapture(event.pointerId);
  });
  timeline.addEventListener('pointerup', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const slot = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-slot]');
    if (slot && timeline.contains(slot)) reorder(drag.index, Math.min(Number(slot.dataset.slot), state.edit.length - 1));
    drag = null;
  });
  timeline.addEventListener('lostpointercapture', () => { drag = null; });
  reset.addEventListener('click', () => change(() => { state.edit = []; state.title = ''; }));
  check.addEventListener('click', () => {
    if (!editable || !canEdit()) return;
    const first = state.stage === 1;
    const order = state.edit.join(',');
    const editCorrect = first ? emotionalEdits.includes(order) : order === '2,3,4,5';
    const titleCorrect = state.title === titles[first ? 2 : 3];
    if (editCorrect && titleCorrect) {
      change(() => { state.stage++; });
      if (first) field.querySelector('legend').scrollIntoView({block:'nearest'});
    } else {
      feedback.textContent = !editCorrect && !titleCorrect ? 'Попробуйте другой порядок кадров и заголовок.'
        : editCorrect ? 'Кадры подходят. Попробуйте другой заголовок.' : 'Заголовок подходит. Попробуйте другой порядок кадров.';
      feedback.scrollIntoView({block:'nearest'});
    }
  });
  renderEdit();
  field.disabled = true;
  return {
    setEditable(value) { editable = value; field.disabled = !value; },
    get complete() { return state.stage === 3; },
  };
}
