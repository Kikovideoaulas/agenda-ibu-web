/* Agenda IBU Web • Somente clientes • Mesmo Firebase do app Android */
'use strict';

const el=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reais=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const servicos=[['Orientação',120],['Búzios',180],['Baralho Cigano',150],['Tarô',150],['Búzios de Exu',150],['Runas',200],['Meditação Guiada',150],['Trabalhos em Geral',0]];
const hoje=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const dataBR=s=>s?.split('-').reverse().join('/')||'';
const msg=t=>{const x=el('toast');x.textContent=t;x.style.display='block';clearTimeout(window._tm);window._tm=setTimeout(()=>x.style.display='none',5000)};
const view=html=>{el('view').innerHTML=html;window.scrollTo(0,0)};
const input=(id,label,type='text',val='')=>`<label class="field" for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(val)}" ${type==='password'?'autocomplete="current-password"':''}>`;

let auth,db,user=null,perfil=null,horarios={},dias=[1,2,3,4,5,6,7],modo='',data='',hora='',modoHora='',ocupados=new Set(),bloqueio={},selec=new Set(),busy=false;

const start=`<section class="center"><img class="hero-logo" src="logo-ibu.png" alt="Instituto Brasil de Umbanda"><h1>INSTITUTO BRASIL DE UMBANDA</h1><p>Agende seu atendimento com praticidade</p><p>Dias e horários disponíveis conforme configuração do Instituto</p><button id="loginStart">Entrar com login e senha</button><button id="signupStart">Criar cadastro</button></section>`;

function home(){view(start);el('loginStart').onclick=login;el('signupStart').onclick=cadastro}

function erro(e){
  console.error(e);
  const code=e?.code||'';
  const mapa={
    'auth/email-already-in-use':'Este e-mail já está cadastrado.',
    'auth/invalid-email':'E-mail inválido.',
    'auth/invalid-credential':'E-mail ou senha incorretos.',
    'auth/weak-password':'A senha precisa ter pelo menos 6 caracteres.',
    'auth/too-many-requests':'Muitas tentativas. Tente novamente mais tarde.',
    'permission-denied':'Acesso não autorizado. Confira as regras do sistema.',
    'firestore/permission-denied':'Acesso não autorizado. Confira as regras do sistema.',
    'unavailable':'Sem conexão. Tente novamente.',
    'firestore/unavailable':'Sem conexão. Tente novamente.'
  };
  msg(mapa[code]||`Não foi possível concluir: ${e?.message||'verifique a conexão.'}`);
}

function login(){
  view(`<h2>Entrar na minha conta</h2>${input('email','E-mail','email')}${input('pass','Senha','password')}<button id="go">Entrar</button><button id="recover">Recuperar senha</button><button id="signup">Criar cadastro</button><button class="secondary" id="back">Voltar</button>`);
  el('back').onclick=home;el('signup').onclick=cadastro;el('recover').onclick=recuperar;
  el('go').onclick=async()=>{try{await auth.signInWithEmailAndPassword(el('email').value.trim(),el('pass').value)}catch(e){erro(e)}};
}

function recuperar(){
  view(`<h2>Recuperar senha</h2><p>Enviaremos um link para seu e-mail.</p>${input('email','E-mail','email')}<button id="go">Enviar link</button><button class="secondary" id="back">Voltar</button>`);
  el('back').onclick=login;
  el('go').onclick=async()=>{try{await auth.sendPasswordResetEmail(el('email').value.trim());msg('Se o e-mail estiver cadastrado, você receberá instruções para recuperar a senha.')}catch(e){erro(e)}};
}

function cadastro(){
  view(`<h2>Criar minha conta</h2>${input('name','Nome completo')}${input('tel','WhatsApp com DDD','tel')}${input('email','E-mail','email')}${input('pass','Senha (mínimo 6 caracteres)','password')}${input('confirm','Confirmar senha','password')}<button id="go">Criar conta</button><button class="secondary" id="back">Voltar</button>`);
  el('back').onclick=home;
  el('go').onclick=async()=>{
    const n=el('name').value.trim(),t=el('tel').value.replace(/\D/g,''),e=el('email').value.trim(),p=el('pass').value;
    if(n.length<2||n.length>100||t.length<10||t.length>20||!e.includes('@'))return msg('Confira nome, WhatsApp e e-mail.');
    if(p.length<6||p!==el('confirm').value)return msg('Confira as senhas (mínimo de 6 caracteres).');
    try{
      const cred=await auth.createUserWithEmailAndPassword(e,p);
      await cred.user.updateProfile({displayName:n});
      await db.collection('clientes').doc(cred.user.uid).set({nome:n,telefone:t,email:e,criadoEm:firebase.firestore.FieldValue.serverTimestamp()});
      msg('Cadastro realizado com sucesso!');
    }catch(e){erro(e)}
  };
}

async function carregarPerfil(){
  if(!user)return;
  try{
    const s=await db.collection('clientes').doc(user.uid).get();
    perfil=s.exists?s.data():{nome:user.displayName||'',telefone:'',email:user.email};
  }catch(e){
    perfil={nome:user.displayName||'',telefone:'',email:user.email};
    erro(e);
  }
}

function conta(){
  if(!user)return home();
  view(`<h2>Minha conta</h2><p>E-mail: ${esc(user.email)}</p><p>Nome: ${esc(perfil?.nome||user.displayName||'Cliente')}</p><button id="new">Agendar horário</button><button id="mine">Meus agendamentos</button><button id="logout">Sair da conta</button><button class="secondary" id="back">Voltar</button>`);
  el('new').onclick=agendar;el('mine').onclick=meus;el('logout').onclick=()=>auth.signOut();el('back').onclick=home;
}

const valorSelecionado=()=>[...selec].reduce((s,i)=>s+servicos[i][1],0);

function agendar(){if(!user)return login();selec=new Set();modo='';data='';hora='';modoHora='';desenharAgendamento()}

function desenharAgendamento(){
  view(`<h2>Novo agendamento</h2><p class="muted">▣ Dias e horários disponíveis conforme o Instituto</p>${input('name','● NOME COMPLETO','text',perfil?.nome||user.displayName||'')}${input('tel','● SEU WHATSAPP','tel',perfil?.telefone||'')}<h3>Escolha a modalidade</h3><div class="row"><button class="mode ${modo==='Presencial'?'selected':''}" id="p"><img src="logo-ibu.png" alt="">Atendimento presencial</button><button class="mode ${modo==='Online'?'selected':''}" id="o"><img src="logo-ibu.png" alt="">Atendimento Online</button></div><h3>Selecione os atendimentos desejados</h3><p class="muted">Marque um ou mais atendimentos. Os valores serão somados automaticamente.</p><div class="services" id="services"></div><div class="total" id="total"></div><h3>Escolha a data</h3><input type="date" id="date" min="${hoje()}" value="${esc(data)}"><p id="status" class="muted">Selecione uma data para consultar os horários.</p><button class="secondary" id="refresh">Atualizar horários</button><div class="slots" id="slots"></div><button id="confirm">Confirmar agendamento</button><button class="secondary" id="back">Voltar</button>`);
  const box=el('services');
  servicos.forEach(([n,p],i)=>{
    const lab=document.createElement('label'),c=document.createElement('input');
    c.type='checkbox';c.checked=selec.has(i);
    c.onchange=()=>{if(c.checked)selec.add(i);else selec.delete(i);el('total').textContent=`Total: ${reais(valorSelecionado())}${selec.has(7)?' + valor a consultar':''}`};
    const span=document.createElement('span');span.textContent=`${n} — ${p?reais(p):'Consultar valor por WhatsApp'}`;
    lab.append(c,span);box.append(lab);
  });
  el('total').textContent=`Total: ${reais(valorSelecionado())}`;
  el('p').onclick=()=>{modo='Presencial';hora='';modoHora='';el('p').classList.add('selected');el('o').classList.remove('selected');grade()};
  el('o').onclick=()=>{modo='Online';hora='';modoHora='';el('o').classList.add('selected');el('p').classList.remove('selected');grade()};
  el('date').onchange=()=>{data=el('date').value;hora='';modoHora='';consultar()};
  el('refresh').onclick=consultar;el('confirm').onclick=confirmar;el('back').onclick=conta;
  if(data)consultar();
}

function diaSemana(s){const [a,m,d]=s.split('-').map(Number);return new Date(a,m-1,d,12).getDay()+1}

function tempos(){
  const key='d'+diaSemana(data),periodos=horarios[key]===undefined?['08:00-20:00']:horarios[key],out=new Set();
  if(!Array.isArray(periodos))return [];
  for(const periodo of periodos){
    const [a,b]=String(periodo).split('-');
    if(!/^\d\d:\d\d$/.test(a||'')||!/^\d\d:\d\d$/.test(b||''))continue;
    const inicio=Number(a.slice(0,2))*60+Number(a.slice(3)),fim=Number(b.slice(0,2))*60+Number(b.slice(3));
    if(fim<inicio||inicio<0||fim>1439)continue;
    for(let t=inicio;t<=fim;t+=60)out.add(`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`);
  }
  return [...out].sort();
}

function permitido(h){return horarios['d'+diaSemana(data)+'_modalidades']?.[h]||'PO'}
function compativel(m){return m==='PO'||(m==='P'&&modo==='Presencial')||(m==='O'&&modo==='Online')}
function bloqueado(h){return bloqueio.integral===true||(h<'12:00'?bloqueio.manha===true:bloqueio.tarde===true)}
function futuro(h){return new Date(`${data}T${h}:00`).getTime()>Date.now()}

async function consultar(){
  if(!data)return msg('Escolha uma data.');
  if(data<hoje())return msg('Escolha uma data futura.');
  el('status').textContent='Consultando horários disponíveis...';el('slots').innerHTML='';
  try{
    const [c,d,b,livres]=await Promise.all([
      db.collection('configuracoes').doc('horarios_semanais').get({source:'server'}),
      db.collection('configuracoes').doc('estabelecimento').get({source:'server'}),
      db.collection('bloqueios').doc(data).get({source:'server'}),
      db.collection('disponibilidade').where('data','==',data).get({source:'server'})
    ]);
    horarios=c.exists?c.data():{};
    dias=d.exists&&Array.isArray(d.data().diasSemana)?d.data().diasSemana:[1,2,3,4,5,6,7];
    bloqueio=b.exists?b.data():{};
    ocupados=new Set(livres.docs.map(x=>x.data().hora));
    if(!dias.includes(diaSemana(data))){el('status').textContent='Este dia não está liberado pelo Instituto.';return}
    grade();
  }catch(e){el('status').textContent='Não foi possível consultar a disponibilidade. Tente novamente.';erro(e)}
}

function grade(){
  const box=el('slots');if(!box||!data)return;box.innerHTML='';
  const lista=tempos();
  el('status').textContent=lista.length?'Toque em um horário livre.':'Nenhum horário disponível neste dia.';
  for(const h of lista){
    const m=permitido(h),blocked=bloqueado(h)||m==='X',taken=ocupados.has(h),past=!futuro(h),wrong=!!modo&&!compativel(m);
    const label=blocked?'BLOQUEADO':taken?'OCUPADO':past?'ENCERRADO':wrong?'MODALIDADE DIFERENTE':h===hora?'SELECIONADO':'LIVRE';
    const button=document.createElement('button');
    button.className='slot '+(blocked?'blocked':taken||past||wrong?'off':h===hora?'selected':'');
    button.innerHTML=`<strong>${h}</strong><br>${label}<br>${blocked||taken||past?'':m==='PO'?'PRESENCIAL / ONLINE':m==='P'?'PRESENCIAL':'ONLINE'}`;
    button.disabled=blocked||taken||past||wrong;
    button.onclick=()=>{if(!modo)return msg('Primeiro escolha Atendimento Presencial ou Online.');hora=h;modoHora=m;grade();el('status').textContent=`Selecionado: ${h} • ${modo}`};
    box.append(button);
  }
}

async function confirmar(){
  if(busy)return;
  const n=el('name').value.trim(),t=el('tel').value.replace(/\D/g,'');
  if(n.length<2)return msg('Informe seu nome completo.');
  if(t.length<10)return msg('Informe seu WhatsApp com DDD.');
  if(!modo)return msg('Escolha atendimento Presencial ou Online.');
  if(!selec.size)return msg('Selecione pelo menos um atendimento.');
  if(!data)return msg('Escolha a data do atendimento.');
  if(!hora)return msg('Selecione um horário livre.');
  if(!futuro(hora))return msg('Este horário já passou.');
  if(!compativel(modoHora))return msg('Modalidade não disponível neste horário.');

  busy=true;el('confirm').disabled=true;

  try{
    const [cfg,est,bl]=await Promise.all([
      db.collection('configuracoes').doc('horarios_semanais').get({source:'server'}),
      db.collection('configuracoes').doc('estabelecimento').get({source:'server'}),
      db.collection('bloqueios').doc(data).get({source:'server'})
    ]);
    horarios=cfg.exists?cfg.data():{};
    dias=est.exists&&Array.isArray(est.data().diasSemana)?est.data().diasSemana:[1,2,3,4,5,6,7];
    bloqueio=bl.exists?bl.data():{};

    if(!dias.includes(diaSemana(data))||!tempos().includes(hora)||bloqueado(hora)||!compativel(permitido(hora))||permitido(hora)==='X')throw Error('Este horário ou modalidade não está mais disponível.');

    const id=data+'_'+hora;
    const ref=db.collection('disponibilidade').doc(id);
    const book=db.collection('agendamentos').doc(id);
    const detalhes=[...selec].sort((a,b)=>a-b).map(i=>servicos[i][0]).join(' + ');
    const s=`ATENDIMENTO ${modo.toUpperCase()}\n${detalhes}\nModalidade: ${modo}`;

    await db.runTransaction(async tr=>{
      const [free,existing]=await Promise.all([tr.get(ref),tr.get(book)]);
      if(free.exists||existing.exists)throw Error('Este horário acabou de ser reservado por outra pessoa.');
      tr.set(book,{clienteId:user.uid,nome:n,telefone:t,servico:s,data,hora,criadoEm:firebase.firestore.FieldValue.serverTimestamp()});
      tr.set(ref,{data,hora});
    });

    perfil={...(perfil||{}),nome:n,telefone:t};
    const resumo=`Olá, Instituto Brasil de Umbanda! Agendei um atendimento.\nNome: ${n}\nWhatsApp: ${t}\nServiços: ${s}\nModalidade: ${modo}\nData: ${dataBR(data)}\nHorário: ${hora}\nTotal dos valores definidos: ${reais(valorSelecionado())}`;

    view(`<div class="card center"><h2>AGENDAMENTO CONFIRMADO!</h2><p><b>${esc(n)}</b></p><p>${esc(s)}</p><p>${esc(dataBR(data))} às ${esc(hora)}</p><p>Modalidade: ${esc(modo)}</p><p>Seu horário foi registrado no sistema.</p><button id="wa">Enviar detalhes pelo WhatsApp</button><button class="secondary" id="back">Minha conta</button></div>`);
    el('wa').onclick=()=>window.open('https://wa.me/5519994584954?text='+encodeURIComponent(resumo),'_blank','noopener');
    el('back').onclick=conta;
  }catch(e){
    console.error('CONFIRMAR:',e);
    if(e?.code==='permission-denied'||e?.code==='firestore/permission-denied'){
      msg('Acesso não autorizado ao gravar o agendamento.');
    }else erro(e);
    if(el('confirm'))consultar();
  }finally{
    busy=false;if(el('confirm'))el('confirm').disabled=false;
  }
}

async function meus(){
  view('<h2>Meus agendamentos</h2><p>Carregando...</p>');
  try{
    const s=await db.collection('agendamentos').where('clienteId','==',user.uid).get({source:'server'});
    const ag=s.docs.map(d=>({id:d.id,...d.data()})).filter(a=>a.data&&a.hora&&new Date(a.data+'T'+a.hora+':00').getTime()>Date.now()).sort((a,b)=>(a.data+a.hora).localeCompare(b.data+b.hora));
    view(`<h2>Meus agendamentos</h2>${ag.length?'':'<p>Você não possui agendamentos futuros.</p>'}<div id="list"></div><p class="muted small">Agendamentos passados não aparecem nesta lista, mas continuam no histórico administrativo.</p><button id="refresh">Atualizar lista</button><button class="secondary" id="back">Voltar</button>`);
    const list=el('list');
    ag.forEach(a=>{const div=document.createElement('div');div.className='card booking';div.innerHTML=`<b>${esc(dataBR(a.data))} às ${esc(a.hora)}</b><p>${esc(a.servico)}</p><p>${esc(a.nome)}</p>`;list.append(div)});
    el('refresh').onclick=meus;el('back').onclick=conta;
  }catch(e){
    erro(e);
    view('<h2>Meus agendamentos</h2><p>Não foi possível consultar seus agendamentos.</p><button id="retry">Tentar novamente</button><button class="secondary" id="back">Voltar</button>');
    el('retry').onclick=meus;el('back').onclick=conta;
  }
}

function iniciar(){
  if(!window.AGENDA_IBU_CONFIG||!window.AGENDA_IBU_CONFIG.apiKey){
    view('<h2>Configuração pendente</h2><p>O site precisa da configuração do Firebase no arquivo <b>config.js</b>.</p>');return;
  }
  try{
    firebase.initializeApp(window.AGENDA_IBU_CONFIG);
    auth=firebase.auth();db=firebase.firestore();
    auth.onAuthStateChanged(async u=>{user=u;if(u){await carregarPerfil();conta()}else{perfil=null;home()}});
  }catch(e){erro(e)}
}
window.addEventListener('load',iniciar);
