/** @typedef {'accept'|'decline'} Choice */
/** @typedef {{sceneId:string, step:number, flags:Record<string,string>, keys:number}} GameState */
/**
 * @typedef {{type:'dialogue', actor:string, text:string, thought?:boolean}
 * | {type:'move', actor:string, path:number[][], duration:number}
 * | {type:'pose', actor:string, pose:string}
 * | {type:'location', id:string, actors:Record<string,{x:number,y:number,pose?:string,direction?:number}>}
 * | {type:'camera', x:number, y:number, zoom:number, duration:number}
 * | {type:'fade', to:number, duration:number}
 * | {type:'wait', duration:number}
 * | {type:'sound', id:string}
 * | {type:'music', id:string}
 * | {type:'title', kicker:string, text:string, duration:number}
 * | {type:'poster', visible:boolean}
 * | {type:'chat', messages:{from:string,text:string,attachment?:string}[]}
 * | {type:'vote', id:string, duration:number, question?:string, options?:Record<Choice,string>}
 * | {type:'branch', flag:string, targets:Record<string,string>}
 * | {type:'goto', target:string}
 * | {type:'parallel', commands:Command[]}
 * | {type:'end'}} Command
 */
/** @typedef {{id:string, chapter:string, title:string, commands:Command[]}} Scene */

export const aborted = () => new DOMException('Выполнение отменено', 'AbortError');
export function checkAbort(signal) { if (signal?.aborted) throw aborted(); }

/** One pausable clock for animation, text and voting. tick() also makes it testable. */
export class GameClock {
  constructor() { this.time = 0; this.paused = false; this.jobs = new Set(); }
  tick(delta) {
    if (this.paused) return;
    this.time += delta;
    for (const job of [...this.jobs]) job(this.time);
  }
  wait(duration, signal, update = () => {}) {
    checkAbort(signal);
    if (duration <= 0) { update(1); return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const start = this.time;
      const cleanup = () => { this.jobs.delete(tick); signal?.removeEventListener('abort', cancel); };
      const cancel = () => { cleanup(); reject(aborted()); };
      const tick = now => {
        const progress = Math.min(1, (now - start) / duration);
        try { update(progress); } catch (error) { cleanup(); reject(error); return; }
        if (progress === 1) { cleanup(); resolve(); }
      };
      signal?.addEventListener('abort', cancel, { once: true });
      this.jobs.add(tick);
      tick(start);
    });
  }
}

/** A replaceable voting adapter. No votes or participants are fabricated. */
export class LocalVoting extends EventTarget {
  constructor() { super(); this.status = 'idle'; this.choice = null; this.remaining = 0; this.duration = 0; }
  emit() { this.dispatchEvent(new Event('change')); }
  start({ id, duration }, clock, signal) {
    checkAbort(signal);
    this.cancel();
    this.id = id; this.duration = duration; this.remaining = duration;
    this.choice = null; this.status = 'active';
    this.timer = new AbortController();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        signal?.removeEventListener('abort', cancel);
        this.resolveResult = null; this.rejectResult = null;
        this.timer?.abort();
      };
      const cancel = () => { cleanup(); this.status = 'idle'; this.emit(); reject(aborted()); };
      this.rejectResult = cancel;
      this.resolveResult = () => { const result = this.choice; cleanup(); this.status = 'ready'; this.emit(); resolve(result); };
      signal?.addEventListener('abort', cancel, { once: true });
      this.emit();
      clock.wait(duration, this.timer.signal, progress => {
        this.remaining = Math.max(0, duration * (1 - progress)); this.emit();
      }).then(() => this.finish()).catch(error => { if (error.name !== 'AbortError') { cleanup(); reject(error); } });
    });
  }
  choose(choice) {
    if (!['accept', 'decline'].includes(choice)) throw new Error('Неизвестная ветка выбора');
    if (!['active', 'awaiting-choice'].includes(this.status)) return;
    this.choice = choice;
    if (this.status === 'awaiting-choice') this.resolveResult?.();
    else this.emit();
  }
  finish() {
    if (this.status !== 'active') return;
    this.timer?.abort(); this.remaining = 0;
    this.status = 'awaiting-choice';
    if (this.choice) this.resolveResult?.(); else this.emit();
  }
  cancel() {
    if (this.rejectResult) this.rejectResult();
    this.timer?.abort(); this.status = 'idle'; this.choice = null; this.emit();
  }
}

const TYPES = new Set(['dialogue','move','pose','location','camera','fade','wait','sound','music','title','poster','chat','vote','branch','goto','parallel','end']);
const BLOCKING = new Set(['dialogue','title','chat','vote','branch','goto','location','end']);
/** Validate references before starting, instead of breaking halfway through an event. */
export function validateScenes(scenes, resources) {
  const problems = [];
  const exists = (collection, id, label) => { if (!Object.hasOwn(collection, id)) problems.push(`${label}: ${id}`); };
  function visit(command, inParallel = false) {
    if (!TYPES.has(command.type)) { problems.push(`Неизвестная команда: ${command.type}`); return; }
    if (inParallel && BLOCKING.has(command.type)) problems.push(`Команда ${command.type} недопустима внутри parallel`);
    if ('duration' in command && (!Number.isFinite(command.duration) || command.duration < 0)) problems.push(`Некорректная длительность: ${command.type}`);
    if (command.actor) exists(resources.characters, command.actor, 'Персонаж не найден');
    if (command.type === 'location') {
      exists(resources.locations, command.id, 'Локация не найдена');
      for (const id of Object.keys(command.actors)) exists(resources.characters, id, 'Персонаж не найден');
    }
    if (command.type === 'pose' && !resources.poses.includes(command.pose)) problems.push(`Неизвестная поза: ${command.pose}`);
    if (command.type === 'sound') exists(resources.sounds, command.id, 'Звук не найден');
    if (command.type === 'music') exists(resources.music, command.id, 'Музыка не найдена');
    if (command.type === 'goto') exists(scenes, command.target, 'Сцена не найдена');
    if (command.type === 'branch') for (const target of Object.values(command.targets)) exists(scenes, target, 'Ветка не найдена');
    if (command.type === 'move' && (!command.path.length || command.path.some(p => p.length !== 2 || p.some(n => !Number.isFinite(n))))) problems.push('Некорректный маршрут');
    if (command.type === 'chat') for (const message of command.messages) {
      exists(resources.characters, message.from, 'Автор сообщения не найден');
      if (message.attachment) exists(resources.attachments, message.attachment, 'Вложение не найдено');
    }
    if (command.type === 'parallel') command.commands.forEach(c => visit(c, true));
  }
  for (const [id, scene] of Object.entries(scenes)) {
    if (scene.id !== id) problems.push(`ID сцены не совпадает с ключом: ${id}`);
    scene.commands.forEach(c => visit(c));
  }
  if (problems.length) throw new Error(problems.join('\n'));
}

/** Executes content through a small runtime interface; it has no DOM dependency. */
export class SceneRunner {
  constructor(scenes, runtime) {
    this.scenes = scenes; this.runtime = runtime; this.controller = null;
    this.state = { sceneId: '', step: 0, flags: {}, keys: 0 };
    this.running = false;
  }
  stop() { this.controller?.abort(); this.controller = null; this.running = false; }
  async start(id) {
    this.stop();
    const controller = new AbortController(); this.controller = controller;
    const signal = controller.signal;
    this.state = { sceneId: id, step: 0, flags: {}, keys: 0 };
    this.running = true;
    try {
      let target = id;
      while (target) {
        checkAbort(signal);
        const scene = this.scenes[target];
        if (!scene) throw new Error(`Сцена не найдена: ${target}`);
        this.state.sceneId = target;
        this.runtime.sceneChanged(scene, this.state);
        let next = null;
        for (let i = 0; i < scene.commands.length; i++) {
          checkAbort(signal);
          this.state.step = i;
          const command = scene.commands[i];
          if (command.type === 'goto') { next = command.target; break; }
          if (command.type === 'branch') {
            next = command.targets[this.state.flags[command.flag]];
            if (!next) throw new Error(`Нет ветки для ${command.flag}`);
            break;
          }
          await this.execute(command, signal);
        }
        target = next;
      }
    } catch (error) {
      controller.abort();
      if (error.name !== 'AbortError') this.runtime.error(error);
    } finally {
      if (this.controller === controller) { this.running = false; this.controller = null; }
    }
  }
  async execute(command, signal) {
    checkAbort(signal);
    if (command.type === 'parallel') {
      await Promise.all(command.commands.map(c => this.execute(c, signal)));
    } else if (command.type === 'vote') {
      const result = await this.runtime.execute(command, signal);
      checkAbort(signal);
      this.state.flags[command.id] = result;
    } else {
      await this.runtime.execute(command, signal);
    }
  }
}
