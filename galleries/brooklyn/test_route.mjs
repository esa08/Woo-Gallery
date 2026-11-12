// node --test galleries/brooklyn/test_route.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { routeXY, facingXY, BROOKLYN_PARTITIONS } = createRequire(import.meta.url)("./route.js");

// painting centre and the way it faces (SCENE.md section 4, Blender XY)
const ART = {
  art_01_hero: [[0, -6.608], [0, 1]], art_04: [[0, -6.932], [0, -1]],
  art_02: [[0, -11.608], [0, 1]], art_05: [[0, -11.932], [0, -1]],
  art_06: [[0, -16.608], [0, 1]], art_08: [[0, -16.932], [0, -1]],
  art_07: [[0, -21.758], [0, 1]], art_03: [[4.988, -9.27], [-1, 0]], art_09: [[4.988, -14.27], [-1, 0]],
};
const STARTS = [[0, -1], [3.5, -9.3], [-3.5, -14.3], [0, -19.3]];
const stand = ([[x, y], [nx, ny]]) => [x + 1.6 * nx, y + 1.6 * ny];

// segment vs axis-aligned rectangle (Liang-Barsky clip)
function hits([ax, ay], [bx, by], { x0, x1, y0, y1 }) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

test("straight line when clear", () => {
  assert.deepEqual(routeXY([0, -3], [0, -6.0]), [[0, -3], [0, -6.0]]);
});

test("never cuts a partition", () => {
  for (const from of STARTS) {
    for (const [name, a] of Object.entries(ART)) {
      const path = routeXY(from, stand(a));
      for (let i = 0; i < path.length - 1; i++) {
        for (const r of BROOKLYN_PARTITIONS) {
          assert.ok(!hits(path[i], path[i + 1], r), `${from} -> ${name}: segment ${i} ${path[i]}..${path[i + 1]} cuts ${JSON.stringify(r)}`);
        }
      }
    }
  }
});

test("waypoints stay in the hall", () => {
  for (const from of STARTS) {
    for (const a of Object.values(ART)) {
      for (const [x, y] of routeXY(from, stand(a))) {
        assert.ok(x >= -4.6 && x <= 4.6 && y >= -21.4 && y <= -1.0, `${x},${y}`);
      }
    }
  }
});

test("facing keeps a correct normal", () => {
  assert.deepEqual(facingXY([0, -6.608], [0, 1]), [0, 1]);
  assert.deepEqual(facingXY([4.988, -9.27], [-1, 0]), [-1, 0]);
});

test("facing flips a normal into the wall or partition", () => {
  assert.deepEqual(facingXY([4.988, -9.27], [1, 0]), [-1, 0]);
  assert.deepEqual(facingXY([0, -6.932], [0, 1]), [0, -1]);
});
