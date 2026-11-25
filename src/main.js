import {GameClock,LocalVoting,SceneRunner,validateScenes} from './engine.js';
import {resources} from './resources.js';
import {scenes} from './scenes.js';
import {World} from './world.js';
import {AudioManager} from './audio.js';
import {GameUI,$} from './ui.js';
import {setupHostSession} from './host-session.js';
import {activityTime,mountViralVideo} from './viral-video.js';

const clock=new GameClock(),world=new World($('world'),clock),audio=new AudioManager(),ui=new GameUI(clock);
let voting=new LocalVoting();
let started=false,frameTime=null,resetting=false;
let pauseQueue=Promise.resolve();
let activeActivity=null;
const voteChanged=()=>ui.voteChanged(voting);
voting.addEventListener('change',voteChanged);
function changeVoting(next){
  voting.removeEventListener('change',voteChanged);voting.cancel();
  voting=next||new LocalVoting();voting.addEventListener('change',voteChanged);voteChanged();
}

function renderActivity(){
  if(!activeActivity)return;
  const {state,session,editor}=activeActivity;
  const remaining=state.status==='paused'?state.remaining:state.deadline-(session?session.now():clock.time);
  $('station-task-timer').textContent=activityTime(remaining);
  editor?.setEditable(!clock.paused&&remaining>0);
  return remaining;
}

async function runActivity(command,signal){
  const session=online.roomSession;
  const {title,description}=resources.activities[command.id];
  const state={id:command.id,status:'open',remaining:command.duration,deadline:(session?session.now():clock.time)+command.duration};
  $('station-task-title').textContent=title;
  $('station-task-description').textContent=description;
  $('station-task-next').hidden=true;
  $('station-task').hidden=false;
  const rehearsal=$('rehearsal-task');
  rehearsal.hidden=!!session;
  const activity={state,session,editor:session?null:mountViralVideo(rehearsal),finished:false};
  activeActivity=activity;
  try{
    if(session){
      // Pause requests queue behind publication so a fast pause cannot miss the new activity.
      const publication=session.writeActivity(state);
      activity.publication=publication;
      await publication;
      if(clock.paused)await pauseQueue;
    }
    while(renderActivity()>0||clock.paused)await clock.wait(100,signal);
    activity.finished=true;
    if(session)await session.writeActivity({id:command.id,status:'finished'});
    rehearsal.hidden=true;
    $('station-task-description').textContent='Время вышло. Продолжим историю?';
    $('station-task-next').hidden=false;
    await ui.waitForAdvance(signal);
    if(session)await session.writeActivity(null);
  }finally{
    activeActivity=null;
    $('station-task').hidden=true;
    rehearsal.replaceChildren();
  }
}

const runtime={
  sceneChanged(scene){ui.sceneChanged(scene);},
  error(error){audio.reset();setPaused(false);$('pause').hidden=true;ui.error(error);},
  async execute(c,signal,state){
    switch(c.type){
      case 'location':world.setLocation(c.id,c.actors);ui.location(c.id);break;
      case 'dialogue':await ui.dialogue(state.total===3&&c.shortText?{...c,text:c.shortText}:c,signal);break;
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
      case 'doors':ui.doors(c.highlight,state);break;
      case 'participantWait':await online.roomSession?.clearPoll();break;
      case 'station':await online.roomSession?.publishProgress(state);break;
      case 'activity':await runActivity(c,signal);break;
      case 'key':
        await online.roomSession?.publishProgress(state);
        ui.progress(state);audio.effect('key');await ui.keyAward(signal);break;
      case 'vote':{
        $('vote').hidden=false;world.frozen=true;audio.duck(true);audio.effect('decision');
        try{
          const result=await voting.start(c,clock,signal);
          await ui.waitForAdvance(signal);
          if(voting.publish)await voting.publish();
          return result;
        }finally{$('vote').hidden=true;world.frozen=false;audio.duck(false);voting.cancel();}
      }
      case 'end':$('pause').hidden=true;ui.end(state.nextStation);await online.close();online.refresh();break;
      default:throw new Error(`Неизвестная команда: ${c.type}`);
    }
  },
};
const runner=new SceneRunner(scenes,runtime);
const online=setupHostSession({isStarted:()=>started||resetting,changeVoting,pauseGame:()=>setPaused(true)});

function applyPause(value){clock.paused=value;audio.setPaused(value);$('pause-overlay').hidden=!value;$('pause').textContent=value?'Продолжить':'Пауза';ui.voteChanged(voting);if(!activeActivity?.finished)renderActivity();}
function setPaused(value){
  if(!voting.setPaused){applyPause(value);return;}
  if(value)applyPause(true);
  const adapter=voting;
  const activity=activeActivity;
  pauseQueue=pauseQueue.then(async()=>{
    if(adapter!==voting)return;
    if(activity?.session&&!activity.finished){
      await activity.publication;
      if(activeActivity!==activity)return;
      activity.state=await activity.session.pauseActivity(activity.state.id,value);
    }
    await adapter.setPaused(value);if(adapter===voting)applyPause(value);
  }).catch(error=>{applyPause(true);online.report(error);});
}
async function reset(){
  if(resetting)return;
  if(!started){ui.reset();online.refresh();$('start').focus();return;}
  resetting=true;
  runner.stop();voting.cancel();audio.reset();applyPause(false);world.frozen=false;
  try{
    await online.close();changeVoting(null);started=false;
    world.setLocation('city');ui.reset();updateMode();
    $('pause').hidden=true;
    await online.prepare();
  }catch(error){online.report(error);ui.error(error);}
  finally{resetting=false;online.refresh();if(online.canStart())$('start').focus();}
}
function start(){
  if(resetting||!online.canStart())return;
  try{validateScenes(scenes,resources);}catch(error){ui.error(error);return;}
  started=true;$('pause').hidden=false;
  online.refresh();
  $('stage').tabIndex=-1;$('stage').focus({preventScroll:true});
  const total=updateMode();
  void audio.unlock();void runner.start('scene00',total);
}
function updateMode(){
  const total=Number($('quest-mode').value);
  ui.progress({keys:0,total});
  $('poster-quest').innerHTML=total===3?'ТРИ КЛЮЧА.<br>ЧЕТВЁРТАЯ ДВЕРЬ.':'ПЯТЬ КЛЮЧЕЙ.<br>ШЕСТАЯ ДВЕРЬ.';
  return total;
}
$('quest-mode').addEventListener('change',updateMode);
$('station-task-next').addEventListener('click',()=>ui.next());
$('start').addEventListener('click',start);
$('next-dialogue').addEventListener('click',()=>ui.next());$('next-chat').addEventListener('click',()=>ui.next());
$('pause').addEventListener('click',()=>{if(started)setPaused(!clock.paused);});$('resume').addEventListener('click',()=>setPaused(false));
$('replay').addEventListener('click',reset);$('error-reload').addEventListener('click',reset);
$('vote-next').addEventListener('click',()=>ui.next());
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
  if(event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;
  if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)||event.target.isContentEditable)return;
  if(event.code==='Space'&&!event.target.closest('button,a')){
    event.preventDefault();if(!started)start();else ui.next();
  }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&started&&runner.running)setPaused(true);});
function frame(now){
  const delta=frameTime===null?0:Math.min(100,now-frameTime);frameTime=now;
  clock.tick(delta);if(!clock.paused)audio.tick(delta);world.render(delta);requestAnimationFrame(frame);
}
world.setLocation('city');requestAnimationFrame(frame);
