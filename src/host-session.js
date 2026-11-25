import {FirebaseSession, networkMessage} from './firebase-session.js';
import {FirebaseVoting} from './firebase-voting.js';
import {joinURL} from './poll.js';

const $ = id => document.getElementById(id);

export function setupHostSession({isStarted, changeVoting, pauseGame}) {
  let session, offMembers, busy = false;
  const message = value => { $('network-status').textContent = value; };
  const report = error => message(networkMessage(error));
  const render = () => {
    const room = session?.room;
    $('host-login').hidden = !!session?.isHost;
    $('network-actions').hidden = !session?.isHost;
    $('create-room').disabled = busy || isStarted() || !!room || !session?.connected;
    $('close-room').disabled = busy || isStarted() || !room || !session?.connected;
    $('host-logout').disabled = busy || !!room || isStarted();
    $('host-mode').textContent = room ? 'ИГРА С УЧАСТНИКАМИ' : 'ЛОКАЛЬНАЯ РЕПЕТИЦИЯ';
    $('vote-instructions').textContent = room ? 'Голоса собираются с телефонов. При ничьей или отсутствии голосов выберите ветку.' : 'Задайте ветку вместо голосования участников.';
    $('room-info').hidden = !room;
  };
  async function connect() {
    if (session) return session;
    session = await FirebaseSession.connect('host');
    session.addEventListener('connection', () => {
      message(session.connected ? 'Связь с Firebase установлена.' : 'Нет связи с Firebase. Ожидаем подключения…');
      if (!session.connected && session.room && isStarted()) pauseGame();
      render();
    });
    render(); return session;
  }
  async function run(action) {
    if (busy) return;
    busy = true; render();
    try { await action(); } catch (error) { report(error); }
    finally { busy = false; render(); }
  }
  $('host-login').addEventListener('submit', event => {
    event.preventDefault();
    const email = $('host-email').value.trim(), password = $('host-password').value;
    $('host-password').value = '';
    void run(async () => { message('Входим…'); await (await connect()).login(email, password); message('Вход выполнен. Создайте сессию перед началом истории.'); });
  });
  $('connect-host').addEventListener('click', () => void run(async () => {
    message('Подключаем Firebase…'); await connect();
    message(session.isHost ? 'Вход восстановлен. Можно создать сессию.' : 'Введите почту и пароль ведущего.');
  }));
  $('create-room').addEventListener('click', () => void run(async () => {
    if (isStarted()) return;
    // Load local QR code generator before creating any remote state.
    const {default: qrcode} = await import('./vendor/qrcode.js');
    const room = await session.createRoom();
    const url = joinURL(room);
    const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
    $('room-qr').innerHTML = qr.createSvgTag({cellSize: 5, margin: 20, scalable: true});
    $('room-link').href = url; $('room-link').textContent = url;
    $('room-count').textContent = 'Подключились: 0';
    offMembers?.(); offMembers = session.watch(session.path('members'), members => {
      $('room-count').textContent = `Подключились: ${Object.keys(members || {}).length}`;
    }, report);
    changeVoting(new FirebaseVoting(session, report));
    message('Сессия создана. Покажите QR участникам, затем начните историю.');
  }));
  $('close-room').addEventListener('click', () => void run(async () => {
    if (isStarted()) return;
    await close(); changeVoting(null); message('Сессия закрыта. Включена локальная репетиция.');
  }));
  $('host-logout').addEventListener('click', () => void run(async () => {
    await session.logout(); message('Вы вышли из аккаунта ведущего.');
  }));
  $('copy-room').addEventListener('click', () => void run(async () => {
    await navigator.clipboard.writeText($('room-link').href); message('Ссылка скопирована.');
  }));
  async function close() {
    if (session?.room) await session.closeRoom();
    offMembers?.(); offMembers = null; render();
  }
  render();
  return {report, refresh: render, close, get room() { return session?.room; }, get busy() { return busy; }};
}
