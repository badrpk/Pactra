'use strict';

const fs = require('fs');
const path = require('path');
const { PactraFleet } = require('./pactra/core');

function usage() {
  console.log(`Pactra mobility CLI\n\nUsage:\n  node src/index.js demo\n  node src/index.js status <state-file>\n  node src/index.js init <state-file>\n\nCommands:\n  demo                 Run a complete in-memory ride lifecycle demo\n  status <state-file>  Print a saved fleet snapshot\n  init <state-file>    Create an empty persisted Pactra state\n`);
}

function demo() {
  let tick = 0;
  const fleet = new PactraFleet({ clock: () => `2026-01-01T00:00:${String(tick++).padStart(2, '0')}Z` });
  fleet.registerDriver({ id: 'driver-1', name: 'Demo Captain', vehicle: { type: 'car', plate: 'DEMO-001' } });
  fleet.setDriverAvailability('driver-1', true);
  fleet.offerRide({ id: 'ride-1', pickup: 'Blue Area', destination: 'F-10', fare: 650, passengerId: 'passenger-1' });
  fleet.acceptRide('driver-1', 'ride-1');
  fleet.transitionRide('ride-1', 'arrived');
  fleet.transitionRide('ride-1', 'in_progress');
  fleet.transitionRide('ride-1', 'completed');
  fleet.rateDriver('driver-1', 5);
  console.log(JSON.stringify({ snapshot: fleet.snapshot(), earnings: fleet.driverEarnings('driver-1') }, null, 2));
}

function main(argv) {
  const [command, fileArg] = argv;
  if (!command || command === '--help' || command === '-h') {
    usage();
    return 0;
  }

  if (command === 'demo') {
    demo();
    return 0;
  }

  if (!fileArg) {
    usage();
    return 2;
  }

  const file = path.resolve(fileArg);
  if (command === 'init') {
    const fleet = new PactraFleet();
    fleet.save(file);
    console.log(file);
    return 0;
  }

  if (command === 'status') {
    if (!fs.existsSync(file)) throw new Error(`state file not found: ${file}`);
    const fleet = new PactraFleet();
    fleet.load(file);
    console.log(JSON.stringify(fleet.snapshot(), null, 2));
    return 0;
  }

  usage();
  return 2;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`Pactra: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main };
