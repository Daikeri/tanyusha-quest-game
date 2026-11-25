import {sounds,music} from './resources.js';

/** Quiet procedural audio. No network assets and no audio permission before Start. */
export class AudioManager {
  constructor(){this.context=null;this.muted=false;this.paused=false;this.ducked=false;this.track='silence';this.notes=new Set();this.beat=0;this.elapsed=0;}
  async unlock(){
    try{
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)return false;
      if(!this.context){this.context=new Audio();this.gain=this.context.createGain();this.gain.connect(this.context.destination);this.updateGain();}
      await this.context.resume();return true;
    }catch{return false;}
  }
  updateGain(){if(this.context)this.gain.gain.setTargetAtTime(this.muted||this.paused ? 0 : this.ducked ? .025 : .09,this.context.currentTime,.08);}
  setMuted(value){this.muted=value;this.updateGain();}
  setPaused(value){this.paused=value;this.updateGain();}
  duck(value){this.ducked=value;this.updateGain();}
  tone(frequency,duration=.25,offset=0,type='triangle'){
    if(!this.context||this.context.state!=='running')return;
    const c=this.context,osc=c.createOscillator(),env=c.createGain(),start=c.currentTime+offset;
    osc.type=type;osc.frequency.value=frequency;env.gain.setValueAtTime(0,start);env.gain.linearRampToValueAtTime(.4,start+.012);env.gain.exponentialRampToValueAtTime(.001,start+duration);
    osc.connect(env);env.connect(this.gain);osc.start(start);osc.stop(start+duration+.02);this.notes.add(osc);
    osc.onended=()=>{this.notes.delete(osc);osc.disconnect();env.disconnect();};
  }
  effect(id){(sounds[id]||[]).forEach((note,i)=>this.tone(note,.25,i*.11,'sine'));}
  play(id){this.track=id;this.beat=0;this.elapsed=0;this.stopNotes();}
  tick(delta){if(this.paused)return;const notes=music[this.track]||[];if(!notes.length)return;this.elapsed+=delta;if(this.elapsed>=520){this.elapsed%=520;const note=notes[this.beat++%notes.length];this.tone(note,.45);if(this.beat%4===1)this.tone(note/2,1.7,0,'sine');}}
  stopNotes(){for(const note of this.notes){try{note.stop();}catch{ /* Already ended. */ }}this.notes.clear();}
  reset(){this.stopNotes();this.track='silence';this.ducked=false;this.paused=false;this.updateGain();}
}
