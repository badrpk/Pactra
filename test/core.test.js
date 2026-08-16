'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { PactraFleet } = require('../src/pactra/core');

function fleet() {
  let n = 0;
  return new PactraFleet({ clock: () => `2026-01-01T00:00:${String(n++).padStart(2, '0')}Z` });
}

test('driver can complete a ride and receive deterministic earnings', () => {
  const f = fleet();
  f.registerDriver({ id: 'd1', name: 'Captain One' });
  f.setDriverAvailability('d1', true);
  f.offerRide({ id: 'r1', pickup: 'A', destination: 'B', fare: 500 });
  f.acceptRide('d1', 'r1');
  f.transitionRide('r1', 'arrived');
  f.transitionRide('r1', 'in_progress');
  f.transitionRide('r1', 'completed');
  assert.deepStrictEqual(f.driverEarnings('d1').total, 500);
  assert.strictEqual(f.snapshot().drivers.d1.activeRideId, null);
});

test('invalid ride transitions are rejected', () => {
  const f = fleet();
  f.offerRide({ id: 'r1', pickup: 'A', destination: 'B', fare: 1 });
  assert.throws(() => f.transitionRide('r1', 'completed'), /invalid ride transition/);
});

test('offline driver cannot accept a ride', () => {
  const f = fleet();
  f.registerDriver({ id: 'd1', name: 'Captain One' });
  f.offerRide({ id: 'r1', pickup: 'A', destination: 'B', fare: 1 });
  assert.throws(() => f.acceptRide('d1', 'r1'), /must be online/);
});

test('SOS events are recorded and acknowledged', () => {
  const f = fleet();
  f.registerDriver({ id: 'd1', name: 'Captain One' });
  const event = f.triggerSOS({ driverId: 'd1', message: 'Need assistance', location: { lat: 33.7, lon: 73.1 } });
  assert.strictEqual(event.acknowledged, false);
  assert.strictEqual(f.acknowledgeSafetyEvent(event.id).acknowledged, true);
});

test('state persists and restores without external services', () => {
  const f = fleet();
  f.registerDriver({ id: 'd1', name: 'Captain One' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pactra-'));
  const file = path.join(dir, 'fleet.json');
  f.save(file);

  const restored = fleet();
  restored.load(file);
  assert.strictEqual(restored.snapshot().drivers.d1.name, 'Captain One');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ratings maintain an average', () => {
  const f = fleet();
  f.registerDriver({ id: 'd1', name: 'Captain One' });
  f.rateDriver('d1', 5);
  const driver = f.rateDriver('d1', 3);
  assert.strictEqual(driver.rating, 4);
  assert.strictEqual(driver.ratingCount, 2);
});
