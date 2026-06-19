const PREFIX='esun10pero-v1-';
let peer=null, isHost=false, myId=null, myName='';
let conns={};            // host: peerId -> DataConnection
let hostConn=null;       // client: connection to host
let players=[];          // host authoritative: [{id,name,avatar}]
let round={active:null, card:null, revealed:false, num:0};
let myAvatar=0;
let spinning=false, pendingRound=null, started=false;

// Servidores ICE: STUN + TURN gratuitos. El TURN hace de "relé" cuando la
// conexión directa P2P falla (routers estrictos), evitando que peten las salas con varios jugadores.
const PEER_CONFIG={ config:{ iceServers:[
  {urls:'stun:stun.l.google.com:19302'},
  {urls:'stun:stun1.l.google.com:19302'},
  {urls:'turn:freestun.net:3478',username:'free',credential:'free'},
  {urls:'turns:freestun.net:5350',username:'free',credential:'free'},
  {urls:'turn:openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'},
  {urls:'turn:openrelay.metered.ca:443',username:'openrelayproject',credential:'openrelayproject'}
]}};

// Avatares incrustados (SVG inline) -> siempre se ven, sin depender de archivos
const AVATARS=[
`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#ffffff"/><g fill="none" stroke="#1a1a1a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 52 Q20 24 50 20 Q82 24 80 54 Q79 82 50 85 Q23 82 22 52Z"/><path d="M34 27 Q46 21 60 27"/><rect x="30" y="42" width="16" height="12" rx="4"/><rect x="54" y="42" width="16" height="12" rx="4"/><path d="M46 48 L54 48"/><circle cx="38" cy="48" r="1.6" fill="#1a1a1a"/><circle cx="62" cy="48" r="1.6" fill="#1a1a1a"/><path d="M40 66 Q50 72 60 64"/></g></svg>`,
`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#ffffff"/><g fill="none" stroke="#1a1a1a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 50 Q22 30 50 26 Q78 30 76 52 Q74 74 56 84 L44 84 Q26 74 24 50Z"/><path d="M26 34 L30 18 L35 32 L41 16 L47 31 L52 14 L58 31 L64 17 L69 33 L74 20 L77 38"/><rect x="30" y="44" width="16" height="11" rx="4"/><rect x="54" y="44" width="16" height="11" rx="4"/><path d="M46 49 L54 49"/><circle cx="38" cy="49" r="1.6" fill="#1a1a1a"/><circle cx="62" cy="49" r="1.6" fill="#1a1a1a"/><path d="M40 64 Q50 60 60 64"/><path d="M46 70 Q50 82 56 70"/></g></svg>`,
`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#ffffff"/><g fill="none" stroke="#1a1a1a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M24 54 Q24 34 50 30 Q78 34 78 56 Q76 80 50 86 Q26 82 24 54Z"/><circle cx="30" cy="34" r="5"/><circle cx="40" cy="26" r="5"/><circle cx="50" cy="23" r="5"/><circle cx="60" cy="26" r="5"/><circle cx="70" cy="34" r="5"/><circle cx="35" cy="30" r="4"/><circle cx="55" cy="24" r="4"/><circle cx="65" cy="30" r="4"/><path d="M33 50 Q39 46 45 50"/><path d="M55 50 Q61 46 67 50"/><circle cx="39" cy="51" r="1.4" fill="#1a1a1a"/><circle cx="61" cy="51" r="1.4" fill="#1a1a1a"/><path d="M40 66 q4 4 8 0 q4 -4 8 0 q4 4 4 4"/></g></svg>`,
`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#ffffff"/><g fill="none" stroke="#1a1a1a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 52 Q20 26 50 22 Q80 26 78 54 Q77 82 50 85 Q23 82 22 52Z"/><path d="M28 34 Q50 18 72 34"/><path d="M28 34 L30 28"/><path d="M72 34 L70 28"/><rect x="30" y="44" width="15" height="11" rx="4"/><rect x="55" y="44" width="15" height="11" rx="4"/><path d="M45 49 L55 49"/><circle cx="37" cy="49" r="2" fill="#39a0ff" stroke="none"/><circle cx="62" cy="49" r="2" fill="#39a0ff" stroke="none"/><path d="M40 66 Q50 73 60 65"/></g></svg>`,
`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#ffffff"/><g stroke="#1a1a1a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M28 52 Q26 34 50 32 Q74 34 72 52 Q72 66 64 76 Q57 84 50 84 Q43 84 36 76 Q28 66 28 52Z" fill="#f0c4a0"/><path d="M30 53 Q33 61 31 67 Q36 83 50 86 Q64 83 69 67 Q67 61 70 53 Q63 64 50 64 Q37 64 30 53Z" fill="#3a2a20"/><path d="M40 57 Q50 53 60 57 Q55 61 50 60 Q45 61 40 57Z" fill="#3a2a20" stroke="none"/><path d="M44 64 Q50 67 56 64" fill="none"/><path d="M26 41 Q30 22 50 22 Q70 22 74 41 Q62 34 50 34 Q38 34 26 41Z" fill="#15161a"/><path d="M24 42 Q40 36 53 40 L53 45 Q39 42 26 47Z" fill="#15161a"/><path d="M37 46 Q41 44 45 46" fill="none"/><path d="M55 46 Q59 44 63 46" fill="none"/><circle cx="41" cy="50" r="1.9" fill="#1a1a1a" stroke="none"/><circle cx="59" cy="50" r="1.9" fill="#1a1a1a" stroke="none"/></g></svg>`,
`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#ffffff"/><g fill="none" stroke="#1a1a1a" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 42 Q20 18 50 15 Q80 18 78 42 L80 80 Q73 73 71 58 Q71 50 67 46 L33 46 Q29 50 29 58 Q27 73 20 80Z"/><path d="M30 44 Q30 30 50 28 Q70 30 70 44 Q72 60 60 73 Q50 81 40 73 Q28 60 30 44Z"/><path d="M32 38 Q50 28 68 38"/><path d="M37 45 l-2 -3"/><path d="M44 45 l2 -3"/><path d="M56 45 l-2 -3"/><path d="M63 45 l2 -3"/><path d="M38 47 Q41 44 44 47"/><path d="M56 47 Q59 44 62 47"/><circle cx="41" cy="48" r="1.5" fill="#1a1a1a"/><circle cx="59" cy="48" r="1.5" fill="#1a1a1a"/><path d="M44 62 Q50 67 56 62" stroke="#e0568a"/><path d="M26 24 l-9 -5 l2 9 Z" stroke="#e0568a"/><path d="M26 24 l-9 5 l2 -9 Z" stroke="#e0568a"/></g></svg>`
];
const AVATAR_NAMES=['Pablo','Walter','Skii','Dopi','Xokas','Andie'];

const $=id=>document.getElementById(id);
const show=(id,on=true)=>$(id).classList.toggle('hidden',!on);
const rand10=()=>Math.floor(Math.random()*10)+1;
const randCode=()=>{let c='';const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';for(let i=0;i<4;i++)c+=a[Math.floor(Math.random()*a.length)];return c;};
const nameOf=id=>{const p=players.find(p=>p.id===id);return p?p.name:'?';};
const avatarOf=id=>{const p=players.find(p=>p.id===id);return p?(p.avatar||0):0;};

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
function flash(id,msg){const e=$(id); if(e) e.textContent=msg;}

// prefijar código si viene en el enlace
const urlRoom=new URLSearchParams(location.search).get('room');
if(urlRoom){$('code').value=urlRoom.toUpperCase();}

// selector de avatar
function renderAvatarPicker(){
  const box=$('avatar-picker'); if(!box)return; box.innerHTML='';
  AVATARS.forEach((svg,i)=>{
    const o=document.createElement('div');
    o.className='avatar-opt'+(i===myAvatar?' sel':'');
    o.innerHTML='<span class="av">'+svg+'</span><div class="nm">'+AVATAR_NAMES[i]+'</div>';
    o.onclick=()=>{myAvatar=i;renderAvatarPicker();};
    box.appendChild(o);
  });
}
renderAvatarPicker();

// ---------- HOST ----------
function createRoom(){
  const code=randCode();
  flash('home-status','Creando sala…');
  peer=new Peer(PREFIX+code, PEER_CONFIG);
  peer.on('disconnected',()=>{try{peer.reconnect();}catch(e){}});
  peer.on('open',()=>{
    myId=peer.id;
    players=[{id:myId,name:myName,avatar:myAvatar}];
    enterRoom(code);
    setupHostControls();
    renderPlayers();
    flash('room-status','Comparte el enlace y pulsa EMPEZAR cuando estéis todos.');
  });
  peer.on('error',err=>{
    if(err.type==='unavailable-id'){createRoom();return;} // código pillado, reintenta
    flash('home-status','Error: '+err.type);
  });
  peer.on('connection',conn=>{
    conns[conn.peer]=conn;                       // guardar al instante (evita perder a quien entra)
    conn.on('open',()=>{ conns[conn.peer]=conn; broadcastState(); });
    conn.on('data',d=>hostOnData(conn,d));
    conn.on('error',()=>{});                      // no tumbar la sala por un fallo puntual
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
  const spin=mkbtn('btn-spin','btn primary','🎡 Empezar (girar ruleta)',()=>{
    if(spinning)return;
    if(players.length<2){flash('game-status','Hace falta al menos 2 jugadores.');return;}
    const w=players[Math.floor(Math.random()*players.length)].id;
    startSpin(w);
  });
  const pick=mkbtn('btn-pick','btn ghost','✋ Elegir a quién le toca',()=>{ if(!spinning) togglePicker(); });
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
    b.innerHTML='<span class="pmini">'+AVATARS[pl.avatar||0]+'</span>'+pl.name;
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
  runSpin(order,winnerId,()=>{
    if(rev) rev.disabled=false;
    started=true;
    const sb=$('btn-spin'); if(sb) sb.textContent='🎡 Siguiente ronda';
    sendRound();
  });
}

// ---------- RULETA (host y cliente) ----------
function buildTrack(order){
  const tr=$('rtrack'); tr.innerHTML='';
  order.forEach(id=>{
    const p=players.find(x=>x.id===id)||{avatar:0,name:'?'};
    const d=document.createElement('div'); d.className='rcell';
    d.innerHTML='<span class="ravatar">'+AVATARS[p.avatar||0]+'</span><span class="rname">'+p.name+'</span>';
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
let joinTimer=null, joinDone=false, joinAttempts=0, joinCode='';
function joinRoom(code){
  joinCode=code; joinDone=false; joinAttempts=0;
  attemptJoin();
}
function attemptJoin(){
  if(joinDone) return;
  joinAttempts++;
  flash('home-status','Conectando… (intento '+joinAttempts+'/6)');
  if(peer){try{peer.destroy();}catch(e){}}
  peer=new Peer(PEER_CONFIG);
  peer.on('disconnected',()=>{try{peer.reconnect();}catch(e){}});
  peer.on('open',()=>{
    if(joinDone) return;
    myId=peer.id;
    const hc=peer.connect(PREFIX+joinCode,{reliable:true});
    hostConn=hc;
    hc.on('open',()=>{
      joinDone=true; clearTimeout(joinTimer);
      hc.send({type:'join',name:myName,avatar:myAvatar});
      enterRoom(joinCode); flash('room-status','¡Dentro! Esperando al anfitrión…');
    });
    hc.on('data',clientOnData);
    hc.on('error',()=>{});
    hc.on('close',()=>{ if(joinDone) flash('game-status','Se cerró la conexión con el anfitrión.'); });
  });
  peer.on('error',err=>{
    if(joinDone) return;
    // errores recuperables -> reintentar enseguida
    if(['peer-unavailable','network','server-error','socket-error','socket-closed','disconnected'].includes(err.type) && joinAttempts<6){
      clearTimeout(joinTimer); setTimeout(attemptJoin,1200);
    } else if(joinAttempts>=6){
      flash('home-status','No hay forma de conectar. Tu red puede bloquear WebRTC: prueba con datos móviles o que el anfitrión recree la sala.');
    }
  });
  // si en 8s no ha abierto, reintenta automáticamente
  clearTimeout(joinTimer);
  joinTimer=setTimeout(()=>{
    if(joinDone) return;
    if(joinAttempts<6){ attemptJoin(); }
    else { flash('home-status','No se encontró la sala o tu red bloquea la conexión. Prueba datos móviles, o pulsa "Unirme" otra vez.'); }
  },8000);
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
      const av='<span class="av-mini">'+AVATARS[p.avatar||0]+'</span>';
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
      $('turninfo').innerHTML='🙈 <span class="hl">¡Te toca adivinar!</span> No puedes ver tu carta. Los demás sí.';
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
