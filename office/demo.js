// Chế độ DEMO: kịch bản chạy ngay trong trình duyệt, dùng CHÍNH cơ chế trạng thái thật (window.AGENTS + window.MEETING → refresh()),
// nên nhân vật đi lại, họp, bong bóng thoại, hồ sơ bay y hệt khi chạy thật mà không gọi Claude, không tốn token.
(() => {
const { el, toast } = OA;
const btn = document.getElementById('btnDemo'), speedSel = document.getElementById('demoSpeed'), loopCk = document.getElementById('demoLoop'), note = document.getElementById('demoNote');
let running = false, t = 0, speed = 1, idx = 0, ev = [], endAt = 0;
const hh = () => new Date().toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit' });
function setSt(id, status, task, say, to) { if (!NODES[id]) return; const o = { status, task, say: say || '', log: [`${hh()} ${task}`] }; if (to) o.to = to; window.AGENTS = window.AGENTS || {}; window.AGENTS[id] = o; refresh(); }
let M = null;
function meet(open, topic, who) { if (open === 'open') M = { id: 'demo', topic, room: ORG.rooms.find(r => r.kind === 'meeting').id, participants: who, open: true, lines: [] }; else if (open === 'close' && M) M.open = false; window.MEETING = M; refresh(); }
function line(id, text) { if (!M) return; M.lines.push({ who: id, text, t: hh() }); window.MEETING = M; refresh(); }
function build() {
  const heads = ORG.rooms.filter(r => r.kind === 'dept' && r.headId).map(r => ({ room: r, head: r.headId, staff: ORG.people.filter(p => p.room === r.id && p.role === 'staff').slice(0, 2).map(p => p.id) }));
  const topic = 'Kế hoạch đợt thử thách 3 ngày', E = []; const at = (s, f) => E.push([s, f]);
  at(0, () => setSt('tro-ly', 'working', 'Nhận việc: chuẩn bị đợt thử thách 3 ngày', 'Nhận lệnh rồi, mình triệu tập họp!'));
  const who = ['tro-ly', ...heads.map(h => h.head), 'kiem-duyet'];
  at(3, () => meet('open', topic, who));
  const opinions = ['Marketing lên 3 hook về làm chủ video AI trong 3 ngày.', 'Sale chuẩn bị email mã giảm 50% cho người tham gia.', 'CSKH soạn giáo án ngày 1, 2, 3 và tin nhắn nhắc việc.', 'Mình rà lời hứa thu nhập trước khi trình giám đốc.'];
  let s = 16; at(s, () => line('tro-ly', 'Chào mọi người, họp về đợt thử thách 3 ngày nhé.')); s += 4;
  who.filter(x => x !== 'tro-ly').forEach((id, i) => { at(s, () => line(id, opinions[i % opinions.length])); s += 4; });
  at(s, () => line('tro-ly', 'Chốt: mỗi phòng làm bản nháp phần mình, kiểm duyệt rà rồi trình giám đốc.')); s += 4;
  at(s, () => meet('close')); const work = s + 4;
  heads.forEach((h, i) => {
    const b = work + i * 4;
    at(b, () => setSt(h.head, 'working', 'Lên kế hoạch phần việc của phòng ' + h.room.name, 'Mình chia việc cho cả phòng nhé.'));
    h.staff.forEach((sid, k) => at(b + 6 + k * 3, () => setSt(sid, 'working', 'Soạn bản nháp theo chỉ đạo của trưởng phòng', 'Mình bắt đầu soạn bản nháp.')));
    h.staff.forEach((sid, k) => at(b + 30 + k * 3, () => setSt(sid, 'review', 'Xong bản nháp, chờ trưởng phòng duyệt', 'Xong rồi, gửi sếp duyệt!', h.head)));
    at(b + 38, () => setSt(h.head, 'review', 'Đã gom bản nháp của phòng', 'Phòng mình xong, gửi Trợ lý.', 'tro-ly'));
  });
  const kd = work + heads.length * 4 + 38;
  at(kd, () => setSt('kiem-duyet', 'working', 'Rà các bản nháp', 'Mình soát chính tả và lời hứa nhé.'));
  at(kd + 10, () => setSt('kiem-duyet', 'done', 'Đã duyệt, đạt', 'Đạt, trình giám đốc.', 'tro-ly'));
  at(kd + 14, () => { heads.forEach(h => [h.head, ...h.staff].forEach(id => setSt(id, 'done', 'Hoàn thành', ''))); setSt('tro-ly', 'done', 'Hoàn thành, báo giám đốc', 'Xong rồi, báo giám đốc!', 'giam-doc'); });
  at(kd + 22, () => { Object.keys(NODES).forEach(id => { if (id !== 'giam-doc') setSt(id, 'idle', 'Chưa có việc', ''); }); });
  endAt = kd + 28; return E.sort((a, b) => a[0] - b[0]);
}
function start() {
  if (running) return; running = true; window.__demo = true; t = 0; idx = 0; M = null; ev = build(); btn.textContent = '⏹ Dừng demo'; btn.classList.add('on'); note.style.display = 'block'; speed = +speedSel.value;
  Object.keys(NODES).forEach(id => { if (window.AGENTS) delete window.AGENTS[id]; }); window.MEETING = null; refresh();
}
function stop(natural) {
  if (!running) return; running = false; window.__demo = false; btn.textContent = '▶ Chạy demo'; btn.classList.remove('on'); note.style.display = 'none';
  Object.keys(NODES).forEach(id => { if (id !== 'giam-doc' && window.AGENTS) delete window.AGENTS[id]; }); window.MEETING = null; M = null; refresh(); poll();
  if (natural && !loopCk.checked) toast('Demo xong. Trạng thái thật được nạp lại từ file.'); else if (natural) start();
}
window.__demoTick = dt => {
  if (!running) return; t += dt * speed;
  while (idx < ev.length && ev[idx][0] <= t) { ev[idx][1](); idx++; }
  if (t >= endAt) stop(true);
};
btn.onclick = () => running ? stop(false) : start();
speedSel.onchange = () => { speed = +speedSel.value; };
OA.demo = { start, stop, get running() { return running; }, seek: s => { t = s; idx = ev.findIndex(e => e[0] > t); if (idx < 0) idx = ev.length; } };
})();
