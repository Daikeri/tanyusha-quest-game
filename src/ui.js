import {aborted,checkAbort} from './engine.js';
import {characters,locations} from './resources.js';
import {drawPortrait,drawObjects} from './world.js';

export const $ = id => document.getElementById(id);
export class GameUI {
  constructor(clock){this.clock=clock;this.advanceAction=null;this.lastAdvance=-Infinity;this.fadeValue=0;}
  next(){if(this.clock.paused||performance.now()-this.lastAdvance<120)return;this.lastAdvance=performance.now();this.advanceAction?.();}
  reset(){
    this.advanceAction=null;this.lastAdvance=-Infinity;this.fadeValue=0;
    for(const id of ['dialogue','poster','chat','vote','ending','pause-overlay','error','title-card','location-tag','network-status','quest-doors','key-award','station-task'])$(id).hidden=true;
    $('fade').style.opacity='0';
    $('chapter-index').textContent='00';$('chapter-name').textContent='ДО НАЧАЛА ИСТОРИИ';$('control-hint').textContent='Новая история ближе, чем кажется';
  }
  sceneChanged(scene){$('chapter-index').textContent=scene.chapter;$('chapter-name').textContent=scene.title.toUpperCase();$('control-hint').textContent='ПРОБЕЛ — продолжить';}
  location(id){$('location-tag').hidden=false;$('location-name').textContent=locations[id].name;}
  waitForAdvance(signal){
    checkAbort(signal);
    return new Promise((resolve,reject)=>{
      const cleanup=()=>{if(this.advanceAction===advance)this.advanceAction=null;signal.removeEventListener('abort',cancel);};
      const advance=()=>{cleanup();resolve();};
      const cancel=()=>{cleanup();reject(aborted());};
      signal.addEventListener('abort',cancel,{once:true});this.advanceAction=advance;
    });
  }
  dialogue(command,signal){
    checkAbort(signal);
    const c=characters[command.actor];$('dialogue').hidden=false;$('speaker').textContent=c.name;$('speaker').style.color=c.accent;
    $('thought-label').hidden=!command.thought;$('dialogue-text').textContent='';$('advance-label').textContent='Раскрыть';drawPortrait($('portrait'),command.actor,command.emotion);
    return new Promise((resolve,reject)=>{
      const typing=new AbortController();let complete=false;
      const reveal=()=>{typing.abort();complete=true;$('dialogue-text').textContent=command.text;$('advance-label').textContent='Далее';};
      const cleanup=()=>{typing.abort();signal.removeEventListener('abort',cancel);if(this.advanceAction===advance)this.advanceAction=null;$('dialogue').hidden=true;};
      const advance=()=>{if(!complete){reveal();return;}cleanup();resolve();};
      const cancel=()=>{cleanup();reject(aborted());};
      signal.addEventListener('abort',cancel,{once:true});this.advanceAction=advance;
      const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:command.text.length*22;
      this.clock.wait(duration,typing.signal,p=>{$('dialogue-text').textContent=command.text.slice(0,Math.floor(p*command.text.length));}).then(()=>{complete=true;$('advance-label').textContent='Далее';}).catch(error=>{if(error.name!=='AbortError'){cleanup();reject(error);}});
    });
  }
  async fade(to,duration,signal){const start=this.fadeValue;await this.clock.wait(duration,signal,p=>{this.fadeValue=start+(to-start)*p;$('fade').style.opacity=String(this.fadeValue);});}
  async title(command,signal){$('title-kicker').textContent=command.kicker;$('title-text').textContent=command.text;$('title-card').hidden=false;try{await this.clock.wait(command.duration,signal);}finally{$('title-card').hidden=true;}}
  async chat(messages,signal){
    $('chat').hidden=false;$('chat-messages').replaceChildren();
    try{
      for(const message of messages){
        checkAbort(signal);
        const bubble=document.createElement('div');bubble.className=`bubble${message.from==='nikita'?' self':''}`;
        bubble.textContent=message.text;bubble.setAttribute('aria-label',`${characters[message.from].name}: ${message.text}`);
        if(message.attachment){const canvas=document.createElement('canvas');canvas.width=270;canvas.height=82;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Камера, геймпад и карта');drawObjects(canvas);bubble.append(canvas);}
        $('chat-messages').append(bubble);bubble.scrollIntoView({block:'nearest',behavior:'instant'});
        await this.waitForAdvance(signal);
      }
    }finally{$('chat').hidden=true;}
  }
  voteChanged(voting){
    const active=['active','awaiting-choice'].includes(voting.status);
    $('vote-controls').hidden=!active;
    $('vote-controls').disabled=this.clock.paused;
    $('vote-finish').hidden=voting.status!=='active';
    $('vote-next').hidden=voting.status!=='ready';
    $('vote-next').disabled=this.clock.paused;
    for(const button of $('vote-controls').querySelectorAll('[data-choice]')){
      button.setAttribute('aria-pressed',String(button.dataset.choice===voting.choice));
      button.hidden=!!voting.network&&voting.status!=='awaiting-choice';
    }
    $('vote-seconds').textContent=String(Math.ceil(voting.remaining/1000)).padStart(2,'0');
    $('vote-progress').style.width=`${voting.duration?voting.remaining/voting.duration*100:0}%`;
    const hints={connecting:'Подключаем голосование…',active:voting.network?'Участники голосуют с телефонов.':'Выберите ветку А или Б.', 'awaiting-choice':'Отсчёт завершён. Выберите ветку А или Б.',ready:'Результат готов.',idle:''};
    const hint=$('vote-hint');
    if(hint.textContent!==hints[voting.status])hint.textContent=hints[voting.status];
  }
  progress({keys,total}){
    $('key-count').textContent=keys;
    $('key-total').textContent=`/ ${total}`;
    $('key-count').parentElement.setAttribute('aria-label',`Собрано ${keys} из ${total} ключей`);
  }
  doors(highlight,{total,keys}){
    const panel=$('quest-doors');
    panel.hidden=highlight==='hide';
    if(panel.hidden)return;
    if(highlight==='all'){
      const doors=[];
      for(let index=0;index<=total;index++){
        const slot=document.createElement('div');
        const secret=index===total;
        slot.className=secret?'quest-slot secret':'quest-slot';
        slot.style.setProperty('--door-index',index);
        const door=document.createElement('span');
        door.className='quest-door';
        door.textContent=secret?'?':index+1;
        slot.append(door);
        if(!secret){
          const key=document.createElement('span');
          key.className='quest-socket';
          key.textContent=index<keys?'⚿':'◇';
          slot.append(key);
        }
        doors.push(slot);
      }
      panel.replaceChildren(...doors);
    }
    panel.dataset.highlight=highlight;
  }
  async keyAward(signal){
    $('key-award').hidden=false;
    try{await this.clock.wait(1600,signal);}finally{$('key-award').hidden=true;}
  }
  end(nextStation){
    $('ending-station').textContent=`Следующая станция — «${nextStation}».`;
    $('ending').hidden=false;$('location-tag').hidden=true;$('control-hint').textContent='Станция пройдена';
  }
  error(error){$('error').hidden=false;$('error-message').textContent=error.message;console.error(error);}
}
