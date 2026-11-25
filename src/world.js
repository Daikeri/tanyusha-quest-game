import { characters, locations } from './resources.js';

const lerp = (a,b,t) => a+(b-a)*t;
const R = (ctx,color,x,y,w,h) => {ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
function label(ctx,text,x,y,size=12,color='#ebe3d7',align='left') { ctx.fillStyle=color;ctx.font=`bold ${size}px monospace`;ctx.textAlign=align;ctx.fillText(text,Math.round(x),Math.round(y));ctx.textAlign='left'; }

/** Pixel sprite: one shared drawing function for actors and portraits. */
export function drawCharacter(ctx,id,x,y,{pose='idle',direction=1,time=0,scale=2,emotion}={}) {
  const c=characters[id];
  if (!c) throw new Error(`Нет спрайта: ${id}`);
  ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(scale,scale);
  const walk=pose==='walk'?Math.sin(time/90):0;
  const seated=['sit','phone','computer'].includes(pose);
  const bodyOffset=seated?3:0;
  R(ctx,'#11182755',-10,-2,20,4);
  // Legs and shoes.
  R(ctx,c.pants,-6,-10+bodyOffset,5,9-bodyOffset+walk*2);
  R(ctx,c.pants,2,-10+bodyOffset,5,9-bodyOffset-walk*2);
  R(ctx,'#e0d7c9',-7,-2+walk*2,6,2);R(ctx,'#e0d7c9',2,-2-walk*2,6,2);
  // Jacket, arms, backpack.
  R(ctx,'#24263f',-8,-20+bodyOffset,16,12);
  R(ctx,c.shirt,-7,-20+bodyOffset,14,12-bodyOffset);
  R(ctx,c.shirt,-10,-19+bodyOffset,3,10-walk*2);R(ctx,c.skin,-10,-10+bodyOffset-walk*2,3,3);
  R(ctx,c.shirt,7,-19+bodyOffset,3,10+walk*2);R(ctx,c.skin,7,-10+bodyOffset+walk*2,3,3);
  R(ctx,'#ffffff25',-6,-19+bodyOffset,3,9);
  R(ctx,'#2d3049',4,-19+bodyOffset,2,11);
  R(ctx,'#e9dfc2',-3,-20+bodyOffset,6,2);
  // Face and hair.
  R(ctx,c.hair,-8,-32+bodyOffset,16,14);R(ctx,c.skin,-6,-28+bodyOffset,13,10);
  R(ctx,'#cb8b74',6,-25+bodyOffset,2,5);R(ctx,c.hair,-8,-32+bodyOffset,16,6);
  R(ctx,c.hair,-8,-27+bodyOffset,3,8);R(ctx,c.hair,-4,-28+bodyOffset,6,3);
  if(['sonya','student2','lera'].includes(id)){R(ctx,c.hair,-9,-28+bodyOffset,3,16);R(ctx,c.hair,7,-26+bodyOffset,3,14);R(ctx,c.accent,-9,-15+bodyOffset,3,3);}
  R(ctx,'#242636',direction<0?-5:0,-24+bodyOffset,2,2);R(ctx,'#242636',direction<0?0:5,-24+bodyOffset,2,2);
  R(ctx,'#b8776f',1,-20+bodyOffset,3,1);
  if(emotion==='happy'){R(ctx,'#894e57',0,-21,5,2);R(ctx,'#f5d6bb',1,-21,3,1);}
  if(emotion==='curious')R(ctx,c.hair,3,-27,4,1);
  if(emotion==='shy'){R(ctx,'#cb8b74',-5,-22,3,2);R(ctx,'#cb8b74',5,-22,2,2);}
  if(pose==='phone'){R(ctx,c.skin,6,-13,4,3);R(ctx,'#282d48',7,-18,5,8);R(ctx,'#9ed7d6',8,-17,3,5);}
  if(pose==='pack'){R(ctx,'#3b4057',7,-17,9,14);R(ctx,'#757395',8,-16,7,9);R(ctx,'#d9bd81',11,-12,2,3);}
  if(pose==='wave'){R(ctx,c.shirt,-13,-23,5,10);R(ctx,c.skin,-14,-27+Math.round(Math.sin(time/140)*2),4,5);}
  if(pose==='tablet'){
    R(ctx,'#292e44',4,-17,12,9);R(ctx,'#9acaca',5,-16,10,7);
    R(ctx,'#635583',9,-15,3,4);R(ctx,'#f4c59d',9,-15,3,2);
  }
  if(pose==='notice'){R(ctx,'#f1c68a',-1,-45,3,7);R(ctx,'#f1c68a',-1,-36,3,3);}
  ctx.restore();
}
export function drawPortrait(canvas,id,emotion) {
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
  ctx.clearRect(0,0,96,96);R(ctx,'#353149',0,0,96,96);R(ctx,'#423b58',8,8,80,80);
  R(ctx,characters[id].accent,8,81,80,7);
  drawCharacter(ctx,id,48,147,{scale:4,emotion});
}
export function drawObjects(canvas) {
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
  for(let i=0;i<3;i++) R(ctx,'#242937',i*90,0,84,82);
  // Camera.
  R(ctx,'#9baab8',12,25,48,37);R(ctx,'#9baab8',20,17,19,10);R(ctx,'#405b6b',23,34,23,22);R(ctx,'#78c7d0',29,39,12,12);R(ctx,'#9baab8',62,32,10,26);R(ctx,'#9baab8',72,27,4,36);
  // Gamepad.
  R(ctx,'#a89ac7',104,30,56,25);R(ctx,'#a89ac7',99,36,10,28);R(ctx,'#a89ac7',156,36,10,28);R(ctx,'#303044',107,39,18,6);R(ctx,'#303044',113,33,6,18);R(ctx,'#e8bc77',145,34,7,7);R(ctx,'#9cc4b5',153,43,7,7);
  // Folded map.
  R(ctx,'#bdcfa3',194,21,22,44);R(ctx,'#9eaf8e',216,25,22,44);R(ctx,'#d1dfb9',238,20,22,44);R(ctx,'#738877',215,22,3,44);R(ctx,'#738877',237,23,3,44);
  [[200,52],[207,44],[216,37],[224,42],[232,49],[243,49]].forEach(([x,y])=>R(ctx,'#d59261',x,y,5,5));
}

export class World {
  constructor(canvas,clock) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.clock=clock;
    this.time=0;this.frozen=false;this.location='city';this.actors={};this.idlePan=true;
    this.camera={...locations.city.camera};this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  setLocation(id,actors={}) {
    if(!locations[id])throw new Error(`Неизвестная локация: ${id}`);
    this.location=id;this.actors=structuredClone(actors);this.camera={...locations[id].camera};this.idlePan=id==='city';
    this.canvas.setAttribute('aria-label',locations[id].name);
  }
  actor(id) { if(!this.actors[id])throw new Error(`Персонаж ${id} отсутствует в ${this.location}`); return this.actors[id]; }
  setPose(id,pose) {this.actor(id).pose=pose;}
  async move(id,path,duration,signal) {
    const actor=this.actor(id);const points=[[actor.x,actor.y],...path];
    const distances=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
    const total=distances.reduce((a,b)=>a+b,0);actor.pose='walk';
    await this.clock.wait(duration,signal,p=>{
      let distance=p*total;let segment=0;
      while(segment<distances.length-1&&distance>distances[segment])distance-=distances[segment++];
      const a=points[segment],b=points[segment+1],t=distances[segment]?distance/distances[segment]:1;
      actor.x=lerp(a[0],b[0],t);actor.y=lerp(a[1],b[1],t);
      if(b[0]!==a[0])actor.direction=Math.sign(b[0]-a[0]);
    });
    actor.pose='idle';
  }
  async pan(command,signal) {
    if(this.idlePan&&!this.reducedMotion)this.camera.x+=Math.sin(this.time/18000)*18;
    this.idlePan=false;
    const start={...this.camera};
    await this.clock.wait(this.reducedMotion?0:command.duration,signal,p=>{
      const t=p*p*(3-2*p);
      for(const key of ['x','y','zoom'])this.camera[key]=lerp(start[key],command[key],t);
    });
  }
  render(delta) {
    if(!this.frozen&&!this.clock.paused)this.time+=delta;
    const ctx=this.ctx;ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,960,540);ctx.save();
    const drift=this.idlePan&&!this.reducedMotion?Math.sin(this.time/18000)*18:0;
    ctx.translate(480,270);ctx.scale(this.camera.zoom,this.camera.zoom);ctx.translate(-this.camera.x-drift,-this.camera.y);
    if(this.location==='city'||this.location==='street')this.drawCity(this.location==='street');
    if(this.location==='classroom')this.drawClassroom();
    if(this.location==='bedroom')this.drawBedroom();
    if(this.location==='hall'||this.location==='media'){
      this.drawCentre(this.location==='media');
      this.drawActors();
    }
    if(this.location==='city'||this.location==='street')this.drawActors();
    ctx.restore();
  }
  drawActors() {
    Object.entries(this.actors).sort((a,b)=>a[1].y-b[1].y).forEach(([id,a])=>drawCharacter(this.ctx,id,a.x,a.y,{...a,time:this.time}));
  }
  building(x,y,w,h,color,rows,cols) {
    const c=this.ctx;R(c,'#11172455',x+12,y+15,w,h);R(c,color,x,y,w,h);R(c,'#ffffff0b',x,y,w,7);R(c,'#00000020',x+w-12,y,12,h);
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const xx=x+18+col*(w-30)/cols,yy=y+22+row*(h-40)/rows;
      R(c,'#293047',xx-3,yy-3,23,32);R(c,(row*7+col*3+Math.round(x))%4===0?'#596c83':(row+col)%3===0?'#b79979':'#d6bb8e',xx,yy,17,24);R(c,'#534d59',xx+8,yy,2,24);R(c,'#534d59',xx,yy+12,17,2);
      R(c,'#22283b',xx-4,yy+26,25,4);
    }
    R(c,'#262b3f',x+5,y+h-8,w-10,8);
  }
  tree(x,y,scale=1) {
    const c=this.ctx;c.save();c.translate(x,y);c.scale(scale,scale);
    R(c,'#111c2b44',-22,2,55,11);R(c,'#665459',-4,-35,8,40);
    R(c,'#304d4b',-24,-60,48,35);R(c,'#365a55',-32,-50,64,25);R(c,'#436b60',-20,-72,40,24);R(c,'#567b68',-12,-68,18,8);R(c,'#233e42',18,-48,14,20);c.restore();
  }
  lamp(x,y) {
    const c=this.ctx;R(c,'#30384b',x,y-83,5,86);R(c,'#30384b',x-7,y-85,19,5);R(c,'#e3c292',x-5,y-81,15,10);R(c,'#f4d49c15',x-18,y-72,42,70);R(c,'#e8bf8518',x-27,y-3,60,8);R(c,'#242c3e',x-3,y,11,5);
  }
  drawCity(street) {
    const c=this.ctx,t=this.reducedMotion?0:this.time;
    R(c,'#33364e',-500,-400,1900,1000);
    ['#3b3b54','#44415b','#51465e','#66516a'].forEach((col,i)=>R(c,col,-200,i*55-40,1360,55));
    R(c,'#b2a2b9',809,45,28,28);R(c,'#454059',800,40,26,24);
    [[62,40],[241,67],[568,34],[714,78],[903,30]].forEach(([x,y])=>R(c,'#b5adba',x,y,2,2));
    for(let i=0;i<11;i++){const x=i*103-40;const h=65+(i*37%70);R(c,i%2?'#373a51':'#3e4057',x,210-h,86,h);R(c,'#30364b',x+8,205-h,69,5);}
    this.building(-35,110,205,244,'#615969',4,5);
    this.building(193,143,155,211,'#6a6373',3,4);
    this.building(366,83,173,271,'#777184',5,4);
    this.building(805,104,195,250,'#65697c',4,5);
    // Youth centre: amber windows, lavender signage, visible destination.
    R(c,'#252c4055',572,192,216,171);R(c,'#8b7c88',555,186,226,170);R(c,'#b09b9f',547,180,242,12);
    R(c,'#343247',568,205,200,44);R(c,'#5b506e',572,209,192,36);label(c,'Я.МОЛОД',668,236,24,'#e4d5ff','center');
    R(c,'#e6bc8550',593,263,150,89);R(c,'#e9bf87',590,263,46,64);R(c,'#8e7882',611,263,4,64);R(c,'#e9bf87',700,263,48,64);R(c,'#8e7882',722,263,4,64);
    R(c,'#3a3549',650,259,40,97);R(c,'#d0aa7f',655,266,30,73);R(c,'#5b5364',668,265,4,88);R(c,'#f2d9ad',676,304,3,8);R(c,'#776c7d',641,349,57,7);
    R(c,'#bda390',-100,356,1160,22);R(c,'#8d8291',-100,378,1160,6);R(c,'#575f76',-100,384,1160,32);
    for(let x=0;x<960;x+=52)R(c,'#74778c',x,388,2,24);
    R(c,'#343e54',-100,416,1160,124);R(c,'#87909c',-100,417,1160,4);R(c,'#283349',-100,488,1160,52);
    for(let x=-40;x<1000;x+=100)R(c,'#d5c9ab',x,475,48,4);
    for(let i=0;i<7;i++)R(c,'#b2b2b5',765+i*19,425,10,43);
    this.tree(160,377,.9);this.tree(349,379,.78);this.tree(800,384,.85);this.tree(925,410,.95);
    this.lamp(551,404);this.lamp(91,404);this.lamp(884,404);
    // Bus stop.
    R(c,'#343951',212,353,4,57);R(c,'#343951',312,353,4,57);R(c,'#434860',201,346,125,9);R(c,'#a3bec132',221,357,84,43);R(c,'#8e7b79',224,395,67,6);R(c,'#3a3f52',229,400,4,9);R(c,'#3a3f52',284,400,4,9);
    const car=(x,y,color,dir)=>{R(c,'#111b2b66',x+3,y+25,85,6);R(c,color,x,y,80,24);R(c,color,x+17,y-11,48,16);R(c,'#829ba8',x+23,y-8,19,10);R(c,'#829ba8',x+45,y-8,15,10);R(c,'#20283a',x+12,y+20,14,10);R(c,'#20283a',x+57,y+20,14,10);R(c,'#eed4a2',dir>0?x+74:x+2,y+5,5,6);};
    car(((t/23+280)%1220)-140,438,'#a88384',1);car(1050-((t/31+600)%1300),508,'#8985ac',-1);
    if(!street){drawCharacter(c,'student1',((t/80+120)%1100)-70,399,{pose:'walk',scale:1.15,time:t});drawCharacter(c,'student2',900-((t/110)%1100),370,{pose:'walk',direction:-1,scale:1.05,time:t});}
    // Foreground gives the panorama depth.
    R(c,'#212c3e',-30,531,1020,12);
  }
  floor(x,y,w,h,color) {
    const c=this.ctx;R(c,color,x,y,w,h);
    for(let yy=y;yy<y+h;yy+=34){R(c,'#00000010',x,yy,w,2);for(let xx=x+(Math.floor(yy/34)%2)*45;xx<x+w;xx+=90){R(c,'#0000000c',xx,yy,2,34);R(c,'#ffffff05',xx+8,yy+9,45,2);}}
  }
  plant(x,y) {const c=this.ctx;R(c,'#1a283c33',x-14,y,38,7);R(c,'#ae7b6b',x-10,y-17,24,22);R(c,'#d0977b',x-14,y-20,32,8);R(c,'#4e796b',x-3,y-53,6,34);R(c,'#618b75',x-18,y-46,18,9);R(c,'#618b75',x+1,y-54,19,9);R(c,'#3e695c',x+1,y-36,18,8);}
  drawCentre(studio) {
    const c=this.ctx;
    R(c,'#21273c',-500,-400,2000,1300);
    this.floor(32,121,896,420,studio?'#6b6f84':'#84838e');
    R(c,studio?'#475471':'#6a627d',32,24,896,98);
    R(c,'#afa3be',32,24,896,8);
    R(c,'#42485f',32,111,896,13);
    label(c,studio?'МЕДИАЛАБ':'Я.МОЛОД',480,79,27,'#eee2fb','center');
    const posters=studio?['СЪЁМКА','МОНТАЖ','ПРЕМЬЕРА']:['Я','ПРОЕКТЫ','СОБЫТИЯ'];
    for(const [i,title] of posters.entries()){
      const x=[142,245,738][i];
      R(c,'#34354a',x,43,85,59);R(c,['#ad91ca','#98b4bc','#c49e88'][i],x+4,47,77,51);
      R(c,'#ffffff38',x+9,53,67,18);label(c,title,x+43,88,11,'#282840','center');
    }
    this.plant(92,155);this.plant(872,158);
    if(!studio){
      R(c,'#333249',506,136,260,72);R(c,'#595071',511,131,250,58);R(c,'#827298',511,131,250,5);
      R(c,'#e0bd90',538,151,10,9);R(c,'#e0bd90',733,151,10,9);
      label(c,'СТАРТ КВЕСТА',636,167,15,'#ede4ef','center');
      R(c,'#4c4d65',415,422,151,100);R(c,'#a389a5',429,430,123,95);
      R(c,'#656179',41,319,113,18);R(c,'#a18fae',41,312,113,12);
      return;
    }
    for(const x of [289,427,565]){
      R(c,'#2e354c',x,181,118,18);R(c,'#b198a2',x,171,118,12);
      R(c,'#232b44',x+20,126,77,47);R(c,'#638396',x+24,130,69,37);
      for(let j=0;j<3;j++)R(c,['#ceb0d9','#84b5bb','#efd1a7'][j],x+29+j*19,150,17,5);
    }
    R(c,'#899da9',719,166,119,108);R(c,'#a6b6bc',729,173,99,94);
    R(c,'#31384f',715,157,126,8);
    for(const x of [737,818]){
      R(c,'#3c4256',x,250,4,40);R(c,'#3c4256',x-9,287,22,4);
      R(c,'#e6c698',x-5,241,14,10);
    }
    R(c,'#2d3349',669,298,25,15);R(c,'#a69ab4',688,301,10,9);
    R(c,'#363c55',679,313,4,26);R(c,'#363c55',671,335,20,4);
  }
  desk(x,y) {const c=this.ctx;R(c,'#2b32413a',x+8,y+26,120,33);R(c,'#615165',x+7,y+21,7,33);R(c,'#615165',x+103,y+21,7,33);R(c,'#a77e68',x,y,120,38);R(c,'#d5b28b',x,y,120,29);R(c,'#e2c29b',x,y,120,4);R(c,'#f1e6d0',x+13,y+9,29,17);R(c,'#84999c',x+16,y+12,23,2);R(c,'#c4a5ad',x+71,y+8,29,19);R(c,'#80677d',x+71,y+8,4,19);}
  drawClassroom() {
    const c=this.ctx;R(c,'#20273b',-400,-400,1760,1300);
    this.floor(60,112,840,428,'#898592');R(c,'#aaa6b2',60,25,840,87);R(c,'#c0b9c2',60,25,840,9);R(c,'#55586f',60,105,840,9);R(c,'#222b3c33',60,114,840,13);
    // Left windows and afternoon light falling onto the floor.
    R(c,'#777b91',60,25,20,515);
    for(let y=139;y<420;y+=128){R(c,'#3b4962',58,y,27,92);R(c,'#a6c4d0',61,y+5,21,80);R(c,'#d5d3c5',61,y+43,22,5);R(c,'#ede5ca22',85,y+8,150,68);R(c,'#ede5ca13',235,y+8,70,68);R(c,'#c6bdc2',55,y+89,34,7);}
    // Board, clock, noticeboard and door.
    R(c,'#6b5862',315,39,286,58);R(c,'#3b5b58',321,43,274,47);R(c,'#81998a',346,56,70,2);R(c,'#81998a',346,64,47,2);label(c,'До завтра!',484,76,15,'#cbd2b4','center');R(c,'#c1af91',316,94,285,6);
    R(c,'#e6ddd1',655,42,32,32);R(c,'#696071',668,48,3,12);R(c,'#696071',668,58,10,3);
    R(c,'#6e5868',120,42,130,52);R(c,'#bb9a82',126,47,118,41);R(c,'#d8d2bb',138,53,28,29);R(c,'#b3b8c3',173,51,27,24);R(c,'#ce9e97',208,54,25,28);
    R(c,'#34394d',838,33,62,81);R(c,'#ad8990',844,39,50,67);R(c,'#d8b0a0',850,46,37,45);R(c,'#f2d49c',884,84,4,8);
    this.plant(802,113);this.plant(115,470);
    // Desks and characters share depth order.
    const objects=[];
    for(const y of [162,278,405])for(const x of [225,465,705]){
      objects.push({y:y-12,draw:()=>{R(c,'#55576d',x+40,y-15,43,20);R(c,'#666880',x+43,y-20,37,13);}});
      objects.push({y:y+19,draw:()=>this.desk(x,y)});
    }
    for(const [id,a] of Object.entries(this.actors))objects.push({y:a.y,draw:()=>drawCharacter(c,id,a.x,a.y,{...a,time:this.time})});
    objects.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());
    R(c,'#21283b',40,25,20,515);R(c,'#21283b',900,25,20,515);
  }
  drawBedroom() {
    const c=this.ctx;R(c,'#20263c',-400,-400,1760,1300);this.floor(120,135,720,405,'#777080');
    R(c,'#615d7b',120,30,720,105);R(c,'#8b83a0',120,30,720,8);R(c,'#3f405b',120,128,720,9);
    // Window, curtains and dusk.
    R(c,'#3c3e5d',194,47,147,75);R(c,'#8d89b3',201,53,132,62);R(c,'#bca1a8',201,83,132,32);R(c,'#5e6182',203,91,27,24);R(c,'#71708c',239,80,35,35);R(c,'#555d7d',285,88,43,27);R(c,'#e3c397',214,98,5,8);R(c,'#b8a7bd',264,53,5,62);R(c,'#4d4d6b',179,42,20,90);R(c,'#4d4d6b',335,42,20,90);
    // Bed.
    R(c,'#3c3b5544',161,224,178,237);R(c,'#514860',150,210,170,233);R(c,'#e0d2c9',159,218,153,213);R(c,'#b1a0bf',159,275,153,156);R(c,'#9589aa',159,400,153,31);R(c,'#cbbbd4',166,282,137,9);R(c,'#f2e5d4',176,228,112,40);R(c,'#dacdbe',176,260,112,8);
    // Rug.
    R(c,'#615574',360,288,329,164);R(c,'#9b859f',369,297,311,146);R(c,'#756783',376,304,297,132);
    for(let x=384;x<670;x+=35)R(c,'#9b859f',x,313,3,114);
    // Desk / screen.
    R(c,'#423d56',450,179,230,64);R(c,'#b69788',442,165,245,47);R(c,'#d1b49b',442,165,245,6);R(c,'#34364d',502,115,107,65);R(c,'#212c47',508,121,95,51);R(c,'#4e5269',548,179,18,10);R(c,'#4e5269',533,186,48,5);
    const active=['computer','phone'].includes(this.actors.nikita?.pose);
    if(active){R(c,'#5d548a',510,123,91,47);label(c,'NEW GAME',555,139,8,'#e9d7ee','center');R(c,'#c4b1f2',529,148,53,5);R(c,'#9885b9',535,158,41,3);R(c,'#ad9fe617',467,170,174,74);}
    R(c,'#43465f',522,196,72,10);for(let x=526;x<590;x+=7)R(c,'#8d8ba8',x,198,4,5);R(c,'#d6bea6',648,181,16,19);R(c,'#6d5d60',651,183,10,4);
    R(c,'#48435e',529,231,65,26);R(c,'#8a7a9e',533,233,57,30);R(c,'#4b455f',541,263,6,24);R(c,'#4b455f',579,263,6,24);
    // Bookshelf and wall poster.
    R(c,'#54475d',738,73,75,174);for(let y=88;y<230;y+=48){R(c,'#ba9c85',744,y+33,63,6);for(let i=0;i<5;i++)R(c,['#a78b9c','#afab95','#8d99af','#c39b7e','#8a7b9f'][i],747+i*11,y+(i%2)*6,8,33-(i%2)*6);}
    R(c,'#332e4b',650,45,56,64);R(c,'#9880bd',655,50,46,54);R(c,'#ead2a7',669,60,18,18);R(c,'#57517f',660,82,36,16);
    this.plant(394,185);R(c,'#34394d',817,336,23,114);R(c,'#bc9897',823,344,17,98);
    this.drawActors();R(c,'#30334d',100,30,20,510);R(c,'#30334d',840,30,20,510);
  }
}
