// Giao diện điều khiển: nền (api, modal, chạy job), quản lý tổ chức, hộp thư, lịch việc. Nói chuyện với serve.ps1 qua token chèn trong index.html.
(() => {
const TOKEN = (document.querySelector('meta[name="town-token"]') || {}).content || '';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function el(tag, attrs, ...kids) {
  const e = document.createElement(tag), late = {};
  for (const k in (attrs || {})) {
    const v = attrs[k];
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e[k] = v;
    else if (k === 'value' || k === 'checked' || k === 'disabled') late[k] = v;
    else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat(9).forEach(c => { if (c == null || c === false) return; e.append(c.nodeType ? c : document.createTextNode(c)); });
  for (const k in late) e[k] = late[k];
  return e;
}
async function api(path, body) {
  const r = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Town-Token': TOKEN, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const err = new Error((j && j.error) || ('HTTP ' + r.status)); err.status = r.status; err.data = j; throw err; }
  return j;
}
function md(t) {
  return esc(t).split('\n').map(l => {
    if (/^#{1,3} /.test(l)) return `<h4>${l.replace(/^#+ /, '')}</h4>`;
    if (/^\s*[-*] /.test(l)) return `<div class="li">• ${l.replace(/^\s*[-*] /, '')}</div>`;
    if (/^\d+\. /.test(l)) return `<div class="li">${l}</div>`;
    return l.trim() ? `<div>${l}</div>` : '<div class="gap"></div>';
  }).join('').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
}
function toast(msg, kind) {
  const t = el('div', { class: 'toast ' + (kind || '') }, msg); document.body.append(t);
  setTimeout(() => t.classList.add('on'), 10); setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 400); }, kind === 'err' ? 6000 : 3200);
}
function modal(title, wide) {
  const body = el('div', { class: 'mbody' }), box = el('div', { class: 'mbox' + (wide ? ' wide' : '') }, el('div', { class: 'mhead' }, el('h3', {}, title), el('button', { class: 'mx', onclick: () => close() }, '×')), body);
  const ov = el('div', { class: 'modal on' }, box); document.body.append(ov);
  const close = () => { ov.remove(); if (modal.onClose) { const f = modal.onClose; modal.onClose = null; f(); } };
  ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });
  return { box, body, close };
}
const field = (label, input, wide) => el('label', { class: wide ? 'wide' : '' }, label, input);
const sel = (opts, value) => el('select', { value }, opts.map(o => el('option', { value: o[0] }, o[1])));
const checks = (items, selected, cls) => el('div', { class: 'chk ' + (cls || '') }, items.map(i => el('label', {}, el('input', { type: 'checkbox', value: i, checked: selected.includes(i) }), i)));
const picked = box => [...box.querySelectorAll('input:checked')].map(i => i.value);
const fmtTime = s => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? s : d.toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };

// ---------- trạng thái cầu nối + chọn engine ----------
const OA = window.OA = { api, el, esc, md, toast, modal, field, sel, checks, picked, fmtTime, TOKEN, bridge: { ok: false }, prompts: null };
const engineSel = document.getElementById('engineSel');
OA.engine = () => engineSel.value;
engineSel.onchange = () => { try { localStorage.setItem('office.engine', engineSel.value); } catch (e) {} };
OA.refreshBridge = async () => {
  const st = document.getElementById('bridgeSt');
  if (!TOKEN) { st.textContent = 'chưa có cầu nối'; st.className = 'bad'; engineSel.value = 'mock'; return; }
  try {
    const s = await api('/api/status'); OA.bridge = Object.assign({ ok: true }, s);
    if (!s.found) { st.textContent = 'không thấy Claude Code'; st.className = 'bad'; engineSel.value = 'mock'; }
    else if (!s.loggedIn) { st.textContent = 'Claude chưa đăng nhập'; st.className = 'warn'; engineSel.value = 'mock'; }
    else { st.textContent = 'Claude sẵn sàng'; st.className = 'ok'; let saved = null; try { saved = localStorage.getItem('office.engine'); } catch (e) {} engineSel.value = saved || 'mock'; }
  } catch (e) { st.textContent = 'mất kết nối'; st.className = 'bad'; }
};
OA.loginHelp = () => {
  const m = modal('Claude chưa đăng nhập'); const exe = OA.bridge.exe || 'claude';
  m.body.append(el('div', { class: 'note', html: 'Mở PowerShell và chạy <b>một lần</b> (mình không tự đăng nhập hộ bạn):' }), el('pre', {}, `& "${exe}" auth login`),
    el('div', { class: 'note' }, 'Trong lúc chờ, chọn engine "Chạy thử" để thử toàn bộ luồng mà không tốn token.'),
    el('div', { class: 'mrow' }, el('button', { class: 'btn2', onclick: async () => { await OA.refreshBridge(); toast(OA.bridge.loggedIn ? 'Đã đăng nhập, dùng được Claude thật.' : 'Vẫn chưa đăng nhập.', OA.bridge.loggedIn ? '' : 'err'); } }, 'Kiểm tra lại')));
};
fetch('prompts.json', { cache: 'no-store' }).then(r => r.json()).then(p => OA.prompts = p);

// ---------- chạy job và theo dõi (dùng cho chat, họp, huấn luyện) ----------
OA.start = async (body) => {
  try { return await api(body.path || '/api/chat', Object.assign({ engine: OA.engine() }, body)); }
  catch (e) {
    if (e.message === 'not-logged-in') { await OA.refreshBridge(); OA.loginHelp(); } else if (e.message === 'not-found') toast('Không tìm thấy Claude Code, hãy dùng "Chạy thử".', 'err');
    else if (e instanceof TypeError || /fetch/i.test(e.message)) { OA.connLost('down'); toast('Không gửi được: mất kết nối máy chủ. Tin nhắn của bạn vẫn còn trong ô chat.', 'err'); }
    else if (e.status === 401) { OA.connLost('restarted'); toast('Không gửi được: máy chủ vừa khởi động lại, hãy tải lại trang.', 'err'); }
    else toast('Không gửi được: ' + e.message, 'err');
    return null;
  }
};
OA.track = (id, onEvent, onDone) => {
  let next = 0, stopped = false, texts = [], sid = '', result = null, isError = false, cost = 0;
  const tick = async () => {
    if (stopped) return;
    try {
      const r = await api(`/api/chat/${id}?from=${next}`); next = r.next;
      r.events.forEach(ev => {
        if (ev.type === 'system' && ev.subtype === 'init') sid = ev.session_id || sid;
        else if (ev.type === 'result') { result = ev.result || ''; isError = !!ev.is_error; sid = ev.session_id || sid; cost = ev.total_cost_usd || 0; }
        else if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content) && !ev.parent_tool_use_id) ev.message.content.forEach(c => { if (c.type === 'text' && c.text && c.text.trim()) texts.push(c.text); });
        if (onEvent) onEvent(ev);
      });
      if (r.done) { stopped = true; onDone && onDone({ texts, sid, result, isError, cost, stderr: r.stderr, exit: r.exit }); return; }
    } catch (e) { stopped = true; onDone && onDone({ texts, sid, result: 'Mất kết nối cầu nối: ' + e.message, isError: true, cost: 0 }); return; }
    setTimeout(tick, 900);
  };
  tick();
  return { id, stop: async () => { stopped = true; try { await api(`/api/chat/${id}/stop`, {}); } catch (e) {} } };
};
OA.nameOf = id => { const p = ORG.people.find(x => x.id === id); return p ? p.name : id; };

// ---------- quản lý tổ chức ----------
async function openOrg(tab, personId) {
  let data; try { data = await api('/api/org'); } catch (e) { toast('Không đọc được tổ chức: ' + e.message, 'err'); return; }
  const m = modal('🏢 Quản lý tổ chức', true); let cur = tab || 'rooms', pid = personId || null, isNew = false;
  const org = data.org, ag = data.agents, cat = data.catalog;
  modal.onClose = null;
  const reload = () => { toast('Đã lưu. Đang dựng lại văn phòng…'); setTimeout(() => location.reload(), 700); };
  const tabs = el('div', { class: 'tabs' }), pane = el('div', { class: 'pane' }); m.body.append(tabs, pane);
  const draw = () => {
    tabs.replaceChildren(...[['rooms', 'Phòng ban'], ['people', 'Nhân sự']].map(([k, l]) => el('button', { class: 'tab' + (cur === k ? ' on' : ''), onclick: () => { cur = k; draw(); } }, l)));
    pane.replaceChildren(cur === 'rooms' ? roomsPane() : peoplePane());
  };
  function roomsPane() {
    const wrap = el('div', {});
    org.rooms.forEach(r => {
      const members = org.people.filter(p => p.room === r.id);
      if (r.kind !== 'dept') { wrap.append(el('div', { class: 'row-line' }, el('i', { class: 'dot', style: `background:${r.color}` }), el('b', {}, r.name), el('span', { class: 'dim' }, r.kind === 'meeting' ? ' · phòng họp chung, ai cũng vào được' : ' · phòng giám đốc, cố định'))); return; }
      const name = el('input', { value: r.name, maxlength: 40 }), color = el('input', { type: 'color', value: r.color }), head = sel([['', '(chưa có)'], ...members.map(p => [p.id, p.name])], r.headId || '');
      wrap.append(el('div', { class: 'row-line' }, el('i', { class: 'dot', style: `background:${r.color}` }), name, color, el('span', { class: 'dim' }, 'Trưởng phòng'), head,
        el('button', { class: 'btn3 sm', onclick: async () => { try { await api('/api/departments', { id: r.id, name: name.value, color: color.value, headId: head.value }); reload(); } catch (e) { toast(e.message, 'err'); } } }, 'Lưu'),
        el('button', { class: 'btn2 sm', onclick: async () => { if (!confirm(`Lưu trữ phòng "${r.name}"? (chỉ được khi phòng không còn ai; không xoá file)`)) return; try { await api(`/api/departments/${r.id}/archive`, {}); reload(); } catch (e) { toast(e.message, 'err'); } } }, 'Lưu trữ')));
    });
    const nn = el('input', { placeholder: 'Tên phòng ban mới, ví dụ: Hậu cần', maxlength: 40 }), nc = el('input', { type: 'color', value: '#2aa198' });
    wrap.append(el('h4', {}, 'Thêm phòng ban'), el('div', { class: 'row-line' }, nn, nc, el('button', { class: 'btn3 sm', onclick: async () => { try { const r = await api('/api/departments', { name: nn.value, color: nc.value }); cur = 'people'; pid = null; isNew = true; toast('Đã tạo phòng. Hãy thêm trưởng phòng đầu tiên.'); const o = await api('/api/org'); Object.assign(org, o.org); org.rooms = o.org.rooms; org.people = o.org.people; draw(); } catch (e) { toast(e.message, 'err'); } } }, 'Thêm')),
      el('div', { class: 'note' }, `Phòng mới tự lấy ô trống trên bản đồ (tối đa ${9} phòng). Người đầu tiên thêm vào phòng với vai trò "trưởng phòng" sẽ là trưởng phòng.`));
    return wrap;
  }
  function peoplePane() {
    const people = org.people.filter(p => p.role !== 'boss' || true);
    const sp = el('select', {}, el('option', { value: '' }, '+ Thêm nhân viên mới'), ...org.rooms.map(r => el('optgroup', { label: r.name }, org.people.filter(p => p.room === r.id).map(p => el('option', { value: p.id }, `${p.name} · ${p.title}`)))));
    sp.value = isNew ? '' : (pid || ''); sp.onchange = () => { pid = sp.value || null; isNew = !sp.value; draw(); };
    const wrap = el('div', {}, el('div', { class: 'row-line' }, sp));
    const p = isNew || !pid ? null : org.people.find(x => x.id === pid); const a = p ? ag[p.id] : null, fixed = p && !a;
    const rooms = org.rooms.filter(r => r.kind === 'dept' || r.kind === 'boss');
    const f = {
      name: el('input', { value: p ? p.name : '', maxlength: 40 }), title: el('input', { value: p ? p.title : '', maxlength: 120 }), color: el('input', { type: 'color', value: p ? p.color : '#3f78d6' }),
      room: sel(rooms.map(r => [r.id, r.name]), p ? p.room : (rooms.find(r => r.kind === 'dept') || rooms[0]).id), role: sel([['staff', 'Nhân viên'], ['head', 'Trưởng phòng']], p && p.role === 'head' ? 'head' : 'staff'),
      vibe: el('textarea', { rows: 2, maxlength: 300 }, p ? p.vibe : ''), desc: el('textarea', { rows: 2 }, a ? a.description : ''), model: sel([['', 'mặc định'], ...cat.models.map(x => [x, x])], a ? a.model : 'sonnet'),
      tools: checks(cat.tools, (a ? a.tools : 'Read, Write, Edit, Glob').split(',').map(s => s.trim()).filter(Boolean)), mcpNote: el('div', { class: 'dim' }, (a && a.tools.includes('mcp__')) ? 'MCP đang giao: ' + a.tools.split(',').map(s => s.trim()).filter(s => s.startsWith('mcp__')).join(', ') : 'Chưa giao MCP nào.'),
      skills: el('div', {}, el('span', { class: 'dim' }, a && a.skills ? 'Skill: ' + a.skills : 'Chưa có skill.'), ' ', el('button', { class: 'btn2 sm', onclick: () => { m.close(); OA.openCaps('matrix', p && p.id); } }, '🧩 Giao skill / MCP…')),
      persona: el('textarea', { rows: 10 }, a ? a.persona : '')
    };
    const note = fixed ? el('div', { class: 'note' }, p.id === 'giam-doc' ? 'Giám đốc là bạn, không phải agent: chỉ chỉnh được tên, chức danh, màu.' : 'Trợ lý là phiên Claude chính, không có file agent: chỉ chỉnh được tên, chức danh, màu. Cách làm việc của Trợ lý nằm trong prompts.json.') : null;
    const grid = el('div', { class: 'grid2' }, field('Tên hiển thị', f.name), field('Màu', f.color), field('Chức danh', f.title, true), fixed ? null : field('Phòng', f.room), fixed ? null : field('Vai trò', f.role),
      field('Vibe (tính cách ngắn)', f.vibe, true), fixed ? null : [field('Khi nào dùng agent này (Claude dựa vào đây để giao việc)', f.desc, true), field('Model (haiku nhẹ và rẻ nhất)', f.model),
        field('Công cụ được dùng (Bash nên để tắt)', f.tools, true), field('Skill và MCP được giao', el('div', {}, f.skills, f.mcpNote), true), field('Prompt: vai trò, quy trình, nguyên tắc (phần báo cáo trạng thái ở cuối file được giữ nguyên)', f.persona, true)]);
    const save = async () => {
      try {
        const display = { name: f.name.value, title: f.title.value, vibe: f.vibe.value, color: f.color.value }, agent = fixed ? undefined : { description: f.desc.value, model: f.model.value, tools: OA.mergeTools(a ? a.tools : '', picked(f.tools)), skills: a ? a.skills : '', persona: f.persona.value };
        if (!p) await api('/api/agents', { name: f.name.value, title: f.title.value, color: f.color.value, room: f.room.value, role: f.role.value, vibe: f.vibe.value, description: f.desc.value, model: f.model.value, tools: agent.tools, skills: agent.skills, persona: f.persona.value });
        else { if (!fixed) { display.room = f.room.value; display.role = f.role.value; } await api('/api/agents/' + p.id, { display, agent }); }
        reload();
      } catch (e) { toast(e.message, 'err'); }
    };
    if (note) wrap.append(note);
    wrap.append(grid, el('div', { class: 'mrow' },
      p && !fixed ? el('button', { class: 'btn2', onclick: () => { m.close(); OA.openTrainer(p.id); } }, '💬 Chat thử & huấn luyện') : null,
      p && !fixed ? el('button', { class: 'btn2', onclick: async () => { if (!confirm(`Lưu trữ ${p.name}? (file chuyển vào office/_archive/, không xoá)`)) return; try { await api(`/api/agents/${p.id}/archive`, {}); reload(); } catch (e) { toast(e.message, 'err'); } } }, 'Lưu trữ') : null,
      el('button', { class: 'btn3', onclick: save }, p ? 'Lưu' : 'Tạo nhân viên')));
    return wrap;
  }
  draw();
}
OA.openOrg = openOrg;

// ---------- hộp thư giám đốc ----------
let inboxCount = 0;
async function pollInbox() {
  try { const r = await api('/api/inbox'); inboxCount = r.items.filter(i => i.status === 'new' || i.status === 'pending').length; const b = document.getElementById('inboxBadge'); b.textContent = inboxCount; b.style.display = inboxCount ? 'inline-block' : 'none'; return r.items; } catch (e) { return []; }
}
async function openInbox() {
  const items = await pollInbox(); const m = modal('📥 Hộp thư giám đốc', true);
  if (!items.length) m.body.append(el('div', { class: 'note' }, 'Chưa có báo cáo nào. Kết quả của việc giao từ khung chat, cuộc họp và lịch việc sẽ về đây.'));
  items.forEach(it => {
    const card = el('div', { class: 'mailcard ' + it.status }),
      st = { new: 'Mới', seen: 'Đã xem', pending: 'Chờ bạn duyệt kế hoạch', approved: 'Đã duyệt, đang chạy', dismissed: 'Đã bỏ' }[it.status] || it.status;
    card.append(el('div', { class: 'mailhead' }, el('b', {}, it.title || it.id), el('span', { class: 'badge2 ' + it.status }, st), el('span', { class: 'dim' }, fmtTime(it.created) + (it.engine === 'mock' ? ' · chạy thử' : '') + (it.cost ? ` · $${Number(it.cost).toFixed(3)}` : ''))),
      el('div', { class: 'mailbody', html: md(it.summary || it.error || '(không có nội dung)') }));
    if (it.files && it.files.length) card.append(el('div', { class: 'files' }, 'Bản nháp: ', it.files.map(f => el('button', { class: 'link', onclick: async () => { try { const r = await api('/api/file?path=' + encodeURIComponent(f)); const v = modal(f); v.body.append(el('pre', { class: 'filev' }, r.text)); } catch (e) { toast(e.message, 'err'); } } }, f.replace('workspace/', '')))));
    if (it.kind === 'hr' && it.plan) { OA.renderPlan(it, card, () => { m.close(); openInbox(); }); if (it.status === 'new') card.append(el('div', { class: 'mrow' }, el('button', { class: 'btn2 sm', onclick: async () => { await api(`/api/inbox/${it.id}/seen`, {}); m.close(); openInbox(); } }, 'Đã xem'))); m.body.append(card); return; }
    const acts = el('div', { class: 'mrow' });
    if (it.status === 'pending') { const note = el('input', { placeholder: 'Ghi chú khi duyệt (không bắt buộc)' }); acts.append(note, el('button', { class: 'btn3 sm', onclick: async () => { try { await api(`/api/inbox/${it.id}/approve`, { note: note.value }); toast('Đã duyệt, đang chạy thật.'); m.close(); openInbox(); } catch (e) { toast(e.message, 'err'); } } }, '✅ Duyệt và chạy')); }
    if (it.status === 'new' || it.status === 'pending') acts.append(el('button', { class: 'btn2 sm', onclick: async () => { await api(`/api/inbox/${it.id}/${it.status === 'new' ? 'seen' : 'dismiss'}`, {}); m.close(); openInbox(); } }, it.status === 'new' ? 'Đã xem' : 'Bỏ'));
    card.append(acts); m.body.append(card);
  });
}
OA.openInbox = openInbox;

// ---------- lịch việc ----------
const DAYS = [[1, 'T2'], [2, 'T3'], [3, 'T4'], [4, 'T5'], [5, 'T6'], [6, 'T7'], [7, 'CN']];
const repText = r => ({ once: () => `Một lần ${r.date} ${r.time}`, daily: () => `Hằng ngày ${r.time}`, weekly: () => `Hằng tuần ${(r.days || []).map(d => (DAYS.find(x => x[0] === d) || [0, d])[1]).join(', ')} ${r.time}`, monthly: () => `Hằng tháng ngày ${r.day} ${r.time}` }[r.type] || (() => r.type))();
const targetText = t => t === 'assistant' ? 'Trợ lý' : t.startsWith('dept:') ? 'Phòng ' + ((ORG.rooms.find(r => r.id === t.slice(5)) || {}).name || t.slice(5)) : OA.nameOf(t.slice(6));
async function openSchedule(prefill) {
  let data; try { data = await api('/api/schedule'); } catch (e) { toast(e.message, 'err'); return; }
  const m = modal('📅 Lịch việc tự động', true), sc = data.schedule;
  const body = m.body;
  const redraw = () => { m.close(); openSchedule(); };
  body.append(el('div', { class: 'note', html: `Lịch chỉ chạy khi <b>server đang bật</b> (cửa sổ chạy <code>chay-van-phong.bat</code>). Mỗi lúc chỉ chạy 1 việc Claude thật, việc trước chưa xong thì lần sau bị bỏ qua. Hôm nay đã chạy <b>${sc.settings.countToday || 0}</b>/${sc.settings.dailyLimit} lượt.` }));
  const lim = el('input', { type: 'number', min: 1, max: 100, value: sc.settings.dailyLimit, style: 'width:70px' });
  body.append(el('div', { class: 'row-line' }, 'Giới hạn lượt chạy mỗi ngày', lim, el('button', { class: 'btn2 sm', onclick: async () => { try { await api('/api/schedule/settings', { dailyLimit: +lim.value }); toast('Đã lưu giới hạn.'); } catch (e) { toast(e.message, 'err'); } } }, 'Lưu'),
    el('button', { class: 'btn2 sm', onclick: () => form(null) }, '+ Thêm lịch'), el('button', { class: 'btn2 sm', onclick: () => templates() }, '✨ Thêm các mẫu gợi ý (tắt sẵn)')));
  const list = el('div', {}); body.append(list);
  if (!sc.items.length) list.append(el('div', { class: 'note' }, 'Chưa có lịch nào. Bấm "+ Thêm lịch" hoặc "Thêm các mẫu gợi ý".'));
  sc.items.forEach(it => {
    const on = it.enabled;
    list.append(el('div', { class: 'mailcard' + (on ? '' : ' off') }, el('div', { class: 'mailhead' },
      el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: on, onchange: async () => { try { const r = await api(`/api/schedule/${it.id}/toggle`, {}); toast(r.enabled ? 'Đã bật. Lần chạy kế: ' + fmtTime(r.nextRun) : 'Đã tắt.'); redraw(); } catch (e) { toast(e.message, 'err'); } } }), ''),
      el('b', {}, it.name), el('span', { class: 'dim' }, `${targetText(it.target)} · ${repText(it.repeat)} · ${it.mode === 'plan' ? 'chỉ lập kế hoạch' : 'chạy luôn'} · ${it.engine === 'mock' ? 'chạy thử' : 'Claude thật'}`)),
      el('div', { class: 'dim' }, `Lần chạy kế: ${on ? fmtTime(it.nextRun) : '(đang tắt)'} · lần trước: ${fmtTime(it.lastRun)}${it.lastResult ? ' (' + (it.lastResult === 'ok' ? 'ok' : 'lỗi') + ')' : ''}`),
      el('div', { class: 'mailbody' }, it.prompt),
      el('div', { class: 'mrow' }, el('button', { class: 'btn2 sm', onclick: () => form(it) }, 'Sửa'), el('button', { class: 'btn2 sm', onclick: async () => { try { await api(`/api/schedule/${it.id}/run-now`, {}); toast('Đã chạy. Kết quả về Hộp thư.'); } catch (e) { toast(e.message === 'not-logged-in' ? 'Claude chưa đăng nhập' : e.message, 'err'); } } }, '▶ Chạy ngay'),
        el('button', { class: 'btn2 sm', onclick: async () => { if (!confirm('Xoá mục lịch này?')) return; await api(`/api/schedule/${it.id}/delete`, {}); redraw(); } }, 'Xoá'))));
  });
  if (data.log.length) body.append(el('h4', {}, 'Nhật ký gần đây'), el('pre', { class: 'filev' }, data.log.slice().reverse().map(l => `${l.t.replace('T', ' ')}  ${l.id}  ${l.ev}  ${l.msg}`).join('\n')));
  function form(it) {
    const f = modal(it ? 'Sửa lịch' : 'Thêm lịch'), r = it ? it.repeat : { type: 'daily', time: '08:00', days: [1], day: 1, date: new Date().toISOString().slice(0, 10) };
    const targets = [['assistant', 'Trợ lý tự phân công'], ...ORG.rooms.filter(x => x.kind === 'dept' && x.headId).map(x => ['dept:' + x.id, 'Phòng ' + x.name + ' (trưởng phòng làm)']), ...ORG.people.filter(x => x.role === 'staff' || x.role === 'head').map(x => ['agent:' + x.id, x.name + ' · ' + x.title])];
    const F = { name: el('input', { value: it ? it.name : (prefill && prefill.name) || '', maxlength: 80 }), target: sel(targets, it ? it.target : 'assistant'), prompt: el('textarea', { rows: 4, maxlength: 4000 }, it ? it.prompt : (prefill && prefill.prompt) || ''),
      mode: sel([['run', 'Chạy luôn, kết quả về hộp thư'], ['plan', 'Chỉ lập kế hoạch, chờ bạn duyệt trong hộp thư']], it ? it.mode : 'run'), engine: sel([['mock', 'Chạy thử (không tốn token)'], ['claude:haiku', 'Claude thật · haiku'], ['claude:sonnet', 'Claude thật · sonnet'], ['claude', 'Claude thật · mặc định']], it ? it.engine : 'mock'),
      type: sel([['daily', 'Hằng ngày'], ['weekly', 'Hằng tuần'], ['monthly', 'Hằng tháng'], ['once', 'Một lần']], r.type), time: el('input', { type: 'time', value: r.time }), date: el('input', { type: 'date', value: r.date }), day: el('input', { type: 'number', min: 1, max: 31, value: r.day || 1, style: 'width:70px' }),
      days: el('div', { class: 'chk' }, DAYS.map(d => el('label', {}, el('input', { type: 'checkbox', value: d[0], checked: (r.days || []).includes(d[0]) }), d[1]))), catchUp: el('input', { type: 'checkbox', checked: it ? it.catchUp : false }), en: el('input', { type: 'checkbox', checked: it ? it.enabled : false }) };
    const vis = () => { F.days.style.display = F.type.value === 'weekly' ? '' : 'none'; F.day.parentElement.style.display = F.type.value === 'monthly' ? '' : 'none'; F.date.parentElement.style.display = F.type.value === 'once' ? '' : 'none'; };
    const rep = () => ({ type: F.type.value, time: F.time.value, days: [...F.days.querySelectorAll('input:checked')].map(i => +i.value), day: +F.day.value, date: F.date.value });
    const pv = el('div', { class: 'dim' });
    f.body.append(el('div', { class: 'grid2' }, field('Tên việc', F.name, true), field('Ai làm', F.target, true), field('Nội dung việc (viết như bạn nhắn Trợ lý)', F.prompt, true), field('Chế độ', F.mode), field('Engine', F.engine),
      field('Lặp lại', F.type), field('Giờ', F.time), field('Ngày trong tháng', F.day), field('Ngày', F.date), field('Các thứ trong tuần', F.days, true),
      el('label', { class: 'wide ck' }, F.catchUp, ' Lỡ giờ (máy tắt) thì chạy bù 1 lần nếu còn trong cùng ngày'), el('label', { class: 'wide ck' }, F.en, ' Bật lịch này ngay')),
      pv, el('div', { class: 'note' }, 'Lịch không bao giờ được bật Bash, chỉ soạn bản nháp vào workspace/. Engine Claude thật dùng hạn mức gói của bạn mỗi lần chạy.'),
      el('div', { class: 'mrow' }, el('button', { class: 'btn2', onclick: async () => { try { const r2 = await api('/api/schedule/preview', { repeat: rep() }); pv.textContent = 'Các lần chạy kế tiếp: ' + (r2.next.map(fmtTime).join(' · ') || 'không còn'); } catch (e) { pv.textContent = 'Lỗi: ' + e.message; } } }, 'Xem 3 lần chạy tới'),
        el('button', { class: 'btn3', onclick: async () => { try { const r2 = await api('/api/schedule', { id: it && it.id, name: F.name.value, target: F.target.value, prompt: F.prompt.value, mode: F.mode.value, engine: F.engine.value, repeat: rep(), catchUp: F.catchUp.checked, enabled: F.en.checked }); toast('Đã lưu. Lần chạy kế: ' + fmtTime(r2.nextRun)); f.close(); redraw(); } catch (e) { toast(e.message, 'err'); } } }, 'Lưu')));
    F.type.onchange = vis; vis();
  }
  async function templates() {
    const T = [
      ['Trend và chủ đề video mỗi sáng', 'dept:marketing', { type: 'daily', time: '07:30' }, 'Tìm 5 trend AI đang nổi trong tuần và đề xuất 1 chủ đề video ngắn kéo người lạ vào cộng đồng Nas. Lưu vào workspace/marketing/trend-hom-nay.md.'],
      ['Kịch bản video mỗi ngày', 'agent:bien-kich-video', { type: 'daily', time: '08:00' }, 'Viết 1 kịch bản video ngắn theo chủ đề trong workspace/marketing/trend-hom-nay.md (nếu có), có 3 hook để chọn. Lưu vào workspace/marketing/.'],
      ['Mẫu trả lời câu hỏi học viên', 'dept:cskh', { type: 'daily', time: '20:00' }, 'Đọc workspace/cskh/cau-hoi-moi.md (nếu có) và soạn mẫu trả lời cho các câu hỏi mới. Lưu vào workspace/cskh/.'],
      ['Họp tuần các trưởng phòng', 'assistant', { type: 'weekly', time: '09:00', days: [1] }, 'Triệu tập họp tuần với các trưởng phòng, tổng hợp kế hoạch tuần và lưu biên bản vào workspace/giam-doc/.'],
      ['Báo cáo phễu tuần', 'assistant', { type: 'weekly', time: '17:00', days: [5] }, 'Tổng hợp báo cáo phễu tuần (video, thành viên Nas, email, người tham gia thử thách, người mua) từ số liệu trong workspace/giam-doc/so-lieu-phieu.md nếu có. Nếu chưa có số liệu, nhắc giám đốc nhập.']
    ];
    try { for (const t of T) await api('/api/schedule', { name: t[0], target: t[1], prompt: t[3], mode: 'run', engine: 'mock', repeat: Object.assign({ days: [], day: 1, date: '' }, t[2]), catchUp: false, enabled: false }); toast('Đã thêm 5 mẫu (đang tắt, engine chạy thử).'); redraw(); } catch (e) { toast(e.message, 'err'); }
  }
  if (prefill) form(null);
}
OA.openSchedule = openSchedule;

// ---------- theo dõi kết nối máy chủ ----------
const banner = el('div', { id: 'connBanner' }); document.body.append(banner);
OA.connLost = kind => {
  banner.replaceChildren(kind === 'restarted' ? '⚠ Máy chủ vừa khởi động lại, trang này dùng mã cũ. ' : '⚠ Mất kết nối máy chủ. Hãy mở lại office/chay-van-phong.bat (giữ cửa sổ đen mở suốt khi dùng). ', el('button', { class: 'mini', onclick: () => location.reload() }, 'Tải lại trang'));
  banner.style.display = 'block';
};
async function heartbeat() {
  if (!TOKEN) return;
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), 5000);
  try { const r = await fetch('/api/ping', { headers: { 'X-Town-Token': TOKEN }, signal: ac.signal }); if (r.status === 401) OA.connLost('restarted'); else if (r.ok) banner.style.display = 'none'; }
  catch (e) { OA.connLost('down'); } finally { clearTimeout(to); }
}
setInterval(heartbeat, 8000);
// ---------- nút trên thanh công cụ ----------
const on = (id, f) => { const b = document.getElementById(id); if (b) b.onclick = f; };
on('btnOrg', () => openOrg()); on('btnInbox', () => openInbox()); on('btnSched', () => openSchedule());
document.getElementById('p-edit').onclick = () => { if (selected) openOrg('people', selected); else toast('Hãy bấm chọn một nhân vật trước.'); };
document.getElementById('p-chat').onclick = () => {
  if (!selected) { toast('Hãy bấm chọn một nhân vật trước.'); return; }
  if (selected === 'tro-ly') { OA.openChat(); return; }
  if (selected === 'giam-doc') { toast('Giám đốc là bạn. Hãy giao việc bằng 💬 Giao việc.'); return; }
  OA.openTrainer(selected);
};
const fit = () => { const b = document.querySelector('.bar').getBoundingClientRect(); document.getElementById('roster').style.top = document.getElementById('panel').style.top = (b.bottom + 8) + 'px'; };
fit(); addEventListener('resize', fit); setInterval(fit, 1500);
OA.refreshBridge(); pollInbox(); setInterval(pollInbox, 10000);
})();
