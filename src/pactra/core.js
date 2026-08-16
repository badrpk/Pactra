'use strict';

const fs = require('fs');
const path = require('path');

const RIDE_STATES = Object.freeze([
  'offered',
  'accepted',
  'arrived',
  'in_progress',
  'completed',
  'cancelled',
]);

const VALID_TRANSITIONS = Object.freeze({
  offered: new Set(['accepted', 'cancelled']),
  accepted: new Set(['arrived', 'cancelled']),
  arrived: new Set(['in_progress', 'cancelled']),
  in_progress: new Set(['completed', 'cancelled']),
  completed: new Set(),
  cancelled: new Set(),
});

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function assertFiniteNumber(value, field, minimum = Number.NEGATIVE_INFINITY) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new TypeError(`${field} must be a finite number >= ${minimum}`);
  }
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class PactraFleet {
  constructor(options = {}) {
    this.clock = typeof options.clock === 'function' ? options.clock : () => new Date().toISOString();
    this.state = {
      drivers: {},
      rides: {},
      dispatchQueue: [],
      earnings: [],
      safetyEvents: [],
    };
  }

  registerDriver({ id, name, vehicle = null }) {
    id = assertNonEmptyString(id, 'id');
    name = assertNonEmptyString(name, 'name');

    if (this.state.drivers[id]) {
      throw new Error(`driver already exists: ${id}`);
    }

    const driver = {
      id,
      name,
      vehicle: vehicle ? clone(vehicle) : null,
      online: false,
      activeRideId: null,
      rating: null,
      ratingCount: 0,
      createdAt: this.clock(),
      updatedAt: this.clock(),
    };

    this.state.drivers[id] = driver;
    return clone(driver);
  }

  setDriverAvailability(driverId, online) {
    const driver = this.#driver(driverId);
    if (typeof online !== 'boolean') {
      throw new TypeError('online must be boolean');
    }
    if (!online && driver.activeRideId) {
      throw new Error('driver with an active ride cannot go offline');
    }
    driver.online = online;
    driver.updatedAt = this.clock();
    return clone(driver);
  }

  offerRide({ id, pickup, destination, fare, passengerId = null, metadata = {} }) {
    id = assertNonEmptyString(id, 'id');
    pickup = assertNonEmptyString(pickup, 'pickup');
    destination = assertNonEmptyString(destination, 'destination');
    fare = assertFiniteNumber(fare, 'fare', 0);

    if (this.state.rides[id]) {
      throw new Error(`ride already exists: ${id}`);
    }

    const ride = {
      id,
      pickup,
      destination,
      fare,
      passengerId,
      metadata: clone(metadata),
      state: 'offered',
      driverId: null,
      createdAt: this.clock(),
      updatedAt: this.clock(),
      history: [{ state: 'offered', at: this.clock() }],
    };

    this.state.rides[id] = ride;
    this.state.dispatchQueue.push(id);
    return clone(ride);
  }

  listAvailableRides() {
    return this.state.dispatchQueue
      .map((id) => this.state.rides[id])
      .filter((ride) => ride && ride.state === 'offered')
      .map(clone);
  }

  acceptRide(driverId, rideId) {
    const driver = this.#driver(driverId);
    const ride = this.#ride(rideId);

    if (!driver.online) {
      throw new Error('driver must be online to accept a ride');
    }
    if (driver.activeRideId) {
      throw new Error(`driver already has active ride: ${driver.activeRideId}`);
    }
    if (ride.state !== 'offered') {
      throw new Error(`ride is not available: ${ride.state}`);
    }

    ride.driverId = driver.id;
    driver.activeRideId = ride.id;
    driver.updatedAt = this.clock();
    this.#transition(ride, 'accepted');
    this.state.dispatchQueue = this.state.dispatchQueue.filter((id) => id !== ride.id);
    return clone(ride);
  }

  transitionRide(rideId, nextState) {
    const ride = this.#ride(rideId);
    if (!RIDE_STATES.includes(nextState)) {
      throw new Error(`unknown ride state: ${nextState}`);
    }

    this.#transition(ride, nextState);

    if (nextState === 'completed') {
      this.#settleCompletedRide(ride);
    } else if (nextState === 'cancelled') {
      this.#releaseDriver(ride);
    }

    return clone(ride);
  }

  rateDriver(driverId, rating) {
    const driver = this.#driver(driverId);
    rating = assertFiniteNumber(rating, 'rating', 1);
    if (rating > 5) {
      throw new RangeError('rating must be between 1 and 5');
    }

    const total = (driver.rating || 0) * driver.ratingCount + rating;
    driver.ratingCount += 1;
    driver.rating = Number((total / driver.ratingCount).toFixed(3));
    driver.updatedAt = this.clock();
    return clone(driver);
  }

  triggerSOS({ driverId, rideId = null, message = 'SOS', location = null }) {
    const driver = this.#driver(driverId);
    if (rideId !== null) {
      const ride = this.#ride(rideId);
      if (ride.driverId && ride.driverId !== driver.id) {
        throw new Error('ride is assigned to a different driver');
      }
    }

    const event = {
      id: `sos-${this.state.safetyEvents.length + 1}`,
      driverId: driver.id,
      rideId,
      message: assertNonEmptyString(message, 'message'),
      location: location ? clone(location) : null,
      createdAt: this.clock(),
      acknowledged: false,
    };

    this.state.safetyEvents.push(event);
    return clone(event);
  }

  acknowledgeSafetyEvent(eventId) {
    eventId = assertNonEmptyString(eventId, 'eventId');
    const event = this.state.safetyEvents.find((item) => item.id === eventId);
    if (!event) {
      throw new Error(`unknown safety event: ${eventId}`);
    }
    event.acknowledged = true;
    event.acknowledgedAt = this.clock();
    return clone(event);
  }

  driverEarnings(driverId) {
    this.#driver(driverId);
    const entries = this.state.earnings.filter((entry) => entry.driverId === driverId);
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    return {
      driverId,
      total: Number(total.toFixed(2)),
      rides: entries.length,
      entries: clone(entries),
    };
  }

  snapshot() {
    return clone(this.state);
  }

  save(filePath) {
    filePath = assertNonEmptyString(filePath, 'filePath');
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(this.state, null, 2) + '\n', 'utf8');
    return filePath;
  }

  load(filePath) {
    filePath = assertNonEmptyString(filePath, 'filePath');
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    this.#validateState(parsed);
    this.state = parsed;
    return this.snapshot();
  }

  #driver(driverId) {
    driverId = assertNonEmptyString(driverId, 'driverId');
    const driver = this.state.drivers[driverId];
    if (!driver) throw new Error(`unknown driver: ${driverId}`);
    return driver;
  }

  #ride(rideId) {
    rideId = assertNonEmptyString(rideId, 'rideId');
    const ride = this.state.rides[rideId];
    if (!ride) throw new Error(`unknown ride: ${rideId}`);
    return ride;
  }

  #transition(ride, nextState) {
    const allowed = VALID_TRANSITIONS[ride.state];
    if (!allowed || !allowed.has(nextState)) {
      throw new Error(`invalid ride transition: ${ride.state} -> ${nextState}`);
    }
    ride.state = nextState;
    ride.updatedAt = this.clock();
    ride.history.push({ state: nextState, at: this.clock() });
  }

  #releaseDriver(ride) {
    if (!ride.driverId) return;
    const driver = this.state.drivers[ride.driverId];
    if (driver && driver.activeRideId === ride.id) {
      driver.activeRideId = null;
      driver.updatedAt = this.clock();
    }
  }

  #settleCompletedRide(ride) {
    if (!ride.driverId) {
      throw new Error('completed ride has no driver');
    }
    this.state.earnings.push({
      rideId: ride.id,
      driverId: ride.driverId,
      amount: ride.fare,
      createdAt: this.clock(),
    });
    this.#releaseDriver(ride);
  }

  #validateState(value) {
    if (!value || typeof value !== 'object') throw new Error('invalid state');
    for (const key of ['drivers', 'rides', 'dispatchQueue', 'earnings', 'safetyEvents']) {
      if (!(key in value)) throw new Error(`state missing key: ${key}`);
    }
    if (!Array.isArray(value.dispatchQueue) || !Array.isArray(value.earnings) || !Array.isArray(value.safetyEvents)) {
      throw new Error('invalid state collection shape');
    }
  }
}

module.exports = {
  PactraFleet,
  RIDE_STATES,
};
