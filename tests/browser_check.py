"""Optional browser QA. Requires Python Playwright and installed Microsoft Edge.
Run a static server on port 8000, then: python tests/browser_check.py
Screenshots are saved to ignored .artifacts/. No production dependencies.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8000'
ARTIFACTS = Path(__file__).resolve().parents[1] / '.artifacts'
ARTIFACTS.mkdir(exist_ok=True)

def visible(page, selector):
    return page.locator(selector).is_visible()

def advance_to(page, target, limit=100):
    for _ in range(limit):
        if visible(page, target):
            return
        if visible(page, '#dialogue'):
            page.locator('#next-dialogue').click()
        elif visible(page, '#chat'):
            page.locator('#next-chat').click()
        page.wait_for_timeout(155)
    raise AssertionError(f'Did not reach {target}')

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width':1280,'height':720}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '/tests/')
    page.wait_for_function("document.documentElement.dataset.testStatus")
    assert page.locator('html').get_attribute('data-test-status') == 'passed', page.locator('#results').inner_text()
    count = page.locator('html').get_attribute('data-test-count')
    print(f'Engine checks: {count} passed')
    page.goto(BASE)
    assert visible(page, '#host-login') and not visible(page, '#start-screen')
    page.keyboard.press('h')
    assert not visible(page, '#host-panel')
    page.locator('#rehearse').click()
    page.locator('#start').wait_for()
    assert not visible(page, '#room-info')
    page.wait_for_timeout(200)
    page.screenshot(path=str(ARTIFACTS/'00-start.png'))
    # Speed up only the test's clock; production has no skip/test controls.
    page.evaluate("""async () => {
      const {GameClock} = await import('/src/engine.js');
      const tick = GameClock.prototype.tick;
      window.testClockSpeed = 40;
      GameClock.prototype.tick = function(delta) { tick.call(this, delta * window.testClockSpeed); };
    }""")
    page.locator('#start').click()
    advance_to(page, '#dialogue')
    page.wait_for_timeout(200)
    page.screenshot(path=str(ARTIFACTS/'01-classroom.png'))
    # Pause preserves current dialogue and blocks advancement.
    page.keyboard.press('KeyH')
    page.locator('#pause').click()
    text = page.locator('#dialogue-text').inner_text()
    page.locator('#stage').focus()
    page.keyboard.press('Space')
    page.wait_for_timeout(150)
    assert page.locator('#dialogue-text').inner_text() == text
    page.locator('#pause').click()
    page.keyboard.press('KeyH')
    advance_to(page, '#poster')
    page.screenshot(path=str(ARTIFACTS/'02-invitation.png'))
    # Use normal speed for the vote; check paused timer, early finish, manual reveal.
    page.evaluate('window.testClockSpeed = 1')
    advance_to(page, '#vote')
    page.screenshot(path=str(ARTIFACTS/'02-vote.png'))
    page.keyboard.press('KeyH')
    page.locator('#pause').click()
    remaining = page.locator('#vote-seconds').inner_text()
    page.wait_for_timeout(1100)
    assert page.locator('#vote-seconds').inner_text() == remaining
    page.locator('#pause').click()
    page.locator('[data-choice="accept"]').click()
    page.locator('#vote-finish').click()
    page.wait_for_timeout(180)
    assert visible(page, '#vote') and not visible(page, '#dialogue')
    page.locator('#stage').focus()
    page.keyboard.press('Space')  # Host panel open: no advancement.
    assert visible(page, '#vote')
    page.keyboard.press('KeyH')
    page.locator('#stage').focus()
    page.keyboard.press('Space')
    page.evaluate('window.testClockSpeed = 40')
    advance_to(page, '#ending')
    assert page.locator('#chapter-index').inner_text() == '04'
    page.screenshot(path=str(ARTIFACTS/'03-ending.png'))
    print('Branch A, paused timer, manual vote reveal: passed')
    page.locator('#replay').click()
    page.locator('#start').click()
    advance_to(page, '#vote')
    # Let the timer expire without a selection.
    page.wait_for_timeout(1000)
    assert visible(page, '#vote')
    assert page.locator('#vote-seconds').inner_text() == '00'
    page.keyboard.press('KeyH')
    page.locator('[data-choice="decline"]').click()
    page.keyboard.press('KeyH')
    page.locator('#stage').focus()
    page.keyboard.press('Space')
    advance_to(page, '#chat')
    page.wait_for_timeout(180)
    for _ in range(5):
        page.locator('#next-chat').click()
        page.wait_for_timeout(155)
    assert page.locator('.bubble').count() == 6
    page.screenshot(path=str(ARTIFACTS/'03-chat.png'))
    advance_to(page, '#ending')
    print('Branch B, zero-selection wait, full chat, convergence: passed')
    # Restart a scene in progress and confirm old timers do not advance the title.
    page.locator('#replay').click()
    page.locator('#start').click()
    advance_to(page, '#dialogue')
    page.keyboard.press('KeyH')
    page.locator('#restart').click()
    page.locator('#restart-confirm [value="cancel"]').click()
    assert visible(page, '#dialogue')
    page.locator('#restart').click()
    page.locator('#restart-confirm [value="restart"]').click()
    page.wait_for_timeout(400)
    assert visible(page, '#start-screen') and not visible(page, '#dialogue')
    # Wide-screen and portrait layout stay within the viewport.
    for width,height in [(1920,1080),(390,844)]:
        page.set_viewport_size({'width':width,'height':height})
        page.wait_for_timeout(100)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(ARTIFACTS/f'layout-{width}.png'))
    page.locator('#sound').click()
    assert page.locator('#sound').get_attribute('aria-pressed') == 'true'
    page.locator('#start').click()
    advance_to(page, '#dialogue')
    page.wait_for_timeout(160)
    page.locator('#next-dialogue').click()
    page.wait_for_timeout(200)
    advance_to(page, '#dialogue')
    page.wait_for_timeout(200)
    assert page.locator('#dialogue-text').evaluate('(el) => el.scrollHeight <= el.clientHeight + 1')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(ARTIFACTS/'mobile-dialogue.png'))
    page.set_viewport_size({'width':1280,'height':720})
    page.locator('#fullscreen').click()
    page.wait_for_timeout(150)
    assert page.evaluate('Boolean(document.fullscreenElement)')
    page.locator('#fullscreen').click()
    page.wait_for_timeout(100)
    assert not page.evaluate('Boolean(document.fullscreenElement)')
    assert not errors, json.dumps(errors, ensure_ascii=False)
    print('Restart/cancel, 1280/1920/390 layouts, mobile dialogue, fullscreen, mute, no JS errors: passed')
    browser.close()
