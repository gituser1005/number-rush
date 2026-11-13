(() => {
  'use strict';
  // Safari may ignore viewport zoom limits; cancel its native pinch gestures too.
  for (const eventName of ['gesturestart','gesturechange','gestureend']) {
    document.addEventListener(eventName,e=>e.preventDefault(),{passive:false});
  }
  const $ = id => document.getElementById(id);
  const ops = ['+','-','*','/'];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  let hand=[], pools={}, examples={}, tokens=[], target=null, score=0, best=0, state='ready';
  let remaining=60, deadline=0, frame=0, noticeTimer=0, recent=[];
  const initialTwoQuestions=10;

  // Evaluate tokenized single-digit expressions using ordinary multiplication/division precedence.
  function evaluate(t) {
    if (!t.length || t.length % 2 !== 1) return null;
    const nums=[];
    for (let i=0;i<t.length;i++) {
      if (i%2===0) {
        if (!hand.some(n=>String(n)===t[i])) return null;
        nums.push(Number(t[i]));
      } else if (!ops.includes(t[i])) return null;
    }
    const chunks=[nums[0]], low=[];
    for(let i=1;i<nums.length;i++) {
      const operator=t[2*i-1], number=nums[i];
      if(operator==='*' || operator==='/') {
        const last=chunks.pop();
        const value=operator==='*' ? last*number : last/number;
        if(!Number.isFinite(value)) return null;
        chunks.push(value);
      } else {
        chunks.push(number);low.push(operator);
      }
    }
    let result=chunks[0];
    for(let i=0;i<low.length;i++) result += low[i]==='+' ? chunks[i+1] : -chunks[i+1];
    return Number.isFinite(result) ? result : null;
  }

  // Enumerate reachable targets from expressions containing exactly 2 or 3 number tokens.
  function buildPools() {
    pools={2:new Set(),3:new Set()};
    examples={2:new Map(),3:new Map()};
    for(let length=2;length<=3;length++) {
      function walk(t,k) {
        if(k===length) {
          const value=evaluate(t);
          if(value!==null && Number.isInteger(value) && value>=9 && value<=70) {
            pools[length].add(value);
            if(!examples[length].has(value)) examples[length].set(value,[...t]);
          }
          return;
        }
        for(const digit of hand) {
          if(k===0) walk([String(digit)],1);
          else for(const operator of ops) walk([...t,operator,String(digit)],k+1);
        }
      }
      walk([],0);
    }
  }
  function phase() {
    if(score<initialTwoQuestions) return {n:2,label:`数字2個 · ${score+1}/${initialTwoQuestions}問`};
    return {n:3,label:'数字3個 · 継続'};
  }
  function newTarget() {
    const n=phase().n, full=[...pools[n]];
    let candidates=full.filter(v=>!recent.includes(v));
    if(n>2) {
      const shorter=pools[2];
      const harder=candidates.filter(v=>!shorter.has(v));
      if(harder.length) candidates=harder;
    }
    if(!candidates.length) candidates=full.filter(v=>v!==target);
    if(!candidates.length) candidates=full;
    // Guaranteed-reachable fallback (hand digits are always 3...9).
    const result=candidates.length ? pick(candidates) : hand[0]+hand[1];
    recent.push(result);
    if(recent.length>6) recent.shift();
    return result;
  }
  function drawTime() {
    $('time').textContent=Math.max(0,remaining).toFixed(1);
    $('fill').style.width=Math.max(0,Math.min(100,remaining/60*100))+'%';
    $('fill').style.background=remaining<10 ? '#ee8c8c' : remaining<20 ? '#f0c37b' : '#9fc8fa';
  }
  function formatExpression(expression) {
    return expression.map(x=>({'*':'×','/':'÷','-':'−'}[x]||x)).join(' ');
  }
  function render() {
    drawTime();
    $('score').textContent=score;
    $('target').textContent=target===null?'?':target;
    $('stage').textContent=state==='ready'?'スタート前':phase().label;
    $('expression').textContent=tokens.length
      ? formatExpression(tokens)
      : '—';
    const answer=state==='over' ? examples[phase().n].get(target)||examples[2].get(target) : null;
    $('final-answer').textContent=answer ? `解答例：${formatExpression(answer)} = ${target}` : '';
    $('final-answer').classList.toggle('hidden',!answer);
    $('best').textContent=`最高記録：${best}問`;
    const active=state==='playing' && performance.now()<deadline;
    document.querySelectorAll('[data-num]').forEach(b=>b.disabled=!active||tokens.length%2!==0||tokens.length>=49);
    document.querySelectorAll('[data-op]').forEach(b=>b.disabled=!active||tokens.length%2===0||tokens.length>=49);
    $('back').disabled=!active||!tokens.length;
    $('clear').disabled=!active||!tokens.length;
    $('check').disabled=!active||evaluate(tokens)===null;
  }
  function notice(text,good=false) {
    clearTimeout(noticeTimer);
    $('message').textContent=text;
    $('message').className='message'+(good?' good':'');
    if(text) noticeTimer=setTimeout(()=>{$('message').textContent='';},1100);
  }
  function finish() {
    if(state!=='playing') return;
    state='over';remaining=0;cancelAnimationFrame(frame);
    best=Math.max(best,score);
    $('status').textContent='TIME UP';
    $('setup-title').textContent='タイムアップ！';
    $('setup-description').textContent='今回の手札：'+hand.join('・');
    $('final-score').textContent=score+' 問';
    $('final-score').classList.remove('hidden');
    $('start').textContent='もう一度挑戦';
    $('setup').classList.remove('hidden');
    notice('');render();
  }
  function tick() {
    if(state!=='playing') return;
    remaining=Math.max(0,(deadline-performance.now())/1000);
    drawTime();
    if(remaining<=0) {finish();return;}
    frame=requestAnimationFrame(tick);
  }
  function makeHand() {
    const available=[3,4,5,6,7,8,9]; // 2 excluded; 5 currently retained.
    for(let i=available.length-1;i>0;i--) {
      const j=Math.floor(Math.random()*(i+1));
      [available[i],available[j]]=[available[j],available[i]];
    }
    hand=available.slice(0,4).sort((a,b)=>a-b);
    $('number-keys').replaceChildren();
    for(const n of hand) {
      const button=document.createElement('button');
      button.className='key';button.dataset.num=String(n);button.textContent=String(n);
      button.addEventListener('click',()=>append(String(n)));
      $('number-keys').appendChild(button);
    }
  }
  function start() {
    cancelAnimationFrame(frame);
    state='playing';remaining=60;score=0;tokens=[];target=null;recent=[];
    makeHand();buildPools();target=newTarget();
    deadline=performance.now()+60000;
    $('status').textContent='PLAYING';$('setup').classList.add('hidden');
    notice('');render();frame=requestAnimationFrame(tick);
  }
  function append(token) {
    if(state!=='playing') return;
    if(performance.now()>=deadline) {finish();return;}
    if(tokens.length>=49) return;
    const isNum=hand.some(n=>String(n)===token), needNum=tokens.length%2===0;
    if(isNum!==needNum || (!isNum && !ops.includes(token))) return;
    tokens.push(token);notice('');render();
  }
  function check() {
    if(state!=='playing') return;
    if(performance.now()>=deadline) {finish();return;}
    const value=evaluate(tokens);
    if(value===null) return;
    if(Math.abs(value-target)<1e-9) {
      score++;best=Math.max(best,score);deadline+=5000;
      remaining=Math.max(0,(deadline-performance.now())/1000);
      target=newTarget();tokens=[];
      notice('正解！ +5秒',true);render();
    } else notice('不正解');
  }
  function reset() {
    cancelAnimationFrame(frame);
    state='ready';remaining=60;score=0;tokens=[];target=null;
    $('status').textContent='3–9 CHALLENGE';
    $('setup-title').textContent='数字を作ろう！';
    $('setup-description').innerHTML='手札は3〜9からランダムに4枚。<br>2は登場しません。';
    $('final-score').classList.add('hidden');
    $('start').textContent='ゲームスタート';$('setup').classList.remove('hidden');
    notice('');render();
  }
  document.querySelectorAll('[data-op]').forEach(b=>b.addEventListener('click',()=>append(b.dataset.op)));
  $('back').addEventListener('click',()=>{if(state==='playing'){tokens.pop();notice('');render();}});
  $('clear').addEventListener('click',()=>{if(state==='playing'){tokens=[];notice('');render();}});
  $('check').addEventListener('click',check);
  $('start').addEventListener('click',start);
  $('reset').addEventListener('click',reset);
  document.addEventListener('keydown',e=>{
    if(state!=='playing'||['INPUT','BUTTON','TEXTAREA'].includes(e.target.tagName))return;
    if((/^[3-9]$/.test(e.key)&&hand.includes(Number(e.key)))||ops.includes(e.key)) {e.preventDefault();append(e.key);}
    else if(e.key==='Backspace') {e.preventDefault();tokens.pop();notice('');render();}
    else if(e.key==='Escape') {e.preventDefault();tokens=[];notice('');render();}
    else if(e.key==='Enter') {e.preventDefault();check();}
  });
  render();
})();
