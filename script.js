const PREFIX='esun10pero-v1-';
let peer=null, isHost=false, myId=null, myName='';
let conns={};            // host: peerId -> DataConnection
let hostConn=null;       // client: connection to host
let players=[];          // host authoritative: [{id,name,avatar}]
let round={active:null, card:null, revealed:false, num:0, turnIdx:-1};
let myAvatar=0;
const AVATARS=['img/pablo.svg','img/walter.svg','img/skii.svg','img/dopi.svg'];
const AVATAR_NAMES=['Pablo','Walter','Skii','Dopi'];

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
    flash('room-status','Comparte el enlace y dale a EMPEZAR cuando estéis todos.');
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
function setupHostControls(){
  const c=$('host-controls'); c.innerHTML='';
  const next=document.createElement('button');
  next.className='btn primary'; next.id='btn-next'; next.textContent='Empezar ronda';
  next.onclick=()=>{
    if(players.length<2){flash('game-status','Hace falta al menos 2 jugadores.');return;}
    round.turnIdx=(round.turnIdx+1)%players.length;
    round.active=players[round.turnIdx].id;
    round.num=rand10(); round.revealed=false;
    sendRound();
    $('btn-next').textContent='Siguiente ronda';
    $('btn-reveal').disabled=false;
  };
  const rev=document.createElement('button');
  rev.className='btn pink'; rev.id='btn-reveal'; rev.textContent='Revelar carta'; rev.disabled=true;
  rev.onclick=()=>{ if(!round.active)return; round.revealed=true; sendRound(); rev.disabled=true; };
  c.appendChild(next); c.appendChild(rev);
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
    hostConn.on('open',()=>{opened=true; hostConn.send({type:'join',name:myName}); enterRoom(code); flash('room-status','¡Dentro! Esperando al anfitrión…');});
    hostConn.on('data',clientOnData);
    hostConn.on('close',()=>flash('game-status','Se cerró la conexión con el anfitrión.'));
    setTimeout(()=>{if(!opened)flash('home-status','No se encontró la sala. Revisa el código.');},6000);
  });
  peer.on('error',err=>{flash('home-status','Error: '+(err.type==='peer-unavailable'?'sala no encontrada':err.type));});
}
function clientOnData(d){
  if(d.type==='state'){players=d.players;renderPlayers();}
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
