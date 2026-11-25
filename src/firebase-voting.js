import {aborted, checkAbort} from './engine.js';
import {tally} from './poll.js';

export class FirebaseVoting extends EventTarget {
  constructor(session, report) {
    super(); this.session = session; this.report = report;
    this.network = true; this.status = 'idle'; this.remaining = 0; this.duration = 0;
    this.choice = null; this.counts = tally(); this.generation = 0;
  }
  emit() { this.dispatchEvent(new Event('change')); }
  async start(command, clock, signal) {
    this.cancel(); checkAbort(signal);
    const generation = this.generation;
    this.status = 'connecting'; this.duration = command.duration; this.remaining = command.duration; this.emit();
    const room = this.session.room;
    const id = await this.session.openPoll(command);
    if (signal.aborted || generation !== this.generation) {
      void this.session.cancelPoll(id, room).catch(this.report); throw aborted();
    }
    this.id = id;
    return new Promise((resolve, reject) => {
      this.reject = reject; this.resolve = resolve;
      this.abort = () => this.cancel(); this.signal = signal;
      signal.addEventListener('abort', this.abort, {once: true});
      this.off = this.session.watch(this.session.path(`polls/${id}`), poll => {
        if (!poll || generation !== this.generation) return;
        this.state = poll.state; this.counts = poll.result || tally(poll.votes);
        this.choice = poll.result?.choice || null;
        this.status = poll.state.status === 'closed' ? (this.choice ? 'ready' : 'awaiting-choice')
          : poll.state.status === 'published' ? 'ready' : poll.state.status === 'cancelled' ? 'idle' : 'active';
        if (poll.state.status === 'cancelled') { this.cancel(); return; }
        this.tick();
        if (this.status === 'ready') { this.resolve?.(this.choice); this.resolve = null; }
      }, error => { reject(error); this.cancel(); });
      this.timer = setInterval(() => this.tick(), 200);
      if (clock.paused) void this.setPaused(true).catch(this.report);
    });
  }
  tick() {
    if (this.state) this.remaining = this.state.status === 'open' ? Math.max(0, this.state.deadline - this.session.now())
      : this.state.status === 'paused' ? this.state.remaining : 0;
    this.emit();
    if (this.state?.status === 'open' && this.remaining === 0 && this.session.connected) void this.finish().catch(this.report);
  }
  async finish() {
    if (!this.id || this.busy || !['open', 'paused'].includes(this.state?.status)) return;
    this.busy = true;
    try { await this.session.closePoll(this.id); } finally { this.busy = false; }
  }
  async choose(choice) { if (this.status === 'awaiting-choice') await this.session.chooseTie(this.id, choice); }
  async setPaused(value) { if (this.id) await this.session.setPaused(this.id, value); }
  async publish() { if (this.id) await this.session.publish(this.id); }
  cancel() {
    this.generation++;
    if (this.id && this.state?.status !== 'published') void this.session.cancelPoll(this.id).catch(this.report);
    clearInterval(this.timer); this.off?.(); this.off = null;
    this.signal?.removeEventListener('abort', this.abort);
    this.reject?.(aborted()); this.reject = null; this.resolve = null;
    this.id = null; this.state = null; this.status = 'idle'; this.choice = null; this.emit();
  }
}
