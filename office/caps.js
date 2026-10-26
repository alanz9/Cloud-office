// 🧩 Năng lực: skill (dự án + tài khoản, tải lên), MCP đã kết nối, công cụ, và ma trận agent nào được dùng gì.
(() => {
const { api, el, esc, toast, modal, fmtTime } = OA;
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const shortMcp = k => String(k).replace(/^claude_ai_/, '').replace(/_/g, ' ');
const ST = { connected: ['🟢', 'Đã kết nối'], 'needs-auth': ['🟡', 'Cần đăng nhập'], failed: ['🔴', 'Lỗi'], other: ['⚪', 'Đang chờ'] };
OA.mergeTools = (oldTools, picked) => [...picked, ...String(oldTools || '').split(',').map(s => s.trim()).filter(t => t && (t.startsWith('mcp__') || t === 'Skill'))].join(',');

let data = null, tab = 'skill', box = null, filter = '', agentFilter = '';
const nameOfAgent = id => { const a = data.agents.find(x => x.id === id); return a ? a.name : id; };
const chips = ids0 => { const ids = (ids0 || []).filter(Boolean); return el('span', { class: 'chips' }, ids.length ? ids.map(id => el('span', { class: 'chip2', title: id }, nameOfAgent(id))) : el('span', { class: 'dim' }, 'chưa ai dùng')); };

async function load(force) {
  try { data = await api('/api/capabilities' + (force ? '?refresh=1' : '')); } catch (e) { toast(e.message, 'err'); return false; }
  const A = v => Array.isArray(v) ? v : (v ? [v] : []);
  data.agents.forEach(a => { a.tools = A(a.tools); a.skills = A(a.skills); a.mcp = A(a.mcp); a.riskAck = A(a.riskAck).filter(Boolean); }); data.skills.forEach(s => s.agents = A(s.agents).filter(Boolean)); data.mcp.forEach(s => { s.agents = A(s.agents).filter(Boolean); s.tools = A(s.tools); }); data.tools.forEach(t => t.agents = A(t.agents).filter(Boolean));
  return true;
}
// gán/gỡ có xử lý bước xác nhận MCP rủi ro
async function assign(kind, name, agents, mode, quiet) {
  let ack = [];
  for (let k = 0; k < 2; k++) {
    try { await api('/api/capabilities/assign', { kind, name, agents, mode, ack }); return true; }
    catch (e) {
      if (e.message === 'can-xac-nhan') {
        const need = (e.data && e.data.need) || [];
        if (!confirm(`⚠ Cần xác nhận: ${need.map(shortMcp).join(', ')} có công cụ CÓ THỂ GỬI, ĐĂNG hoặc TỐN TIỀN/CREDIT (ví dụ gửi mail, tạo bài, tạo ảnh/video).\n\nChỉ cho phép khi bạn chắc chắn. Việc chạy tự động theo lịch và Trợ lý sẽ KHÔNG bao giờ dùng được các công cụ này.\n\nXác nhận cho ${agents.map(nameOfAgent).join(', ')}?`)) return false;
        ack = need; continue;
      }
      if (!quiet) toast(e.message, 'err'); return false;
    }
  }
  return false;
}
async function pickAgents(title, current, onApply, onlyHaveFile) {
  const m = modal(title); const list = data.agents.filter(a => !(a.emptyTools && false));
  const boxes = list.map(a => ({ a, cb: el('input', { type: 'checkbox', checked: current.includes(a.id) }) }));
  m.body.append(el('div', { class: 'chk col' }, boxes.map(x => el('label', {}, x.cb, `${x.a.name} · ${x.a.title}`))),
    el('div', { class: 'mrow' }, el('button', { class: 'btn2', onclick: () => m.close() }, 'Đóng'), el('button', { class: 'btn3', onclick: async () => {
      const add = boxes.filter(x => x.cb.checked && !current.includes(x.a.id)).map(x => x.a.id), rem = boxes.filter(x => !x.cb.checked && current.includes(x.a.id)).map(x => x.a.id);
      await onApply(add, rem); m.close();
    } }, 'Lưu')));
}
async function refresh(keep) { if (await load(false)) draw(); }

// ---------- tải skill lên ----------
const b64 = f => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = bad; r.readAsDataURL(f); });
function uploadDialog() {
  const m = modal('⬆ Tải skill lên'); let mode = 'zip';
  const zipIn = el('input', { type: 'file', accept: '.zip' }), dirIn = el('input', { type: 'file', webkitdirectory: true, multiple: true }), mdIn = el('input', { type: 'file', accept: '.md,.markdown,.txt' }), text = el('textarea', { rows: 10, placeholder: '---\nname: ten-skill\ndescription: Khi nào dùng skill này...\n---\n\nNội dung hướng dẫn...' }), nameIn = el('input', { placeholder: 'Tên skill (bỏ trống để lấy từ SKILL.md / tên thư mục)', maxlength: 41 });
  const panes = { zip: el('div', {}, el('div', { class: 'note' }, 'Chọn file .zip chứa thư mục skill (có SKILL.md ở gốc hoặc trong một thư mục duy nhất).'), zipIn), dir: el('div', {}, el('div', { class: 'note' }, 'Chọn nguyên thư mục skill từ máy.'), dirIn), md: el('div', {}, el('div', { class: 'note' }, 'Chọn một file SKILL.md (chỉ có một file).'), mdIn), text: el('div', {}, el('div', { class: 'note' }, 'Dán nội dung SKILL.md (có phần --- name/description ---).'), text) };
  const tabs = el('div', { class: 'tabs' }), res = el('div', { class: 'note' });
  const draw2 = () => { tabs.replaceChildren(...[['zip', 'File .zip'], ['dir', 'Thư mục'], ['md', 'File SKILL.md'], ['text', 'Dán nội dung']].map(([k, l]) => el('button', { class: 'tab' + (mode === k ? ' on' : ''), onclick: () => { mode = k; draw2(); } }, l))); Object.entries(panes).forEach(([k, p]) => p.style.display = k === mode ? '' : 'none'); };
  async function go(overwrite) {
    res.textContent = 'Đang tải lên…'; let body = { mode: 'files', name: nameIn.value.trim(), overwrite };
    try {
      if (mode === 'zip') { const f = zipIn.files[0]; if (!f) throw new Error('Chưa chọn file .zip'); if (f.size > 8 * 1048576) throw new Error('File zip quá 8 MB'); body = { mode: 'zip', zip: await b64(f), name: nameIn.value.trim(), overwrite }; }
      else if (mode === 'dir') { const fs = [...dirIn.files]; if (!fs.length) throw new Error('Chưa chọn thư mục'); body.files = []; for (const f of fs) body.files.push({ path: f.webkitRelativePath || f.name, b64: await b64(f) }); }
      else if (mode === 'md') { const f = mdIn.files[0]; if (!f) throw new Error('Chưa chọn file'); body = { mode: 'text', text: await f.text(), name: nameIn.value.trim(), overwrite }; }
      else { body = { mode: 'text', text: text.value, name: nameIn.value.trim(), overwrite }; }
    } catch (e) { res.textContent = '❌ ' + e.message; return; }
    const r = await fetch('/api/skills/upload', { method: 'POST', headers: { 'X-Town-Token': OA.TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json()).catch(e => ({ err: String(e) }));
    if (r.ok) { res.innerHTML = `✅ Đã tải lên <b>${esc(r.name)}</b> (${r.files} file, ${kb(r.bytes)})${r.replaced ? ', bản cũ được lưu trữ' : ''}.` + (r.warnings && r.warnings.length ? '<br>⚠ ' + r.warnings.map(esc).join('<br>⚠ ') : ''); toast('Đã tải skill lên: ' + r.name); await refresh(); }
    else if (r.err === 'da-ton-tai') { if (confirm(`Skill "${r.name}" đã có. Thay bằng bản mới? (bản cũ được lưu trữ, không xoá)`)) go(true); else res.textContent = 'Đã huỷ.'; }
    else res.textContent = '❌ ' + (r.err || r.error || 'lỗi');
  }
  m.body.append(tabs, ...Object.values(panes), el('div', { class: 'grid2' }, el('label', { class: 'wide' }, 'Tên (không bắt buộc)', nameIn)), res,
    el('div', { class: 'note' }, 'Giới hạn: 5 MB, 100 file, không nhận .exe/.dll. Skill chứa script (.ps1/.py/...) chỉ chạy khi agent có Bash (mặc định tắt). Skill tải lên nằm trong .claude/skills/ của dự án.'),
    el('div', { class: 'mrow' }, el('button', { class: 'btn3', onclick: () => go(false) }, 'Tải lên')));
  draw2();
}

// ---------- các tab ----------
function skillTab() {
  const q = filter.toLowerCase(); const rows = data.skills.filter(s => !q || (s.name + ' ' + s.description).toLowerCase().includes(q));
  const wrap = el('div', {}, el('div', { class: 'row-line' }, el('button', { class: 'btn3 sm', onclick: uploadDialog }, '⬆ Tải skill lên'), el('input', { placeholder: 'Lọc skill…', value: filter, oninput: e => { filter = e.target.value; refreshBody(); } }), el('span', { class: 'dim' }, `${data.skills.filter(s => s.source === 'project').length} của dự án · ${data.skills.filter(s => s.source === 'account').length} của tài khoản`)),
    el('div', { class: 'note' }, 'Agent chỉ dùng được skill được giao (công cụ Skill + danh sách skill của agent đó; hook chặn skill khác). Skill của tài khoản tự đồng bộ từ claude.ai, chỉ đọc.'));
  rows.forEach(s => wrap.append(el('div', { class: 'mailcard' }, el('div', { class: 'mailhead' }, el('b', {}, s.name), el('span', { class: 'badge2 ' + (s.source === 'project' ? 'approved' : 'seen') }, s.source === 'project' ? 'Dự án' : 'Tài khoản'),
    el('span', { class: 'dim' }, `${s.files} file · ${kb(s.bytes)}${s.scripts ? ' · ⚠ ' + s.scripts + ' script' : ''}`)),
    el('div', { class: 'mailbody' }, s.description || '(chưa có mô tả)'), el('div', { class: 'row-line' }, 'Đang dùng:', chips(s.agents),
      el('button', { class: 'btn2 sm', onclick: async () => { try { const r = await api('/api/skills/view?name=' + encodeURIComponent(s.name)); const v = modal(s.name, true); v.body.append(el('pre', { class: 'filev' }, r.text)); } catch (e) { toast(e.message, 'err'); } } }, '👁 Xem'),
      el('button', { class: 'btn2 sm', onclick: () => pickAgents('Giao skill "' + s.name + '" cho', s.agents || [], async (add, rem) => { if (add.length) await assign('skill', s.name, add, 'add'); if (rem.length) await assign('skill', s.name, rem, 'remove'); await refresh(); }) }, '👥 Giao cho agent…'),
      s.source === 'account' ? el('button', { class: 'btn2 sm', onclick: async () => { try { const r = await api('/api/skills/import', { name: s.name }); toast('Đã sao chép về dự án: ' + r.name); await refresh(); } catch (e) { toast(e.message === 'da-ton-tai' ? 'Đã có bản sao trong dự án' : e.message, 'err'); } } }, '📥 Sao chép về dự án') : el('button', { class: 'btn2 sm', onclick: async () => { if (!confirm(`Lưu trữ skill "${s.name}"? (chuyển vào office/_archive, không xoá)`)) return; try { await api(`/api/skills/${s.name}/archive`, {}); toast('Đã lưu trữ.'); await refresh(); } catch (e) { toast(e.message === 'dang-duoc-dung' ? 'Skill đang được agent dùng, hãy gỡ trước.' : e.message, 'err'); } } }, 'Lưu trữ')))));
  return wrap;
}
function mcpTab() {
  const wrap = el('div', {}); const sn = data.snapshot;
  wrap.append(el('div', { class: 'row-line' }, el('button', { class: 'btn2 sm', onclick: async () => { await load(true); draw(); toast('Đang làm mới trạng thái…'); setTimeout(() => refresh(), 12000); } }, '🔄 Làm mới trạng thái'),
    el('button', { class: 'btn2 sm', onclick: scan }, '🔎 Quét công cụ của MCP (1 lượt Claude)'), el('span', { class: 'dim' }, sn.at ? `Lần quét: ${fmtTime(sn.at)} · ${sn.tools} công cụ` : 'Chưa quét công cụ')),
    el('div', { class: 'note', html: 'Danh sách lấy từ <code>claude mcp list</code> (các connector của tài khoản claude.ai). Connector <b>cần đăng nhập</b>: vào claude.ai → Cài đặt → Connectors để kết nối (mình không đăng nhập hộ). Một số connector kết nối chậm nên có thể chưa hiện công cụ; quét thêm 1–2 lần, kết quả được gộp lại.' + (data.mcpUpdating ? '<br>⏳ Đang cập nhật…' : '') }));
  data.mcp.forEach(s => {
    const st = ST[s.status] || ST.other, det = el('div', { style: 'display:none' });
    det.append(...(s.tools.length ? s.tools.map(t => el('div', { class: 'row-line' }, el('code', {}, t.name), t.risky ? el('span', { class: 'badge2 pending' }, '⚠ có thể gửi/đăng/tốn tiền') : el('span', { class: 'badge2 approved' }, 'chỉ đọc'),
      el('button', { class: 'btn2 sm', onclick: () => pickAgents(`Giao công cụ ${t.name}`, data.agents.filter(a => a.mcp.includes('mcp__' + s.key + '__' + t.name)).map(a => a.id), async (add, rem) => { if (add.length) await assign('mcp', 'mcp__' + s.key + '__' + t.name, add, 'add'); if (rem.length) await assign('mcp', 'mcp__' + s.key + '__' + t.name, rem, 'remove'); await refresh(); }) }, 'Giao…'))) : [el('div', { class: 'dim' }, 'Chưa quét được công cụ của connector này.')]));
    wrap.append(el('div', { class: 'mailcard' }, el('div', { class: 'mailhead' }, el('span', {}, st[0]), el('b', {}, shortMcp(s.key)), el('span', { class: 'badge2 seen' }, st[1]), (!s.scanned ? el('span', { class: 'badge2 seen' }, 'chưa quét: coi là có rủi ro') : s.risky ? el('span', { class: 'badge2 pending' }, '⚠ có công cụ gửi/đăng/tốn tiền') : el('span', { class: 'badge2 approved' }, 'chỉ đọc')), el('span', { class: 'dim' }, s.scanned ? s.tools.length + ' công cụ' : 'chưa quét')),
      el('div', { class: 'dim' }, s.url), el('div', { class: 'row-line' }, 'Đang dùng:', chips(s.agents),
        s.status === 'connected' ? el('button', { class: 'btn2 sm', onclick: () => pickAgents(`Giao cả connector "${shortMcp(s.key)}" cho`, data.agents.filter(a => a.mcp.includes('mcp__' + s.key)).map(a => a.id), async (add, rem) => { if (add.length) await assign('mcp', 'mcp__' + s.key, add, 'add'); if (rem.length) await assign('mcp', 'mcp__' + s.key, rem, 'remove'); await refresh(); }) }, '👥 Giao cả connector…') : el('span', { class: 'dim' }, 'cần kết nối trước'),
        el('button', { class: 'btn2 sm', onclick: () => det.style.display = det.style.display === 'none' ? '' : 'none' }, '📋 Công cụ')), det));
  });
  return wrap;
}
async function scan() {
  if (!OA.engine().startsWith('claude')) { toast('Quét cần Claude thật: chọn engine "Claude thật · haiku" ở thanh trên.', 'err'); return; }
  if (!confirm('Quét sẽ dùng 1 lượt Claude (haiku, nhẹ nhất) để đọc danh sách công cụ MCP. Tiếp tục?')) return;
  const r = await OA.start({ path: '/api/capabilities/scan' }); if (!r) return; toast('Đang quét…');
  OA.track(r.job, null, async () => { await refresh(); toast('Đã quét xong.'); });
}
function toolTab() {
  const wrap = el('div', {}, el('div', { class: 'note' }, 'Công cụ có sẵn của Claude Code. Công cụ Skill được tự thêm khi agent có skill; MCP xem ở tab MCP.'));
  data.tools.forEach(t => wrap.append(el('div', { class: 'mailcard' }, el('div', { class: 'mailhead' }, el('b', {}, t.name), t.risky ? el('span', { class: 'badge2 pending' }, '⚠ nguy hiểm, nên để tắt') : null, el('span', { class: 'dim' }, t.desc)),
    el('div', { class: 'row-line' }, 'Đang dùng:', chips(t.agents), el('button', { class: 'btn2 sm', onclick: () => pickAgents(`Giao công cụ ${t.name} cho`, t.agents || [], async (add, rem) => { if (t.name === 'Bash' && add.length && !confirm('Bash cho phép chạy lệnh trên máy bạn. Chỉ bật khi thật cần. Tiếp tục?')) return; if (add.length) await assign('tool', t.name, add, 'add'); if (rem.length) await assign('tool', t.name, rem, 'remove'); await refresh(); }) }, '👥 Giao cho agent…')))));
  return wrap;
}
function matrixTab() {
  const wrap = el('div', {}), sel = el('select', { value: agentFilter, onchange: e => { agentFilter = e.target.value; refreshBody(); } }, el('option', { value: '' }, 'Tất cả agent'), ...data.agents.map(a => el('option', { value: a.id }, a.name)));
  sel.value = agentFilter;
  wrap.append(el('div', { class: 'row-line' }, 'Xem:', sel, el('span', { class: 'dim' }, 'Bấm ô để bật/tắt ngay. Trợ lý (phiên chính) không dùng Skill/MCP, chỉ giao việc.')));
  const list = data.agents.filter(a => !agentFilter || a.id === agentFilter), tools = data.tools.map(t => t.name);
  const tbl = el('table', { class: 'mx' }, el('thead', {}, el('tr', {}, el('th', {}, 'Agent'), ...tools.map(t => el('th', { title: t }, t)), el('th', {}, 'Skill'), el('th', {}, 'MCP'))));
  const tb = el('tbody', {});
  list.forEach(a => {
    const row = el('tr', {}, el('td', {}, el('b', {}, a.name), el('div', { class: 'dim' }, a.title)));
    tools.forEach(t => row.append(el('td', { class: 'c' }, el('input', { type: 'checkbox', checked: a.tools.includes(t), onchange: async e => { const ok = await assign('tool', t, [a.id], e.target.checked ? 'add' : 'remove'); if (!ok) e.target.checked = !e.target.checked; else await refresh(); } }))));
    const skSel = el('select', { onchange: async e => { if (!e.target.value) return; if (await assign('skill', e.target.value, [a.id], 'add')) await refresh(); } }, el('option', { value: '' }, '+ skill'), ...data.skills.filter(s => !a.skills.includes(s.name)).map(s => el('option', { value: s.name }, s.name.replace('anthropic-skills:', '☁ '))));
    row.append(el('td', {}, a.skills.map(s => el('span', { class: 'chip2 x', title: 'Bấm để gỡ', onclick: async () => { if (await assign('skill', s, [a.id], 'remove')) await refresh(); } }, s.replace('anthropic-skills:', '☁ ') + ' ×')), skSel));
    const mcSel = el('select', { onchange: async e => { if (!e.target.value) return; if (await assign('mcp', e.target.value, [a.id], 'add')) await refresh(); } }, el('option', { value: '' }, '+ MCP'), ...data.mcp.filter(s => s.status === 'connected' && !a.mcp.includes('mcp__' + s.key)).map(s => el('option', { value: 'mcp__' + s.key }, shortMcp(s.key) + (s.risky ? ' ⚠' : ''))));
    row.append(el('td', {}, a.mcp.map(m => { const p = m.split('__'); return el('span', { class: 'chip2 x', title: 'Bấm để gỡ ' + m, onclick: async () => { if (await assign('mcp', m, [a.id], 'remove')) await refresh(); } }, shortMcp(p[1]) + (p[2] ? ': ' + p[2] : '') + (a.riskAck.includes(p[1]) ? ' ⚠' : '') + ' ×'); }), mcSel));
    tb.append(row);
  });
  tbl.append(tb); wrap.append(el('div', { style: 'overflow:auto' }, tbl)); return wrap;
}
const TABS = [['skill', '📚 Skill'], ['mcp', '🔌 MCP'], ['tool', '🛠 Công cụ'], ['matrix', '🧮 Ma trận agent']];
let body = null, tabsEl = null;
function refreshBody() { body.replaceChildren(({ skill: skillTab, mcp: mcpTab, tool: toolTab, matrix: matrixTab })[tab]()); }
function draw() {
  tabsEl.replaceChildren(...TABS.map(([k, l]) => el('button', { class: 'tab' + (tab === k ? ' on' : ''), onclick: async () => { tab = k; await load(false); draw(); } }, l)));
  refreshBody();
}
OA.openCaps = async function (t, agent) {
  if (!(await load(false))) return; tab = t || 'skill'; agentFilter = agent || ''; filter = '';
  const m = modal('🧩 Năng lực: skill, MCP, công cụ', true); m.box.classList.add('xl'); tabsEl = el('div', { class: 'tabs' }); body = el('div', {}); m.body.append(tabsEl, body); draw();
  if (data.mcpUpdating) setTimeout(() => refresh(), 9000);
};
document.getElementById('btnCaps').onclick = () => OA.openCaps();
})();
