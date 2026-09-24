# Project: PulseGuard Full-Stack Hardening & Defect Resolution

## Architecture
PulseGuard is a high-reliability full-stack monitoring and alerting platform comprised of:
1. **Protocol Worker Fleet (`backend/src/workers/`)**: 8 specialized protocol workers (PING, HTTP, HTTPS, TCP, UDP, DNS, SMTP, SSL) responsible for executing discrete health probes against user-configured endpoints.
2. **Core Engine & Pipeline (`backend/src/services/`)**:
   - `scheduler.service.js`: Distributed BullMQ job coordinator with Redis master election and deterministic job deduplication.
   - `runner.js`: Safe execution wrapper enforcing protocol dispatch, timeouts, and error normalization.
   - `health-evaluator.service.js`: Multi-region verification coordinator using `CheckHostProvider` with fallback to local checks and SSRF protection.
   - `enhanced-alert.service.js`: Incident lifecycle management, deduplication, and suppression.
3. **Data Layer & Models (`backend/src/models/`)**: MongoDB collections (`Monitor`, `Check`, `Incident`, `User`, `NotificationPolicy`).
4. **Frontend Dashboard (`frontend/src/`)**: React 18 + Vite SPA utilizing Socket.IO (`SocketContext.jsx`) for live metrics, monitor management (`Monitors.jsx`, `MonitorDetails.jsx`), and incident triage (`Incidents.jsx`).

---

## Feature Inventory

| # | Feature / Hardening Task | Description | Milestone | Source |
|---|--------------------------|-------------|-----------|--------|
| 1 | SSRF Firewall Hardening | Remove `NODE_ENV === 'test'` bypass; enforce full CIDRs (`100.64.0.0/10`, `198.18.0.0/15`, `240.0.0.0/4`, `fe80::/10` full block, IPv6 uncompressed loopbacks, IPv4-mapped IPv6) in `url-validator.js`. | M1 | Survey 1 |
| 2 | Ping Worker Cross-Platform Hardening | Move `resolveSecurely` inside `try/catch`; handle IPv6 on macOS with `/sbin/ping6` (no `-W`) and Linux with `ping -6`; provide fallback `parseUrl`. | M1 | Survey 1 |
| 3 | HTTP / HTTPS Worker Resiliency | Prevent RFC 6066 `DEP0123` IP SNI warning; destroy sockets on body >1MB; map `SSRF_BLOCKED` to `DOWN`; preserve port in `https.worker.js` for SSL check delegation; support `monitor.headers`. | M1 | Survey 1 |
| 4 | TCP / UDP Worker Lifecycle Hardening | Validate `port` (1–65535) before connect; resolve structured results instead of rejecting promises; move UDP socket creation into promise; treat UDP port 53 timeout as `DOWN` (prevent false UP on timeout). | M1 | Survey 1 |
| 5 | DNS Worker Protocol & Error Hardening | Support IPv6 AAAA queries on `ENODATA`; update protocol prefix regex to strip any protocol schema (e.g. `dns://`); populate top-level `addresses`; map `ECONNREFUSED` on port 53 to `DNS_SERVER_FAILURE`. | M1 | Survey 1 |
| 6 | SMTP Worker STARTTLS & State Hardening | Support STARTTLS negotiation on port 25/2525; detach plaintext `'data'` listener before upgrading to TLS; populate top-level `bannerCode`; map SSRF errors to `SSRF_BLOCKED`. | M1 | Survey 1 |
| 7 | SSL Worker & OCSP Timer Hardening | Omit SNI for IP addresses; strict wildcard SAN matching (`.example.com`); populate top-level `daysUntilExpiry` and `issuer`; clear timeout timer in `ocsp-checker.js` race. | M1 | Survey 1 |
| 8 | Error Classification Engine Hardening | Add missing HTTP status categories (`CLIENT_ERROR` 4xx -> `DOWN`/`DEGRADED`, `SUCCESS` 2xx -> `UP`) in `determineHealthStateFromError`; map `SSRF_BLOCKED` to `DOWN` across all workers. | M1 | Survey 1 |
| 9 | Controller Input Validation Hardening | Enforce URL/hostname SSRF and format validation for all monitor types (TCP, UDP, PING, DNS, SMTP, SSL) at creation and update in `monitor.controller.js`. | M1 | Survey 1 |
| 10 | Deterministic BullMQ Job Scheduling | Replace random suffixes with deterministic job IDs (`scheduled:${id}`, `immediate:${id}`); eliminate duplicate/zombie recursive loops when updating intervals or triggering manual checks. | M2 | Survey 2 |
| 11 | Unawaited Promise Fix in Sync | Await `job.getState()` instead of calling unawaited `j.isActive()` in `allJobs.filter` in `scheduler.service.js`. | M2 | Survey 2 |
| 12 | Distributed Master Lock & Sentinel Hardening | Use atomic Lua script for lock renewal; remove unconditional dev lock steal; add `isMaster` guard to `verifyJobHealth`; clear sentinel intervals on standby demotion. | M2 | Survey 2 |
| 13 | Global Verification Cache & Rate Limiting | Never cache empty arrays `[]` on rate limit in `verificationCache`; handle Axios HTTP 429 status code and apply backoff in `CheckHostProvider.js`. | M2 | Survey 2 |
| 14 | Verification Engine SSRF & Command Injection Fix | Enforce SSRF validation on target before global verification or local fallbacks; replace shell `execAsync(pingCommand)` with parameterized `execFileAsync` in `health-evaluator.service.js`. | M2 | Survey 2 |
| 15 | Telemetry Persistence & Uptime Consistency | Always persist 5-node verification telemetry to `Check` record; return 100% uptime when `totalChecks === 0`; prevent `NaN` in uptime calculations; reset uptime metrics when target changes. | M2 | Survey 2 |
| 16 | IPv6 Bracket & URL Parsing Hardening | Strip brackets from IPv6 hostnames before regex checking in `runner.js`; fix IPv6 address splitting in `parseUrl`. | M2 | Survey 2 |
| 17 | Runtime TypeError Fix in MonitorDetails | Guard `forensicsSource?.verifications?.filter(...)?.length || 0` in `MonitorDetails.jsx:745` to prevent blank panel crash when inspecting monitors lacking verification telemetry. | M3 | Survey 3 |
| 18 | Frontend Socket Reconnection & Subscriptions | Reset `socketRef.current = null` on disconnect in `SocketContext.jsx`; add subscriptions for `'incident_created'`, `'incident_resolved'`, and `'monitor_status_change'` in `MonitorDetails.jsx` and `Monitors.jsx`. | M3 | Survey 3 |
| 19 | UI Form Fields Preservation (Port, AlertThreshold, Headers) | Add `port` and `alertThreshold` fields to `Monitors.jsx`, `MonitorDetails.jsx`, and `AdminMonitorEditModal.jsx`; add custom headers schema support to `Monitor.js`, controller whitelist, and frontend forms. | M3 | Survey 3 |
| 20 | Automated Test Runner Unification | Modernize `run-full-tests.js` to execute Jest test suites via Jest CLI with `NODE_OPTIONS=--experimental-vm-modules` and `process.execPath`; execute validation scripts with Node; remove duplicates; include all missing test suites. | M4 | Survey 3 |
| 21 | Full Test Suite 100% Pass Rate | Ensure all unit, integration, validation, and property test suites pass with 100% success rate under `node src/test/run-full-tests.js`. | M4 | Survey 3 |
| 22 | Full Production Build & E2E Acceptance Pass | Verify frontend `npm run build` succeeds with 0 errors; verify full end-to-end integration and adversarial edge cases pass. | M5 | Synthesis |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Comprehensive Protocol Workers & SSRF Hardening | Features 1–9: All 8 protocol workers, `url-validator.js`, `resolver.js`, `error-classifications.js`, `ocsp-checker.js`, controller SSRF validation. | none | IN_PROGRESS (worker: 8fe36c3f-0c26-4279-887b-b6f91384b13e) |
| M2 | Core Engine & Scheduler Pipeline Resilience | Features 10–16: `scheduler.service.js`, `health-evaluator.service.js`, `runner.js`, `CheckHostProvider.js`, `monitor.controller.js` uptime stats, Redis locks. | M1 | PLANNED |
| M3 | Frontend State & Monitor Details Integrity | Features 17–19: `MonitorDetails.jsx` crash fix, `SocketContext.jsx` reconnect, event subscriptions, form inputs (`port`, `alertThreshold`, `headers`), `Monitor.js` schema. | M2 | PLANNED |
| M4 | Automated Test Runner & Suite Unification | Features 20–21: `backend/src/test/run-full-tests.js` overhaul, Jest integration, test suite regression fixes, 100% test pass verification. | M1, M2, M3 | PLANNED |
| M5 | E2E Final Pass & Adversarial Hardening | Feature 22: Full production build (`frontend` npm run build), full backend test runner execution, adversarial verification, final report to Sentinel. | M4 | PLANNED |

---

## Interface Contracts

### 1. Protocol Workers Contract (`backend/src/workers/*.worker.js`)
- **Invocation**: `check<Protocol>(monitor, result, options = {})` where:
  - `monitor`: `{ url, port, timeout, type, headers, ... }`
  - `result`: `{ isUp: boolean, statusCode: number|null, responseTime: number, errorType: string|null, errorMessage: string|null, healthState: 'UP'|'DEGRADED'|'DOWN'|'UNKNOWN', meta: object, addresses?: string[], address?: string, bannerCode?: number, daysUntilExpiry?: number, issuer?: string }`
  - `options`: `{ parseUrl: function }`
- **Error Behavior**: Must NEVER reject promise or throw uncaught exceptions; must populate `result.healthState = 'DOWN'` with specific `errorType` (e.g. `'SSRF_BLOCKED'`, `'HOST_UNREACHABLE_PING'`, `'TIMEOUT'`, `'PORT_CLOSED'`).
- **SSRF Code**: All blocked targets must throw/yield `errorType: 'SSRF_BLOCKED'`.

### 2. BullMQ Scheduler Job Contract (`backend/src/services/scheduler.service.js`)
- **Scheduled Job ID**: `scheduled:${monitorId}`
- **Immediate Job ID**: `immediate:${monitorId}`
- **State Guarantee**: Deduplicated by BullMQ native `jobId`. No duplicate delayed check loops.

### 3. Monitor Model & Controller Contract
- **Fields**: `name`, `type`, `url`, `port`, `interval`, `timeout`, `alertThreshold`, `degradedThresholdMs`, `sslExpiryThresholdDays`, `isActive`, `headers` (Map/Object).
- **Uptime Stats**: `totalChecks === 0 ? 100 : (successfulChecks / totalChecks) * 100`.

### 4. Frontend Realtime Event Contract
- **Events**: `'monitor_update'`, `'monitor_status_change'`, `'incident_created'`, `'incident_resolved'`.
- **Handling**: `MonitorDetails.jsx` reconciles state on any of these events.

---

## Code Layout

```
PulseGuard/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── redis.js
│   │   │   └── redis-cache.js
│   │   ├── controllers/
│   │   │   └── monitor.controller.js
│   │   ├── models/
│   │   │   ├── Monitor.js
│   │   │   ├── Check.js
│   │   │   └── Incident.js
│   │   ├── services/
│   │   │   ├── scheduler.service.js
│   │   │   ├── runner.js
│   │   │   ├── health-evaluator.service.js
│   │   │   ├── enhanced-alert.service.js
│   │   │   ├── stats.service.js
│   │   │   └── providers/
│   │   │       ├── CheckHostProvider.js
│   │   │       └── SSLProvider.js
│   │   ├── utils/
│   │   │   ├── url-validator.js
│   │   │   ├── resolver.js
│   │   │   ├── error-classifications.js
│   │   │   ├── status-classifier.js
│   │   │   └── ocsp-checker.js
│   │   ├── workers/
│   │   │   ├── ping.worker.js
│   │   │   ├── http.worker.js
│   │   │   ├── https.worker.js
│   │   │   ├── tcp.worker.js
│   │   │   ├── udp.worker.js
│   │   │   ├── dns.worker.js
│   │   │   ├── smtp.worker.js
│   │   │   └── ssl.worker.js
│   │   └── test/
│   │       └── run-full-tests.js
│   └── tests/
│       ├── unit/
│       ├── validation/
│       ├── integration/
│       └── realtime/
└── frontend/
    └── src/
        ├── context/
        │   └── SocketContext.jsx
        ├── pages/
        │   ├── MonitorDetails.jsx
        │   ├── Monitors.jsx
        │   └── Incidents.jsx
        └── components/
            └── AdminMonitorEditModal.jsx
```
