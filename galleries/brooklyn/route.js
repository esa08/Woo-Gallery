// Brooklyn glide routing (Blender XY, metres). Classic script: defines globals for main.js; also loads in Node for tests.
// Three free-standing partition rows cross the hall; a glide must go round them through the gaps beside the centre panels.
"use strict";

const CLEAR = 0.45;                                      // camera ellipsoid radius 0.35 + margin
const HALL = { x0: -4.6, x1: 4.6 };                      // walkable x (walls at +-5 minus clearance)
const PARTITION_ROWS = [                                 // raw rectangles per row (SCENE.md section 2)
  [{ x0: -2, x1: 2, y0: -6.92, y1: -6.62 }, { x0: 4, x1: 5, y0: -6.92, y1: -6.62 }],
  [{ x0: -2, x1: 2, y0: -11.92, y1: -11.62 }, { x0: -5, x1: -4, y0: -11.92, y1: -11.62 }],
  [{ x0: -2, x1: 2, y0: -16.92, y1: -16.62 }, { x0: 4, x1: 5, y0: -16.92, y1: -16.62 }],
];
const grow = (r) => ({ x0: r.x0 - CLEAR, x1: r.x1 + CLEAR, y0: r.y0 - CLEAR, y1: r.y1 + CLEAR });
const BROOKLYN_PARTITIONS = PARTITION_ROWS.flat().map(grow);

// does segment a-b touch rectangle r (Liang-Barsky)
function segHitsRect([ax, ay], [bx, by], r) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  for (const [p, q] of [[-dx, ax - r.x0], [dx, r.x1 - ax], [-dy, ay - r.y0], [dy, r.y1 - ay]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const s = q / p;
    if (p < 0) t0 = Math.max(t0, s); else t1 = Math.min(t1, s);
    if (t0 > t1) return false;
  }
  return true;
}

// [from, ...waypoints, to] that passes no partition: recurse on the first row the straight line hits
function routeXY(from, to, depth = 0) {
  const rows = PARTITION_ROWS.map((row) => row.map(grow))
    .filter((row) => row.some((r) => segHitsRect(from, to, r)))
    .sort((a, b) => Math.abs(a[0].y1 - from[1]) - Math.abs(b[0].y1 - from[1]));
  if (!rows.length || depth > 6) return [from, to];
  const row = rows[0], { y0, y1 } = row[0], ym = (y0 + y1) / 2;
  // free x intervals of this row inside the hall; take the gap nearest to where the line crosses the row
  const t = to[1] === from[1] ? 0 : Math.min(1, Math.max(0, (ym - from[1]) / (to[1] - from[1])));
  const xLine = from[0] + t * (to[0] - from[0]);
  const gaps = [];
  let x = HALL.x0;
  for (const r of [...row].sort((a, b) => a.x0 - b.x0)) {
    if (r.x0 > x) gaps.push((x + Math.min(r.x0, HALL.x1)) / 2);
    x = Math.max(x, r.x1);
  }
  if (x < HALL.x1) gaps.push((x + HALL.x1) / 2);
  const gx = gaps.reduce((best, g) => (Math.abs(g - xLine) < Math.abs(best - xLine) ? g : best));
  const above = from[1] > ym, near = above ? y1 + 0.3 : y0 - 0.3, far = above ? y0 - 0.3 : y1 + 0.3;
  const a = routeXY(from, [gx, near], depth + 1), b = routeXY([gx, far], to, depth + 1);
  return [...a, ...b];
}

// unit normal of a painting, flipped when it points into a partition or out of the hall (a frame flipped in Blender)
function facingXY([cx, cy], [nx, ny]) {
  const len = Math.hypot(nx, ny), ux = nx / len, uy = ny / len;
  const px = cx + 0.15 * ux, py = cy + 0.15 * uy;
  const blocked = px < -5 || px > 5 || py < -21.77 || py > -1.8 ||
    PARTITION_ROWS.flat().some((r) => px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1);
  return blocked ? [0 - ux, 0 - uy] : [ux, uy];         // 0 - v, not -v: no -0
}

if (typeof module === "object") module.exports = { routeXY, facingXY, BROOKLYN_PARTITIONS };
