// Văn phòng 3D của Alan Academy: một tầng của toà nhà, nhìn mặt cắt chéo. Đọc phòng ban và nhân vật từ org.json (window.ORG), trạng thái từ state/<id>.js (window.AGENTS).
// Bản đồ tự xếp: mỗi phòng nằm ở một ô trên lưới (slot [cột, hàng]); phòng ban mới chỉ cần thêm vào org.json.
const ORG = window.ORG;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hexNum = s => parseInt(s.slice(1), 16);
const ST = {
  idle:    { label:'Đang rảnh',  color:'#9aa0a6', hex:0x9aa0a6, icon:'💤' },
  suspended: { label:'Đình chỉ', color:'#b0413e', hex:0xb0413e, icon:'⛔' },
  working: { label:'Đang làm',   color:'#3f78d6', hex:0x3f78d6, icon:'⚙️' },
  review:  { label:'Chờ duyệt',  color:'#e0a01a', hex:0xe0a01a, icon:'❗' },
  done:    { label:'Hoàn thành', color:'#3da36a', hex:0x3da36a, icon:'✅' },
};
const stateOf = id => (window.AGENTS && window.AGENTS[id]) || { status:'idle', task:'Chưa có dữ liệu', say:'', log:[] };

// ---------- lưới phòng ----------
const CELL = { w:18, d:12, gap:5 }, MARGIN = 3, FLOOR_Y = .15;
const slotXZ = ([c, r]) => ({ x: c * (CELL.w + CELL.gap), z: r * (CELL.d + CELL.gap) });
const cols = ORG.rooms.map(r => r.slot[0]), rows = ORG.rooms.map(r => r.slot[1]);
const GRID = { c0:Math.min(-1, ...cols), c1:Math.max(1, ...cols), r0:Math.min(-1, ...rows), r1:Math.max(1, ...rows) };
const X0 = GRID.c0 * (CELL.w + CELL.gap) - CELL.w / 2 - MARGIN, X1 = GRID.c1 * (CELL.w + CELL.gap) + CELL.w / 2 + MARGIN;
const Z0 = GRID.r0 * (CELL.d + CELL.gap) - CELL.d / 2 - MARGIN, Z1 = GRID.r1 * (CELL.d + CELL.gap) + CELL.d / 2 + MARGIN;

// ---------- cảnh, camera, ánh sáng ----------
const SKY = 0xdfe8f2;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 190, 380);
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 1.2, 520);
camera.position.set(42, 64, 66);
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.maxPolarAngle = Math.PI / 2.4;
controls.minDistance = 12; controls.maxDistance = 190;
controls.enableDamping = true;
controls.target.set(-4, 0, 2);

scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc8bc, 0.68));
const sun = new THREE.DirectionalLight(0xfff3e0, 0.5);
sun.position.set(-40, 90, 50);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left:-85, right:85, top:70, bottom:-70, far:260 });
sun.shadow.bias = -0.0003; sun.shadow.radius = 3;
scene.add(sun);

const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color:c, roughness:.85 }, o));
function add(parent, geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
}
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cyl = (rt, rb, h, s = 14) => new THREE.CylinderGeometry(rt, rb, h, s);
const Sph = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
const Cone = (r, h, s = 14) => new THREE.ConeGeometry(r, h, s);
const tint = (hex, k) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), k);
const solid = (g, x1, y1, z1, x2, y2, z2, mat, sh = true) => add(g, Box(x2 - x1, y2 - y1, z2 - z1), mat, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, sh);
const WHITE = M(0xf7f5f1, { roughness:.7 }), WOOD = M(0xc89a68), DARKWOOD = M(0x6b4a2f), STEEL = M(0x8b94a1, { metalness:.4, roughness:.4 });
const GLASS = new THREE.MeshStandardMaterial({ color:0xbfe0f2, transparent:true, opacity:.2, roughness:.05, metalness:.2, depthWrite:false });
let _seed = 5; const rnd = () => (_seed = (_seed * 16807) % 2147483647) / 2147483647;

// ---------- nhãn và biểu tượng (canvas) ----------
function labelSprite(line1, line2, k = 1) {
  const c = document.createElement('canvas'), x = c.getContext('2d');
  const f1 = 'bold 46px Segoe UI, sans-serif', f2 = '28px Segoe UI, sans-serif';
  x.font = f1; const w1 = x.measureText(line1).width; x.font = f2; const w2 = x.measureText(line2 || '').width;
  const w = Math.ceil(Math.max(w1, w2)) + 48, h = line2 ? 112 : 72;
  c.width = w; c.height = h;
  x.fillStyle = 'rgba(255,255,255,.96)'; x.beginPath();
  if (x.roundRect) x.roundRect(0, 0, w, h, 30); else x.rect(0, 0, w, h); x.fill();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#26303f'; x.font = f1; x.fillText(line1, w / 2, line2 ? 40 : h / 2 + 2);
  if (line2) { x.fillStyle = '#6a7686'; x.font = f2; x.fillText(line2, w / 2, 82); }
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:t, transparent:true, depthTest:false }));
  s.scale.set(w / 112 * 1.5 * k, h / 112 * 1.5 * k, 1); s.renderOrder = 10; return s;
}
function iconSprite(emoji) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:new THREE.CanvasTexture(c), transparent:true, depthTest:false }));
  s.scale.set(1.3, 1.3, 1); s.renderOrder = 11; s.userData = { c, emoji:null };
  setIcon(s, emoji); return s;
}
function setIcon(s, emoji) {
  if (s.userData.emoji === emoji) return;
  const x = s.userData.c.getContext('2d'); x.clearRect(0, 0, 128, 128);
  x.font = '96px Segoe UI Emoji, Apple Color Emoji, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(emoji, 64, 70);
  s.material.map.needsUpdate = true; s.userData.emoji = emoji;
}
// bảng treo tường: vẽ chữ lên canvas rồi dán lên một tấm phẳng
function boardMesh(w, h, lines, bg = '#ffffff', ink = '#26303f') {
  const c = document.createElement('canvas'); c.width = 640; c.height = Math.round(640 * h / w);
  const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = '#c9d0da'; x.lineWidth = 8; x.strokeRect(4, 4, c.width - 8, c.height - 8);
  x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle';
  const n = lines.length, step = c.height / (n + 1), f1 = Math.round(c.height * (n > 1 ? .34 : .42)), f2 = Math.round(c.height * .22);
  lines.forEach((l, i) => { x.font = (i === 0 ? 'bold ' + f1 : f2) + 'px Segoe UI, sans-serif'; x.fillText(l, c.width / 2, step * (i + 1) + (i === 0 ? 2 : 0)); });
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map:t }));
  return m;
}
function frameArt(g, x, y, z, w, h, color) {                                           // tranh treo tường trang trí
  solid(g, x - w / 2 - .08, y - h / 2 - .08, z, x + w / 2 + .08, y + h / 2 + .08, z + .08, WHITE, false);
  const c = document.createElement('canvas'); c.width = 128; c.height = Math.round(128 * h / w); const q = c.getContext('2d');
  const gr = q.createLinearGradient(0, 0, c.width, c.height); gr.addColorStop(0, '#' + new THREE.Color(color).getHexString()); gr.addColorStop(1, '#' + tint(color, .65).getHexString());
  q.fillStyle = gr; q.fillRect(0, 0, c.width, c.height); q.fillStyle = 'rgba(255,255,255,.55)'; q.beginPath(); q.arc(c.width * .35, c.height * .45, c.height * .22, 0, 7); q.fill();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map:new THREE.CanvasTexture(c) })); m.position.set(x, y, z + .09); g.add(m);
}

// ---------- chất liệu sàn ----------
function plankTexture(base, tw, th) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const q = c.getContext('2d'), b = new THREE.Color(base);
  const rows = 8, rh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    let x = rnd() * 200;
    while (x < 760) {
      const len = 160 + rnd() * 220, k = .93 + rnd() * .12;
      q.fillStyle = '#' + b.clone().multiplyScalar(k).getHexString(); q.fillRect(x - 200, r * rh, len, rh);
      q.fillStyle = 'rgba(120,90,55,.12)'; q.fillRect(x - 200 + len - 1, r * rh, 1, rh);
      x += len;
    }
    q.fillStyle = 'rgba(120,90,55,.1)'; q.fillRect(0, r * rh, 512, 1);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(tw, th); t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}
function carpetTexture(base, tw, th) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const q = c.getContext('2d'), b = new THREE.Color(base);
  q.fillStyle = '#' + b.getHexString(); q.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i++) { const sh = b.clone().multiplyScalar(.9 + rnd() * .1); q.fillStyle = '#' + sh.getHexString(); q.fillRect(rnd() * 128, rnd() * 128, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(tw, th); t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}

// ---------- toà nhà: nền, sàn, tường ngoài, cửa sổ ----------
const BW = X1 - X0, BD = Z1 - Z0, CX = (X0 + X1) / 2, CZ = (Z0 + Z1) / 2, T = .8, HB = 4.8;
add(scene, Box(BW + 80, 1, BD + 80), M(0xeef1f5), CX, -2.2, CZ, false).receiveShadow = true;           // mặt đất quanh toà nhà
solid(scene, X0 - T - .3, -1.7, Z0 - T - .3, X1 + T + .3, -.02, Z1 + T + .3, M(0xc9d0d9));              // bệ toà nhà
const floor = add(scene, new THREE.PlaneGeometry(BW, BD).rotateX(-Math.PI / 2), M(0xffffff, { map:plankTexture(0xd2b98f, BW / 8, BD / 8), roughness:.6 }), CX, .02, CZ, false);
function winWall(axis) {                                                                              // tường ngoài phía sau (Bắc/Tây) có ô cửa sổ thật
  const g = new THREE.Group(); scene.add(g);
  const len = axis === 'x' ? BW + 2 * T : BD + T, start = axis === 'x' ? X0 - T : Z0;
  const put = (a, b, y0, y1, mat, extra = 0) => axis === 'x'
    ? solid(g, a, y0, Z0 - T - extra, b, y1, Z0 + extra, mat) : solid(g, X0 - T - extra, y0, a, X0 + extra, y1, b, mat);
  const wins = []; for (let p = start + 7; p < start + len - 5; p += 9) wins.push([p - 1.8, p + 1.8]);
  let cur = start;
  wins.forEach(([a, b]) => {
    put(cur, a, 0, HB, WHITE); put(a, b, 0, 1.1, WHITE); put(a, b, 3.6, HB, WHITE);
    put(a - .1, b + .1, 1.05, 1.18, WHITE, .12);                                                       // bệ cửa sổ nhô vào trong
    const mid = (a + b) / 2;
    if (axis === 'x') { solid(g, a, 1.1, Z0 - T / 2 - .03, b, 3.6, Z0 - T / 2 + .03, GLASS, false); solid(g, mid - .05, 1.1, Z0 - T / 2 - .06, mid + .05, 3.6, Z0 - T / 2 + .06, WHITE, false); }
    else { solid(g, X0 - T / 2 - .03, 1.1, a, X0 - T / 2 + .03, 3.6, b, GLASS, false); solid(g, X0 - T / 2 - .06, 1.1, mid - .05, X0 - T / 2 + .06, 3.6, mid + .05, WHITE, false); }
    cur = b;
  });
  put(cur, start + len, 0, HB, WHITE);
}
winWall('x'); winWall('z');
function lowWall(axis, fixed, from, to, gapC, gapW) {                                                 // tường ngoài phía trước (Nam/Đông): thấp, kính phía trên
  const g = new THREE.Group(); scene.add(g); const H = 1.0, GT = 3.2;
  const seg = (a, b) => {
    if (b - a < .01) return;
    if (axis === 'x') { solid(g, a, 0, fixed, b, H, fixed + T, WHITE); solid(g, a, H, fixed + T / 2 - .03, b, GT, fixed + T / 2 + .03, GLASS, false); solid(g, a, GT, fixed, b, GT + .12, fixed + T, WHITE, false); }
    else { solid(g, fixed, 0, a, fixed + T, H, b, WHITE); solid(g, fixed + T / 2 - .03, H, a, fixed + T / 2 + .03, GT, b, GLASS, false); solid(g, fixed, GT, a, fixed + T, GT + .12, b, WHITE, false); }
    for (let p = a; p <= b + .01; p += 6) { if (axis === 'x') solid(g, p - .06, H, fixed + T / 2 - .06, p + .06, GT, fixed + T / 2 + .06, WHITE, false); else solid(g, fixed + T / 2 - .06, H, p - .06, fixed + T / 2 + .06, GT, p + .06, WHITE, false); }
  };
  if (gapW) { seg(from, gapC - gapW / 2); seg(gapC + gapW / 2, to); } else seg(from, to);
}
lowWall('x', Z1, X0 - T, X1 + T, 0, 5);                                                               // cửa chính ở giữa tường Nam
lowWall('z', X1, Z0 - T, Z1 + T, 0, 0);
// lối vào: thảm chùi chân + bậc thềm
solid(scene, -2.4, 0, Z1 + T, 2.4, .05, Z1 + T + 2.6, M(0xb9c2cd));
solid(scene, -1.8, .05, Z1 + T + .4, 1.8, .09, Z1 + T + 1.6, M(0x4a5568), false);

// ---------- đồ nội thất ----------
const CHAIR_Y = 0.55;
function chair(g, x, z, ry, color) {
  const c = new THREE.Group(); c.position.set(x, FLOOR_Y, z); c.rotation.y = ry; g.add(c);
  const m = M(color, { roughness:.6 });
  add(c, Cyl(.42, .4, .12, 16), m, 0, CHAIR_Y - .15, 0);
  add(c, Cyl(.06, .06, .38, 8), STEEL, 0, .2 - .15, 0);
  add(c, Cyl(.35, .35, .04, 5), STEEL, 0, .03, 0);
  add(c, Box(.72, .85, .1), m, 0, CHAIR_Y + .38 - .15, -.38);
  for (const sx of [-1, 1]) add(c, Box(.07, .07, .5), STEEL, sx * .4, CHAIR_Y + .15, -.1, false);
}
function desk(g, x, z, w, topMat) {
  const d = new THREE.Group(); d.position.set(x, FLOOR_Y, z); g.add(d);
  add(d, Box(w, .08, 1.2), topMat, 0, .8, 0);
  for (const sx of [-1, 1]) add(d, Box(.08, .78, 1.1), WHITE, sx * (w / 2 - .08), .39, 0);
  add(d, Box(w - .3, .5, .05), WHITE, 0, .52, -.5, false);                                           // tấm chắn chân bàn
  add(d, Box(.82, .48, .05), M(0x232a38), 0, 1.3, .12);                                              // màn hình, mặt hướng về người ngồi
  add(d, new THREE.PlaneGeometry(.72, .38), new THREE.MeshBasicMaterial({ color:0x6bb4ff }), 0, 1.3, .085, false).rotation.y = Math.PI;
  add(d, Cyl(.05, .08, .26, 8), M(0x232a38), 0, .98, .12);
  add(d, Box(.56, .03, .2), M(0x394150), 0, .86, -.22);                                              // bàn phím
  add(d, Cyl(.09, .09, .14, 10), M(0xf2b04c), w / 2 - .45, .91, .1);                                 // cốc
  add(d, Box(.3, .02, .4), WHITE, -w / 2 + .5, .85, -.1, false);                                     // giấy tờ
  return d;
}
function plant(g, x, z, s = 1, y = 0) {
  add(g, Cyl(.32 * s, .26 * s, .55 * s, 12), M(0xf1ede6), x, y + .28 * s, z);
  add(g, Cyl(.3 * s, .3 * s, .04, 12), M(0x5a4030), x, y + .55 * s, z, false);
  for (let i = 0; i < 6; i++) { const a = i * 1.05, l = add(g, Sph(.34 * s, 8, 6), M(i % 2 ? 0x3f9b5c : 0x58b774), x + Math.cos(a) * .25 * s, y + (.95 + (i % 3) * .28) * s, z + Math.sin(a) * .25 * s); l.scale.y = 1.4; }
}
function sofa(g, x, z, w, color, ry = 0) {
  const s = new THREE.Group(); s.position.set(x, FLOOR_Y, z); s.rotation.y = ry; g.add(s); const m = M(color, { roughness:.9 });
  add(s, Box(w, .45, 1.25), m, 0, .3, 0); add(s, Box(w, .75, .3), m, 0, .75, -.48);
  for (const sx of [-1, 1]) add(s, Box(.3, .62, 1.25), m, sx * (w / 2 - .15), .5, 0);
  for (let i = 0; i < 2; i++) add(s, Box(.6, .5, .15), M(tint(color, .55)), -w / 4 + i * w / 2, .8, -.25).rotation.x = -.2;
  for (const sx of [-1, 1]) add(s, Box(.1, .12, .1), DARKWOOD, sx * (w / 2 - .1), .05, .5, false);
}
function coffeeTable(g, x, z, r, color) { add(g, Cyl(r, r, .06, 20), M(0xf4f1ea), x, FLOOR_Y + .42, z); add(g, Cyl(.07, .07, .4, 8), color ? M(color) : STEEL, x, FLOOR_Y + .2, z); add(g, Cyl(r * .5, r * .5, .02, 14), M(0x6b8fa8), x + r * .2, FLOOR_Y + .47, z, false); }
function rug(g, x, z, w, d, color, round) {
  const m = round ? add(g, Cyl(w / 2, w / 2, .03, 40), M(color, { roughness:1 }), x, FLOOR_Y + .015, z, false) : add(g, Box(w, .03, d), M(color, { roughness:1 }), x, FLOOR_Y + .015, z, false);
  if (round) m.scale.z = d / w; return m;
}
function shelf(g, x, z, ry, color) {
  const s = new THREE.Group(); s.position.set(x, FLOOR_Y, z); s.rotation.y = ry; g.add(s);
  add(s, Box(2.8, 2.5, .5), M(0xe9e3d8), 0, 1.25, 0);
  [.5, 1.2, 1.9].forEach((y, i) => { add(s, Box(2.6, .05, .5), WOOD, 0, y - .3, .02, false); for (let k = 0; k < 7; k++) add(s, Box(.28, .5 + (k % 3) * .06, .32), M(k % 2 ? color : tint(color, .5)), -1.1 + k * .36, y, .08, false); });
}
function floorLamp(g, x, z) { add(g, Cyl(.2, .22, .06, 12), STEEL, x, FLOOR_Y + .03, z, false); add(g, Cyl(.03, .03, 2.1, 6), STEEL, x, FLOOR_Y + 1.05, z, false); add(g, Cyl(.2, .32, .45, 12), M(0xfff1c9, { emissive:0xffe9b0, emissiveIntensity:.35 }), x, FLOOR_Y + 2.2, z, false); }
function cooler(g, x, z) { add(g, Box(.55, 1.1, .55), WHITE, x, FLOOR_Y + .55, z); add(g, Cyl(.2, .2, .55, 12), M(0x9fd4f0, { transparent:true, opacity:.7 }), x, FLOOR_Y + 1.35, z, false); }
function credenza(g, x, z, w, ry = 0) { const s = new THREE.Group(); s.position.set(x, FLOOR_Y, z); s.rotation.y = ry; g.add(s); add(s, Box(w, .85, .6), WOOD, 0, .45, 0); add(s, Box(w + .1, .06, .65), DARKWOOD, 0, .9, 0, false); for (let i = 1; i < w / 1.2; i++) add(s, Box(.03, .7, .02), DARKWOOD, -w / 2 + i * 1.2, .45, .31, false); }

// ---------- vách ngăn phòng ----------
const RTALL = 3.8, RLOW = .9, RGLASS = 3.0, RT = .3, DGAP = 1.9;
function partition(g, side, hw, hd, hasDoor, glassFront, kind) {
  const horiz = side === 'n' || side === 's', len = horiz ? hw : hd, fixed = side === 'n' ? -hd : side === 's' ? hd : side === 'w' ? -hw : hw;
  const back = side === 'n' || side === 'w', allGlass = kind === 'meeting' && side !== 'n';
  const piece = (a, b) => {
    if (b - a < .01) return;
    const mk = (y0, y1, mat, th = RT) => horiz ? solid(g, a, FLOOR_Y + y0, fixed - th / 2, b, FLOOR_Y + y1, fixed + th / 2, mat, mat !== GLASS) : solid(g, fixed - th / 2, FLOOR_Y + y0, a, fixed + th / 2, FLOOR_Y + y1, b, mat, mat !== GLASS);
    if (allGlass) { mk(0, .3, WHITE); mk(.3, RTALL, GLASS, .06); mk(RTALL - .1, RTALL, WHITE); }
    else if (back) mk(0, RTALL, WHITE);
    else { mk(0, RLOW, WHITE); mk(RLOW, RGLASS, GLASS, .06); mk(RGLASS - .05, RGLASS, WHITE, RT * .8); }
    for (let p = a; p <= b + .01; p += 4.5) { if (!back || allGlass) { horiz ? solid(g, p - .05, FLOOR_Y, fixed - .08, p + .05, FLOOR_Y + (allGlass ? RTALL : RGLASS), fixed + .08, WHITE, false) : solid(g, fixed - .08, FLOOR_Y, p - .05, fixed + .08, FLOOR_Y + (allGlass ? RTALL : RGLASS), p + .05, WHITE, false); } }
  };
  if (!hasDoor) { piece(-len, len); return; }
  piece(-len, -DGAP); piece(DGAP, len);
  const lintel = (y0, y1) => horiz ? solid(g, -DGAP, FLOOR_Y + y0, fixed - RT / 2, DGAP, FLOOR_Y + y1, fixed + RT / 2, WHITE) : solid(g, fixed - RT / 2, FLOOR_Y + y0, -DGAP, fixed + RT / 2, FLOOR_Y + y1, DGAP, WHITE);
  lintel(2.7, RTALL > RGLASS && (back || allGlass) ? RTALL : RGLASS);
  const th = horiz ? solid(g, -DGAP, FLOOR_Y, fixed - .6, DGAP, FLOOR_Y + .03, fixed + .6, M(0xb9c2cd), false) : solid(g, fixed - .6, FLOOR_Y, -DGAP, fixed + .6, FLOOR_Y + .03, DGAP, M(0xb9c2cd), false);
}

// ---------- dựng phòng ----------
const ROOMS = {};
function doorSides(room) {
  if (room.kind === 'meeting') return ['n', 's', 'e', 'w'];
  const [c, r] = room.slot;
  if (r < 0) return ['s'];
  if (r > 0) return ['n'];
  return [c < 0 ? 'e' : c > 0 ? 'w' : 's'];
}
function buildRoom(room) {
  const { x, z } = slotXZ(room.slot), hw = CELL.w / 2, hd = CELL.d / 2;
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const base = new THREE.Color(room.color), doors = doorSides(room);
  const fl = room.kind === 'meeting' ? M(0xffffff, { map:plankTexture(0x9c7b56, 2.2, 1.5), roughness:.55 }) : M(0xffffff, { map:carpetTexture(tint(room.color, .66).getHex(), 5, 3.4) });
  add(g, Box(CELL.w, FLOOR_Y, CELL.d), fl, 0, FLOOR_Y / 2, 0, false);
  add(g, Box(CELL.w - .02, FLOOR_Y + .02, .35), M(base), 0, (FLOOR_Y + .02) / 2, hd - .15, false);          // dải màu ở mép trước nhận ra phòng
  ['n', 'w', 's', 'e'].forEach(s => partition(g, s, hw, hd, doors.includes(s), true, room.kind));
  const topMat = room.kind === 'boss' ? DARKWOOD : M(0xf0e1c6);
  const members = ORG.people.filter(p => p.room === room.id);
  const seats = {}, info = { room, g, x, z, hw, hd, seats, doors:[], members };
  const chairColor = tint(room.color, .1).getHex();
  const seatAt = (p, lx, lz, w) => { desk(g, lx, lz, w, topMat); chair(g, lx, lz - 1.3, 0, chairColor); seats[p.id] = { x:x + lx, z:z + lz - 1.3, ry:0 }; };
  if (room.kind === 'meeting') {
    rug(g, 0, 0, 13, 8.6, 0x4b6a8c, true);
    const t = add(g, Cyl(1, 1, .12, 48), M(0xf5f1ea, { roughness:.4 }), 0, FLOOR_Y + .8, 0); t.scale.set(4.5, 1, 2.35);
    add(g, Cyl(.55, .8, .8, 14), M(0x3b3f4a), 0, FLOOR_Y + .4, 0);
    info.seatList = [];
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2 + Math.PI / 10, px = Math.cos(a) * 5.4, pz = Math.sin(a) * 3.3, ry = Math.atan2(-px, -pz);
      chair(g, px, pz, ry, 0x3d5a80); info.seatList.push({ x:x + px, z:z + pz, ry });
      add(g, Box(.5, .02, .36), WHITE, Math.cos(a) * 3.5, FLOOR_Y + .87, Math.sin(a) * 1.9, false).rotation.y = ry;
    }
    add(g, Cyl(.14, .1, .35, 10), M(0x9fd4f0, { transparent:true, opacity:.75 }), 0, FLOOR_Y + 1.05, 0, false);
    solid(g, -3.2, FLOOR_Y + 1.3, -hd + .2, 3.2, FLOOR_Y + 3.2, -hd + .3, M(0x1b2230));                // màn hình lớn trên tường
    const scr = boardMesh(6.2, 1.8, ['PHÒNG HỌP', 'Trợ lý chủ trì · trưởng phòng dự'], '#243a5e', '#ffffff'); scr.position.set(0, FLOOR_Y + 2.25, -hd + .32); g.add(scr);
    credenza(g, 5.2, -hd + .6, 4); plant(g, -8, -5, 1.3, FLOOR_Y); plant(g, 8, 5, 1.3, FLOOR_Y); floorLamp(g, -8, 4.6);
  } else if (room.kind === 'reserve') {
    rug(g, 0, 0.6, 15, 9, tint(room.color, .55).getHex());
    members.forEach((p, i) => { const lx = -7 + (i % 6) * 2.8, lz = -3 + Math.floor(i / 6) * 2.6; chair(g, lx, lz, 0, 0x7d8794); seats[p.id] = { x:x + lx, z:z + lz, ry:0 }; });
    const rb = boardMesh(5.2, 1.0, ['PHÒNG NHÂN SỰ DỰ BỊ', members.length + ' người · đình chỉ, chưa được giao việc'], '#f3f4f6'); rb.position.set(0, FLOOR_Y + 3.15, -hd + .2); g.add(rb);
    sofa(g, 6.8, 4.9, 3.0, 0x8a929e, Math.PI); plant(g, hw - 1, -hd + 1, 1.1, FLOOR_Y); floorLamp(g, -hw + 1, hd - 1.2);
  } else {
    const head = room.kind === 'boss' ? members.find(p => p.role === 'boss') : members.find(p => p.id === room.headId);
    const others = members.filter(p => p !== head);
    rug(g, 0, -2.8, 16.6, 5, tint(room.color, .5).getHex());
    if (head) seatAt(head, 0, -3.2, 3.6);
    const xs = [-5.8, 5.8];
    others.forEach((p, i) => { if (i < 2) seatAt(p, xs[i], -3.2, 2.7); else seatAt(p, xs[i % 2] * .6, 1 + Math.floor((i - 2) / 2) * 2.4, 2.7); });
    const title = room.kind === 'boss' ? ['PHÒNG GIÁM ĐỐC', 'Lịch việc và hộp thư báo cáo (M6, M8)'] : [room.name.toUpperCase(), (head ? 'Trưởng phòng ' + head.name + ' · ' : '') + members.length + ' người'];
    const b = boardMesh(5.2, 1.0, title, '#ffffff'); b.position.set(0, FLOOR_Y + 3.15, -hd + .2); g.add(b);
    frameArt(g, -6.8, FLOOR_Y + 2.6, -hd + .17, 1.7, 1.1, tint(room.color, .1)); frameArt(g, 6.8, FLOOR_Y + 2.6, -hd + .17, 1.7, 1.1, tint(room.color, .3));
    const lx = room.kind === 'boss' ? 6.2 : -5.4;
    rug(g, lx, 3.6, 5.6, 3.4, tint(room.color, .45).getHex());
    sofa(g, lx, 4.6, 3.4, room.kind === 'boss' ? 0x3b4a66 : tint(room.color, .05).getHex(), Math.PI);
    coffeeTable(g, lx, 3.2, .75);
    plant(g, hw - 1, -hd + 1, 1.2, FLOOR_Y); floorLamp(g, -hw + 1, hd - 1.2);
    if (room.kind === 'boss') { credenza(g, -6.5, -hd + .6, 4); plant(g, -hw + 1, -hd + 1, 1.3, FLOOR_Y); cooler(g, 8, 4.6); }
    else { shelf(g, -hw + .5, 1.2, Math.PI / 2, base); cooler(g, hw - 1, 4.8); }
  }
  const lab = labelSprite(room.name, room.kind === 'dept' ? 'Phòng ban' : '', .9); lab.position.set(0, 5.9, -hd + .4); g.add(lab);
  const D = { n:{ x:0, z:-hd, ox:0, oz:-2 }, s:{ x:0, z:hd, ox:0, oz:2 }, e:{ x:hw, z:0, ox:2, oz:0 }, w:{ x:-hw, z:0, ox:-2, oz:0 } };
  doors.forEach(s => info.doors.push({ side:s, x:x + D[s].x, z:z + D[s].z, outX:x + D[s].x + D[s].ox, outZ:z + D[s].z + D[s].oz }));
  ROOMS[room.id] = info;
}
ORG.rooms.forEach(buildRoom);

// ---------- sảnh, lễ tân, hành lang ----------
(function lobby() {
  const g = scene, rz = Z1 - 1.7;
  add(g, Box(5.4, 1.1, 1.2), WHITE, -9, 0.55, rz);
  add(g, Box(5.5, .08, 1.3), WOOD, -9, 1.14, rz);
  add(g, Box(1.6, .45, .05), M(0x232a38), -8, 1.55, rz - .1);
  const sg = boardMesh(4.4, 1.2, ['ALAN ACADEMY', 'Học AI · Làm video · Bán khóa học'], '#2f5fb3', '#ffffff'); sg.position.set(-9, 3.1, rz + .55); sg.rotation.y = Math.PI; g.add(sg);
  solid(g, -11.3, 0, rz + .5, -11.1, 2.6, rz + .6, WHITE, false); solid(g, -6.9, 0, rz + .5, -6.7, 2.6, rz + .6, WHITE, false);
  chair(g, -9, rz - 1.2, Math.PI, 0x2f5fb3);
  [[X0 + 1.8, Z0 + 1.8], [X1 - 1.8, Z0 + 1.8], [X0 + 1.8, Z1 - 1.8], [X1 - 1.8, Z1 - 1.8]].forEach(([px, pz]) => plant(g, px, pz, 1.5, 0));
  [[-13, Z1 - 1.2], [13, Z1 - 1.2]].forEach(([bx, bz]) => { add(g, Box(3, .15, .9), WOOD, bx, .5, bz); add(g, Box(3, .6, .1), M(0x3b4a66), bx, .85, bz + .4); for (const s of [-1, 1]) add(g, Box(.12, .45, .7), STEEL, bx + s * 1.2, .22, bz); });
  const mid = (CELL.w + CELL.gap) / 2, midz = (CELL.d + CELL.gap) / 2;
  [[-mid, -midz], [mid, -midz], [-mid, midz], [mid, midz]].forEach(([px, pz], i) => { plant(g, px, pz, 1.2, 0); if (i % 2) floorLamp(g, px + 1.4, pz); });
})();
