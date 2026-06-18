const PREFIX='esun10pero-v1-';
let peer=null, isHost=false, myId=null, myName='';
let conns={};            // host: peerId -> DataConnection
let hostConn=null;       // client: connection to host
let players=[];          // host authoritative: [{id,name,avatar}]
let round={active:null, card:null, revealed:false, num:0, turnIdx:-1};
let myAvatar=0;
let spinning=false, pendingRound=null;
const AVATARS=['img/pablo.svg','img/walter.svg','img/skii.svg','img/dopi.svg','img/xokas.svg','img/chica.svg'];
const AVATAR_NAMES=['Pablo','Walter','Skii','Dopi','Xokas','Chica'];

const $=id=>document.getElementById(id);
const show=(id,on=true)=>$(id).classList.toggle('hidden',!on);
const rand10=()=>Math.floor(Math.random()*10)+1;
const randCode=()=>{let c='';const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';for(let i=0;i<4;i++)c+=a[Math.floor(Math.random()*a.length)];return c;};
const nameOf=id=>{const p=players.find(p=>p.id===id);return p?p.name:'?';};

// ---------- ENTRADA ----------
$('btn-create').onclick=()=>{
  myName=$('name').value.trim();
  if(!myName){flash('home-status','Escribe tu nombre 😉');return;}
  isHost=true; createRoom();
};
$('btn-join').onclick=()=>{
  myName=$('name').value.trim();
  const code=$('code').value.trim().toUpperCase();
  if(!myName){flash('home-status','Escribe tu nombre 😉');return;}
  if(code.length<3){flash('home-status','Pon el código de la sala');return;}
  isHost=false; joinRoom(code);
};
function flash(id,msg){$(id).textContent=msg;}

// prefijar código si viene en el enlace
const urlRoom=new URLSearchParams(location.search).get('room');
if(urlRoom){$('code').value=urlRoom.toUpperCase();}

// selector de avatar
function renderAvatarPicker(){
  const box=$('avatar-picker'); if(!box)return; box.innerHTML='';
  AVATARS.forEach((src,i)=>{
    const o=document.createElement('div');
    o.className='avatar-opt'+(i===myAvatar?' sel':'');
    o.innerHTML='<img class="av" src="'+src+'" alt="'+AVATAR_NAMES[i]+'"><div class="nm">'+AVATAR_NAMES[i]+'</div>';
    o.onclick=()=>{myAvatar=i;renderAvatarPicker();};
    box.appendChild(o);
  });
}
renderAvatarPicker();

// ---------- HOST ----------
function createRoom(){
  const code=randCode();
  flash('home-status','Creando sala…');
  peer=new Peer(PREFIX+code);
  peer.on('open',()=>{
    myId=peer.id;
    players=[{id:myId,name:myName,avatar:myAvatar}];
    enterRoom(code);
    setupHostControls();
    renderPlayers();
    flash('room-status','Comparte el enlace y dale a GIRAR cuando estéis todos.');
  });
  peer.on('error',err=>{
    if(err.type==='unavailable-id'){createRoom();return;} // código pillado, reintenta
    flash('home-status','Error: '+err.type);
  });
  peer.on('connection',conn=>{
    conn.on('open',()=>{ conns[conn.peer]=conn; });
    conn.on('data',d=>hostOnData(conn,d));
    conn.on('close',()=>{ delete conns[conn.peer]; players=players.filter(p=>p.id!==conn.peer); broadcastState(); renderPlayers(); });
  });
}
function hostOnData(conn,d){
  if(d.type==='join'){
    if(!players.find(p=>p.id===conn.peer)) players.push({id:conn.peer,name:d.name,avatar:d.avatar||0});
    broadcastState(); renderPlayers();
    if(round.active) sendRound(); // por si entra a mitad
  }
}
function broadcastState(){
  const msg={type:'state',players};
  Object.values(conns).forEach(c=>{try{c.send(msg);}catch(e){}});
}
function kickPlayer(id){
  if(id===myId)return;
  const c=conns[id];
  if(c){ try{c.send({type:'kicked'});}catch(e){} setTimeout(()=>{try{c.close();}catch(e){}},250); }
  delete conns[id];
  players=players.filter(p=>p.id!==id);
  if(round.active===id) round.active=null;
  broadcastState(); renderPlayers();
  flash('game-status','Has expulsado a un jugador.');
}
function mkbtn(id,cls,txt,fn){const b=document.createElement('button');b.id=id;b.className=cls;b.textContent=txt;b.onclick=fn;return b;}
function setupHostControls(){
  const c=$('host-controls'); c.innerHTML='';
  const spin=mkbtn('btn-spin','btn primary','🎡 Girar ruleta',()=>{
    if(spinning)return;
    if(players.length<2){flash('game-status','Hace falta al menos 2 jugadores.');return;}
    const w=players[Math.floor(Math.random()*players.length)].id;
    startSpin(w);
  });
  const pick=mkbtn('btn-pick','btn ghost','✋ Elegir yo',()=>{ if(!spinning) togglePicker(); });
  const rev=mkbtn('btn-reveal','btn pink','Revelar carta',()=>{
    if(!round.active||spinning)return; round.revealed=true; sendRound(); rev.disabled=true;
  });
  rev.disabled=true;
  c.appendChild(spin); c.appendChild(pick); c.appendChild(rev);
  const picker=document.createElement('div'); picker.id='host-picker'; picker.className='picker hidden';
  c.appendChild(picker);
}
function togglePicker(){
  const p=$('host-picker'); p.innerHTML='';
  players.forEach(pl=>{
    const b=document.createElement('button'); b.className='btn ghost pick-opt';
    b.innerHTML='<img src="'+AVATARS[pl.avatar||0]+'">'+pl.name;
    b.onclick=()=>{ p.classList.add('hidden'); startSpin(pl.id); };
    p.appendChild(b);
  });
  p.classList.toggle('hidden');
}
function startSpin(winnerId){
  round.active=winnerId; round.num=rand10(); round.revealed=false;
  const order=players.map(p=>p.id);
  Object.values(conns).forEach(c=>{try{c.send({type:'spin',order,winnerId});}catch(e){}});
  const rev=$('btn-reveal'); if(rev) rev.disabled=true;
  runSpin(order,winnerId,()=>{ if(rev) rev.disabled=false; sendRound(); });
}

// ---------- RULETA (host y cliente) ----------
function buildTrack(order){
  const tr=$('rtrack'); tr.innerHTML='';
  order.forEach(id=>{
    const p=players.find(x=>x.id===id)||{avatar:0,name:'?'};
    const d=document.createElement('div'); d.className='rcell';
    d.innerHTML='<img src="'+AVATARS[p.avatar||0]+'" alt=""><span>'+p.name+'</span>';
    tr.appendChild(d);
  });
}
function highlight(idx){
  const cells=$('rtrack').children;
  for(let i=0;i<cells.length;i++) cells[i].classList.toggle('hl',i===idx);
}
function runSpin(order,winnerId,done){
  show('roulette',true);
  $('rmsg').textContent='🎡 Girando la ruleta…';
  $('turninfo').textContent='';
  buildTrack(order);
  spinning=true;
  const n=order.length, winIdx=Math.max(0,order.indexOf(winnerId));
  const loops=4, totalSteps=loops*n+winIdx, DUR=3000, t0=performance.now();
  function frame(now){
    const prog=Math.min((now-t0)/DUR,1);
    const ease=1-Math.pow(1-prog,3);
    highlight(Math.floor(ease*totalSteps)%n);
    if(prog<1){requestAnimationFrame(frame);}
    else{
      highlight(winIdx); spinning=false;
      const w=players.find(x=>x.id===winnerId);
      $('rmsg').innerHTML='👉 ¡Le toca a <b>'+(w?w.name:'?')+'</b>!';
      if(pendingRound){const d=pendingRound;pendingRound=null;applyRound(d);}
      if(done) done();
    }
  }
  requestAnimationFrame(frame);
}
function sendRound(){
  players.forEach(p=>{
    const isActive=p.id===round.active;
    const payload={type:'round',activeId:round.active,activeName:nameOf(round.active),
      revealed:round.revealed, card:(isActive&&!round.revealed)?null:round.num};
    if(p.id===myId) applyRound(payload);
    else if(conns[p.id]){try{conns[p.id].send(payload);}catch(e){}}
  });
}

// ---------- CLIENTE ----------
function joinRoom(code){
  flash('home-status','Conectando…');
  peer=new Peer();
  peer.on('open',()=>{
    myId=peer.id;
    hostConn=peer.connect(PREFIX+code,{reliable:true});
    let opened=false;
    hostConn.on('open',()=>{opened=true; hostConn.send({type:'join',name:myName,avatar:myAvatar}); enterRoom(code); flash('room-status','¡Dentro! Esperando al anfitrión…');});
    hostConn.on('data',clientOnData);
    hostConn.on('close',()=>flash('game-status','Se cerró la conexión con el anfitrión.'));
    setTimeout(()=>{if(!opened)flash('home-status','No se encontró la sala. Revisa el código.');},6000);
  });
  peer.on('error',err=>{flash('home-status','Error: '+(err.type==='peer-unavailable'?'sala no encontrada':err.type));});
}
function clientOnData(d){
  if(d.type==='state'){players=d.players;renderPlayers();}
  else if(d.type==='spin'){runSpin(d.order,d.winnerId);}
  else if(d.type==='round'){applyRound(d);}
  else if(d.type==='kicked'){
    show('game',false); show('screen-room',false); show('screen-home',true);
    flash('home-status','El anfitrión te ha expulsado de la sala. 👋');
    try{peer.destroy();}catch(e){}
  }
}

// ---------- COMÚN ----------
function enterRoom(code){
  show('screen-home',false); show('screen-room',true); show('game',true);
  $('room-code').textContent=code;
  $('share-link').value=location.origin+location.pathname+'?room='+code;
  if(!isHost){show('host-controls',false);}
}
function renderPlayers(){
  ['players','players-game'].forEach(id=>{
    const box=$(id); if(!box)return; box.innerHTML='';
    players.forEach((p,i)=>{
      const t=document.createElement('span');
      t.className='ptag'+(i===0?' host':'')+(p.id===round.active?' active':'');
      const av='<img class="av-mini" src="'+AVATARS[p.avatar||0]+'" alt="">';
      t.innerHTML=av+'<span>'+p.name+(i===0?' 👑':'')+(p.id===myId?' (tú)':'')+'</span>';
      if(isHost && p.id!==myId){
        const k=document.createElement('button');
        k.className='kick'; k.textContent='✕'; k.title='Expulsar';
        k.onclick=()=>kickPlayer(p.id);
        t.appendChild(k);
      }
      box.appendChild(t);
    });
  });
}
function applyRound(d){
  if(spinning){pendingRound=d;return;}
  round.active=d.activeId; round.revealed=d.revealed;
  const card=$('card'); const amActive=d.activeId===myId;
  renderPlayers();
  $('room-status').textContent='';
  card.classList.remove('flipped');
  setTimeout(()=>{
    if(amActive && !d.revealed){
      // YO tengo el turno: no veo mi carta
      $('turninfo').innerHTML='🙈 <span class="hl">¡Te toca!</span> No puedes ver tu carta. Los demás sí.';
    } else {
      $('number').textContent=d.card;
      card.classList.add('flipped');
      if(amActive){ // revelada para mí
        $('turninfo').innerHTML='🎉 Tu carta era un <span class="hl">'+d.card+'</span>';
      } else {
        $('turninfo').innerHTML='A <span class="hl">'+d.activeName+'</span> le ha tocado un <span class="hl">'+d.card+'</span>'+(d.revealed?' (revelada)':' — ¡pícale!');
      }
    }
  },250);
}

// copiar enlace
$('btn-copy').onclick=()=>{
  const inp=$('share-link'); inp.select();
  navigator.clipboard?.writeText(inp.value).then(()=>{$('btn-copy').textContent='¡Copiado!';setTimeout(()=>$('btn-copy').textContent='Copiar',1500);}).catch(()=>{document.execCommand('copy');});
};
