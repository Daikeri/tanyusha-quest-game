import {GameClock,LocalVoting,SceneRunner,validateScenes} from '../src/engine.js';
import {scenes} from '../src/scenes.js';
import {resources} from '../src/resources.js';

const assert=(value,message='Условие не выполнено')=>{if(!value)throw new Error(message);};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const expectAbort=async promise=>{try{await promise;throw new Error('Ожидалась отмена');}catch(e){assert(e.name==='AbortError',e.message);}};
const tests=[];
const test=(name,fn)=>tests.push({name,fn});

test('Ссылки и команды всех сцен корректны',()=>validateScenes(scenes,resources));
test('Валидатор отклоняет неизвестные команды, ресурсы и параллельный диалог',()=>{
  for(const command of [{type:'unknown'},{type:'goto',target:'missing'},{type:'sound',id:'missing'},{type:'parallel',commands:[{type:'dialogue',actor:'nikita',text:'Нет'}]}]){
    let failed=false;try{validateScenes({x:{id:'x',commands:[command]}},resources);}catch{failed=true;}assert(failed);
  }
});
test('Пауза сохраняет точный остаток ожидания',async()=>{
  const clock=new GameClock();let done=false;
  const promise=clock.wait(1000).then(()=>done=true);clock.tick(400);clock.paused=true;clock.tick(5000);await flush();assert(!done);assert(clock.time===400);
  clock.paused=false;clock.tick(599);await flush();assert(!done);clock.tick(1);await promise;assert(done);
});
test('Отмена ожидания удаляет анимацию и запрещает дальнейшие обновления',async()=>{
  const clock=new GameClock(),controller=new AbortController();let updates=0;
  const promise=clock.wait(1000,controller.signal,()=>updates++);controller.abort();await expectAbort(promise);const before=updates;clock.tick(5000);assert(updates===before);assert(clock.jobs.size===0);
});
test('Голосование завершается ровно через 30 секунд и учитывает заданную ветку',async()=>{
  const clock=new GameClock(),vote=new LocalVoting(),controller=new AbortController();let resolved=false;
  const promise=vote.start({id:'x',duration:30000},clock,controller.signal).then(value=>{resolved=true;return value;});
  vote.choose('decline');clock.tick(29999);await flush();assert(!resolved);clock.tick(1);assert(await promise==='decline');assert(vote.status==='ready');assert(clock.jobs.size===0);
});
test('Без заданной ветки истечение таймера оставляет ожидание',async()=>{
  const clock=new GameClock(),vote=new LocalVoting();let resolved=false;
  const promise=vote.start({id:'x',duration:30000},clock,new AbortController().signal).then(value=>{resolved=true;return value;});
  clock.tick(30000);await flush();assert(!resolved);assert(vote.status==='awaiting-choice');vote.choose('accept');assert(await promise==='accept');
});
test('Досрочное завершение фиксирует результат один раз',async()=>{
  const clock=new GameClock(),vote=new LocalVoting();const promise=vote.start({id:'x',duration:30000},clock,new AbortController().signal);
  vote.choose('accept');vote.choose('decline');vote.finish();vote.choose('accept');vote.finish();assert(await promise==='decline');assert(clock.jobs.size===0);
});
test('Пауза останавливает голосование, отмена очищает таймер',async()=>{
  const clock=new GameClock(),vote=new LocalVoting(),controller=new AbortController();
  const promise=vote.start({id:'x',duration:30000},clock,controller.signal);clock.tick(7000);clock.paused=true;clock.tick(30000);assert(vote.remaining===23000);controller.abort();await expectAbort(promise);assert(vote.status==='idle');assert(clock.jobs.size===0);
});
test('Отменённое голосование не меняет новое',async()=>{
  const clock=new GameClock(),vote=new LocalVoting(),controller=new AbortController();
  const old=vote.start({id:'old',duration:30000},clock,controller.signal);controller.abort();await expectAbort(old);
  const fresh=vote.start({id:'new',duration:30000},clock,new AbortController().signal);await flush();assert(vote.status==='active');vote.choose('accept');vote.finish();assert(await fresh==='accept');
});
test('Параллельная группа ждёт все действия перед следующим шагом',async()=>{
  const clock=new GameClock(),events=[];
  const runner=new SceneRunner({x:{id:'x',commands:[{type:'parallel',commands:[{type:'wait',duration:100},{type:'wait',duration:300}]},{type:'end'}]}},{sceneChanged(){},error(e){throw e;},async execute(c,s){if(c.type==='wait')await clock.wait(c.duration,s);events.push(c.type);}});
  const done=runner.start('x');clock.tick(100);await flush();assert(events.join()==='wait');clock.tick(200);await done;assert(events.join()==='wait,wait,end');
});
test('Перезапуск не допускает события прежней сцены',async()=>{
  const clock=new GameClock(),events=[];
  const runner=new SceneRunner({old:{id:'old',commands:[{type:'wait',duration:1000},{type:'sound',id:'old'}]},fresh:{id:'fresh',commands:[{type:'sound',id:'fresh'}]}},{sceneChanged(){},error(e){throw e;},async execute(c,s){if(c.type==='wait')await clock.wait(c.duration,s);else events.push(c.id);}});
  const old=runner.start('old');clock.tick(100);await runner.start('fresh');clock.tick(2000);await old;assert(events.join()==='fresh');assert(clock.jobs.size===0);
});
for(const [choice,total,next] of [['accept',5,'scene07'],['decline',3,'scene09']])test(`Маршрут ${choice} сходится в scene04 и выдаёт первый ключ перед ${next}`,async()=>{
  const visited=[],commands=[],errors=[];
  const runner=new SceneRunner(scenes,{sceneChanged(scene){visited.push(scene.id);},error(e){errors.push(e);},async execute(c){commands.push(c);if(c.type==='vote')return choice;}});
  await runner.start('scene00',total);assert(!errors.length);assert(visited.join()===`scene00,scene01,scene02,scene03${choice==='accept'?'a':'b'},scene04,scene05,scene06,${next}`);
  const selected=choice==='accept'?'Ладно, пошли.':'Не, Сонь, давай без меня.';
  assert(commands.filter(c=>c.type==='dialogue'&&c.text.startsWith(selected)).length===1);
  assert(commands.find(c=>c.type==='activity').duration===90000);
  assert(runner.state.keys===1&&runner.state.total===total);
  assert(runner.state.flags.invitation===choice);assert(commands.at(-1).type==='end');
  if(choice==='decline')assert(commands.find(c=>c.type==='chat').messages.length===6);
});

let failures=0;
for(const {name,fn} of tests){const line=document.createElement('div');try{await fn();line.className='pass';line.textContent=`✓ ${name}`;}catch(error){failures++;line.className='fail';line.textContent=`✗ ${name}: ${error.message}`;console.error(error);}document.getElementById('results').append(line);}
document.documentElement.dataset.testStatus=failures?'failed':'passed';
document.documentElement.dataset.testCount=String(tests.length);
