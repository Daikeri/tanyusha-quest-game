/** @import {Scene, Command} from './engine.js' */
const say = (actor, text, thought = false) => ({type:'dialogue',actor,text,thought});
const move = (actor, path, duration = 1600) => ({type:'move',actor,path,duration});
const pose = (actor, value) => ({type:'pose',actor,pose:value});
const fade = (to, duration = 650) => ({type:'fade',to,duration});
const wait = duration => ({type:'wait',duration});
const go = target => ({type:'goto',target});
const music = id => ({type:'music',id});
const parallel = (...commands) => ({type:'parallel',commands});

/** @type {Record<string, Scene>} */
export const scenes = {
  scene00:{id:'scene00',chapter:'00',title:'Начало истории',commands:[
    music('city'),
    {type:'camera',x:630,y:235,zoom:1.5,duration:1800},
    fade(1,900), music('silence'),
    {type:'title',kicker:'ПРОЛОГ',text:'«Здесь ничего не происходит»',duration:2200},
    go('scene01'),
  ]},
  scene01:{id:'scene01',chapter:'01',title:'Здесь ничего не происходит',commands:[
    {type:'location',id:'classroom',actors:{nikita:{x:530,y:292,pose:'phone'},sonya:{x:750,y:170},student1:{x:305,y:195},student2:{x:305,y:310},student3:{x:750,y:310}}},
    music('classroom'),fade(0),{type:'sound',id:'bell'},
    parallel(move('student1',[[380,195],[405,110],[910,110]],2200),move('student2',[[405,310],[405,110],[960,110]],2800),move('student3',[[840,310],[840,110],[1000,110]],2100)),
    say('nikita','Наконец-то. Ещё один день пережили.',true),
    pose('nikita','pack'),wait(550),
    say('nikita','Сейчас домой, поесть, проверить игру, потом ещё домашка… А завтра опять сюда. Стабильность, конечно, впечатляет.',true),
    move('sonya',[[655,170],[655,300],[600,300]],1500),
    pose('nikita','sit'),
    say('sonya','Никит, какие планы на вечер?'),
    say('nikita','Сонь, если это опять мастер-класс по изготовлению чего-нибудь из шишек, то я занят.'),
    say('sonya','Ну красиво же в итоге получилось. Я своё макраме над кроватью повесила!'),
    say('nikita','Ага, а я до сих пор шелуху из рюкзака вытряхиваю…'),
    say('sonya','Ладно, сегодня без рукоделия. Обещаю. Опять за комп собираешься?'),
    say('nikita','А какие варианты? У нас тут даже сходить некуда.'),
    wait(600),pose('sonya','phone'),
    say('sonya','О, как удачно ты это сказал.'),
    say('nikita','Мне уже не нравится это начало.'),
    {type:'camera',x:555,y:250,zoom:1.25,duration:1100},
    go('scene02'),
  ]},
  scene02:{id:'scene02',chapter:'02',title:'Неожиданное предложение',commands:[
    {type:'poster',visible:true},
    say('sonya','Смотри, в «Ямолод» сегодня какой-то квест проводят. Пять уровней, на каждом нужно выполнить задание и получить ключ.'),
    say('nikita','«Ямолод»? Это где все собираются, чтобы поговорить о том, какие они инициативные?'),
    say('sonya','Ты там хоть раз был?'),
    say('nikita','Нет, но у меня богатое воображение.'),
    say('sonya','Короче, если собрать все пять ключей, откроется секретная шестая дверь.'),
    say('nikita','А за ней что?'),
    say('sonya','Не говорят. В этом и прикол.'),
    say('nikita','То есть побочные квесты, сбор предметов и секретный уровень?'),
    say('sonya','Ну, если тебе так понятнее… Ну что, идём?'),
    say('nikita','Хм…'),
    {type:'poster',visible:false},
    {type:'vote',id:'invitation',duration:30000},
    {type:'branch',flag:'invitation',targets:{accept:'scene03a',decline:'scene03b'}},
  ]},
  scene03a:{id:'scene03a',chapter:'03',title:'Последствия выбора · пойти с Соней',commands:[
    say('nikita','Ладно, пошли. Но если там будут шишки и клей, я ухожу.'),
    say('sonya','Ого, я даже не ожидала! У тебя интернет дома отключили, что ли?'),
    say('nikita','Давай не начинай, а то я щас передумаю.'),
    say('sonya','Молчу, молчу! Вот это я понимаю — открытость к новому!'),
    say('nikita','Это не открытость. Это любопытство к секретной локации.'),
    say('sonya','Согласна, надеюсь, за победу нам подарят какого-нибудь Ямулика…'),
    say('nikita','Яму… кого? Какие-то новые модные лабубушки?'),
    say('sonya','Хахаха, круче! Всё, пошли уже.'),
    say('nikita','Ты иди, я забегу домой и к тебе сразу.'),
    pose('nikita','pack'),wait(500),
    {type:'camera',x:480,y:270,zoom:1,duration:600},
    parallel(move('sonya',[[660,300],[660,110],[1000,110]],2200),move('nikita',[[660,310],[660,125],[970,125]],2600)),
    say('nikita','Интересно, что они там спрятали… Надеюсь, не грамоту за активное участие.',true),
    fade(1),go('scene04'),
  ]},
  scene03b:{id:'scene03b',chapter:'03',title:'Последствия выбора · свои квесты',commands:[
    say('nikita','Не, Сонь, давай без меня. У меня дома свои квесты.'),
    say('sonya','Ну как знаешь. Тогда секретная дверь достанется кому-нибудь другому. А вдруг за ней будут раздавать Ямуликов!'),
    say('nikita','Яму… кого? Какие-то новые модные лабубушки?'),
    say('sonya','Круче!'),
    say('nikita','Ничего страшного, переживу.'),
    fade(1),{type:'location',id:'bedroom',actors:{nikita:{x:560,y:235,pose:'computer'}}},music('bedroom'),fade(0),
    say('nikita','Наконец-то. Никаких мероприятий, знакомств и активностей. Ещё этого не хватало после четырёх пар.',true),
    {type:'sound',id:'notification'},pose('nikita','phone'),
    {type:'chat',messages:[
      {from:'sonya',text:'Тут, кстати, первое задание уже появилось.'},
      {from:'sonya',text:'Угадаешь, что объединяет эти три предмета?',attachment:'objects'},
      {from:'nikita',text:'Камера, геймпад и карта?\nИнвентарь какого-то странного персонажа?'},
      {from:'sonya',text:'Почти. Ответ узнаешь, если придёшь :)'},
      {from:'nikita',text:'Это манипуляция.'},
      {from:'sonya',text:'Работает?'},
    ]},
    wait(1200),say('nikita','Соня, блин! Умеет же заинтриговать…'),
    pose('nikita','pack'),wait(500),
    say('nikita','Ладно. Один квест. Чисто из принципа.',true),
    move('nikita',[[690,235],[690,400],[910,400]],1800),
    fade(1),{type:'location',id:'street',actors:{nikita:{x:150,y:355}}},music('city'),fade(0),
    move('nikita',[[480,355],[660,355],[660,270]],3200),
    fade(1),go('scene04'),
  ]},
  scene04:{id:'scene04',chapter:'04',title:'Продолжение следует',commands:[
    {type:'location',id:'street',actors:{nikita:{x:660,y:285}}},music('city'),fade(0,1000),{type:'end'},
  ]},
};
