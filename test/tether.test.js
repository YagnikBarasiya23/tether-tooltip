import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorPoint, bubblePoint, place, stringPath } from '../tether.js';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const viewport = { width: 1000, height: 800 };
const bubble = { width: 200, height: 60 };

test('sits above the anchor, centred, one gap away', () => {
  const p = place(rect(400, 400, 100, 40), bubble, viewport, { placement: 'top', gap: 30 });
  assert.equal(p.side, 'top');
  assert.equal(p.x, 350);
  assert.equal(p.y, 400 - 30 - 60);
  assert.deepEqual(p.from, { x: 450, y: 400 });
});

test('flips to the other side when there is no room', () => {
  assert.equal(place(rect(400, 20, 100, 40), bubble, viewport, { placement: 'top' }).side, 'bottom');
  assert.equal(place(rect(400, 760, 100, 30), bubble, viewport, { placement: 'bottom' }).side, 'top');
  assert.equal(place(rect(20, 400, 50, 40), bubble, viewport, { placement: 'left' }).side, 'right');
});

test('keeps the preferred side when neither side fits', () => {
  assert.equal(place(rect(400, 10, 100, 780), bubble, viewport, { placement: 'top' }).side, 'top');
});

test('slides along the edge to stay inside the viewport', () => {
  const p = place(rect(960, 400, 30, 30), bubble, viewport, { placement: 'top', padding: 8 });
  assert.equal(p.x, 1000 - 8 - 200);
  assert.deepEqual(p.from, { x: 975, y: 400 }, 'the string still starts at the anchor');
});

test('anchor points are the middle of the facing edge', () => {
  const r = rect(100, 100, 80, 40);
  assert.deepEqual(anchorPoint(r, 'left'), { x: 100, y: 120 });
  assert.deepEqual(anchorPoint(r, 'bottom'), { x: 140, y: 140 });
});

test('the string ties onto the bubble edge nearest the anchor, clamped off the corners', () => {
  assert.deepEqual(bubblePoint(0, 0, 200, 60, 'top', { x: 100, y: 200 }), { x: 100, y: 60 });
  assert.deepEqual(bubblePoint(0, 0, 200, 60, 'top', { x: 500, y: 200 }), { x: 186, y: 60 });
  assert.deepEqual(bubblePoint(0, 0, 200, 60, 'right', { x: -50, y: 30 }), { x: 0, y: 30 });
});

test('a taut string is straight; sway and slack bend it sideways', () => {
  assert.equal(stringPath({ x: 0, y: 100 }, { x: 0, y: 0 }, 0, 36), 'M0 100 Q0 50 0 0');
  assert.equal(stringPath({ x: 0, y: 100 }, { x: 0, y: 0 }, 10, 36), 'M0 100 Q10 50 0 0');
  const slack = stringPath({ x: 0, y: 20 }, { x: 0, y: 0 }, 0, 36);
  assert.equal(slack, 'M0 20 Q9.6 10 0 0');
});
