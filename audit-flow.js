// 勤務表の確認・修正。実データは認証済みフォームGASから取得する。
let afEditor = null;
let afOpenSequence = 0;
const afLabels = {kind:'種別',start:'出勤',end:'退勤',dept:'稼働部門',content:'実施内容'};
const afStyle = document.createElement('style');
afStyle.textContent = `
  #audit-flow-section{padding:14px 2px 20px;border-bottom:1px solid var(--border2)}
  .af-heading{font-size:16px;font-weight:700;margin-bottom:6px}
  .af-caption{font-size:12px;color:var(--muted);line-height:1.8;margin-bottom:12px}
  .af-card{background:var(--surface);border:1px solid var(--border2);border-radius:14px;padding:16px;margin:10px 0;overflow-wrap:anywhere}
  .af-card-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
  .af-tag{font-size:11px;padding:4px 8px;background:var(--amber-glow);color:var(--text);border-radius:6px;white-space:nowrap}
  .af-tag.pending{background:var(--accent-glow)}
  .af-issues{font-size:13px;line-height:1.8;padding-left:20px;margin:8px 0 14px}
  .af-button{padding:13px 14px;border:1px solid var(--border2);border-radius:10px;background:var(--surface2);color:var(--text);font:inherit;font-size:14px;font-weight:700;cursor:pointer;width:100%;min-height:46px}
  .af-button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
  .af-button:disabled{opacity:.55;cursor:wait}
  #audit-correction-screen{display:none;flex-direction:column;gap:16px;padding-top:4px;padding-bottom:50px;overflow-y:auto}
  .af-summary{display:grid;grid-template-columns:80px minmax(0,1fr);font-size:13px;line-height:1.8;gap:6px 10px}
  .af-summary dt{color:var(--muted)}.af-summary dd{white-space:pre-wrap;overflow-wrap:anywhere}
  .af-field{display:block;margin-bottom:16px;font-size:13px;line-height:1.7}
  .af-field>span{display:block;font-weight:700;margin-bottom:7px}
  .af-field input,.af-field select,.af-field textarea{display:block;width:100%;min-width:0;background:var(--surface);color:var(--text);border:1px solid var(--border2);border-radius:9px;padding:12px;font:inherit;font-size:16px}
  .af-field textarea{min-height:94px;resize:vertical}
  .af-time{display:flex;align-items:center;gap:8px}.af-time select{flex:1}
  .af-focus{background:var(--amber-glow);border:1px solid var(--amber);border-radius:12px;padding:14px;margin-bottom:16px}
  .af-focus .af-field:last-child{margin-bottom:0}
  .af-error{color:var(--red);font-size:13px;white-space:pre-wrap;line-height:1.7;margin:8px 0}
  .af-review-row{border-bottom:1px solid var(--border);padding:12px 0;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}
  .af-review-row strong{display:block;margin-bottom:6px}.af-review-old{color:var(--muted)}
  .af-actions{display:flex;gap:10px;margin-top:14px}.af-actions>*{flex:1;min-width:0}
  .af-error:empty{display:none}
`;
document.head.appendChild(afStyle);
const afScreen = document.createElement('div');
afScreen.id = 'audit-correction-screen';
afScreen.className = 'screen';
document.getElementById('approval-screen').after(afScreen);

function afHideEditor_() {
  afOpenSequence++;
  afScreen.style.display = 'none';
  afScreen.replaceChildren();
  afEditor = null;
}
function renderAuditFlow_() {
  const section = document.getElementById('audit-flow-section');
  section.style.display = 'block';
  const editable = auditFlowItems.filter(item => item.canEdit).length;
  section.innerHTML = '<h2 class="af-heading">勤務表の確認・修正' + (editable ? ' <span class="af-tag">要確認 '+editable+'日</span>' : '') + '</h2>'
    + '<p class="af-caption">毎月1日・10日・20日の朝に、前日までの勤務表を確認します。指摘のある日を開いて修正してください。</p>';
  if (!auditFlowItems.length) {
    const empty = document.createElement('p'); empty.className = 'af-caption'; empty.textContent = '現在、対応が必要な指摘はありません。'; section.appendChild(empty); return;
  }
  auditFlowItems.forEach(item => {
    const card = document.createElement('article'); card.className = 'af-card';
    card.innerHTML = '<div class="af-card-top"><strong>'+escapeHtml_(withWeekday_(item.date))+'</strong><span class="af-tag'+(!item.canEdit?' pending':'')+'">'+escapeHtml_(item.status)+'</span></div>'
      + '<ul class="af-issues">'+item.issues.map(text => '<li>'+escapeHtml_(text)+'</li>').join('')+'</ul>'
      + (item.fields.length ? '<p class="af-caption">確認する項目：'+escapeHtml_(item.fields.join('・'))+'</p>' : '')
      + '<button class="af-button '+(item.canEdit?'primary':'')+'">'+(item.canEdit?'確認して修正する':'申請内容を見る')+'</button>';
    card.querySelector('button').onclick = () => afOpen_(item.key);
    section.appendChild(card);
  });
}
function afHeader_(date) {
  afScreen.innerHTML = '<div class="apply-screen-header"><button class="back-btn" id="af-back">◀ 各種確認</button><strong style="font-size:14px">勤務表の修正</strong></div>'
    + (date ? '<div><h2 class="af-heading">'+escapeHtml_(withWeekday_(date))+'</h2><p class="af-caption">対象日の内容を確認して、必要な項目を修正します。</p></div>' : '');
  document.getElementById('af-back').onclick = afBack_;
}
function afBack_() {
  if (afEditor && afEditor.busy) return;
  afHideEditor_();
  document.getElementById('approval-screen').style.display = 'flex';
  loadApprovalQueue(true, true);
}
async function afOpen_(key) {
  afHideEditor_();
  const sequence = afOpenSequence, user = currentUser && currentUser.id;
  document.getElementById('approval-screen').style.display = 'none';
  afScreen.style.display = 'flex'; afScreen.scrollTop = 0; afHeader_('');
  const loading = document.createElement('p'); loading.className = 'af-caption'; loading.textContent = '勤務表を確認しています…'; afScreen.appendChild(loading);
  try {
    const data = await postJson_({requestType:'auditFlow',action:'detail',empId:user,key});
    if(sequence!==afOpenSequence || !currentUser || currentUser.id!==user)return;
    if(data.status!=='ok')throw new Error(data.message || '取得に失敗しました');
    if(data.resolved){showToast(data.message);afBack_();return;}
    afEditor = {data, key, user, requestId: crypto.randomUUID ? crypto.randomUUID() : 'audit_'+Date.now()+'_'+Math.random().toString(36).slice(2),busy:false};
    afHeader_(data.date);
    if(data.pending){afRenderPending_(data);return;}
    afRenderForm_();
  }catch(error){
    if(sequence!==afOpenSequence)return;
    loading.textContent = error.message; loading.className = 'af-error';
  }
}
function afRenderPending_(data) {
  const card = document.createElement('div'); card.className = 'af-card';
  card.innerHTML = '<span class="af-tag pending">上長確認待ち</span><p class="af-caption" style="margin-top:12px">上長の承認後に勤務表へ反映されます。</p>';
  const p = data.application;
  if(p){Object.keys(p.changes).forEach(key=>card.appendChild(afReviewRow_(key,p.before[key],p.changes[key])));
    const reason=document.createElement('p');reason.className='af-caption';reason.textContent='修正理由：'+p.reason;card.appendChild(reason);}
  afScreen.appendChild(card);
}
function afRenderForm_() {
  const d = afEditor.data;
  const form = document.createElement('form'); form.id='af-form'; form.noValidate=true;
  form.innerHTML = '<div class="af-focus"><strong style="font-size:13px">確認してほしい内容</strong><ul class="af-issues">'+d.issues.map(text=>'<li>'+escapeHtml_(text)+'</li>').join('')+'</ul></div>'
    + '<details class="af-card"><summary style="font-size:13px;cursor:pointer">現在の勤務記録を見る</summary><dl class="af-summary" style="margin-top:12px">'+Object.keys(afLabels).map(key=>'<dt>'+afLabels[key]+'</dt><dd>'+escapeHtml_(d.values[key]||'未入力')+'</dd>').join('')+'</dl></details>';
  if(d.guidance){const guidance=document.createElement('p');guidance.className='af-caption';guidance.textContent=d.guidance;form.appendChild(guidance);}
  d.fields.forEach(field=>{
    const label=document.createElement('label');label.className='af-field';
    const title=document.createElement('span');title.textContent=field.label+'（修正する項目）';label.appendChild(title);
    let input;
    if(field.key==='start'||field.key==='end'){
      input=document.createElement('div');input.className='af-time';
      const time=(d.values[field.key]||'').split(':');
      ['hour','minute'].forEach((part,index)=>{
        const select=document.createElement('select');select.id='af-'+field.key+'-'+part;select.setAttribute('aria-label',field.label+(index?'の分':'の時'));
        select.add(new Option('未入力',''));
        for(let n=0;n<(index?60:36);n++){const val=index?String(n).padStart(2,'0'):String(n);select.add(new Option(val+(index?'分':'時'),val));}
        select.value=!time[index]?'':index?time[index]:String(Number(time[index]));input.appendChild(select);
      });
    }else if(field.key==='kind'){
      input=document.createElement('select');input.add(new Option('種別を選択',''));
      d.kinds.forEach(kind=>input.add(new Option(kind,kind))); input.value=d.values.kind;
    }else if(field.key==='dept'){
      input=document.createElement('select');input.add(new Option('稼働部門を選択',''));
      Array.from(document.getElementById('work-dept').options).filter(opt=>opt.value).forEach(opt=>input.add(new Option(opt.text,opt.value)));
      if(d.values.dept&&!Array.from(input.options).some(opt=>opt.value===d.values.dept))input.add(new Option(d.values.dept,d.values.dept));
      input.value=d.values.dept;
    }else{input=document.createElement('textarea');input.maxLength=1000;input.value=d.values[field.key]||'';input.placeholder='例：○○現場での施工・点検';}
    if(!['start','end'].includes(field.key))input.id='af-'+field.key;
    label.appendChild(input);form.appendChild(label);
  });
  if(d.fields.some(field=>field.key==='end')){const hint=document.createElement('p');hint.className='af-caption';hint.textContent='翌日に退勤した場合は、翌1:00なら25時00分を選択してください。';form.appendChild(hint);}
  if(d.fields.some(field=>field.key==='kind')){const hint=document.createElement('p');hint.className='af-caption';hint.textContent='有給・振休・代休の午前／午後は、その種別を選択してください。全日の休暇や欠勤の登録が必要な場合は、理由を記入して勤怠担当者へ確認を依頼できます。';form.appendChild(hint);}
  const reason=document.createElement('label');reason.className='af-field';reason.innerHTML='<span>修正・確認の理由（必須）</span><textarea id="af-reason" maxlength="1000" placeholder="例：退勤の打刻と実施内容の入力を忘れたため"></textarea>';form.appendChild(reason);
  const error=document.createElement('p');error.id='af-error';error.className='af-error';error.setAttribute('role','alert');form.appendChild(error);
  const caption=document.createElement('p');caption.className='af-caption';caption.textContent=(d.managerName?'承認者：'+d.managerName+'。':'')+'申請後、上長の承認で勤務表に反映されます。';form.appendChild(caption);
  const button=document.createElement('button');button.type='submit';button.className='af-button primary';button.textContent=d.fields.length?'修正内容を確認する':'確認依頼の内容を確認する';form.appendChild(button);
  if(d.fields.length){const route=document.createElement('button');route.type='button';route.id='af-consult';route.className='af-button';route.style.marginTop='10px';route.textContent='自分で修正できないため確認を依頼する';route.onclick=()=>afReview_(true);form.appendChild(route);}
  form.onsubmit=event=>{event.preventDefault();afReview_(false);};
  afScreen.appendChild(form);
}
function afReviewRow_(key,before,after) {
  const row=document.createElement('div');row.className='af-review-row';
  row.innerHTML='<strong>'+escapeHtml_(afLabels[key]||key)+'</strong><span class="af-review-old">'+escapeHtml_(before||'未入力')+'</span><br>↓<br>'+escapeHtml_(after||'空欄');return row;
}
function afReview_(consult) {
  const d=afEditor.data,values={},reason=document.getElementById('af-reason').value.trim();
  document.getElementById('af-error').textContent='';
  try{
    if(!reason)throw new Error('修正・確認の理由を入力してください。');
    if(!consult)d.fields.forEach(field=>{
      if(['start','end'].includes(field.key)){
        const hour=document.getElementById('af-'+field.key+'-hour').value,minute=document.getElementById('af-'+field.key+'-minute').value;
        if((hour==='')!==(minute===''))throw new Error(field.label+'の時と分を両方選択してください。');
        values[field.key]=hour===''?'':hour+':'+minute;
      }else values[field.key]=document.getElementById('af-'+field.key).value.trim();
    });
    const next=Object.assign({},d.values,values),full=['有給','欠勤','特別','慶弔','振休','代休','明休'].includes(next.kind);
    if(!consult&&d.fields.length){
      if(!next.kind||(!full&&Object.keys(afLabels).some(key=>!next[key])))throw new Error('勤務日の種別・出勤・退勤・稼働部門・実施内容を入力してください。');
      if(full&&(next.start||next.end))throw new Error('全休のままにする場合は出勤・退勤を空欄にしてください。');
    }
    afEditor.submission={requestType:'auditFlow',action:'submit',empId:afEditor.user,key:afEditor.key,version:d.version,requestId:afEditor.requestId,reason,values,consult:!!consult};
    document.getElementById('af-form').style.display='none';
    document.getElementById('af-review')?.remove();
    const review=document.createElement('div');review.id='af-review';
    review.innerHTML='<h3 class="af-heading">'+(consult?'確認依頼':'修正申請')+'の内容</h3><p class="af-caption">'+escapeHtml_(withWeekday_(d.date))+'／'+escapeHtml_(currentUser.name)+'</p>';
    Object.keys(values).filter(key=>values[key]!==d.values[key]).forEach(key=>review.appendChild(afReviewRow_(key,d.values[key],values[key])));
    const note=document.createElement('p');note.className='af-review-row';note.textContent='理由：'+reason;review.appendChild(note);
    review.insertAdjacentHTML('beforeend','<p class="af-caption" style="margin-top:12px">'+(consult?'上長・勤怠担当者に確認を依頼します。勤務表の修正後に承認されます。':'上長の承認後に勤務表へ反映します。')+'</p><p id="af-submit-error" class="af-error" role="alert"></p><div class="af-actions"><button id="af-edit" class="af-button">入力に戻る</button><button id="af-submit" class="af-button primary">'+(consult?'確認を依頼する':'この内容で申請する')+'</button></div>');
    afScreen.appendChild(review);document.getElementById('af-edit').onclick=()=>{review.remove();document.getElementById('af-form').style.display='block';};document.getElementById('af-submit').onclick=afSubmit_;afScreen.scrollTop=0;
  }catch(error){document.getElementById('af-error').textContent=error.message;}
}
async function afSubmit_() {
  if(!afEditor||afEditor.busy)return;
  const editor=afEditor;editor.busy=true;
  ['af-submit','af-edit','af-back'].forEach(id=>document.getElementById(id).disabled=true);
  document.getElementById('af-submit').textContent='送信中…';document.getElementById('af-submit-error').textContent='';
  try{
    const data=await postJson_(editor.submission);
    if(afEditor!==editor)return;
    if(data.status!=='ok')throw new Error(data.message||'申請に失敗しました');
    editor.busy=false;showToast(data.message||'申請を受け付けました');afBack_();
  }catch(error){
    if(afEditor!==editor)return;
    document.getElementById('af-submit-error').textContent=error.message+' 内容を確認して再送してください。';
    ['af-submit','af-edit','af-back'].forEach(id=>document.getElementById(id).disabled=false);
    document.getElementById('af-submit').textContent='同じ内容で再送する';editor.busy=false;
  }
}
// 前面復帰時は軽い一覧・件数の照会だけを行い、全員の勤務表チェックは実行しない。
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible'||!currentUser)return;
  if(document.getElementById('approval-screen').style.display==='flex')loadApprovalQueue(false,true);
  else checkManagerStatus();
});
