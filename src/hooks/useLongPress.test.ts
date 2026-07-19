import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LongPressGesture } from './useLongPress.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('LongPressGesture fires onLongPress after the delay elapses', async () => {
  let fired = false;
  const gesture = new LongPressGesture({
    delay: 15,
    moveTolerancePx: 10,
    onLongPress: () => {
      fired = true;
    },
  });

  gesture.start({ x: 0, y: 0 });
  await wait(30);

  assert.equal(fired, true);
  assert.equal(gesture.end(), true);
});

test('LongPressGesture does not fire if end() is called before the delay elapses', async () => {
  let fired = false;
  const gesture = new LongPressGesture({
    delay: 30,
    moveTolerancePx: 10,
    onLongPress: () => {
      fired = true;
    },
  });

  gesture.start({ x: 0, y: 0 });
  const didFireBeforeEnd = gesture.end();
  await wait(45);

  assert.equal(didFireBeforeEnd, false);
  assert.equal(fired, false);
});

test('LongPressGesture cancels when movement exceeds the tolerance', async () => {
  let fired = false;
  const gesture = new LongPressGesture({
    delay: 15,
    moveTolerancePx: 10,
    onLongPress: () => {
      fired = true;
    },
  });

  gesture.start({ x: 0, y: 0 });
  gesture.move({ x: 0, y: 25 });
  await wait(30);

  assert.equal(fired, false);
  assert.equal(gesture.end(), false);
});

test('LongPressGesture keeps the timer when movement stays within the tolerance', async () => {
  let fired = false;
  const gesture = new LongPressGesture({
    delay: 15,
    moveTolerancePx: 10,
    onLongPress: () => {
      fired = true;
    },
  });

  gesture.start({ x: 0, y: 0 });
  gesture.move({ x: 3, y: 4 }); // distance = 5, within the 10px tolerance
  await wait(30);

  assert.equal(fired, true);
});

test('LongPressGesture.cancel() stops a pending timer', async () => {
  let fired = false;
  const gesture = new LongPressGesture({
    delay: 15,
    moveTolerancePx: 10,
    onLongPress: () => {
      fired = true;
    },
  });

  gesture.start({ x: 0, y: 0 });
  gesture.cancel();
  await wait(30);

  assert.equal(fired, false);
});
