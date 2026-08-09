# Xerus Rider Partner - Driver & Captain Application

Domain: `partner.sastisawari.com` / `partner.xerus.biz`

Xerus Rider Partner is the **Driver, Captain & Mobility Fleet Partner Application** for `sastisawari.com` and `xerus.biz`.

## Architecture & Features

- **Driver Dispatch Console**: Real-time incoming ride request notifications with pickup distance & fare.
- **Online/Offline Switch**: Instant driver availability toggle.
- **GPS Turn-by-Turn Navigation**: Built-in route guidance to passenger pickup and destination.
- **Earnings & Monero Vault Payouts**: Real-time daily earnings tracker with instant XMR crypto withdrawals.
- **Passenger Rating & Safety**: Dual-sided rating engine and emergency SOS button.

## App Structure

```text
xerus_rider_partner/
├── src/
│   ├── components/       # DispatchAlert, NavigationMap, EarningsDashboard
│   ├── services/         # LocationTracker, PartnerAPI, MoneroPayouts
│   └── views/            # DashboardView, ActiveRideView, EarningsView
├── public/               # Web App Manifest & App Icons
├── package.json          # React Native / Web App Configuration
└── README.md
```

## Quick Start

```bash
npm install
npm run dev
```
