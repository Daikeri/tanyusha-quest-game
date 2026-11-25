import {firebaseConfig, HOST_UID} from './firebase-config.js';
import {closePoll, pausePoll, validRoom} from './poll.js';

// Lazy imports keep the local rehearsal independent of Firebase and the network.
const SDK = 'https://www.gstatic.com/firebasejs/12.6.0';
let sdkPromise;
async function loadSDK() {
  sdkPromise ??= Promise.all([
    import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-database.js`),
  ]).catch(error => { sdkPromise = null; throw error; });
  return sdkPromise;
}

export function networkMessage(error) {
  const code = String(error?.code || '');
  if (/permission.denied/i.test(code) || /permission_denied/i.test(error?.message || '')) return 'Доступ запрещён. Проверьте опубликованные правила Firebase и аккаунт ведущего.';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code)) return 'Не удалось войти. Проверьте почту и пароль.';
  if (/operation-not-allowed/.test(code)) return 'Этот способ входа не включён в Firebase Authentication.';
  if (/too-many-requests/.test(code)) return 'Слишком много попыток входа. Попробуйте позже.';
  if (/network-request-failed/.test(code)) return 'Нет связи с Firebase. Проверьте интернет.';
  return error?.message || 'Не удалось связаться с Firebase.';
}

export class FirebaseSession extends EventTarget {
  static async connect(role) {
    const [appSDK, authSDK, dbSDK] = await loadSDK();
    const name = `yamolod-${role}`;
    const app = appSDK.getApps().find(item => item.name === name) || appSDK.initializeApp(firebaseConfig, name);
    const session = new FirebaseSession();
    session.a = authSDK; session.d = dbSDK;
    session.auth = authSDK.getAuth(app); session.db = dbSDK.getDatabase(app);
    session.connected = false; session.offset = 0; session.room = null;
    // Separate named apps keep host and participant identities apart on one device.
    await authSDK.setPersistence(session.auth, authSDK.browserLocalPersistence);
    await session.auth.authStateReady();
    session.disposers = [
      dbSDK.onValue(dbSDK.ref(session.db, '.info/connected'), snap => {
        session.connected = snap.val() === true;
        session.dispatchEvent(new Event('connection'));
      }),
      dbSDK.onValue(dbSDK.ref(session.db, '.info/serverTimeOffset'), snap => { session.offset = snap.val() || 0; }),
    ];
    return session;
  }

  get uid() { return this.auth.currentUser?.uid; }
  get isHost() { return this.uid === HOST_UID; }
  now() { return Date.now() + this.offset; }
  path(tail = '') { return `rooms/${this.room}${tail ? '/' + tail : ''}`; }
  requireOnline() { if (!this.connected) throw new Error('Нет связи с Firebase. Дождитесь подключения.'); }
  watch(path, callback, onError = () => {}) {
    return this.d.onValue(this.d.ref(this.db, path), snap => callback(snap.val()), onError);
  }
  async login(email, password) {
    await this.a.signInWithEmailAndPassword(this.auth, email, password);
    if (!this.isHost) { await this.a.signOut(this.auth); throw new Error('У этого аккаунта нет прав ведущего.'); }
  }
  async logout() { await this.a.signOut(this.auth); }
  async createRoom() {
    this.requireOnline();
    if (!this.isHost) throw new Error('Сначала войдите в аккаунт ведущего.');
    const room = this.d.push(this.d.ref(this.db, 'rooms')).key;
    await this.d.set(this.d.ref(this.db, `rooms/${room}`), {
      meta: {hostUid: this.uid, status: 'lobby', createdAt: this.d.serverTimestamp()},
    });
    this.room = room;
    return room;
  }
  async closeRoom(room = this.room) {
    if (!room) return;
    this.requireOnline();
    await this.d.set(this.d.ref(this.db, `rooms/${room}/meta/status`), 'closed');
    if (this.room === room) this.room = null;
  }
  async join(room) {
    if (!validRoom(room)) throw new Error('Некорректная ссылка. Отсканируйте QR ведущего ещё раз.');
    if (!this.auth.currentUser) await this.a.signInAnonymously(this.auth);
    this.room = room;
    const meta = (await this.d.get(this.d.ref(this.db, this.path('meta')))).val();
    if (!meta || meta.status === 'closed') throw new Error('Эта игра завершена или не существует. Получите новый QR у ведущего.');
    await this.d.runTransaction(this.d.ref(this.db, this.path(`members/${this.uid}`)), value => value ? undefined : {joinedAt: this.d.serverTimestamp()}, {applyLocally: false});
  }
  async openPoll(command) {
    this.requireOnline();
    const id = this.d.push(this.d.ref(this.db, this.path('polls'))).key;
    const state = {question: command.question, options: command.options, status: 'open',
      duration: command.duration, remaining: command.duration, deadline: this.now() + command.duration};
    await this.d.update(this.d.ref(this.db, this.path()), {
      [`polls/${id}/state`]: state, activePoll: id, 'meta/status': 'playing',
    });
    return id;
  }
  async closePoll(id) {
    this.requireOnline();
    return this.d.runTransaction(this.d.ref(this.db, this.path(`polls/${id}`)), closePoll, {applyLocally: false});
  }
  async setPaused(id, paused) {
    this.requireOnline();
    await this.d.runTransaction(this.d.ref(this.db, this.path(`polls/${id}/state`)), state => pausePoll(state, paused, this.now()), {applyLocally: false});
  }
  async chooseTie(id, choice) {
    this.requireOnline();
    await this.d.runTransaction(this.d.ref(this.db, this.path(`polls/${id}`)), poll => {
      if (poll === null) return null;
      if (poll?.state.status !== 'closed' || !poll.result || poll.result.choice || !['accept', 'decline'].includes(choice)) return;
      return {...poll, result: {...poll.result, choice}};
    }, {applyLocally: false});
  }
  async publish(id) {
    this.requireOnline();
    const result = await this.d.runTransaction(this.d.ref(this.db, this.path(`polls/${id}`)), poll => {
      if (poll === null) return null;
      if (poll?.state.status !== 'closed' || !poll.result?.choice) return;
      return {...poll, state: {...poll.state, status: 'published', result: poll.result}};
    }, {applyLocally: false});
    if (result.snapshot.val()?.state.status !== 'published') throw new Error('Результат ещё не готов к публикации.');
  }
  async cancelPoll(id, room = this.room) {
    // Queued cancellation is safe: unique poll IDs are never reused.
    await this.d.runTransaction(this.d.ref(this.db, `rooms/${room}/polls/${id}/state`), state => {
      if (state === null) return null;
      if (['published', 'cancelled'].includes(state.status)) return;
      return {...state, status: 'cancelled'};
    }, {applyLocally: false});
  }
  async answer(id, choice) {
    this.requireOnline();
    await this.d.set(this.d.ref(this.db, this.path(`polls/${id}/votes/${this.uid}`)), {choice, at: this.d.serverTimestamp()});
  }
}
