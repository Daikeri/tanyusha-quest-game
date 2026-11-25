// Pure protocol operations, shared by the network adapter and its tests.
export function tally(votes = {}) {
  const counts = {accept: 0, decline: 0};
  for (const vote of Object.values(votes)) {
    if (Object.hasOwn(counts, vote.choice)) counts[vote.choice]++;
  }
  return {...counts, total: counts.accept + counts.decline,
    choice: counts.accept === counts.decline ? '' : counts.accept > counts.decline ? 'accept' : 'decline'};
}

export function closePoll(poll) {
  // An empty local cache still needs a server round trip to detect a conflict.
  if (poll === null) return null;
  if (!poll?.state || !['open', 'paused'].includes(poll.state.status)) return;
  return {...poll, state: {...poll.state, status: 'closed', remaining: 0}, result: tally(poll.votes)};
}

export function pausePoll(state, paused, now) {
  if (state === null) return null;
  if (paused && state.status === 'open') {
    return {...state, status: 'paused', remaining: Math.max(0, state.deadline - now)};
  }
  if (!paused && state.status === 'paused') {
    return {...state, status: 'open', deadline: now + state.remaining};
  }
}

export const PUBLIC_GAME_URL = 'https://daikeri.github.io/tanyusha-quest-game/';

export function joinURL(room, base = location.href) {
  const host = new URL(base);
  const isLoopback = host.hostname === 'localhost' || host.hostname === '[::1]' || /^127\./.test(host.hostname);
  const url = new URL('join.html', isLoopback ? PUBLIC_GAME_URL : host);
  url.searchParams.set('room', room);
  return url.href;
}

export function validRoom(room) { return /^[A-Za-z0-9_-]{20,64}$/.test(room || ''); }
