"""Integration QA against a local Realtime Database emulator only.

Run a static server on 8000 and the database emulator on 9000 first.
Firebase Authentication is substituted with emulator mock tokens in intercepted
test responses. Production source and the real Firebase project are not modified.
Requires Python Playwright and Microsoft Edge, like browser_check.py.
"""
from pathlib import Path
import json
import urllib.request
from urllib.parse import urlsplit
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:8000'
DB = 'http://127.0.0.1:9000'
NS = 'demo-yamolod'
HOST = 'nukA4eMs1ag5ikrHTjw485UD8sf1'


def admin(path, method='GET', data=None):
    request = urllib.request.Request(
        f'{DB}/{path}.json?ns={NS}', method=method,
        data=json.dumps(data).encode() if data is not None else None,
        headers={'Authorization': 'Bearer owner', 'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(request))


def instrument(context, uid):
    source = (ROOT / 'src/firebase-session.js').read_text(encoding='utf-8')
    start = source.index('  static async connect(role) {')
    end = source.index('\n  get uid()', start)
    replacement = '''  static async connect(role) {
      const [apps, unusedAuth, dbSDK] = await loadSDK();
      const name = `yamolod-${role}`;
      const app = apps.getApps().find(a => a.name === name) || apps.initializeApp({
        projectId: 'demo-yamolod', databaseURL: 'https://demo-yamolod.firebaseio.com', apiKey: 'test-key'
      }, name);
      const session = new FirebaseSession();
      session.d = dbSDK; session.db = dbSDK.getDatabase(app);
      dbSDK.connectDatabaseEmulator(session.db, '127.0.0.1', 9000, {
        mockUserToken: {sub: UID, user_id: UID, firebase: {sign_in_provider: 'anonymous'}}
      });
      session.auth = {currentUser: role === 'host' ? null : {uid: UID}};
      session.a = {
        signInWithEmailAndPassword: async (auth, email, password) => {
          if (password !== 'emulator-only') {
            await new Promise(resolve => { window.releaseTestLogin = resolve; });
            throw Object.assign(new Error('Invalid credentials'), {code: 'auth/invalid-credential'});
          }
          session.auth.currentUser = {uid: UID};
        },
        signInAnonymously: async () => { session.auth.currentUser = {uid: UID}; },
        signOut: async () => { session.auth.currentUser = null; }
      };
      session.connected = false; session.offset = 0; session.room = null;
      session.disposers = [
        dbSDK.onValue(dbSDK.ref(session.db, '.info/connected'), snap => {
          session.connected = snap.val() === true; session.dispatchEvent(new Event('connection'));
        }),
        dbSDK.onValue(dbSDK.ref(session.db, '.info/serverTimeOffset'), snap => { session.offset = snap.val() || 0; })
      ];
      window.testSession = session;
      return session;
    }
'''.replace('UID', json.dumps(uid))
    context.route('**/src/firebase-session.js', lambda route: route.fulfill(
        status=200, content_type='text/javascript', body=source[:start] + replacement + source[end:]))


def denied(page, path, value=None, read=False):
    result = page.evaluate('''async ({path, value, read}) => {
      const s = window.testSession;
      try {
        if (read) await s.d.get(s.d.ref(s.db, path));
        else await s.d.set(s.d.ref(s.db, path), value);
        return false;
      } catch (e) { return /permission/i.test(e.code + e.message); }
    }''', {'path': path, 'value': value, 'read': read})
    assert result, f'Unexpected access: {path}'


def advance_to(page, selector):
    for _ in range(180):
        if page.locator(selector).is_visible():
            return
        if page.locator('#dialogue').is_visible():
            page.locator('#next-dialogue').click()
        elif page.locator('#chat').is_visible():
            page.locator('#next-chat').click()
        page.wait_for_timeout(160)
    raise AssertionError(f'Did not reach {selector}')


admin('.settings/rules', 'PUT', json.loads((ROOT / 'database.rules.json').read_text()))
admin('rooms', 'DELETE')
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    contexts = [browser.new_context(viewport={'width': 1280, 'height': 900})]
    contexts += [browser.new_context(viewport={'width': 390, 'height': 844}) for _ in range(2)]
    for context, uid in zip(contexts, [HOST, 'participant-a', 'participant-b']):
        instrument(context, uid)
    host, a, b = [context.new_page() for context in contexts]
    errors = []
    for page in [host, a, b]:
        page.on('pageerror', lambda error: errors.append(str(error)))
    host.goto(BASE)
    assert host.locator('#host-login').is_visible()
    assert not host.locator('#start-screen').is_visible()
    assert host.locator('#host-panel, #host-toggle').count() == 0
    host.locator('#host-email').fill('host@example.test')
    host.locator('#host-password').fill('wrong-password')
    host.locator('#host-submit').click()
    host.wait_for_function("() => typeof window.releaseTestLogin === 'function'")
    assert host.locator('#host-password').input_value() == 'wrong-password'
    host.evaluate('window.releaseTestLogin()')
    host.wait_for_function("document.querySelector('#entry-status').textContent.startsWith('Не удалось войти')")
    assert host.locator('#host-password').input_value() == 'wrong-password'
    assert not host.locator('#start-screen').is_visible()
    assert admin('rooms') is None
    host.evaluate('''() => {
      const session = window.testSession;
      const createRoom = session.createRoom.bind(session);
      session.createRoom = async () => {
        session.createRoom = createRoom;
        throw new Error('Test room creation failure');
      };
    }''')
    host.locator('#host-password').fill('emulator-only')
    host.locator('#host-submit').click()
    host.locator('#retry-room').wait_for()
    assert host.locator('#host-password').input_value() == ''
    assert not host.locator('#start-screen').is_visible()
    assert admin('rooms') is None
    host.locator('#retry-room').click()
    host.locator('#start-screen #room-qr svg').wait_for()
    assert not host.locator('#host-entry').is_visible()
    public_link = urlsplit(host.locator('#room-link').get_attribute('href'))
    room = host.evaluate('window.testSession.room')
    assert list(admin('rooms')) == [room]
    assert admin(f'rooms/{room}/meta/status') == 'lobby'
    for width, height in [(1280, 720), (390, 844), (320, 640), (844, 390)]:
        host.set_viewport_size({'width': width, 'height': height})
        bounds = host.evaluate('''() => {
          const screen = document.querySelector('#start-screen').getBoundingClientRect();
          const card = document.querySelector('#room-info').getBoundingClientRect();
          return [card.top - screen.top, screen.right - card.right, screen.bottom - card.bottom];
        }''')
        top, right, bottom = bounds
        assert 0 <= top <= 24 and 0 <= right <= 24 and abs(top - right) < 1 and bottom >= 0, (
            f'QR card outside the top right corner at {width}×{height}: {bounds}')
    host.set_viewport_size({'width': 1280, 'height': 900})
    assert public_link.geturl() == f'https://daikeri.github.io/tanyusha-quest-game/join.html?room={room}'
    link = f'{BASE}/join.html?{public_link.query}'
    a.goto(link)
    b.goto(link)
    a.wait_for_function("document.querySelector('#participant-title').textContent === 'Вы в игре'")
    b.wait_for_function("document.querySelector('#participant-title').textContent === 'Вы в игре'")
    host.wait_for_function("document.querySelector('#room-count').textContent.endsWith('2')")
    for page in [a, b]:
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    denied(a, f'rooms/{room}/meta/status', 'closed')
    denied(a, 'rooms/unauthorized-room', {'meta': {'hostUid': 'participant-a'}})
    denied(a, f'rooms/{room}', read=True)
    denied(a, f'rooms/{room}/members/participant-b', {'joinedAt': {'.sv': 'timestamp'}})
    print('Join, QR, responsive participant layout, session and host authorization: passed', flush=True)

    host.evaluate('''async () => {
      const {GameClock} = await import('/src/engine.js');
      const tick = GameClock.prototype.tick;
      GameClock.prototype.tick = function(delta) { tick.call(this, delta * 50); };
    }''')
    host.locator('#start').click()
    advance_to(host, '#vote')
    a.locator('[data-choice="accept"]').wait_for()
    poll = admin(f'rooms/{room}/activePoll')
    host.locator('#pause').click()
    a.wait_for_function("document.querySelector('#participant-timer').textContent === 'Пауза'")
    denied(a, f'rooms/{room}/polls/{poll}/votes/participant-a', {'choice': 'accept', 'at': {'.sv': 'timestamp'}})
    remaining = admin(f'rooms/{room}/polls/{poll}/state/remaining')
    host.wait_for_timeout(1100)
    assert admin(f'rooms/{room}/polls/{poll}/state/remaining') == remaining
    host.locator('#pause').click()
    a.wait_for_function("!document.querySelector('[data-choice=accept]').disabled")
    a.locator('[data-choice="accept"]').click()
    a.wait_for_function("document.querySelector('#participant-status').textContent.startsWith('Ответ принят')")
    a.locator('[data-choice="decline"]').click()
    a.wait_for_function("document.querySelector('#participant-status').textContent.startsWith('Ответ принят')")
    b.locator('[data-choice="accept"]').click()
    b.wait_for_function("document.querySelector('#participant-status').textContent.startsWith('Ответ принят')")
    assert len(admin(f'rooms/{room}/polls/{poll}/votes')) == 2
    denied(a, f'rooms/{room}/polls/{poll}/votes/participant-b', {'choice': 'decline', 'at': {'.sv': 'timestamp'}})
    denied(a, f'rooms/{room}/polls/{poll}/votes/participant-b', read=True)
    denied(a, f'rooms/{room}/polls/{poll}/votes/participant-a', {'choice': 'hacked', 'at': {'.sv': 'timestamp'}})
    denied(a, f'rooms/{room}/polls/{poll}/votes/participant-a', {'choice': 'accept', 'at': 1})
    a.reload()
    a.wait_for_function("document.querySelector('[data-choice=decline]')?.getAttribute('aria-pressed') === 'true'")
    print('Pause/resume, own answer replacement, reconnect, foreign/invalid writes denied: passed', flush=True)

    host.locator('#vote-finish').click()
    host.locator('#vote [data-choice="accept"]').wait_for()
    result = admin(f'rooms/{room}/polls/{poll}/result')
    assert result == {'accept': 1, 'decline': 1, 'total': 2, 'choice': ''}, result
    assert admin(f'rooms/{room}/polls/{poll}/state/result') is None
    denied(a, f'rooms/{room}/polls/{poll}/result', read=True)
    denied(a, f'rooms/{room}/polls/{poll}/votes/participant-a', {'choice': 'accept', 'at': {'.sv': 'timestamp'}})
    host.locator('[data-choice="accept"]').click()
    host.locator('#vote-next').click()
    a.wait_for_function("document.querySelector('#participant-status').textContent.startsWith('Выбрано:')")
    assert admin(f'rooms/{room}/polls/{poll}/state/result/choice') == 'accept'
    print('Atomic close, hidden result, tie resolution, explicit publication: passed', flush=True)

    # Service-level race: a concurrent vote is either rejected or included in the frozen tally.
    race = host.evaluate('''async () => window.testSession.openPoll({
      duration: 20000, question: 'Race', options: {accept:'А',decline:'Б'}
    })''')
    a.wait_for_function("document.querySelector('#participant-title').textContent === 'Race'")
    a.evaluate("id => { window.raceWrite = window.testSession.answer(id, 'decline').then(() => true, () => false); }", race)
    host.evaluate('(id) => window.testSession.closePoll(id)', race)
    accepted = a.evaluate('window.raceWrite')
    saved = admin(f'rooms/{room}/polls/{race}')
    assert saved['result']['total'] == len(saved.get('votes', {})) == int(accepted), saved
    denied(a, f'rooms/{room}/polls/{race}/votes/participant-a', {'choice': 'accept', 'at': {'.sv': 'timestamp'}})

    # Deadline remains enforced by the server even with no active host timer.
    timed = host.evaluate('''() => window.testSession.openPoll({
      duration: 100, question: 'Deadline', options: {accept:'А',decline:'Б'}
    })''')
    a.wait_for_timeout(250)
    denied(a, f'rooms/{room}/polls/{timed}/votes/participant-a', {'choice': 'accept', 'at': {'.sv': 'timestamp'}})
    host.evaluate('(id) => window.testSession.cancelPoll(id)', timed)
    a.wait_for_function("document.querySelector('#participant-title').textContent === 'Вы в игре'")
    advance_to(host, '#quest-doors')
    expect(a.locator('#participant-progress')).to_have_text('0/5')
    assert 'МедиаЛаб' in a.locator('#participant-station').inner_text()
    advance_to(host, '#station-task')
    for phone in [a, b]:
        expect(phone.locator('.video-editor legend')).to_contain_text('1 / 2')
        assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth')
    denied(a, f'rooms/{room}/quest/keys', 99)
    host.locator('#pause').click()
    a.get_by_text('Ведущий поставил игру на паузу.').wait_for()
    assert a.locator('.video-frames button').first.is_disabled()
    seconds = admin(f'rooms/{room}/quest/activity/remaining')
    assert 0 < seconds <= 90000
    host.locator('#resume').click()
    a.wait_for_function("!document.querySelector('.video-editor').disabled")
    for frame in ['Никита дома', 'Вход в центр', 'Монтаж', 'Готовый ролик']:
        a.get_by_role('button', name=frame, exact=True).click()
    a.get_by_role('radio', name='«Я тебя могну» — видеоурок').check()
    a.get_by_role('button', name='Проверить').click()
    a.get_by_text('Кадры подходят. Попробуйте другой заголовок.').wait_for()
    a.get_by_role('radio', name='Когда надоело скучать дома').check()
    a.get_by_role('button', name='Проверить').click()
    expect(a.locator('.video-editor legend')).to_contain_text('2 / 2')
    assert '1. Никита дома' in a.locator('.video-timeline').inner_text()
    assert '1 / 2' in b.locator('.video-editor legend').inner_text()
    a.reload()
    expect(a.locator('.video-editor legend')).to_contain_text('2 / 2')
    a.get_by_role('button', name='Убрать · Никита дома').click()
    a.get_by_role('button', name='Съёмка', exact=True).click()
    a.get_by_role('button', name='Сдвинуть влево · Съёмка').click()
    # Drag from third to second position. The keyboard/button controls provide an equivalent path.
    a.get_by_text('3. Съёмка', exact=True).drag_to(a.get_by_text('2. Монтаж', exact=True))
    assert '2. Съёмка' in a.locator('.video-timeline').inner_text()
    a.get_by_role('radio', name='Как снять свой первый ролик в Ямолод').check()
    a.get_by_role('button', name='Проверить').click()
    a.get_by_role('heading', name='Монтаж готов').wait_for()
    host.evaluate('window.testSession.offset += 95000')
    b.get_by_text('Время вышло. Смотрите продолжение на общем экране.').wait_for()
    assert not b.locator('.video-editor').is_visible()
    host.locator('#station-task-next').click()
    advance_to(host, '#ending')
    assert a.locator('#participant-progress').inner_text() == '1/5'
    assert b.locator('#participant-progress').inner_text() == '1/5'
    print('Shared task clock, individual stages, draft restore, drag, timeout and team key: passed', flush=True)
    host.locator('#replay').click()
    host.locator('#start-screen #room-qr svg').wait_for()
    new_room = host.evaluate('window.testSession.room')
    assert new_room != room and admin(f'rooms/{new_room}/meta/status') == 'lobby'
    assert host.locator('#room-link').get_attribute('href').endswith(f'?room={new_room}')
    a.wait_for_function("document.querySelector('#participant-title').textContent === 'Игра завершена'")
    b.reload()
    b.locator('#join-retry').wait_for()
    assert 'завершена' in b.locator('#participant-status').inner_text()
    print('Concurrent close, server deadline, cancellation and closed-room rejection: passed', flush=True)

    host.locator('#host-logout').click()
    host.locator('#host-login').wait_for()
    assert admin(f'rooms/{new_room}/meta/status') == 'closed'
    assert not host.locator('#start-screen').is_visible()

    a.goto(BASE + '/join.html')
    a.locator('#join-retry').wait_for()
    assert 'QR' in a.locator('#participant-status').inner_text()
    assert not errors, errors
    browser.close()
    print('No JavaScript errors. No production Firebase requests were made.', flush=True)
