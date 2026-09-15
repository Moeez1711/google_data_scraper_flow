/**
 * Country borders for scan tiles. A country's bounding box overlaps its neighbours (Oman's box covers the UAE),
 * so tiles that don't touch the chosen country are skipped before any billed request is made.
 * Borders: Natural Earth 1:50m admin-0 countries (public domain), simplified to 3 decimals in geo/borders.json
 * as { ISO2: MultiPolygon coordinates }.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';

let borders;
const load = () => {
  if (!borders) {
    try { borders = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'geo', 'borders.json'), 'utf8')); } catch { borders = {}; }
  }
  return borders;
};

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolygon = (x, y, poly) => inRing(x, y, poly[0]) && !poly.slice(1).some((hole) => inRing(x, y, hole));

const orient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
const segmentsCross = (a, b, c, d) => orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b);

export const hasBorder = (code) => Boolean(load()[code]);

/**
 * True when the rectangle (grown by marginKm, since simplified borders are a few km off) touches the country.
 * Countries without a border shape are never filtered.
 */
export function rectTouchesCountry(b, code, marginKm = 5) {
  const polys = load()[code];
  if (!polys) return true;
  const mLat = marginKm / 110.574;
  const mLng = marginKm / (111.32 * Math.cos((((b.south + b.north) / 2) * Math.PI) / 180));
  const s = b.south - mLat, n = b.north + mLat, w = b.west - mLng, e = b.east + mLng;
  const corners = [[w, s], [e, s], [e, n], [w, n]];
  const edges = corners.map((c, i) => [c, corners[(i + 1) % 4]]);
  for (const poly of polys) {
    const outer = poly[0];
    if (outer.some(([x, y]) => x >= w && x <= e && y >= s && y <= n)) return true; // border point inside the tile
    if (corners.some(([x, y]) => inPolygon(x, y, poly))) return true; // tile corner inside the country
    for (let i = 0; i < outer.length - 1; i++) {
      if (edges.some(([p, q]) => segmentsCross(outer[i], outer[i + 1], p, q))) return true; // border crosses tile edge
    }
  }
  return false;
}
