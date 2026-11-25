import {FirebaseSession, networkMessage} from './firebase-session.js';
import {validRoom} from './poll.js';

const $ = id => document.getElementById(id);
const room = new URL(location.href).searchParams.get('room');
let session, pollId, state, ownVote, pending = false, closed = false, failed = false;
let offState, offVote, offMeta, offActive, timer;
let notice = '';
function render() {
  $('connection-status').textContent = session?.connected ? 'Вы подключены к игре' : 'Нет связи. Подключаемся снова…';
  if (failed) return;
  $('participant-poll').hidden = closed || !state || state.status === 'cancelled';
  if (closed) { $('participant-title').textContent = 'Игра завершена'; $('participant-status').textContent = 'Спасибо за участие! Для новой игры отсканируйте новый QR.'; return; }
  if (!state || state.status === 'cancelled') {
    $('participant-title').textContent = 'Вы в игре'; $('participant-status').textContent = 'Ждём следующего вопроса от ведущего.'; return;
  }
  $('participant-title').textContent = state.question;
  const remaining = state.status === 'paused' ? state.remaining : Math.max(0, state.deadline - session.now());
  const accepting = state.status === 'open' && remaining > 0 && session.connected;
  $('participant-timer').textContent = state.status === 'paused' ? 'Пауза' : state.status === 'open' ? `${Math.ceil(remaining / 1000)} сек.` : 'Приём ответов завершён';
  for (const button of $('participant-options').children) {
    button.disabled = !accepting || pending;
    button.setAttribute('aria-pressed', String(ownVote?.choice === button.dataset.choice));
  }
  if (state.status === 'published') {
    const result = state.result;
    $('participant-status').textContent = result ? `Выбрано: ${state.options[result.choice]}. Голосов: А — ${result.accept}, Б — ${result.decline}.` : 'Голосование завершено.';
  } else if (pending) $('participant-status').textContent = session.connected ? 'Отправляем ответ…' : 'Ответ ещё не подтверждён. Ждём связи…';
  else if (notice) $('participant-status').textContent = notice;
  else if (!accepting && state.status !== 'paused') $('participant-status').textContent = 'Ждём, когда ведущий раскроет результат.';
  else $('participant-status').textContent = ownVote ? 'Ваш ответ сохранён. До окончания времени выбор можно изменить.' : 'Выберите вариант ответа.';
}
function showError(error) {
  failed = true;
  $('participant-status').textContent = networkMessage(error);
  $('participant-poll').hidden = true; $('join-retry').hidden = false;
}
async function answer(choice) {
  if (pending || !session?.connected) return;
  const id = pollId;
  pending = true; notice = ''; render();
  try {
    await session.answer(id, choice);
    if (id === pollId) { ownVote = {choice}; notice = 'Ответ принят. До окончания времени выбор можно изменить.'; }
  } catch (error) {
    if (id === pollId) notice = /permission/i.test(String(error.code) + error.message)
      ? 'Ответ не принят: голосование закрыто или поставлено на паузу.' : networkMessage(error);
  } finally { if (id === pollId) { pending = false; render(); } }
}
function watchPoll(id) {
  if (id === pollId) return;
  offState?.(); offVote?.(); pollId = id; state = null; ownVote = null; pending = false; notice = '';
  $('participant-options').replaceChildren(); render();
  if (!id) return;
  offState = session.watch(session.path(`polls/${id}/state`), value => {
    if (pollId !== id) return;
    state = value;
    if (value && !$('participant-options').children.length) {
      for (const [choice, label] of Object.entries(value.options)) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.dataset.choice = choice; button.addEventListener('click', () => void answer(choice));
        $('participant-options').append(button);
      }
    }
    render();
  }, showError);
  offVote = session.watch(session.path(`polls/${id}/votes/${session.uid}`), vote => {
    // Firebase emits optimistic local writes; acknowledgement is shown only after set() resolves.
    if (pollId === id && !pending) { ownVote = vote; render(); }
  }, showError);
}
async function connect() {
  $('join-retry').hidden = true; failed = false;
  $('participant-title').textContent = 'Подключаемся к игре'; $('participant-status').textContent = '';
  try {
    if (!validRoom(room)) throw new Error('Откройте ссылку из QR-кода ведущего. В этой ссылке нет корректного номера сессии.');
    if (!session) {
      session = await FirebaseSession.connect('participant');
      session.addEventListener('connection', render);
    }
    await session.join(room);
    offMeta?.(); offActive?.(); offState?.(); offVote?.(); clearInterval(timer);
    pollId = undefined; state = null; closed = false;
    offMeta = session.watch(session.path('meta'), meta => { closed = !meta || meta.status === 'closed'; render(); }, showError);
    offActive = session.watch(session.path('activePoll'), watchPoll, showError);
    timer = setInterval(render, 250); render();
  } catch (error) { showError(error); }
}
$('join-retry').addEventListener('click', () => void connect());
void connect();
