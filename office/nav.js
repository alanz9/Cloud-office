// Đồ thị đường đi: hành lang (các đường ngang/dọc giữa các phòng), lối đi trong từng phòng, cửa. Dùng để nhân vật đi bộ và để chặn vào phòng không phải của mình.
// Nút thuộc phòng nào thì mang room = id phòng đó; nút hành lang có room = null. route() chỉ cho đi qua nút của các phòng được phép.
const NAV = (() => {
  const nodes = [], adj = [];
  const addNode = (x, z, room = null, kind = 'way', tag = null) => { nodes.push({ id:nodes.length, x, z, room, kind, tag }); adj.push([]); return nodes.length - 1; };
  const link = (a, b) => {
    if (a === b) return;
    const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
    if (!adj[a].some(e => e.to === b)) { adj[a].push({ to:b, d }); adj[b].push({ to:a, d }); }
  };
  const pitchX = CELL.w + CELL.gap, pitchZ = CELL.d + CELL.gap;
  const xs = [], zs = [];
  for (let c = GRID.c0; c < GRID.c1; c++) xs.push((c + .5) * pitchX);
  for (let r = GRID.r0; r < GRID.r1; r++) zs.push((r + .5) * pitchZ);
  const xa = X0 + 1.6, xb = X1 - 1.6, za = Z0 + 1.6, zb = Z1 - 1.6;
  const lines = [];
  zs.forEach(zv => lines.push({ axis:'h', c:zv, a:xa, b:xb, ids:[addNode(xa, zv), addNode(xb, zv)] }));
  xs.forEach(xv => lines.push({ axis:'v', c:xv, a:za, b:zb, ids:[addNode(xv, za), addNode(xv, zb)] }));
  lines.filter(l => l.axis === 'h').forEach(h => lines.filter(l => l.axis === 'v').forEach(v => { const id = addNode(v.c, h.c); h.ids.push(id); v.ids.push(id); }));
  const snap = oid => {                                                                   // nối nút ngoài cửa vào đường hành lang gần nhất
    const o = nodes[oid]; let best = null;
    lines.forEach(l => {
      const along = l.axis === 'h' ? o.x : o.z, off = l.axis === 'h' ? Math.abs(o.z - l.c) : Math.abs(o.x - l.c);
      if (along >= l.a && along <= l.b && (!best || off < best.off)) best = { l, off };
    });
    const l = best.l, s = l.axis === 'h' ? addNode(o.x, l.c) : addNode(l.c, o.z);
    l.ids.push(s); link(oid, s);
  };

  const seatNode = {}, meetSeats = [], doorOut = {}, stroll = {}, roomOf = {};
  ORG.rooms.forEach(room => {
    const R = ROOMS[room.id], hw = R.hw, hd = R.hd, W = (lx, lz, kind = 'way', tag = null) => addNode(R.x + lx, R.z + lz, room.id, kind, tag);
    doorOut[room.id] = [];
    if (room.kind === 'meeting') {
      const ring = [];
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2 + Math.PI / 10;
        ring.push(W(Math.cos(a) * 6.9, Math.sin(a) * 4.4));
        const s = R.seatList[i], sid = addNode(s.x, s.z, room.id, 'seat', 'meeting'); meetSeats.push({ id:sid, ry:s.ry }); link(sid, ring[i]);
      }
      ring.forEach((id, i) => link(id, ring[(i + 1) % 10]));
      R.doors.forEach(d => {
        const D = addNode(d.x, d.z, room.id), O = addNode(d.outX, d.outZ); doorOut[room.id].push(O); link(D, O); snap(O);
        let best = ring[0]; ring.forEach(id => { if (Math.hypot(nodes[id].x - d.x, nodes[id].z - d.z) < Math.hypot(nodes[best].x - d.x, nodes[best].z - d.z)) best = id; });
        link(D, best);
      });
      stroll[room.id] = [];
      return;
    }
    const BZ = -5.4, LX = 8.1;
    const EL = W(-LX, BZ), EC = W(0, BZ), ER = W(LX, BZ), ML = W(-LX, 0), MR = W(LX, 0), FL = W(-LX, 1.5), FM = W(0, 1.5), FR = W(LX, 1.5);
    link(EL, ML); link(ML, FL); link(ER, MR); link(MR, FR); link(FL, FM); link(FM, FR);
    const back = [EL, EC, ER], front = [FL, FM, FR, ML, MR];
    Object.entries(R.seats).forEach(([pid, s]) => {
      const sid = addNode(s.x, s.z, room.id, 'seat', pid); seatNode[pid] = sid; roomOf[pid] = room.id;
      if (s.z - R.z < -2) { const b = W(s.x - R.x, BZ); back.push(b); link(sid, b); }
      else { let best = front[0]; front.forEach(id => { if (Math.hypot(nodes[id].x - s.x, nodes[id].z - s.z) < Math.hypot(nodes[best].x - s.x, nodes[best].z - s.z)) best = id; }); link(sid, best); }
    });
    back.sort((a, b) => nodes[a].x - nodes[b].x).forEach((id, i, arr) => { if (i) link(arr[i - 1], id); });
    const inner = { n:EC, s:FM, e:MR, w:ML };
    R.doors.forEach(d => { const D = addNode(d.x, d.z, room.id), O = addNode(d.outX, d.outZ); doorOut[room.id].push(O); link(D, O); snap(O); link(D, inner[d.side]); });
    stroll[room.id] = [FL, FM, FR];
  });
  lines.forEach(l => { const k = l.axis === 'h' ? 'x' : 'z'; l.ids.sort((p, q) => nodes[p][k] - nodes[q][k]).forEach((id, i, arr) => { if (i && nodes[id][k] - nodes[arr[i - 1]][k] > .01) link(arr[i - 1], id); else if (i) link(arr[i - 1], id); }); });

  function route(from, to, allowed) {                                                      // Dijkstra; trả về mảng id nút từ from tới to, hoặc null nếu bị chặn
    const ok = id => nodes[id].room === null || allowed.has(nodes[id].room);
    if (!ok(to)) return null;
    const dist = new Array(nodes.length).fill(Infinity), prev = new Array(nodes.length).fill(-1), done = new Array(nodes.length).fill(false);
    dist[from] = 0;
    for (;;) {
      let u = -1; for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0) return null; if (u === to) break; done[u] = true;
      adj[u].forEach(e => { if (ok(e.to) && dist[u] + e.d < dist[e.to]) { dist[e.to] = dist[u] + e.d; prev[e.to] = u; } });
    }
    const path = []; for (let v = to; v >= 0; v = prev[v]) path.unshift(v); return path;
  }
  return { nodes, adj, route, seatNode, meetSeats, doorOut, stroll, roomOf };
})();
