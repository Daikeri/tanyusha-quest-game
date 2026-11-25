import {GameClock,LocalVoting,SceneRunner,validateScenes} from './engine.js';
import {resources} from './resources.js';
import {scenes} from './scenes.js';
import {World} from './world.js';
import {AudioManager} from './audio.js';
import {GameUI,$} from './ui.js';

const clock=new GameClock(),voting=new LocalVoting(),world=new World($('world'),clock),audio=new AudioManager(),ui=new GameUI(clock);
let started=false,frameTime=null,confirmWasPaused=false,hostFocus=null;

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
          return result;
        }finally{$('vote').hidden=true;world.frozen=false;audio.duck(false);voting.cancel();}
      }
      case 'end':ui.end();break;
      default:throw new Error(`Неизвестная команда: ${c.type}`);
    }
  },
};
const runner=new SceneRunner(scenes,runtime);

function setPaused(value){clock.paused=value;audio.setPaused(value);$('pause-overlay').hidden=!value;$('pause').textContent=value?'Продолжить':'Пауза';ui.voteChanged(voting);}
function toggleHost(force){
  const open=force??$('host-panel').hidden;
  if(open)hostFocus=document.activeElement;
  $('host-panel').hidden=!open;$('host-toggle').setAttribute('aria-expanded',String(open));
  if(open)$('host-close').focus();else (hostFocus?.isConnected?hostFocus:$('host-toggle')).focus();
}
function reset(){
  runner.stop();voting.cancel();audio.reset();setPaused(false);world.frozen=false;world.setLocation('city');ui.reset();
  started=false;$('start').disabled=false;$('pause').disabled=true;$('host-status').textContent='История готова к запуску';toggleHost(false);$('start').focus();
}
function requestRestart(){
  if(!started){reset();return;}
  confirmWasPaused=clock.paused;setPaused(true);$('restart-confirm').returnValue='cancel';$('restart-confirm').showModal();
}
function start(){
  if(started)return;
  try{validateScenes(scenes,resources);}catch(error){ui.error(error);return;}
  started=true;$('start').disabled=true;$('start-screen').hidden=true;$('pause').disabled=false;
  $('stage').tabIndex=-1;$('stage').focus({preventScroll:true});
  void audio.unlock();void runner.start('scene00');
}
$('start').addEventListener('click',start);
$('next-dialogue').addEventListener('click',()=>ui.next());$('next-chat').addEventListener('click',()=>ui.next());
$('host-toggle').addEventListener('click',()=>toggleHost());$('host-close').addEventListener('click',()=>toggleHost(false));
$('pause').addEventListener('click',()=>{if(started)setPaused(!clock.paused);});$('resume').addEventListener('click',()=>setPaused(false));
$('restart').addEventListener('click',requestRestart);$('replay').addEventListener('click',reset);$('error-reload').addEventListener('click',reset);
$('restart-confirm').addEventListener('close',()=>{if($('restart-confirm').returnValue==='restart')reset();else setPaused(confirmWasPaused);});
$('vote-finish').addEventListener('click',()=>{if(!clock.paused)voting.finish();});
document.querySelectorAll('[data-choice]').forEach(button=>button.addEventListener('click',()=>{if(!clock.paused)voting.choose(button.dataset.choice);}));
voting.addEventListener('change',()=>ui.voteChanged(voting));
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
reset();requestAnimationFrame(frame);
