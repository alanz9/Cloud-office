// Chat riêng với từng agent để thử năng lực và chỉnh dần tới khi ưng: chat thử trong hộp cát, 👍/👎, Trợ lý đề xuất sửa prompt,
// hỏi lại với bản mới, bộ câu hỏi kiểm tra, lịch sử phiên bản, đạt chuẩn.
(() => {
const { api, el, esc, md, toast, modal, field, sel, checks, picked, fmtTime } = OA;
const parseImprove = t => { const p = /##\s*Prompt mới\s*\n<<<\n([\s\S]*?)\n>>>/.exec(t), c = /##\s*Thay đổi chính\s*\n([\s\S]*?)(?:\n##\s*Prompt mới|$)/.exec(t); return p ? { persona: p[1], changes: c ? c[1].trim() : '' } : null; };

OA.openTrainer = async function (id) {
  let data; try { data = await api('/api/org'); } catch (e) { toast(e.message, 'err'); return; }
  const person = data.org.people.find(p => p.id === id), a = data.agents[id], cat = data.catalog;
  if (!person || !a) { toast('Nhân vật này không có file agent để huấn luyện.', 'err'); return; }
  const m = modal(`💬 Chat thử & huấn luyện: ${person.name}`, true); m.box.classList.add('xl');
  const famT = () => OA.engine().startsWith('claude') ? 'claude' : 'mock'; let sidFam = '';
  let sid = '', msgs = [], busy = null, fb = [], tests = [], certFile = ((data.certified || {})[id] || {}).file || '';
  try { const t = await api(`/api/agents/${id}/trials`); msgs = t.messages || []; const sp = String(t.sid || '').split(':'); if (sp.length === 2) { sidFam = sp[0]; sid = sp[1]; } } catch (e) {}
  try { tests = (await api(`/api/agents/${id}/tests`)).cases || []; } catch (e) {}
  // --- cột trái: chat ---
  const log = el('div', { class: 'tchat' }), inp = el('textarea', { rows: 2, placeholder: 'Hỏi thử hoặc giao một việc nhỏ để kiểm tra năng lực...' }), ro = el('input', { type: 'checkbox', checked: true });
  const sendB = el('button', { class: 'btn3', onclick: () => ask(inp.value) }, 'Gửi'), stopB = el('button', { class: 'btn2 sm', style: 'display:none', onclick: () => { busy && busy.stop(); } }, '⏹');
  const persist = () => api(`/api/agents/${id}/trials`, { session: 'phien-hien-tai', sid: sid ? sidFam + ':' + sid : '', messages: msgs }).catch(() => {});
  function render() {
    log.replaceChildren(...msgs.map((x, i) => {
      const d = el('div', { class: 'msg ' + (x.role === 'user' ? 'user' : 'bot') });
      if (x.role === 'user') d.textContent = x.text; else {
        d.innerHTML = `<div class="who">${esc(person.name)}${x.tag ? ' · ' + esc(x.tag) : ''}</div>${md(x.text)}`;
        const row = el('div', { class: 'row' }, el('button', { onclick: () => { x.vote = 'up'; persist(); render(); } }, x.vote === 'up' ? '👍 Ưng' : '👍'), el('button', { onclick: () => { const t = prompt('Chưa ưng chỗ nào? (góp ý cho Trợ lý sửa prompt)'); if (t) { x.vote = 'down'; x.fb = t; fb.push(`Với câu hỏi "${(msgs[i - 1] || {}).text || ''}": ${t}`); persist(); render(); } } }, x.vote === 'down' ? '👎 Chưa ưng' : '👎'));
        if (x.fb) row.append(el('span', { class: 'dim' }, ' ' + x.fb)); d.append(row);
      }
      return d;
    })); log.scrollTop = log.scrollHeight;
  }
  function runTrial(text, fresh, tag) {
    return new Promise(resolve => {
      OA.start({ kind: 'trial', mode: ro.checked ? 'plan' : 'run', agent: id, prompt: OA.prompts.trialHead.replace('{id}', id).replace('{text}', text), resume: fresh || sidFam !== famT() ? '' : sid, label: 'Chat thử ' + person.name }).then(r => {
        if (!r) { resolve(null); return; }
        busy = OA.track(r.job, null, res => { busy = null; stopB.style.display = 'none'; sendB.disabled = false;
          if (!fresh && /No conversation found/i.test((res.stderr || '') + (res.result || ''))) { sid = ''; toast('Phiên chat thử cũ không còn, mình mở phiên mới.'); runTrial(text, false, tag).then(resolve); return; }
          if (!fresh && res.sid) { sid = res.sid; sidFam = famT(); } resolve({ text: res.texts.join('\n\n') || res.result || '(không có trả lời)', err: res.isError, sid: res.sid }); });
        stopB.style.display = ''; sendB.disabled = true;
      });
    });
  }
  async function ask(t) {
    t = t.trim(); if (!t || busy) return; inp.value = ''; msgs.push({ role: 'user', text: t }); render();
    const r = await runTrial(t, false); if (!r) return; msgs.push({ role: 'bot', text: r.text, err: r.err }); render(); persist();
  }
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(inp.value); } });
  const left = el('div', { class: 'tcol' }, el('h4', {}, 'Chat thử'), log, el('div', { class: 'row-line' }, el('label', { class: 'ck' }, ro, ' Chỉ đọc (không tạo file)'), el('span', { class: 'dim' }, 'Nếu tạo file, chỉ vào workspace/_thu-nghiem/' + id + '/'), stopB),
    el('div', { class: 'row-line' }, inp, sendB),
    el('div', { class: 'row-line' }, el('button', { class: 'btn2 sm', onclick: () => { msgs = []; sid = ''; fb = []; render(); persist(); } }, '🗑️ Phiên mới'), el('button', { class: 'btn2 sm', onclick: () => reask() }, '🔁 Hỏi lại câu cuối với bản mới'), el('button', { class: 'btn2 sm', onclick: () => saveCase() }, '➕ Lưu câu cuối vào bộ kiểm tra')));
  // --- cột phải: setup ---
  const F = { desc: el('textarea', { rows: 2 }, a.description), model: sel([['', 'mặc định'], ...cat.models.map(x => [x, x])], a.model), tools: checks(cat.tools, a.tools.split(',').map(s => s.trim()).filter(Boolean)),
    skills: el('div', { class: 'dim' }, (a.skills ? 'Skill: ' + a.skills : 'Chưa có skill') + (a.tools.includes('mcp__') ? ' · MCP: ' + a.tools.split(',').map(s => s.trim()).filter(s => s.startsWith('mcp__')).join(', ') : '') + ' (đổi ở 🧩 Năng lực)'), persona: el('textarea', { rows: 12 }, a.persona) };
  const cur = () => ({ description: F.desc.value, model: F.model.value, tools: OA.mergeTools(a.tools, picked(F.tools)), skills: a.skills, persona: F.persona.value });
  const saveSetup = async () => { try { await api('/api/agents/' + id, { agent: cur() }); toast('Đã lưu (bản cũ được giữ trong lịch sử phiên bản).'); refreshVersions(); return true; } catch (e) { toast(e.message, 'err'); return false; } };
  const fbIn = el('input', { placeholder: 'Góp ý thêm cho Trợ lý (không bắt buộc)' });
  const improve = async () => {
    if (!OA.prompts) return; const chat = msgs.slice(-8).map(x => (x.role === 'user' ? 'Giám đốc: ' : person.name + ': ') + x.text).join('\n\n') || '(chưa có chat)';
    const feedback = [...fb.slice(-6), fbIn.value.trim()].filter(Boolean).join('\n') || '(giám đốc chưa ghi góp ý, hãy dựa vào đoạn chat để cải thiện)';
    if (OA.engine().startsWith('claude') && !confirm('Nhờ Trợ lý sửa prompt sẽ dùng 1 lượt gọi Claude. Tiếp tục?')) return;
    const p = OA.prompts.improve.replace('{id}', id).replace('{name}', person.name).replace('{title}', person.title).replace('{persona}', F.persona.value).replace('{chat}', chat).replace('{feedback}', feedback);
    const r = await OA.start({ kind: 'improve', mode: 'plan', agent: '', prompt: p, label: 'Sửa prompt ' + person.name }); if (!r) return;
    toast('Trợ lý đang soạn bản sửa…'); impB.disabled = true;
    OA.track(r.job, null, res => { impB.disabled = false; const t = res.texts.join('\n') + '\n' + (res.result || ''); const pr = parseImprove(t); if (!pr) { toast('Không đọc được bản sửa Trợ lý trả về.', 'err'); return; } diff(pr); });
  };
  const impB = el('button', { class: 'btn2 sm', onclick: improve }, '🪄 Nhờ Trợ lý sửa');
  function diff(pr) {
    const d = modal('So sánh prompt trước / sau', true), after = el('textarea', { rows: 16 }, pr.persona);
    d.body.append(el('div', { class: 'mailbody', html: md(pr.changes || '') }), el('div', { class: 'grid2' }, el('div', {}, el('h4', {}, 'Trước'), el('pre', { class: 'filev' }, F.persona.value)), el('div', {}, el('h4', {}, 'Sau (sửa tay được)'), after)),
      el('div', { class: 'mrow' }, el('button', { class: 'btn2', onclick: () => d.close() }, 'Bỏ'), el('button', { class: 'btn3', onclick: async () => { F.persona.value = after.value; if (await saveSetup()) { d.close(); toast('Đã áp dụng. Bấm "Hỏi lại câu cuối với bản mới" để so sánh.'); } } }, 'Áp dụng và lưu')));
  }
  async function reask() {
    const lastQ = [...msgs].reverse().find(x => x.role === 'user'); const lastA = [...msgs].reverse().find(x => x.role === 'bot'); if (!lastQ) { toast('Chưa có câu hỏi nào.', 'err'); return; }
    if (!(await saveSetup())) return; toast('Đang hỏi lại với bản hiện tại…');
    const r = await runTrial(lastQ.text, true); if (!r) return;
    const c = modal('So sánh câu trả lời cũ và mới', true);
    c.body.append(el('div', { class: 'note' }, 'Câu hỏi: ' + lastQ.text), el('div', { class: 'grid2' }, el('div', {}, el('h4', {}, 'Bản cũ'), el('div', { class: 'mailbody', html: md(lastA ? lastA.text : '(chưa có)') })), el('div', {}, el('h4', {}, 'Bản mới'), el('div', { class: 'mailbody', html: md(r.text) }))),
      el('div', { class: 'mrow' }, el('button', { class: 'btn2', onclick: () => c.close() }, 'Đóng'), el('button', { class: 'btn3', onclick: () => { msgs.push({ role: 'user', text: lastQ.text }, { role: 'bot', text: r.text, tag: 'bản mới' }); render(); persist(); c.close(); } }, 'Thêm vào chat')));
  }
  // --- bộ câu hỏi kiểm tra ---
  const testBox = el('div', {});
  function renderTests() {
    testBox.replaceChildren(...tests.map((t, i) => el('div', { class: 'row-line' }, el('input', { value: t.q, placeholder: 'Câu hỏi / việc thử', onchange: e => t.q = e.target.value }), el('input', { value: t.criteria, placeholder: 'Thế nào là đạt?', onchange: e => t.criteria = e.target.value }), el('button', { class: 'btn2 sm', onclick: () => { tests.splice(i, 1); renderTests(); } }, '×'))),
      el('div', { class: 'row-line' }, el('button', { class: 'btn2 sm', onclick: () => { tests.push({ q: '', criteria: '' }); renderTests(); } }, '+ Thêm câu'), el('button', { class: 'btn2 sm', onclick: async () => { try { await api(`/api/agents/${id}/tests`, { cases: tests }); toast('Đã lưu bộ kiểm tra.'); } catch (e) { toast(e.message, 'err'); } } }, 'Lưu bộ'), el('button', { class: 'btn3 sm', onclick: runTests }, '▶ Chạy bộ kiểm tra')));
  }
  function saveCase() { const q = [...msgs].reverse().find(x => x.role === 'user'); if (!q) { toast('Chưa có câu hỏi.', 'err'); return; } tests.push({ q: q.text, criteria: '' }); renderTests(); toast('Đã thêm vào bộ kiểm tra (nhớ bấm Lưu bộ và ghi tiêu chí đạt).'); }
  async function runTests() {
    const list = tests.filter(t => t.q.trim()); if (!list.length) { toast('Bộ kiểm tra đang trống.', 'err'); return; }
    if (!confirm(`Chạy ${list.length} câu = ${list.length} lượt gọi ${OA.engine().startsWith('claude') ? 'Claude THẬT (tốn hạn mức)' : 'giả lập (không tốn token)'}. Tiếp tục?`)) return;
    if (!(await saveSetup())) return;
    const r = modal('Kết quả bộ kiểm tra', true), box = el('div', {}), sum = el('div', { class: 'note' }); r.body.append(sum, box); let pass = 0;
    const upd = () => sum.textContent = `Đạt ${pass}/${list.length} (bạn tick từng câu theo tiêu chí).`; upd();
    for (const t of list) { const row = el('div', { class: 'mailcard' }, el('b', {}, t.q), el('div', { class: 'dim' }, 'Tiêu chí: ' + (t.criteria || '(chưa ghi)')), el('div', { class: 'dim' }, 'Đang chạy…')); box.append(row); const a2 = await runTrial(t.q, true); row.lastChild.remove();
      row.append(el('div', { class: 'mailbody', html: md(a2 ? a2.text : '(lỗi)') }), el('label', { class: 'ck' }, el('input', { type: 'checkbox', onchange: e => { pass += e.target.checked ? 1 : -1; upd(); } }), ' Đạt')); }
  }
  // --- phiên bản ---
  const verSel = el('select', {}), verInfo = el('span', { class: 'dim' });
  async function refreshVersions() {
    try { const v = (await api(`/api/agents/${id}/versions`)).versions; verSel.replaceChildren(...v.map(x => el('option', { value: x.name }, (x.certified ? '⭐ ' : '') + x.name.replace('.md', '').replace(/-dat-chuan$/, ' (đạt chuẩn)')))); verInfo.textContent = v.length ? v.length + ' bản' : 'chưa có bản cũ nào'; } catch (e) {}
  }
  const viewVer = async () => { if (!verSel.value) return; try { const v = await api(`/api/agents/${id}/version?name=${encodeURIComponent(verSel.value)}`); const d = modal('Phiên bản ' + verSel.value); d.body.append(el('pre', { class: 'filev' }, v.persona), el('div', { class: 'mrow' }, el('button', { class: 'btn3', onclick: async () => { if (!confirm('Khôi phục bản này? (bản hiện tại được giữ lại trong lịch sử)')) return; try { await api(`/api/agents/${id}/restore`, { name: verSel.value }); toast('Đã khôi phục.'); d.close(); m.close(); OA.openTrainer(id); } catch (e) { toast(e.message, 'err'); } } }, 'Khôi phục bản này'))); } catch (e) { toast(e.message, 'err'); } };
  const certify = async () => { if (!(await saveSetup())) return; try { await api(`/api/agents/${id}/certify`, {}); toast(`⭐ ${person.name} đã đạt chuẩn. Phiên bản được lưu lại.`); badge.textContent = '⭐ Đã đạt chuẩn'; refreshVersions(); } catch (e) { toast(e.message, 'err'); } };
  const badge = el('span', { class: 'badge2 seen' }, certFile ? '⭐ Đã đạt chuẩn' : 'Chưa đạt chuẩn');
  const right = el('div', { class: 'tcol' }, el('h4', {}, 'Setup của agent ', badge), field('Khi nào dùng', F.desc, true), el('div', { class: 'grid2' }, field('Model', F.model), field('Công cụ', F.tools, true), field('Skill', F.skills, true)), field('Prompt', F.persona, true),
    fbIn, el('div', { class: 'row-line' }, el('button', { class: 'btn3 sm', onclick: saveSetup }, '💾 Lưu'), impB, el('button', { class: 'btn2 sm', onclick: certify }, '⭐ Đạt chuẩn')),
    el('div', { class: 'row-line' }, 'Lịch sử:', verSel, el('button', { class: 'btn2 sm', onclick: viewVer }, 'Xem / khôi phục'), verInfo), el('h4', {}, 'Bộ câu hỏi kiểm tra'), testBox);
  m.body.append(el('div', { class: 'split' }, left, right));
  render(); renderTests(); refreshVersions();
};
})();
