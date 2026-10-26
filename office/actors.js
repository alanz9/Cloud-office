// Nhân vật, đi lại, họp, bong bóng thoại, giao diện. Mọi thứ đọc từ org.json (window.ORG), state/<id>.js (window.AGENTS) và meetings/current.js (window.MEETING).
const lerp = (a, b, k) => a + (b - a) * k;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const hashStr = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const angDiff = (a, b) => { let d = (b - a + Math.PI) % (Math.PI * 2); if (d < 0) d += Math.PI * 2; return d - Math.PI; };
const SKINS = [0xffd9b8, 0xf2c6a0, 0xe0ac86, 0xc98f68];
const HAIRS = [0x2a2220, 0x4a3426, 0x1c1c26, 0x6b4a2f, 0x8a6a45];
const SPEED = 4.2;

// ---------- nhân vật: thân, đầu, hai tay, hai chân có đầu gối (ngồi/đứng/đi bằng cách đổi góc xoay) ----------
function makeChar(p) {
  const g = new THREE.Group(), ud = g.userData, h = hashStr(p.id);
  const cloth = M(hexNum(p.color)), pants = M(0x39424f), skin = M(SKINS[h % SKINS.length]), hair = M(HAIRS[(h >>> 3) % HAIRS.length]), dark = M(0x2a2220);
  ud.cloth = cloth;
  add(g, Cyl(.36, .46, 1.0, 16), cloth, 0, .75, 0);
  const hg = new THREE.Group(); hg.position.set(0, 1.55, 0); g.add(hg); ud.hg = hg;
  add(hg, Sph(.4, 20, 16), skin, 0, 0, 0);
  for (const sx of [-.14, .14]) add(hg, Sph(.05, 8, 8), dark, sx, .03, .36, false);
  add(hg, new THREE.SphereGeometry(.43, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, .03, -.02);
  if ((h >>> 5) % 3 === 0) add(hg, Box(.8, .6, .2), hair, 0, -.2, -.3);                  // tóc dài
  const mkArm = sx => { const a = new THREE.Group(); a.position.set(sx * .45, 1.15, 0); add(a, Cyl(.09, .09, .65, 8), skin, 0, -.3, 0); g.add(a); return a; };
  ud.armR = mkArm(1); ud.armL = mkArm(-1);
  const mkLeg = sx => {
    const hip = new THREE.Group(); hip.position.set(sx * .17, .3, 0); g.add(hip);
    add(hip, Cyl(.1, .1, .36, 8), pants, 0, -.18, 0);
    const knee = new THREE.Group(); knee.position.set(0, -.36, 0); hip.add(knee);
    add(knee, Cyl(.09, .09, .46, 8), pants, 0, -.23, 0); add(knee, Box(.2, .1, .3), dark, 0, -.5, .08, false);
    return { hip, knee };
  };
  ud.legR = mkLeg(1); ud.legL = mkLeg(-1);
  const gold = M(0xf2c14e, { metalness:.4, roughness:.4 });
  if (p.role === 'boss') {
    add(g, Box(.12, .55, .05), M(0xc9372c), 0, .95, .4, false);                          // cà vạt
    for (const sx of [-.17, .17]) add(hg, new THREE.TorusGeometry(.1, .018, 6, 14), dark, sx, .05, .4, false);
  } else if (p.role === 'assistant') {
    add(hg, new THREE.TorusGeometry(.43, .035, 6, 20, Math.PI), dark, 0, .02, 0, false);   // tai nghe
    add(hg, Sph(.08, 8, 8), dark, .42, -.05, 0, false); add(hg, Cyl(.015, .015, .3, 5), dark, .38, -.12, .15, false).rotation.x = 1;
    const sc = new THREE.Group(); sc.position.set(.55, .75, .35); sc.visible = false; g.add(sc); ud.scroll = sc;           // cuộn giấy khi đi giao việc
    add(sc, Cyl(.1, .1, .6, 10), M(0xfff4d6), 0, 0, 0, false).rotation.z = Math.PI / 2; add(sc, Cyl(.105, .105, .08, 10), M(0xc9372c), 0, 0, 0, false).rotation.z = Math.PI / 2;
  } else if (p.role === 'head') {
    add(g, Cyl(.12, .12, .04, 10), gold, .2, 1.1, .42, false).rotation.x = Math.PI / 2;     // huy hiệu trưởng phòng
    add(hg, Cone(.1, .3, 5), gold, 0, .55, 0, false);
  } else {
    add(g, Box(.2, .26, .03), M(0xffffff), -.18, 1.0, .44, false);                       // thẻ nhân viên
  }
  return g;
}

// ---------- tạo nhân vật trên bản đồ ----------
const NODES = {}, selectable = [];
const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
const floorY = (x, z) => { for (const id in ROOMS) { const r = ROOMS[id]; if (Math.abs(x - r.x) < r.hw && Math.abs(z - r.z) < r.hd) return FLOOR_Y; } return .02; };
function makeNode(p) {
  const sid = NAV.seatNode[p.id]; if (sid === undefined) return;
  const sn = NAV.nodes[sid], seat = ROOMS[p.room].seats[p.id];
  const cg = new THREE.Group(); cg.position.set(sn.x, FLOOR_Y, sn.z); cg.rotation.y = seat.ry; cg.userData.id = p.id; scene.add(cg);
  const g = makeChar(p); g.position.y = .15; cg.add(g); if (p.status === 'suspended') g.userData.cloth.color.set(0x8a929e);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.75, .95, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color:ST.idle.hex, transparent:true, opacity:.9 }));
  ring.position.y = .03; scene.add(ring);
  const label = labelSprite(p.name, trunc(p.title, 26), .72); label.position.set(0, 2.5, 0); cg.add(label);
  const icon = iconSprite(p.role === 'boss' ? '🧑‍💼' : ST.idle.icon); icon.position.set(0, 3.45, 0); cg.add(icon);
  NODES[p.id] = { id:p.id, p, cg, g, ring, label, icon, ud:g.userData, home:sid, cur:sid, path:[], goal:sid, sit:1, face:seat.ry, walk:0, phase:Math.random() * 6,
    strollAt:12 + Math.random() * 30, stroll:null, errand:null, y:FLOOR_Y };
  selectable.push(cg);
}
ORG.people.forEach(makeNode);

const selRing = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.4, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:.9, depthTest:false }));
selRing.visible = false; selRing.renderOrder = 9; scene.add(selRing);

// ---------- nơi mỗi người nên ở (suy ra từ trạng thái, agent không tự ghi vị trí) ----------
let meeting = null, meetSeatOf = {};
function allowedRooms(p) { return new Set([p.room, ...ORG.rooms.filter(r => r.kind === 'meeting').map(r => r.id)]); }
function assignMeeting() {
  meetSeatOf = {};
  if (!meeting || !meeting.open) return;
  const order = [7, 6, 8, 5, 9, 4, 0, 3, 1, 2];                                           // ghế phía Bắc (quay mặt ra camera) lấp trước
  meeting.participants.filter(id => NODES[id]).forEach((id, i) => { const s = NAV.meetSeats[order[i % order.length]]; meetSeatOf[id] = s.id; });
}
function desiredNode(n) {
  if (n.p.status === 'suspended') return n.home;
  if (meetSeatOf[n.id] !== undefined) return meetSeatOf[n.id];
  if (n.errand) return NAV.doorOut[n.errand.room][0];
  if (n.stroll) return n.stroll.node;
  return n.home;
}
function setGoal(n, goal) {
  n.goal = goal;
  const start = n.path.length ? n.path[0] : n.cur;
  const r = NAV.route(start, goal, allowedRooms(n.p));
  if (!r) { n.goal = n.path.length ? n.path[n.path.length - 1] : n.cur; return; }
  n.path = n.path.length ? r : r.slice(1);
}
function seatFacing(n) {
  const sn = NAV.nodes[n.cur]; if (sn.kind !== 'seat') return null;
  return sn.tag === 'meeting' ? NAV.meetSeats.find(m => m.id === n.cur).ry : ROOMS[n.p.room].seats[n.p.id].ry;
}
function updateWalker(n, dt) {
  const want = desiredNode(n);
  if (want !== n.goal) setGoal(n, want);
  const moving = n.path.length > 0, atSeat = !moving && NAV.nodes[n.cur].kind === 'seat';
  n.sit = lerp(n.sit, atSeat ? 1 : 0, Math.min(1, dt * 6));
  let speedNow = 0;
  if (moving && n.sit < .2) {
    const nx = NAV.nodes[n.path[0]], dx = nx.x - n.cg.position.x, dz = nx.z - n.cg.position.z, d = Math.hypot(dx, dz), step = SPEED * dt;
    if (d <= step) { n.cg.position.x = nx.x; n.cg.position.z = nx.z; n.cur = n.path.shift(); }
    else { n.cg.position.x += dx / d * step; n.cg.position.z += dz / d * step; n.face = Math.atan2(dx, dz); speedNow = SPEED; }
  } else if (!moving) {
    const f = seatFacing(n); if (f !== null) n.face = f;
    const sn = NAV.nodes[n.cur]; n.cg.position.x = lerp(n.cg.position.x, sn.x, Math.min(1, dt * 8)); n.cg.position.z = lerp(n.cg.position.z, sn.z, Math.min(1, dt * 8));
  }
  n.cg.rotation.y += angDiff(n.cg.rotation.y, n.face) * Math.min(1, dt * 8);
  n.y = lerp(n.y, floorY(n.cg.position.x, n.cg.position.z), Math.min(1, dt * 10)); n.cg.position.y = n.y;
  n.walk = lerp(n.walk, speedNow ? 1 : 0, Math.min(1, dt * 8)); n.phase += speedNow * dt * 2.1;
  // thỉnh thoảng người đang rảnh đứng dậy đi dạo trong phòng mình
  const s = statusOf(n.p).status;
  if (n.stroll) { if (!moving && n.cur === n.stroll.node) { n.stroll.wait -= dt; if (n.stroll.wait <= 0) { n.stroll = null; n.strollAt = 25 + Math.random() * 40; } } }
  else if (s === 'idle' && !n.errand && meetSeatOf[n.id] === undefined && n.id !== selected && atSeat) {
    n.strollAt -= dt;
    if (n.strollAt <= 0) { const opts = NAV.stroll[n.p.room] || []; if (opts.length) n.stroll = { node:opts[Math.floor(Math.random() * opts.length)], wait:4 + Math.random() * 4 }; else n.strollAt = 40; }
  } else if (s !== 'idle' && n.stroll) n.stroll = null;
  if (n.errand && !moving && n.cur === NAV.doorOut[n.errand.room][0]) {                    // tới cửa phòng ban: trao việc rồi quay về
    if (!n.errand.said) { n.errand.said = true; if (n.errand.text) say(n.id, n.errand.text); }
    n.errand.wait -= dt; if (n.errand.wait <= 0) { n.errand = null; if (n.ud.scroll) n.ud.scroll.visible = false; nextErrand(n); }
  }
}
const errandQueue = [];
function queueErrand(room, text) {
  const tl = NODES['tro-ly']; if (!tl) return;
  if (errandQueue.some(e => e.room === room) || (tl.errand && tl.errand.room === room)) return;
  errandQueue.push({ room, text, wait:1.8, said:false }); nextErrand(tl);
}
function nextErrand(n) { if (n && !n.errand && errandQueue.length) { n.errand = errandQueue.shift(); if (n.ud.scroll) n.ud.scroll.visible = true; n.stroll = null; } }

// ---------- dáng: đứng, ngồi, đi, gõ phím, giơ tay ----------
const intro = { id:null, t:0 };
function applyPose(n, t) {
  const u = n.ud, sit = n.sit, st = statusOf(n.p).status, seated = sit > .6;
  u.legR.hip.rotation.x = lerp(Math.sin(n.phase) * .65, -Math.PI / 2, sit); u.legL.hip.rotation.x = lerp(-Math.sin(n.phase) * .65, -Math.PI / 2, sit);
  u.legR.knee.rotation.x = lerp(Math.max(0, -Math.sin(n.phase)) * .8, Math.PI / 2, sit); u.legL.knee.rotation.x = lerp(Math.max(0, Math.sin(n.phase)) * .8, Math.PI / 2, sit);
  n.g.position.y = lerp(.55, .15, sit) + Math.abs(Math.sin(n.phase)) * .05 * n.walk;
  const type = st === 'working' && seated ? Math.sin(t * 14 + n.phase) * .12 : 0;
  const swing = Math.sin(n.phase) * .55 * n.walk;
  let ar = lerp(0, -1.1, sit) + type - swing, al = lerp(0, -1.1, sit) - type + swing;
  if (n.ud.scroll && n.ud.scroll.visible) ar = -.9 - swing * .2;
  if (seated && st === 'review') ar = -2.7 + Math.sin(t * 7) * .3;                         // giơ tay: chờ duyệt
  if (seated && st === 'done') { ar = -2.6 + Math.sin(t * 6) * .15; al = -2.6 - Math.sin(t * 6) * .15; }
  if (intro.id === n.id) { const k = Math.sin(Math.min(1, intro.t / 2.4) * Math.PI); ar = lerp(ar, -2.7 + Math.sin(t * 9) * .35, Math.min(1, k * 3)); }
  if (st === 'suspended') { ar = -.2; al = -.2; }
  u.armR.rotation.x = ar; u.armL.rotation.x = al;
  u.hg.rotation.x = st === 'working' && seated ? .12 : Math.sin(t * .8 + n.phase) * .02; if (st === 'suspended') u.hg.rotation.x = .38;
  u.hg.rotation.y = n.walk > .1 ? 0 : Math.sin(t * .5 + n.phase * 2) * .12;
}

// ---------- bong bóng thoại kiểu game nhập vai ----------
const bubbleLayer = $('bubbles'), BUB_MAX = 3, bubQueue = [], bubActive = [];
function say(id, text) {
  text = String(text || '').trim().slice(0, 140); if (!text || !NODES[id]) return;
  const old = bubActive.findIndex(b => b.id === id); if (old >= 0) removeBubble(old);
  if (bubQueue.some(b => b.id === id && b.text === text)) return;
  bubQueue.push({ id, text });
}
function removeBubble(i) { bubActive[i].el.remove(); bubActive.splice(i, 1); }
function startBubble(b) {
  const p = NODES[b.id].p, el = document.createElement('div'); el.className = 'bub';
  const nm = document.createElement('b'); nm.textContent = p.name; nm.style.background = p.color; const tx = document.createElement('span');
  el.append(nm, tx); bubbleLayer.append(el); bubActive.push({ id:b.id, text:b.text, el, tx, age:0, life:2.8 + b.text.length * .055 });
}
function updateBubbles(dt) {
  while (bubActive.length < BUB_MAX && bubQueue.length) startBubble(bubQueue.shift());
  const w = innerWidth, h = innerHeight;
  for (let i = bubActive.length - 1; i >= 0; i--) {
    const b = bubActive[i]; b.age += dt;
    if (b.age > b.life) { removeBubble(i); continue; }
    b.tx.textContent = b.text.slice(0, Math.floor(b.age * 45)) + (b.age * 45 < b.text.length ? '▌' : '');   // chữ hiện dần như hộp thoại game
    const n = NODES[b.id], v = V(n.cg.position.x, n.cg.position.y + 4.4 + (1 - n.sit) * .45, n.cg.position.z).project(camera);
    const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
    b.el.style.display = vis ? 'block' : 'none';
    b.el.style.left = (v.x * .5 + .5) * w + 'px'; b.el.style.top = (-v.y * .5 + .5) * h + 'px';
    b.el.style.opacity = Math.min(1, (b.life - b.age) * 3, b.age * 6 + .2);
  }
}

// ---------- hồ sơ bay giữa hai người (suy ra từ việc đổi trạng thái) ----------
const DOCS = [], emojiTex = {};
function emojiTexture(e) {
  if (!emojiTex[e]) { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.font = '96px Segoe UI Emoji, Apple Color Emoji, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(e, 64, 70); emojiTex[e] = new THREE.CanvasTexture(c); }
  return emojiTex[e];
}
const headPos = id => { const n = NODES[id]; return V(n.cg.position.x, n.cg.position.y + 3.2, n.cg.position.z); };
function sendDoc(from, to, emoji = '📄') {
  if (!NODES[from] || !NODES[to] || from === to) return;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:emojiTexture(emoji), transparent:true, depthTest:false })); s.scale.set(1.4, 1.4, 1); s.renderOrder = 12; scene.add(s);
  DOCS.push({ s, from, to, t:0 });
}
function updateDocs(dt) {
  for (let i = DOCS.length - 1; i >= 0; i--) {
    const d = DOCS[i]; d.t += dt / 2.2;
    if (d.t >= 1 || !NODES[d.to]) { scene.remove(d.s); d.s.material.dispose(); DOCS.splice(i, 1); continue; }
    const a = headPos(d.from), b = headPos(d.to), k = d.t * d.t * (3 - 2 * d.t), mid = a.clone().lerp(b, .5); mid.y += 3 + a.distanceTo(b) * .18;
    const u = 1 - k; d.s.position.set(u * u * a.x + 2 * u * k * mid.x + k * k * b.x, u * u * a.y + 2 * u * k * mid.y + k * k * b.y, u * u * a.z + 2 * u * k * mid.z + k * k * b.z);
    d.s.material.rotation = Math.sin(d.t * 12) * .25;
  }
}
const headOf = p => { const r = ORG.rooms.find(x => x.id === p.room); return r && r.headId; };
function onStatus(id, old, now) {
  const p = NODES[id].p;
  if (now === 'working' && old !== 'working') {
    const head = headOf(p), giver = p.role === 'staff' && head && stateOf(head).status === 'working' ? head : 'tro-ly';
    sendDoc(giver, id, '📋');
    if (giver === 'tro-ly' && p.id !== 'tro-ly' && p.room !== 'giam-doc') queueErrand(p.room, 'Giao việc cho ' + p.name);
  } else if (old === 'working' && (now === 'review' || now === 'done')) {
    const to = stateOf(id).to || (p.role === 'staff' && p.room !== 'giam-doc' ? headOf(p) : p.id === 'tro-ly' ? 'giam-doc' : 'tro-ly');
    sendDoc(id, to, now === 'done' ? '✅' : '📄');
  }
}

// ---------- camera bay tới ----------
let fly = null;
const ISO_DIR = V(.5, .62, .6).normalize();
function flyTo(x, z, dist, dir) {
  const off = (dir || camera.position.clone().sub(controls.target)).clone().normalize().multiplyScalar(dist);
  fly = { tgt:V(x, 1, z), off, t:0 };
}
controls.addEventListener('start', () => { fly = null; });
function updateFly(dt) {
  if (!fly) return;
  fly.t += dt; const k = Math.min(1, dt * 4), goal = fly.tgt.clone().add(fly.off);
  controls.target.lerp(fly.tgt, k);
  camera.position.lerp(goal, k);
  if (fly.t > 8 || camera.position.distanceTo(goal) < .05) fly = null;
}

// ---------- giao diện ----------
let selected = null, selectedRoom = null;
const people = () => ORG.people.filter(p => p.role !== 'boss');
function statusOf(p) {
  if (p.role === 'boss') return { status:'idle', task:'Đang ở phòng giám đốc, ra lệnh và duyệt kết quả.', log:[] };
  if (p.status === 'suspended') return { status:'suspended', task:'Đình chỉ' + (p.reason ? ': ' + p.reason : ''), log:[] };
  return stateOf(p.id);
}
function renderStats() {
  const c = { working:0, review:0, done:0, idle:0, suspended:0 };
  people().forEach(p => { const s = statusOf(p).status; c[s in c ? s : 'idle']++; });
  $('stats').innerHTML = [['working', 'Đang làm'], ['review', 'Chờ duyệt'], ['done', 'Hoàn thành'], ['idle', 'Rảnh'], ...(c.suspended ? [['suspended', 'Đình chỉ']] : [])]
    .map(([k, l]) => `<div class="stat"><b>${c[k]}</b><span>${l}</span></div>`).join('');
}
const COLL_KEY = 'office.collapsed';
const getColl = () => { try { return JSON.parse(localStorage.getItem(COLL_KEY) || '{}'); } catch (e) { return {}; } };
const setColl = c => { try { localStorage.setItem(COLL_KEY, JSON.stringify(c)); } catch (e) {} };
function toggleColl(id, v) { const c = getColl(); if (v === undefined) v = !c[id]; if (v) c[id] = 1; else delete c[id]; setColl(c); }
function renderRoster() {
  const box = $('roster'); box.replaceChildren(); const coll = getColl();
  ORG.rooms.forEach(r => {
    const members = ORG.people.filter(p => p.room === r.id), folded = !!coll[r.id];
    const hb = document.createElement('button'); hb.className = 'rhead' + (selectedRoom === r.id ? ' on' : '');
    const caret = document.createElement('span'); caret.className = 'caret'; caret.textContent = folded ? '▸' : '▾'; caret.title = folded ? 'Mở danh sách' : 'Thu gọn';
    caret.onclick = e => { e.stopPropagation(); toggleColl(r.id); renderRoster(); };
    const dot = document.createElement('i'); dot.style.background = r.color; const cnt = document.createElement('small'); cnt.textContent = members.length;
    hb.append(caret, dot, r.name, cnt); hb.onclick = () => selectRoom(r.id); box.append(hb);
    if (folded) return;
    members.forEach(p => {
      const st = ST[statusOf(p).status] || ST.idle, b = document.createElement('button');
      b.className = 'chip' + (selected === p.id ? ' on' : '') + (p.status === 'suspended' ? ' sus' : '');
      const d = document.createElement('i'); d.style.background = p.role === 'boss' ? '#2f3e5c' : st.color;
      const sm = document.createElement('small'); sm.textContent = p.status === 'suspended' ? 'đình chỉ' : p.role === 'head' ? 'trưởng phòng' : p.role === 'boss' ? 'giám đốc' : p.role === 'assistant' ? 'trợ lý' : '';
      b.append(d, p.name, sm); b.onclick = () => select(p.id); box.append(b);
    });
  });
}function renderPanel() {
  const panel = $('panel');
  if (selectedRoom && !selected) {
    const r = ORG.rooms.find(x => x.id === selectedRoom), ms = ORG.people.filter(p => p.room === r.id);
    $('p-name').textContent = r.name;
    $('p-role').textContent = r.kind === 'meeting' ? 'Nơi trưởng phòng họp với trợ lý, ai cũng vào được' : r.kind === 'boss' ? 'Chỉ giám đốc, trợ lý và kiểm duyệt làm việc ở đây' : 'Chỉ thành viên phòng ban được vào làm việc';
    $('p-zone').textContent = r.kind === 'meeting' ? (meeting && meeting.open ? 'Đang họp: ' + meeting.topic : 'Đang trống') : ms.length + ' người';
    $('p-status').textContent = '🏢 Phòng'; $('p-status').style.background = r.color;
    $('p-task').textContent = ms.map(p => p.name).join(', ') || 'Chưa có ai thuộc phòng này (dành cho cuộc họp)';
    $('p-vibe').textContent = ''; $('p-log').replaceChildren(); panel.classList.add('on'); return;
  }
  if (!selected) { panel.classList.remove('on'); return; }
  const p = ORG.people.find(x => x.id === selected), s = statusOf(p), st = ST[s.status] || ST.idle, room = ORG.rooms.find(r => r.id === p.room);
  $('p-name').textContent = p.name; $('p-role').textContent = p.title; $('p-zone').textContent = 'Phòng: ' + room.name;
  $('p-status').textContent = p.role === 'boss' ? '🧑‍💼 Giám đốc' : st.icon + ' ' + st.label; $('p-status').style.background = p.role === 'boss' ? '#2f3e5c' : st.color;
  $('p-task').textContent = s.task || ''; $('p-vibe').textContent = p.vibe;
  const lines = (s.log || []).slice().reverse();
  $('p-log').replaceChildren(...lines.map(l => Object.assign(document.createElement('li'), { textContent:l })));
  panel.classList.add('on');
}
// hoạt cảnh mở đầu khi chọn nhân vật: cột sáng theo màu, vòng chọn, giơ tay chào, biểu tượng bay lên
const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 14, 28, 1, true), new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending }));
beam.visible = false; scene.add(beam);
function startIntro(id) {
  intro.id = id; intro.t = 0; const n = NODES[id]; beam.material.color.set(n.p.color); beam.visible = true; beam.position.set(n.cg.position.x, 7, n.cg.position.z);
  const e = { boss:'👑', assistant:'🗓️', head:'⭐', staff:'✨' }[n.p.role];
  if (n.pop) scene.remove(n.pop.s);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:emojiTexture(e), transparent:true, depthTest:false })); s.scale.set(1.5, 1.5, 1); s.position.copy(headPos(id)); s.renderOrder = 12; scene.add(s); n.pop = { s, t:0 };
}
function select(id) {
  selected = id; selectedRoom = id ? NODES[id].p.room : null; renderPanel(); renderRoster();
  if (id) { const n = NODES[id]; selRing.visible = true; flyTo(n.cg.position.x, n.cg.position.z, 24); startIntro(id); }
  else selRing.visible = false;
}
function selectRoom(id) {
  selected = null; selectedRoom = id; selRing.visible = false; renderPanel(); renderRoster();
  const r = ROOMS[id]; flyTo(r.x, r.z, 40);
}
$('close').onclick = () => { selected = null; selectedRoom = null; selRing.visible = false; renderPanel(); renderRoster(); };
$('home').onclick = () => { selected = null; selectedRoom = null; selRing.visible = false; renderPanel(); renderRoster(); flyTo(-4, 2, 98, ISO_DIR); };

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let downAt = null;
function pick(e) {
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(selectable, true)[0]; if (!hit) return null;
  let o = hit.object; while (o && !o.userData.id) o = o.parent; return o ? o.userData.id : null;
}
renderer.domElement.addEventListener('pointermove', e => { renderer.domElement.style.cursor = pick(e) ? 'pointer' : 'grab'; });
renderer.domElement.addEventListener('pointerdown', e => downAt = [e.clientX, e.clientY]);
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const id = pick(e); if (id) select(id);
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ---------- đọc trạng thái và cuộc họp (thẻ script ?t=, chạy được cả khi mở bằng file://) ----------
let lastSig = '', prevStatus = {}, prevSay = {}, meetLines = 0, meetId = null, firstLoad = true;
function poll() {
  if (window.__demo) return;
  const list = people(); let pending = list.length + 1;
  window.MEETING = null;
  const one = src => { const s = document.createElement('script'); s.src = `${src}?t=${Date.now()}`; const done = () => { s.remove(); if (--pending === 0) refresh(); }; s.onload = done; s.onerror = done; document.head.appendChild(s); };
  list.forEach(p => one(`state/${p.id}.js`)); one('meetings/current.js');
}
function renderMeetingBar() {
  const bar = $('meetBar');
  if (!meeting || !meeting.open) { bar.style.display = 'none'; return; }
  bar.style.display = 'block';
  const esc = s => String(s).replace(/</g, '&lt;');
  const last = meeting.lines.slice(-4).map(l => { const p = ORG.people.find(x => x.id === l.who); return `<div><b>${esc(p ? p.name : l.who)}</b>: ${esc(l.text)}</div>`; }).join('');
  bar.innerHTML = `<h4>🗣️ Đang họp: ${esc(meeting.topic)} <small>${meeting.participants.length} người</small></h4>${last}`;
}
function refresh() {
  const sig = JSON.stringify(window.AGENTS || {}) + JSON.stringify(window.MEETING || null); if (sig === lastSig) return; lastSig = sig;
  people().forEach(p => {
    const s = stateOf(p.id), old = prevStatus[p.id];
    if (!firstLoad && old !== undefined && old !== s.status) onStatus(p.id, old, s.status);
    prevStatus[p.id] = s.status;
    if (s.say && s.say !== prevSay[p.id] && !firstLoad) say(p.id, s.say);
    prevSay[p.id] = s.say;
  });
  const m = window.MEETING && window.MEETING.room ? window.MEETING : null;
  if (m && m.id !== meetId) { meetId = m.id; meetLines = firstLoad ? m.lines.length : 0; }
  if (m) { for (let i = meetLines; i < m.lines.length; i++) say(m.lines[i].who, m.lines[i].text); meetLines = m.lines.length; }
  meeting = m; assignMeeting(); firstLoad = false;
  renderStats(); renderPanel(); renderRoster(); renderMeetingBar();
}
renderStats(); renderRoster(); poll(); setInterval(poll, 3000);

// ---------- vòng lặp ----------
const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const raw = clock.getDelta(), dt = Math.min(raw, .1), t = clock.elapsedTime;
  updateFly(Math.min(raw, .35));
  for (const id in NODES) {
    const n = NODES[id], s = statusOf(n.p), st = ST[s.status] || ST.idle, working = s.status === 'working';
    updateWalker(n, dt); applyPose(n, t);
    if (n.p.role !== 'boss') { n.ring.material.color.setHex(st.hex); setIcon(n.icon, st.icon); }
    n.ring.position.set(n.cg.position.x, n.cg.position.y + .03, n.cg.position.z);
    n.ring.scale.setScalar(working ? 1 + Math.sin(t * 4 + n.phase) * .06 : 1);
    n.label.position.y = lerp(3.0, 2.5, n.sit); n.icon.position.y = lerp(3.95, 3.45, n.sit) + (working ? Math.sin(t * 5 + n.phase) * .12 : Math.sin(t * 1.5 + n.phase) * .04);
    if (n.pop) { n.pop.t += dt; n.pop.s.position.copy(headPos(id)).y += 1.2 + n.pop.t * 1.8; n.pop.s.material.opacity = Math.max(0, 1 - n.pop.t / 1.4); if (n.pop.t > 1.4) { scene.remove(n.pop.s); n.pop = null; } }
  }
  if (intro.id) { intro.t += dt; const k = Math.min(1, intro.t / 2.4), n = NODES[intro.id]; beam.position.set(n.cg.position.x, 7, n.cg.position.z); beam.material.opacity = Math.sin(k * Math.PI) * .35; if (intro.t > 2.4) { beam.visible = false; intro.id = null; } }
  if (selRing.visible && selected) { const n = NODES[selected]; selRing.position.set(n.cg.position.x, n.cg.position.y + .08, n.cg.position.z); selRing.scale.setScalar(1 + Math.sin(t * 3) * .05); }
  if (window.__demoTick) window.__demoTick(dt);
  updateDocs(dt); updateBubbles(dt);
  controls.update();
  renderer.render(scene, camera);
}
tick();
