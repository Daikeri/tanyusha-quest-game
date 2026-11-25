import {FirebaseSession, networkMessage} from './firebase-session.js';
import {FirebaseVoting} from './firebase-voting.js';
import {joinURL} from './poll.js';

const $ = id => document.getElementById(id);

export function setupHostSession({isStarted, changeVoting, pauseGame}) {
  let session, offMembers, closing, busy = false, authenticated = false, rehearsal = false, roomReady = false;
  const entryStatus = $('entry-status'), roomStatus = $('room-status'), networkStatus = $('network-status');
  const hasGame = () => isStarted() || rehearsal || roomReady;
  const canStart = () => !busy && !isStarted() && (rehearsal || (roomReady && session.connected));
  const report = error => {
    const status = !hasGame() ? entryStatus : isStarted() ? networkStatus : roomStatus;
    status.textContent = networkMessage(error);
    status.hidden = false;
  };

  function render() {
    const inGame = hasGame();
    const wasInGame = $('host-entry').hidden;
    $('host-entry').hidden = inGame;
    $('game-shell').hidden = !inGame;
    $('start-screen').hidden = !inGame || isStarted();
    $('host-login').hidden = authenticated;
    $('host-submit').disabled = busy;
    $('retry-room').hidden = !authenticated || busy;
    $('rehearse').disabled = busy || !!session?.room;
    $('room-info').hidden = !roomReady;
    $('host-logout').hidden = !inGame || isStarted();
    $('host-logout').disabled = busy;
    $('start').disabled = !canStart();
    if (wasInGame && !inGame) {
      $('host-entry-title').focus();
    }
    if (!wasInGame && inGame) {
      $('start').focus({preventScroll: true});
    }
  }

  async function connect() {
    if (session) return;
    session = await FirebaseSession.connect('host');
    const disconnected = 'Нет связи с Firebase. Ожидаем подключения…';
    session.addEventListener('connection', () => {
      roomStatus.textContent = session.connected ? '' : disconnected;
      if (!session.connected && session.room && isStarted()) {
        networkStatus.textContent = disconnected;
        networkStatus.hidden = false;
        pauseGame();
      } else if (session.connected && networkStatus.textContent === disconnected) {
        networkStatus.hidden = true;
      }
      render();
    });
  }

  async function waitForConnection() {
    if (session.connected) return;
    entryStatus.textContent = 'Подключаемся к Firebase…';
    const timeout = AbortSignal.timeout(10000);
    await new Promise((resolve, reject) => {
      session.addEventListener('connection', () => {
        if (session.connected) resolve();
      }, {signal: timeout});
      timeout.addEventListener('abort', () => reject(new Error('Нет связи с Firebase. Попробуйте подключиться ещё раз.')), {once: true});
    });
  }

  async function prepareRoom() {
    if (rehearsal || !authenticated) return;
    await waitForConnection();
    entryStatus.textContent = 'Готовим игру…';
    const {default: qrcode} = await import('./vendor/qrcode.js');
    const room = session.room || await session.createRoom();
    const url = joinURL(room);
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    $('room-qr').innerHTML = qr.createSvgTag({cellSize: 5, margin: 20, scalable: true});
    $('room-link').href = url;
    $('room-count').textContent = 'Подключились: 0';
    roomStatus.textContent = '';
    offMembers = session.watch(session.path('members'), members => {
      $('room-count').textContent = `Подключились: ${Object.keys(members || {}).length}`;
    }, report);
    changeVoting(new FirebaseVoting(session, report));
    roomReady = true;
  }

  function close() {
    if (!session?.room) return;
    closing ??= session.closeRoom().then(() => {
      offMembers?.();
      offMembers = null;
      roomReady = false;
    }).finally(() => { closing = null; });
    return closing;
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    render();
    try { await action(); }
    catch (error) { report(error); }
    finally { busy = false; render(); }
  }

  $('host-login').addEventListener('submit', event => {
    event.preventDefault();
    void run(async () => {
      const email = $('host-email').value.trim();
      const password = $('host-password').value;
      entryStatus.textContent = 'Входим…';
      await connect();
      await session.login(email, password);
      $('host-password').value = '';
      authenticated = true;
      render();
      await prepareRoom();
    });
  });
  $('retry-room').addEventListener('click', () => void run(prepareRoom));
  $('rehearse').addEventListener('click', () => {
    $('host-password').value = '';
    rehearsal = true;
    render();
  });
  $('host-logout').addEventListener('click', () => void run(async () => {
    await close();
    if (authenticated) await session.logout();
    authenticated = false;
    rehearsal = false;
    changeVoting(null);
    entryStatus.textContent = '';
    networkStatus.hidden = true;
  }));
  $('copy-room').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('room-link').href);
      roomStatus.textContent = 'Ссылка скопирована.';
    } catch {
      roomStatus.textContent = 'Откройте QR-ссылку и скопируйте адрес из браузера.';
    }
  });

  render();
  return {report, refresh: render, close, prepare: () => run(prepareRoom), canStart,
    get roomSession() { return roomReady ? session : null; }};
}
