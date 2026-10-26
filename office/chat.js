// Khung chat giao việc cho Trợ lý / phòng ban / một người, và nút Triệu tập họp.
// Một cuộc trò chuyện = một phiên Claude (session). Tin nhắn sau nối tiếp phiên đó (--resume), kể cả khi bạn không bấm nút mà gõ trả lời khác.
// Luồng: gõ việc → (mặc định) lập kế hoạch ở chế độ chỉ-đọc → bạn duyệt / gõ trả lời để chỉnh / bỏ → chạy thật → báo cáo (cũng về Hộp thư).
(() => {
const { api, el, esc, md, toast, modal, field, sel, checks, picked } = OA;
const log = el('div', { class: 'chat-b' });
const target = el('select', {}), planCk = el('input', { type: 'checkbox', checked: true }), bashCk = el('input', { type: 'checkbox' });
const text = el('textarea', { rows: 2 });
const sendBtn = el('button', { onclick: () => send() }, 'Gửi'), stopBtn = el('button', { class: 'mini', style: 'display:none', onclick: async () => { if (current) { await current.ctl.stop(); addMsg('sys', '⏹ Đã dừng. Bạn có thể nhắn tiếp, mình nối tiếp cuộc trò chuyện.'); setRunning(null); } } }, '⏹ Dừng');
const status = el('span', { class: 'cs' }), convInfo = el('div', { class: 'convinfo' });
const panel = el('div', { class: 'chat', id: 'chat', style: 'display:none' },
  el('div', { class: 'chat-h' }, el('b', {}, '💬 Giao việc'), status, stopBtn,
    el('button', { class: 'mini', title: 'Bắt đầu việc mới (phiên mới)', onclick: () => newConv(true) }, '🆕 Mới'),
    el('button', { class: 'mini', onclick: () => meetingForm() }, '🗣️ Họp'), el('button', { class: 'mini', onclick: () => panel.classList.toggle('min') }, '–'), el('button', { class: 'mini', onclick: () => panel.style.display = 'none' }, '×')),
  log, convInfo, el('div', { class: 'chat-o' }, el('label', {}, 'Giao cho ', target), el('label', { class: 'ck' }, planCk, ' Lập kế hoạch cho tôi duyệt trước'), el('label', { class: 'ck' }, bashCk, ' Cho phép chạy lệnh (Bash), cẩn thận')),
  el('div', { class: 'chat-i' }, text, sendBtn));
document.body.append(panel);
document.getElementById('btnChat').onclick = () => { panel.style.display = panel.style.display === 'none' ? 'flex' : 'none'; if (panel.style.display === 'flex') text.focus(); };
function fillTargets() {
  const cur = target.value; target.replaceChildren(el('option', { value: 'assistant' }, 'Trợ lý tự phân công'));
  ORG.rooms.filter(r => r.kind === 'dept' && r.headId).forEach(r => target.append(el('option', { value: 'dept:' + r.id }, 'Phòng ' + r.name + ' (trưởng phòng làm)')));
  ORG.people.filter(p => (p.role === 'head' || p.role === 'staff') && p.status !== 'suspended').forEach(p => target.append(el('option', { value: 'agent:' + p.id }, p.name + ' · ' + p.title)));
  if (cur && [...target.options].some(o => o.value === cur)) target.value = cur;
}
fillTargets();
function addMsg(cls, html) { const e = el('div', { class: 'msg ' + cls, html }); log.append(e); log.scrollTop = log.scrollHeight; return e; }
const bubble = (t, who, err) => addMsg(err ? 'bot err' : 'bot', `<div class="who">${esc(who)}</div>${md(t)}`);
addMsg('sys', 'Giao việc cho đội ở đây. Mặc định Claude sẽ <b>lập kế hoạch trước</b> để bạn duyệt. Khi Trợ lý hỏi hoặc đưa phương án, bạn có thể bấm nút <b>hoặc gõ câu trả lời của mình</b>, mình sẽ nối tiếp đúng cuộc trò chuyện. Bấm <b>🆕 Mới</b> khi muốn giao việc khác.');

// ---------- cuộc trò chuyện ----------
const fam = () => OA.engine().startsWith('claude') ? 'claude' : 'mock';
let current = null, conv = null, card = null;
const whoName = t => t === 'assistant' ? 'Trợ lý' : t.startsWith('dept:') ? OA.nameOf((ORG.rooms.find(r => r.id === t.slice(5)) || {}).headId) : OA.nameOf(t.slice(6));
function resolve(t) { if (t === 'assistant') return ''; if (t.startsWith('dept:')) return (ORG.rooms.find(r => r.id === t.slice(5)) || {}).headId || ''; return t.slice(6); }
function showConv() {
  text.placeholder = conv && conv.sid ? `Trả lời hoặc nhắn tiếp cho ${conv.who}… (gõ khác các phương án cũng được)` : 'Giao việc, ví dụ: chuẩn bị nội dung cho đợt thử thách 3 ngày tuần sau...';
  convInfo.innerHTML = conv && conv.sid ? `🧵 Đang trò chuyện với <b>${esc(conv.who)}</b>${conv.pendingPlan ? ' · kế hoạch đang chờ bạn duyệt' : ''} · <a href="#" class="newc">việc mới</a>` : '';
  const a = convInfo.querySelector('.newc'); if (a) a.onclick = e => { e.preventDefault(); newConv(true); };
}
function newConv(say) { conv = null; disableCard(); if (say) addMsg('sys', '🆕 Cuộc trò chuyện mới. Tin nhắn tiếp theo sẽ là một việc mới.'); showConv(); }
function disableCard() { if (card) { card.querySelectorAll('button').forEach(b => b.disabled = true); card = null; } }
target.onchange = () => { if (conv) newConv(true); };
document.getElementById('engineSel').addEventListener('change', () => { if (conv && conv.fam !== fam()) { addMsg('sys', 'Đã đổi engine, phiên cũ không dùng tiếp được nên tin nhắn sau sẽ bắt đầu phiên mới.'); newConv(false); } });
showConv();

function setRunning(c) { current = c; stopBtn.style.display = c ? 'inline-block' : 'none'; sendBtn.disabled = !!c; panel.classList.toggle('busy', !!c); status.textContent = c ? 'đang chạy…' : ''; }
function compose(req, agent, plan) {
  const P = OA.prompts;
  const head = agent ? P.agentHead.replace('{request}', req) : P.assistantHead.replace('{request}', req).replace('{target}', P.targetAssistant);
  return head + (plan ? P.planMode : (agent ? P.agentRules : P.runRules));
}
const rulesFor = agent => agent ? OA.prompts.agentRules : OA.prompts.runRules;
async function start(opts) {
  if (!OA.prompts) { toast('Chưa tải xong cấu hình, thử lại sau giây lát.', 'err'); return; }
  const r = await OA.start({ kind: 'chat', mode: opts.mode, prompt: opts.prompt, resume: opts.resume || '', agent: opts.agent, allowBash: bashCk.checked, label: opts.label });
  if (!r) { if (opts.userText && !text.value) text.value = opts.userText; return; }
  const ctl = OA.track(r.job, ev => {
    if (ev.type !== 'assistant' || !ev.message || !Array.isArray(ev.message.content)) return;
    ev.message.content.forEach(c => {
      if (c.type === 'text' && c.text && c.text.trim() && !ev.parent_tool_use_id) bubble(c.text, opts.who);
      else if (c.type === 'tool_use') {
        const i = c.input || {};
        if (c.name === 'Agent' || c.name === 'Task') addMsg('sys', `📨 giao việc cho <b>${esc(OA.nameOf(i.subagent_type))}</b>${i.description ? ': ' + esc(i.description) : ''}`);
        else if ((c.name === 'Write' || c.name === 'Edit') && i.file_path && !/office[\\/](state|meetings)/.test(i.file_path)) addMsg('sys', `📝 ghi <code>${esc(String(i.file_path).split(/[\\/]/).slice(-2).join('/'))}</code>`);
        else if (c.name === 'AskUserQuestion') addMsg('sys', '❓ Trợ lý muốn hỏi bạn. Hãy gõ câu trả lời vào ô chat.');
      }
    });
  }, res => finish(res, opts));
  setRunning({ ctl, id: r.job });
}
function finish(res, opts) {
  setRunning(null);
  const lost = /No conversation found/i.test((res.stderr || '') + (res.result || ''));
  if (lost && opts.resume && !opts.retried) {                    // phiên cũ không còn (đổi engine / máy chủ khởi động lại): mở phiên mới, giữ nội dung
    addMsg('sys', 'Phiên trước không còn nên mình mở phiên mới và gửi lại tin nhắn của bạn.');
    const req = conv && conv.request ? conv.request + '\n\nGiám đốc nhắn thêm: ' + opts.userText : opts.userText;
    conv = { sid: '', fam: fam(), agent: opts.agent, who: opts.who, target: target.value, request: req, label: opts.label, pendingPlan: false };
    start(Object.assign({}, opts, { resume: '', retried: true, prompt: compose(req, opts.agent, opts.mode === 'plan') })); return;
  }
  if (!res.texts.length && res.result) bubble(res.result, opts.who, res.isError);
  if (!res.result && !res.texts.length) addMsg('sys err', 'Không nhận được kết quả.' + (res.stderr ? `<pre>${esc(res.stderr)}</pre>` : ''));
  if (res.isError && /not logged in|\/login/i.test(res.result || '')) { OA.refreshBridge().then(OA.loginHelp); return; }
  if (res.sid && conv) { conv.sid = res.sid; conv.fam = fam(); }
  if (res.isError) { showConv(); return; }
  if (opts.mode === 'plan') planCard(res, opts);
  else { if (conv) conv.pendingPlan = false; addMsg('sys ok', `✅ Xong.${res.cost ? ' Chi phí ước tính $' + res.cost.toFixed(3) + '.' : ''} Bản nháp nằm trong <code>workspace/</code>, báo cáo ở 📥 Hộp thư. Bạn có thể nhắn tiếp để chỉnh.`); }
  showConv();
}
function planCard(res, opts) {
  disableCard();
  const planText = res.texts.join('\n') + (res.result || '');
  const box = addMsg('card', '<div class="cardtitle">Kế hoạch đang chờ bạn duyệt</div><div class="dim">Bấm nút, hoặc gõ câu trả lời / lựa chọn khác vào ô chat để mình cập nhật kế hoạch.</div>'), row = el('div', { class: 'row' });
  card = box; conv.pendingPlan = true;
  const ok = el('button', { class: 'ok', onclick: () => approve(text.value.trim()) }, '✅ Duyệt và chạy');
  const rev = el('button', { onclick: () => { text.placeholder = 'Nói bạn muốn chỉnh gì trong kế hoạch, rồi bấm Gửi...'; text.focus(); } }, '✏️ Chỉnh kế hoạch');
  const no = el('button', { onclick: () => { disableCard(); conv.pendingPlan = false; addMsg('sys', 'Đã bỏ kế hoạch, chưa làm gì cả. Bạn có thể nhắn tiếp hoặc bấm 🆕 Mới.'); showConv(); } }, '✖ Bỏ');
  row.append(ok, rev, no);
  if (/##\s*Đề xuất lịch/.test(planText)) row.append(el('button', { onclick: () => OA.openSchedule({ name: (opts.label || 'Việc lặp lại').slice(0, 60), prompt: (conv && conv.request) || opts.label }) }, '📅 Thêm vào lịch'));
  box.append(row);
}
function approve(note) {
  if (current || !conv) return;
  disableCard(); conv.pendingPlan = false; text.value = '';
  addMsg('user', esc(note ? 'Duyệt. ' + note : 'Duyệt kế hoạch, bắt đầu làm.'));
  start({ mode: 'run', agent: conv.agent, who: conv.who, label: conv.label, resume: conv.sid, userText: note || 'Duyệt kế hoạch', prompt: OA.prompts.approve.replace('{note}', note ? '. Ghi chú thêm của giám đốc: ' + note : '') + rulesFor(conv.agent) });
}
function send() {
  const t = text.value.trim(); if (!t) return;
  if (current) { toast('Đang chạy việc trước. Chờ xong hoặc bấm ⏹ Dừng rồi nhắn tiếp.', 'err'); return; }
  text.value = ''; addMsg('user', esc(t));
  const P = OA.prompts, plan = planCk.checked;
  if (conv && conv.sid && conv.fam === fam() && conv.target === target.value) {
    if (conv.pendingPlan) { disableCard(); start({ mode: 'plan', agent: conv.agent, who: conv.who, label: conv.label, resume: conv.sid, userText: t, prompt: P.reply.replace('{text}', t) }); return; }
    start({ mode: plan ? 'plan' : 'run', agent: conv.agent, who: conv.who, label: conv.label, resume: conv.sid, userText: t, prompt: (plan ? P.followPlan : P.followRun).replace('{text}', t) + (plan ? P.planMode : rulesFor(conv.agent)) });
    return;
  }
  const tg = target.value, agent = resolve(tg);
  conv = { sid: '', fam: fam(), agent, who: whoName(tg), target: tg, request: t, label: t.slice(0, 70), pendingPlan: false };
  start({ mode: plan ? 'plan' : 'run', agent, who: conv.who, label: conv.label, userText: t, prompt: compose(t, agent, plan) });
}
text.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

// ---------- triệu tập họp ----------
function meetingForm() {
  const m = modal('🗣️ Triệu tập họp'), topic = el('input', { placeholder: 'Chủ đề họp, ví dụ: kế hoạch đợt thử thách 3 ngày', maxlength: 200 });
  const people = ORG.people.filter(p => p.role !== 'boss' && p.status !== 'suspended'), def = people.filter(p => p.id === 'tro-ly' || p.role === 'head').map(p => p.id);
  const box = el('div', { class: 'chk col' }, people.map(p => el('label', {}, el('input', { type: 'checkbox', value: p.id, checked: def.includes(p.id) }), `${p.name} · ${p.title}`)));
  m.body.append(el('div', { class: 'note' }, 'Mặc định chỉ Trợ lý (chủ trì) và các trưởng phòng dự họp. Tick thêm nhân viên khi cần ý kiến chuyên môn. Người đang bị đình chỉ không được mời. Mỗi người dự là một lượt gọi Claude khi chạy thật (2 vòng).'),
    field('Chủ đề', topic, true), el('div', { class: 'wide' }, box),
    el('div', { class: 'mrow' }, el('button', { class: 'btn3', onclick: async () => {
      const list = picked(box); if (!topic.value.trim() || !list.length) { toast('Cần chủ đề và ít nhất một người dự.', 'err'); return; }
      if (current) { toast('Đang chạy việc khác, chờ xong rồi họp.', 'err'); return; }
      const calls = list.filter(x => x !== 'tro-ly').length * 2 + 2;
      if (OA.engine().startsWith('claude') && !confirm(`Họp thật sẽ dùng khoảng ${calls} lượt gọi Claude (hạn mức gói của bạn). Tiếp tục?`)) return;
      const r = await OA.start({ path: '/api/meetings', topic: topic.value.trim(), participants: list }); if (!r) return;
      m.close(); panel.style.display = 'flex'; addMsg('sys', `🗣️ Đã triệu tập họp: <b>${esc(topic.value.trim())}</b> (${list.length} người). Nhìn trên bản đồ: mọi người đi vào phòng họp.`);
      const ctl = OA.track(r.job, null, res => { setRunning(null); addMsg(res.isError ? 'sys err' : 'sys ok', res.isError ? esc(res.result || res.stderr || 'Lỗi') : '✅ Họp xong. Biên bản ở 📥 Hộp thư và workspace/giam-doc/.'); });
      setRunning({ ctl, id: r.job });
    } }, 'Bắt đầu họp')));
}
OA.openMeeting = meetingForm; OA.openChat = () => { panel.style.display = 'flex'; text.focus(); };
document.getElementById('btnMeet').onclick = meetingForm;
})();
