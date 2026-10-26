// 🧑‍💼 Cơ cấu & Nhân sự: cây phòng ban/nhân sự thu gọn được, tuyển / đình chỉ / phục hồi / sa thải, thành lập / giải thể phòng ban,
// nhờ Trưởng phòng Nhân sự lập kế hoạch (tuyển dụng, đánh giá, tinh gọn, mở rộng) rồi duyệt để hệ thống thực hiện, hồ sơ và lịch sử làm việc.
(() => {
const { api, el, esc, md, toast, modal, field, sel, checks, picked, fmtTime } = OA;
const ROLE_VN = { boss: 'Giám đốc', assistant: 'Trợ lý', head: 'Trưởng phòng', staff: 'Nhân viên' };
const KIND_VN = { boss: 'Giám đốc', meeting: 'Họp chung', hr: 'Nhân sự', reserve: 'Dự bị', dept: 'Phòng ban' };
const PROTECTED = ['giam-doc', 'tro-ly', 'tp-nhan-su'];
const ERR_VN = {
  'khong-duoc-dinh-chi-nguoi-nay': 'Không được đình chỉ người này', 'khong-duoc-sa-thai-nguoi-nay': 'Không được sa thải người này', 'khong-duoc-chuyen-nguoi-nay': 'Không được chuyển người này',
  'da-bi-dinh-chi': 'Đã bị đình chỉ', 'khong-bi-dinh-chi': 'Không ở trạng thái đình chỉ', 'khong-co-nguoi-nay': 'Không có người này', 'phong-khong-hop-le': 'Phòng không hợp lệ',
  'can-chon-phong-hop-le': 'Cần chọn phòng hợp lệ để phục hồi', 'phong-co-dinh-khong-giai-the-duoc': 'Phòng cố định, không giải thể được', 'khong-co-phong': 'Không có phòng này',
  'toi-da-30-agent': 'Đã đủ 30 agent', 'toi-da-phong': 'Đã đủ số phòng tối đa', 'het-o-trong': 'Hết ô trống trên bản đồ', 'ten-phong-rong': 'Thiếu tên phòng',
  'thieu-ten-hoac-chuc-danh': 'Thiếu tên hoặc chức danh', 'mcp-rui-ro-can-giam-doc-xac-nhan-thu-cong': 'MCP rủi ro: cần bạn xác nhận thủ công trong 🧩 Năng lực',
  'nguoi-phai-dang-lam-viec-trong-phong': 'Người đó phải đang làm việc trong phòng', 'dang-bi-dinh-chi-hay-phuc-hoi-truoc': 'Đang bị đình chỉ, hãy phục hồi trước'
};
const errVn = m => ERR_VN[m] || m;
const nm = id => { const p = ORG.people.find(x => x.id === id); return p ? p.name : id; };
const roomName = r => { const x = ORG.rooms.find(z => z.id === r) || ORG.rooms.find(z => z.name === r); return x ? x.name : r; };
const reopen = (tab, pid) => { try { sessionStorage.setItem('office.reopen', JSON.stringify({ tab, pid })); } catch (e) {} };
const afterChange = (msg, tab, pid) => { toast(msg || 'Đã lưu. Đang dựng lại văn phòng…'); reopen(tab, pid); setTimeout(() => location.reload(), 900); };
async function post(path, body) { try { return await api(path, body); } catch (e) { toast(errVn(e.message), 'err'); return null; } }

// ---------- mô tả một hành động trong kế hoạch ----------
function actionInfo(a) {
  const who = a.id ? `${nm(a.id)}` : '';
  switch (a.type) {
    case 'create_agent': return { icon: '➕', text: `Tuyển ${a.name || '?'} · ${a.title || ''} → ${roomName(a.room)} (${ROLE_VN[a.role] || 'Nhân viên'}, model ${a.model || 'haiku'})`, detail: a.persona || a.description };
    case 'suspend': return { icon: '⛔', text: `Đình chỉ ${who}: ${a.reason || ''}`, danger: true };
    case 'reinstate': return { icon: '↩️', text: `Phục hồi ${who} → ${roomName(a.room) || 'phòng cũ'}${a.reason ? ': ' + a.reason : ''}` };
    case 'move': return { icon: '🔀', text: `Chuyển ${who} → ${roomName(a.room)}` };
    case 'fire': return { icon: '🚫', text: `Sa thải ${who}: ${a.reason || ''} (hồ sơ được lưu trữ)`, danger: true };
    case 'create_room': return { icon: '🏢', text: `Thành lập phòng "${a.name}"` };
    case 'dissolve_room': return { icon: '🧨', text: `Giải thể phòng ${roomName(a.room)} (nhân sự chuyển sang dự bị và bị đình chỉ)`, danger: true };
    case 'set_head': return { icon: '⭐', text: `Đặt ${who} làm trưởng phòng ${roomName(a.room)}` };
    case 'update_prompt': return { icon: '🎓', text: `Huấn luyện lại ${who}${a.reason ? ': ' + a.reason : ''} (sửa prompt, bản cũ được giữ)`, detail: a.persona };
    case 'note': return { icon: '📝', text: `Ghi ${({ evaluation: 'đánh giá', feedback: 'góp ý', warning: 'cảnh cáo', praise: 'khen' })[a.kind] || 'ghi chú'} cho ${who}: ${a.text || ''}` };
    default: return { icon: '❔', text: `Hành động lạ: ${a.type}` };
  }
}
// hiển thị kế hoạch nhân sự + nút duyệt (dùng trong tab Nhân sự và Hộp thư)
OA.renderPlan = function (item, host, onDone) {
  const plan = item.plan; if (!plan || !plan.actions) return;
  const acts = [].concat(plan.actions), boxes = [];
  host.append(el('div', { class: 'cardtitle' }, '📋 Kế hoạch nhân sự: ' + (plan.summary || '')));
  const list = el('div', {}); host.append(list);
  acts.forEach(a => {
    const info = actionInfo(a), cb = el('input', { type: 'checkbox', checked: item.status === 'pending' && !info.danger, disabled: item.status !== 'pending' }); boxes.push(cb);
    const row = el('div', { class: 'planrow' + (info.danger ? ' danger' : '') }, el('label', {}, cb, ` ${info.icon} ${info.text}`));
    if (info.detail) { const d = el('pre', { class: 'filev', style: 'display:none' }, info.detail); row.append(el('button', { class: 'link', onclick: () => d.style.display = d.style.display === 'none' ? '' : 'none' }, 'xem chi tiết'), d); }
    list.append(row);
  });
  if (acts.some(a => actionInfo(a).danger)) host.append(el('div', { class: 'note' }, '⚠ Các mục đỏ (đình chỉ, sa thải, giải thể) mặc định chưa được tick. Tick từng mục bạn đồng ý.'));
  if (item.status === 'pending') {
    const res = el('div', {});
    host.append(res, el('div', { class: 'mrow' },
      el('button', { class: 'btn2 sm', onclick: async () => { await post(`/api/inbox/${item.id}/dismiss`, {}); toast('Đã bỏ kế hoạch.'); onDone && onDone(); } }, 'Bỏ kế hoạch'),
      el('button', { class: 'btn3 sm', onclick: async () => {
        const chosen = acts.filter((a, i) => boxes[i].checked); if (!chosen.length) { toast('Chưa tick mục nào.', 'err'); return; }
        if (chosen.some(a => actionInfo(a).danger) && !confirm('Có mục đình chỉ / sa thải / giải thể. Xác nhận thực hiện các mục đã tick?')) return;
        const r = await post('/api/hr/execute', { actions: chosen, inboxId: item.id }); if (!r) return;
        res.replaceChildren(el('div', { class: 'note' }, r.results.map(x => `${x.ok ? '✅' : '❌'} ${x.type}${x.id ? ' ' + x.id : ''}: ${x.ok ? 'xong' : errVn(x.msg)}`).join(' · ')));
        afterChange('Đã thực hiện kế hoạch. Đang dựng lại văn phòng…', 'plans');
      } }, '✅ Duyệt các mục đã tick')));
  } else if (item.results) host.append(el('div', { class: 'note' }, 'Kết quả: ' + [].concat(item.results).map(x => `${x.ok ? '✅' : '❌'} ${x.type} ${x.id || ''}`).join(' · ')));
};

OA.openHr = async function (tab, pid) {
  let data, ov; try { data = await api('/api/org'); ov = await api('/api/hr/overview'); } catch (e) { toast(e.message, 'err'); return; }
  const org = data.org, stat = {}; ov.people.forEach(r => stat[r.id] = r);
  const m = modal('🧑‍💼 Cơ cấu & Nhân sự', true); m.box.classList.add('xl');
  let cur = tab || 'struct', who = pid || null;
  const tabs = el('div', { class: 'tabs' }), body = el('div', {}); m.body.append(tabs, body);
  const draw = () => {
    tabs.replaceChildren(...[['struct', '🏢 Cơ cấu'], ['request', '📨 Nhờ Nhân sự'], ['dossier', '📁 Hồ sơ & lịch sử'], ['plans', '📋 Kế hoạch']].map(([k, l]) => el('button', { class: 'tab' + (cur === k ? ' on' : ''), onclick: () => { cur = k; draw(); } }, l)));
    body.replaceChildren(({ struct: structTab, request: requestTab, dossier: dossierTab, plans: plansTab })[cur]());
  };

  // ---- Cơ cấu ----
  function structTab() {
    const coll = getColl(), wrap = el('div', {});
    wrap.append(el('div', { class: 'row-line' },
      el('button', { class: 'btn3 sm', onclick: () => roomForm(null) }, '🏢 Thành lập phòng ban'),
      el('button', { class: 'btn2 sm', onclick: () => { const c = {}; org.rooms.forEach(r => c[r.id] = 1); setColl(c); renderRoster(); draw(); } }, '▸ Thu gọn hết'),
      el('button', { class: 'btn2 sm', onclick: () => { setColl({}); renderRoster(); draw(); } }, '▾ Mở hết'),
      el('span', { class: 'dim' }, `${org.people.filter(p => p.role !== 'boss').length} nhân sự · ${org.people.filter(p => p.status === 'suspended').length} đình chỉ · ${org.rooms.length} phòng`)));
    org.rooms.forEach(r => {
      const mem = org.people.filter(p => p.room === r.id), folded = !!coll[r.id], head = org.people.find(p => p.id === r.headId);
      const fold = el('button', { class: 'caretb', title: folded ? 'Mở' : 'Thu gọn', onclick: () => { toggleColl(r.id); renderRoster(); draw(); } }, folded ? '▸' : '▾');
      const acts = el('span', { class: 'acts' });
      if (['dept', 'hr', 'boss'].includes(r.kind)) acts.append(el('button', { class: 'btn2 sm', onclick: () => recruitForm(r.id) }, '➕ Tuyển'));
      if (r.kind === 'dept') acts.append(el('button', { class: 'btn2 sm', onclick: () => roomForm(r) }, '✏️ Sửa'), el('button', { class: 'btn2 sm danger', onclick: () => dissolve(r, mem) }, '🧨 Giải thể'));
      const card = el('div', { class: 'hrroom' }, el('div', { class: 'hrhead' }, fold, el('i', { class: 'dot', style: `background:${r.color}` }), el('b', {}, r.name), el('span', { class: 'badge2 seen' }, KIND_VN[r.kind] || r.kind),
        el('span', { class: 'dim' }, `${mem.length} người${head ? ' · ' + head.name + ' trưởng phòng' : (['dept', 'hr'].includes(r.kind) ? ' · chưa có trưởng phòng' : '')}`), acts));
      if (!folded) {
        if (!mem.length) card.append(el('div', { class: 'dim', style: 'padding:4px 30px' }, r.kind === 'meeting' ? 'Không ai thuộc phòng họp, ai cũng vào được.' : 'Chưa có ai.'));
        mem.forEach(p => {
          const s = stat[p.id], sus = p.status === 'suspended', prot = PROTECTED.includes(p.id) || p.role === 'boss';
          const a = el('span', { class: 'acts' }, el('button', { class: 'btn2 sm', onclick: () => { m.close(); OA.openOrg('people', p.id); } }, '✏️ Sửa'), el('button', { class: 'btn2 sm', onclick: () => { cur = 'dossier'; who = p.id; draw(); } }, '📁 Hồ sơ'));
          if (sus) a.append(el('button', { class: 'btn2 sm', onclick: () => reinstateForm(p) }, '↩️ Phục hồi'), el('button', { class: 'btn2 sm danger', onclick: () => fireForm(p) }, '🚫 Sa thải'));
          else if (!prot) a.append(el('button', { class: 'btn2 sm', onclick: () => suspendForm(p) }, '⛔ Đình chỉ'), el('button', { class: 'btn2 sm danger', onclick: () => fireForm(p) }, '🚫 Sa thải'));
          card.append(el('div', { class: 'hrrow' + (sus ? ' sus' : '') }, el('i', { class: 'dot', style: `background:${p.color}` }), el('b', {}, p.name), el('span', { class: 'dim' }, p.title),
            el('span', { class: 'badge2 ' + (p.role === 'head' ? 'approved' : 'seen') }, ROLE_VN[p.role] || p.role), sus ? el('span', { class: 'badge2 pending' }, '⛔ Đình chỉ' + (p.reason ? ': ' + p.reason : '')) : null,
            s && p.role !== 'boss' ? el('span', { class: 'dim' }, `${s.jobsReal} việc thật · ${s.jobsMock} thử · 👍${s.thumbsUp} 👎${s.thumbsDown}`) : null, a));
        });
      }
      wrap.append(card);
    });
    return wrap;
  }
  function roomForm(r) {
    const f = modal(r ? 'Sửa phòng ' + r.name : 'Thành lập phòng ban'), name = el('input', { value: r ? r.name : '', maxlength: 40, placeholder: 'Tên phòng ban' }), color = el('input', { type: 'color', value: r ? r.color : '#2aa198' });
    const mem = r ? org.people.filter(p => p.room === r.id) : [], head = sel([['', '(chưa có)'], ...mem.map(p => [p.id, p.name])], r ? r.headId || '' : '');
    f.body.append(el('div', { class: 'grid2' }, field('Tên', name, true), field('Màu', color), r ? field('Trưởng phòng', head) : null),
      el('div', { class: 'note' }, r ? '' : 'Phòng mới tự lấy ô trống trên bản đồ. Sau khi lập, hãy tuyển trưởng phòng đầu tiên (hoặc nhờ Trưởng phòng Nhân sự).'),
      el('div', { class: 'mrow' }, el('button', { class: 'btn3', onclick: async () => { const x = await post('/api/departments', { id: r && r.id, name: name.value, color: color.value, headId: r ? head.value : undefined }); if (x) { f.close(); m.close(); afterChange(r ? 'Đã lưu phòng.' : 'Đã thành lập phòng.', 'struct'); } } }, r ? 'Lưu' : 'Thành lập')));
  }
  function dissolve(r, mem) {
    if (!confirm(`Giải thể phòng "${r.name}"?\n\n• ${mem.length} người trong phòng KHÔNG bị xoá: họ chuyển sang Phòng nhân sự dự bị và bị đình chỉ (có thể phục hồi).\n• Phòng được lưu trữ, thư mục workspace giữ nguyên.\n• Các lịch việc giao cho phòng này bị tắt.`)) return;
    post(`/api/departments/${r.id}/archive`, {}).then(x => { if (x) { m.close(); afterChange('Đã giải thể phòng; nhân sự chuyển sang dự bị.', 'struct'); } });
  }
  function recruitForm(roomId) {
    const f = modal('➕ Tuyển nhân sự'), rooms = org.rooms.filter(r => ['dept', 'hr', 'boss'].includes(r.kind));
    const F = { name: el('input', { maxlength: 40, placeholder: 'Tên (ví dụ: Lan)' }), title: el('input', { maxlength: 120, placeholder: 'Chức danh (ví dụ: Biên tập viên)' }), room: sel(rooms.map(r => [r.id, r.name]), roomId), role: sel([['staff', 'Nhân viên'], ['head', 'Trưởng phòng']], 'staff'),
      color: el('input', { type: 'color', value: '#3f78d6' }), vibe: el('input', { maxlength: 300, placeholder: 'Tính cách ngắn' }), desc: el('textarea', { rows: 2, placeholder: 'Khi nào dùng người này (Claude dựa vào đây để giao việc)' }), model: sel([['haiku', 'haiku (nhẹ, rẻ)'], ['sonnet', 'sonnet'], ['', 'mặc định']], 'haiku'),
      tools: checks(['Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'WebFetch'], ['Read', 'Write', 'Edit', 'Glob']), persona: el('textarea', { rows: 6, placeholder: 'Prompt: vai trò, quy trình, nguyên tắc. Bỏ trống để dùng mẫu chuẩn.' }) };
    f.body.append(el('div', { class: 'grid2' }, field('Tên', F.name), field('Màu', F.color), field('Chức danh', F.title, true), field('Phòng', F.room), field('Vai trò', F.role), field('Vibe', F.vibe, true), field('Mô tả khi nào dùng', F.desc, true), field('Model', F.model), field('Công cụ', F.tools, true), field('Prompt', F.persona, true)),
      el('div', { class: 'note' }, 'Công cụ ngoài (Bash, MCP, skill) giao sau trong 🧩 Năng lực. Hoặc nhờ Trưởng phòng Nhân sự soạn hồ sơ tuyển đầy đủ.'),
      el('div', { class: 'mrow' }, el('button', { class: 'btn2', onclick: () => { f.close(); cur = 'request'; draw(); } }, '📨 Nhờ Trưởng phòng Nhân sự tuyển'),
        el('button', { class: 'btn3', onclick: async () => { const x = await post('/api/agents', { name: F.name.value, title: F.title.value, room: F.room.value, role: F.role.value, color: F.color.value, vibe: F.vibe.value, description: F.desc.value, model: F.model.value, tools: picked(F.tools).join(','), skills: '', persona: F.persona.value }); if (x) { f.close(); m.close(); afterChange('Đã tuyển ' + F.name.value + '.', 'struct'); } } }, 'Tuyển')));
  }
  function reasonForm(title, label, button, danger, run) {
    const f = modal(title), reason = el('textarea', { rows: 3, placeholder: label });
    f.body.append(el('div', {}, reason), el('div', { class: 'mrow' }, el('button', { class: 'btn2', onclick: () => f.close() }, 'Huỷ'), el('button', { class: 'btn3' + (danger ? ' danger' : ''), onclick: async () => { if (!reason.value.trim()) { toast('Hãy ghi lý do (để lưu vào lịch sử).', 'err'); return; } if (await run(reason.value.trim())) { f.close(); m.close(); } } }, button)));
  }
  const suspendForm = p => reasonForm(`⛔ Đình chỉ ${p.name}`, 'Lý do đình chỉ (lưu vào hồ sơ)…', 'Đình chỉ', false, async r => { const x = await post('/api/hr/suspend', { id: p.id, reason: r }); if (x) afterChange(`Đã đình chỉ ${p.name}; chuyển sang phòng dự bị.`, 'struct'); return !!x; });
  const fireForm = p => reasonForm(`🚫 Sa thải ${p.name}`, 'Lý do sa thải (lưu vào hồ sơ)…', 'Sa thải (lưu trữ hồ sơ)', true, async r => { if (!confirm(`Sa thải ${p.name}? Hồ sơ và file agent được lưu trữ trong office/_archive (không xoá), nhưng người này rời khỏi văn phòng.`)) return false; const x = await post('/api/hr/fire', { id: p.id, reason: r }); if (x) afterChange(`Đã sa thải ${p.name}.`, 'struct'); return !!x; });
  function reinstateForm(p) {
    const f = modal(`↩️ Phục hồi ${p.name}`), rooms = org.rooms.filter(r => ['dept', 'hr', 'boss'].includes(r.kind)), room = sel(rooms.map(r => [r.id, r.name]), p.prevRoom && rooms.some(r => r.id === p.prevRoom) ? p.prevRoom : rooms[0].id), why = el('input', { placeholder: 'Ghi chú (không bắt buộc)' });
    f.body.append(el('div', { class: 'grid2' }, field('Về phòng', room), field('Ghi chú', why)), el('div', { class: 'mrow' }, el('button', { class: 'btn3', onclick: async () => { const x = await post('/api/hr/reinstate', { id: p.id, room: room.value, reason: why.value }); if (x) { f.close(); m.close(); afterChange(`Đã phục hồi ${p.name}.`, 'struct'); } } }, 'Phục hồi')));
  }

  // ---- Nhờ Nhân sự ----
  const KINDS = [['recruit', '➕ Tuyển dụng', 'Ví dụ: Tuyển thêm 1 biên tập viên cho phòng Marketing, chuyên viết caption Facebook.'], ['review', '📊 Đánh giá năng lực', 'Ví dụ: Đánh giá toàn bộ nhân sự dựa trên lịch sử làm việc, góp ý nâng cấp.'], ['lean', '✂️ Tinh gọn', 'Ví dụ: Công ty cần tinh gọn, giảm khoảng 2 người ít hiệu quả nhất.'], ['expand', '🚀 Mở rộng', 'Ví dụ: Chuẩn bị mở rộng để chạy thêm kênh TikTok, cần phòng ban và người mới nào?'], ['other', '💬 Khác', 'Nêu yêu cầu nhân sự khác…']];
  let kind = 'recruit', draft = '';
  function requestTab() {
    const wrap = el('div', {}), ta = el('textarea', { rows: 4, placeholder: KINDS[0][2] }, draft), out = el('div', {}), run = el('div', {});
    const kb = el('div', { class: 'tabs' });
    const drawKinds = () => { kb.replaceChildren(...KINDS.map(([k, l, ph]) => el('button', { class: 'tab' + (kind === k ? ' on' : ''), onclick: () => { draft = ta.value; kind = k; ta.placeholder = ph; drawKinds(); } }, l))); ta.placeholder = KINDS.find(x => x[0] === kind)[2]; };
    drawKinds();
    wrap.append(el('div', { class: 'note', html: 'Trưởng phòng Nhân sự đọc <b>hồ sơ và lịch sử làm việc</b> của từng người rồi <b>đề xuất kế hoạch</b>. Hệ thống chỉ thực hiện (tuyển, đình chỉ, sa thải, lập/giải thể phòng, sửa prompt) sau khi bạn tick và bấm Duyệt. Số liệu từ "Chạy thử" là giả lập, không tính vào đánh giá năng lực thật.' }), kb, ta,
      el('div', { class: 'mrow' }, el('button', { class: 'btn3', onclick: async () => {
        const text = ta.value.trim(); if (!text) { toast('Hãy nêu yêu cầu.', 'err'); return; }
        if (OA.engine().startsWith('claude') && !confirm('Nhờ Nhân sự dùng khoảng 1 lượt Claude (trưởng phòng Nhân sự chạy model sonnet). Tiếp tục?')) return;
        const r = await OA.start({ path: '/api/hr/request', kind, text }); if (!r) return;
        run.replaceChildren(el('div', { class: 'note' }, '⏳ Trưởng phòng Nhân sự đang đọc hồ sơ và lập kế hoạch… (xem trên bản đồ: phòng Nhân sự đang làm việc)'));
        OA.track(r.job, null, async res => {
          let item = null; try { item = (await api('/api/inbox')).items.find(i => i.id === r.job); } catch (e) {}
          out.replaceChildren(); run.replaceChildren();
          if (item && item.plan) { out.append(el('div', { class: 'mailcard new' }, el('div', { class: 'mailbody', html: md((item.summary || '').split('```office-plan')[0]) }), el('div', {}, (() => { const h = el('div', {}); OA.renderPlan(item, h, () => { cur = 'plans'; draw(); }); return h; })()))); }
          else out.append(el('div', { class: 'mailcard' }, el('div', { class: 'mailbody', html: md(res.result || res.texts.join('\n') || 'Không có kết quả.') }), el('div', { class: 'note' }, 'Không đọc được kế hoạch có cấu trúc từ câu trả lời. Bạn có thể thử lại hoặc diễn đạt yêu cầu rõ hơn.')));
        });
      } }, '📨 Gửi cho Trưởng phòng Nhân sự')), run, out);
    return wrap;
  }

  // ---- Hồ sơ & lịch sử ----
  function dossierTab() {
    const wrap = el('div', {}), pick = el('select', {}, ...org.people.filter(p => p.role !== 'boss').map(p => el('option', { value: p.id }, `${p.name} · ${p.title}${p.status === 'suspended' ? ' (đình chỉ)' : ''}`))), box = el('div', {});
    if (who && org.people.some(p => p.id === who)) pick.value = who; else who = pick.value;
    pick.onchange = () => { who = pick.value; load(); };
    wrap.append(el('div', { class: 'row-line' }, pick, el('button', { class: 'btn2 sm', onclick: () => load() }, '🔄 Làm mới')), box);
    async function load() {
      box.replaceChildren(el('div', { class: 'dim' }, 'Đang tải…'));
      let d, h; try { d = await api('/api/hr/dossier?id=' + who); h = (await api('/api/hr/history?id=' + who)).events; } catch (e) { box.replaceChildren(el('div', { class: 'note' }, e.message)); return; }
      const s = d.stats, kv = (k, v) => el('div', { class: 'kv' }, el('span', { class: 'dim' }, k), el('b', {}, String(v)));
      const note = el('input', { placeholder: 'Ghi chú nhân sự…' }), nk = sel([['evaluation', 'Đánh giá'], ['feedback', 'Góp ý'], ['warning', 'Cảnh cáo'], ['praise', 'Khen']], 'feedback');
      box.replaceChildren(...[
        el('div', { class: 'kvs' }, kv('Phòng', d.roomName), kv('Vai trò', ROLE_VN[d.role] || d.role), kv('Trạng thái', d.status === 'suspended' ? 'Đình chỉ' : 'Đang làm việc'), kv('Vào làm', fmtTime(d.joinedAt)), kv('Model', d.model || '—'),
          kv('Việc thật', `${s.jobsRealOk}/${s.jobsReal} ok`), kv('Việc thử (mock)', s.jobsMock), kv('Phiên làm việc', `${s.workSessions} (TB ${s.avgWorkSeconds}s)`), kv('Lần cuối hoạt động', fmtTime(s.lastActive)), kv('👍 / 👎 khi chat thử', `${d.feedback.up} / ${d.feedback.down}`), kv('Bản prompt', d.trials.promptVersions), kv('Đạt chuẩn', d.trials.certified ? fmtTime(d.trials.certified) : 'chưa')),
        d.reason ? el('div', { class: 'note' }, '⛔ Lý do đình chỉ: ' + d.reason) : null,
        d.feedback.comments.length ? el('div', { class: 'note' }, '👎 Góp ý của giám đốc: ' + d.feedback.comments.join(' | ')) : null,
        el('h4', {}, 'Ghi chú và đánh giá nhân sự'), el('div', {}, d.notes.length ? d.notes.slice().reverse().map(n => el('div', { class: 'row-line' }, el('span', { class: 'badge2 seen' }, n.kind), el('span', { class: 'dim' }, fmtTime(n.t) + ' · ' + n.by), el('span', {}, n.text))) : el('div', { class: 'dim' }, 'Chưa có ghi chú.')),
        el('div', { class: 'row-line' }, nk, note, el('button', { class: 'btn2 sm', onclick: async () => { if (!note.value.trim()) return; const x = await post('/api/hr/note', { id: who, kind: nk.value, text: note.value }); if (x) { toast('Đã ghi.'); load(); } } }, 'Ghi')),
        el('h4', {}, 'Lịch sử gần đây'), el('div', { class: 'tl' }, h.length ? h.slice().reverse().slice(0, 60).map(e => el('div', { class: 'tlrow' }, el('span', { class: 'dim' }, fmtTime(e.t)), el('span', {}, evText(e)))) : el('div', { class: 'dim' }, 'Chưa có lịch sử (lịch sử được ghi từ khi bật bản này).'))].filter(Boolean));
    }
    load(); return wrap;
  }
  const evText = e => ({ status: () => `Trạng thái ${e.from} → ${e.to}${e.task ? ': ' + e.task : ''}`, job: () => `${e.ok ? '✅' : '❌'} Việc "${e.label}" (${e.kind}, ${e.engine === 'mock' ? 'chạy thử' : 'thật'})`, suspend: () => `⛔ Bị đình chỉ: ${e.reason}`, reinstate: () => `↩️ Phục hồi vào ${e.room}`, fire: () => `🚫 Bị sa thải: ${e.reason}`, hire: () => `➕ Được tuyển vào ${e.room}`, move: () => `🔀 Chuyển ${e.from} → ${e.to}`, coach: () => `🎓 Huấn luyện lại: ${e.reason}`, sethead: () => `⭐ Làm trưởng phòng ${e.room}` }[e.ev] || (() => e.ev))();

  // ---- Kế hoạch ----
  function plansTab() {
    const wrap = el('div', {}, el('div', { class: 'dim' }, 'Đang tải…'));
    api('/api/inbox').then(r => {
      const items = r.items.filter(i => i.kind === 'hr' && i.plan);
      wrap.replaceChildren(items.length ? el('div', {}, items.map(it => { const c = el('div', { class: 'mailcard ' + it.status }, el('div', { class: 'mailhead' }, el('b', {}, it.title), el('span', { class: 'badge2 ' + it.status }, ({ pending: 'Chờ duyệt', approved: 'Đã duyệt', dismissed: 'Đã bỏ', new: 'Mới' })[it.status] || it.status), el('span', { class: 'dim' }, fmtTime(it.created) + (it.engine === 'mock' ? ' · chạy thử' : ''))), el('div', { class: 'mailbody', html: md((it.summary || '').split('```office-plan')[0]) })); OA.renderPlan(it, c, () => draw()); return c; })) : el('div', { class: 'note' }, 'Chưa có kế hoạch nhân sự nào. Vào tab "Nhờ Nhân sự" để yêu cầu.'));
    });
    return wrap;
  }
  draw();
};
document.getElementById('btnOrg').onclick = () => OA.openHr('struct');
document.getElementById('p-hr').onclick = () => { if (typeof selected !== 'undefined' && selected && selected !== 'giam-doc') OA.openHr('dossier', selected); else toast('Hãy bấm chọn một nhân vật (không phải giám đốc).'); };
try { const r = JSON.parse(sessionStorage.getItem('office.reopen') || 'null'); if (r) { sessionStorage.removeItem('office.reopen'); setTimeout(() => OA.openHr(r.tab, r.pid), 1500); } } catch (e) {}
})();
