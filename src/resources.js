export const palette = {
  ink:'#171b2b', night:'#24283f', lavender:'#b6a0ef', peach:'#e8b184',
  skin:'#e8b697', skinShadow:'#c58b76', hair:'#483a43', light:'#f1e5cb',
};
export const characters = {
  nikita:{name:'Никита',hair:'#4d3840',shirt:'#8b84c4',pants:'#343e58',skin:'#e4ac8e',accent:'#c7b3ff'},
  sonya:{name:'Соня',hair:'#b06e48',shirt:'#e3af6f',pants:'#566d79',skin:'#efbc99',accent:'#edbd82'},
  student1:{name:'Студент',hair:'#353443',shirt:'#779e93',pants:'#3c465c',skin:'#d8a482',accent:'#99c9b7'},
  student2:{name:'Студентка',hair:'#7d5149',shirt:'#d48b91',pants:'#3c465c',skin:'#e9b89d',accent:'#d48b91'},
  student3:{name:'Студент',hair:'#3c343d',shirt:'#8b9cc2',pants:'#3c465c',skin:'#be8b6d',accent:'#8b9cc2'},
};
export const locations = {
  city:{name:'Город · обычный вечер', camera:{x:480,y:270,zoom:1}},
  classroom:{name:'Колледж · конец учебного дня',camera:{x:480,y:270,zoom:1}},
  bedroom:{name:'Комната Никиты · чуть позже',camera:{x:480,y:270,zoom:1}},
  street:{name:'По дороге в «Ямолод»',camera:{x:480,y:270,zoom:1}},
};
export const poses = ['idle','sit','phone','pack','walk','computer'];
export const sounds = {bell:[784,659,523],notification:[659,988],decision:[440,660,880],step:[110]};
export const music = {city:[196,247,294,370,330,294,247,220],classroom:[220,262,330,392,330,294,262,196],bedroom:[165,196,247,294,247,220,196,185],silence:[]};
export const attachments = {objects:'Камера, геймпад и карта'};
export const resources = {characters,locations,poses,sounds,music,attachments};
