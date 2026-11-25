import {GameClock,LocalVoting,SceneRunner,validateScenes} from './engine.js';
import {resources} from './resources.js';
import {scenes} from './scenes.js';
import {World} from './world.js';
import {AudioManager} from './audio.js';
import {GameUI,$} from './ui.js';
import {setupHostSession} from './host-session.js';

const clock=new GameClock(),world=new World($('world'),clock),audio=new AudioManager(),ui=new GameUI(clock);
let voting=new LocalVoting();
let started=false,frameTime=null,confirmWasPaused=false,hostFocus=null,resetting=false;
let pauseQueue=Promise.resolve();
const voteChanged=()=>ui.voteChanged(voting);
voting.addEventListener('change',voteChanged);
function changeVoting(next){
  voting.removeEventListener('change',voteChanged);voting.cancel();
  voting=next||new LocalVoting();voting.addEventListener('change',voteChanged);voteChanged();
}

const runtime={
  sceneChanged(scene){ui.sceneChanged(scene);},
  error(error){audio.reset();setPaused(false);ui.error(error);},
  async execute(c,signal){
    switch(c.type){
      case 'location':world.setLocation(c.id,c.actors);ui.location(c.id);break;
      case 'dialogue':await ui.dialogue(c,signal);break;
      case 'move':await world.move(c.actor,c.path,c.duration,signal);break;
      case 'pose':world.setPose(c.actor,c.pose);break;
      case 'camera':await world.pan(c,signal);break;
      case 'fade':await ui.fade(c.to,c.duration,signal);break;
      case 'wait':await clock.wait(c.duration,signal);break;
      case 'sound':audio.effect(c.id);break;
      case 'music':audio.play(c.id);break;
      case 'title':await ui.title(c,signal);break;
      case 'poster':$('poster').hidden=!c.visible;break;
      case 'chat':await ui.chat(c.messages,signal);break;
      case 'vote':{
        $('vote').hidden=false;world.frozen=true;audio.duck(true);audio.effect('decision');
        try{
          const result=await voting.start(c,clock,signal);
          await ui.waitForAdvance(signal);
          if(voting.publish)await voting.publish();
          return result;
        }finally{$('vote').hidden=true;world.frozen=false;audio.duck(false);voting.cancel();}
      }
      case 'end':ui.end();await online.close();online.refresh();break;
      default:throw new Error(`Неизвестная команда: ${c.type}`);
    }
  },
};
const runner=new SceneRunner(scenes,runtime);
const online=setupHostSession({isStarted:()=>started||resetting,changeVoting,pauseGame:()=>setPaused(true)});

function applyPause(value){clock.paused=value;audio.setPaused(value);$('pause-overlay').hidden=!value;$('pause').textContent=value?'Продолжить':'Пауза';ui.voteChanged(voting);}
function setPaused(value){
  if(!voting.setPaused){applyPause(value);return;}
  if(value)applyPause(true);
  const adapter=voting;
  pauseQueue=pauseQueue.then(async()=>{
    if(adapter!==voting)return;
    await adapter.setPaused(value);if(adapter===voting)applyPause(value);
  }).catch(error=>{applyPause(true);online.report(error);});
}
function toggleHost(force){
  if($('game-shell').hidden)return;
  const open=force??$('host-panel').hidden;
  if(open)hostFocus=document.activeElement;
  $('host-panel').hidden=!open;$('host-toggle').setAttribute('aria-expanded',String(open));
  if(open)$('host-close').focus();else (hostFocus?.isConnected?hostFocus:$('host-toggle')).focus();
}
async function reset(){
  if(resetting)return;
  if(!started){ui.reset();online.refresh();$('start').focus();return;}
  resetting=true;
  runner.stop();voting.cancel();audio.reset();applyPause(false);world.frozen=false;
  try{
    await online.close();changeVoting(null);started=false;
    world.setLocation('city');ui.reset();
    $('pause').disabled=true;$('restart').disabled=true;$('host-status').textContent='История готова к запуску';toggleHost(false);
    await online.prepare();
  }catch(error){online.report(error);ui.error(error);}
  finally{resetting=false;online.refresh();if(online.canStart())$('start').focus();}
}
function requestRestart(){
  if(!started)return;
  confirmWasPaused=clock.paused;setPaused(true);$('restart-confirm').returnValue='cancel';$('restart-confirm').showModal();
}
function start(){
  if(resetting||!online.canStart())return;
  try{validateScenes(scenes,resources);}catch(error){ui.error(error);return;}
  started=true;$('pause').disabled=false;$('restart').disabled=false;
  online.refresh();
  $('stage').tabIndex=-1;$('stage').focus({preventScroll:true});
  void audio.unlock();void runner.start('scene00');
}
$('start').addEventListener('click',start);
$('next-dialogue').addEventListener('click',()=>ui.next());$('next-chat').addEventListener('click',()=>ui.next());
$('host-toggle').addEventListener('click',()=>toggleHost());$('host-close').addEventListener('click',()=>toggleHost(false));
$('pause').addEventListener('click',()=>{if(started)setPaused(!clock.paused);});$('resume').addEventListener('click',()=>setPaused(false));
$('restart').addEventListener('click',requestRestart);$('replay').addEventListener('click',reset);$('error-reload').addEventListener('click',reset);
$('restart-confirm').addEventListener('close',()=>{if($('restart-confirm').returnValue==='restart')reset();else setPaused(confirmWasPaused);});
$('vote-finish').addEventListener('click',()=>{if(!clock.paused)Promise.resolve(voting.finish()).catch(online.report);});
document.querySelectorAll('[data-choice]').forEach(button=>button.addEventListener('click',()=>{if(!clock.paused)Promise.resolve(voting.choose(button.dataset.choice)).catch(online.report);}));
$('sound').addEventListener('click',()=>{
  audio.setMuted(!audio.muted);$('sound').textContent=audio.muted?'Звук выкл.':'Звук вкл.';
  $('sound').setAttribute('aria-pressed',String(audio.muted));$('sound').setAttribute('aria-label',audio.muted?'Включить звук':'Отключить звук');
  if(!audio.muted&&started)void audio.unlock();
});
$('fullscreen').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('fullscreen').title='Полноэкранный режим недоступен в этом браузере';}
});
document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Выйти из полного экрана':'Полный экран');});
document.addEventListener('keydown',event=>{
  if($('game-shell').hidden)return;
  if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||$('restart-confirm').open)return;
  if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)||event.target.isContentEditable)return;
  if(event.code==='KeyH'){event.preventDefault();toggleHost();return;}
  if(event.code==='Escape'&&!$('host-panel').hidden){toggleHost(false);return;}
  // Host controls must never advance the story or leak buffered input into a later beat.
  if(!$('host-panel').hidden)return;
  if(event.code==='Space'&&!event.target.closest('button,a')){
    event.preventDefault();if(!started)start();else ui.next();
  }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&started&&runner.running)setPaused(true);});
function frame(now){
  const delta=frameTime===null?0:Math.min(100,now-frameTime);frameTime=now;
  clock.tick(delta);if(!clock.paused)audio.tick(delta);world.render(delta);requestAnimationFrame(frame);
}
world.setLocation('city');$('pause').disabled=true;$('restart').disabled=true;requestAnimationFrame(frame);
