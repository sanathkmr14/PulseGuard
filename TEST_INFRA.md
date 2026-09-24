# PulseGuard End-to-End (E2E) Test Infrastructure Specification

## 1. Test Philosophy: Opaque-Box & Requirement-Driven Testing

PulseGuard's End-to-End (E2E) test suite is constructed on strict **opaque-box, requirement-driven testing principles**. The overarching objective is to validate real-world behavior and guarantees against specifications (R1–R4 from `ORIGINAL_REQUEST.md` and `PROJECT.md`), completely uncoupled from incidental internal implementation details.

### Core Tenets
1. **Opaque-Box Boundary Integrity**:
   - Tests interact exclusively with external interfaces, public protocol workers (`checkHttp`, `checkHttps`, `checkTcp`, `checkUdp`, `checkDns`, `checkSmtp`, `checkSsl`, `checkPing`), public service methods (`runner.run`, `healthEvaluator.determineHealthState`, `alertService.handleFailure`, `scheduler.scheduleMonitor`), and observable side-effects (state transitions, incident creation, notification dispatches, response telemetry).
   - Tests assert on contract fulfillment: correct health state classification (`UP`, `DEGRADED`, `DOWN`), accurate error categorization (`SSRF_BLOCKED`, `TIMEOUT`, `CONNECTION_REFUSED`), clean latency measurement, and incident lifecycle progression without inspecting internal private variables.
2. **Authoritative Expected Output Derivation**:
   - Every single test case derives its expected status, error classification, and state transitions strictly from user requirements (R1: Protocol workers & SSRF, R2: Resilience & engine transitions, R3: State integrity & incident lifecycle, R4: 100% automated test verification) and network RFC standards (RFC 792 ICMP, RFC 2616/7230 HTTP, RFC 5246/8446 TLS, RFC 5321 SMTP, RFC 1035 DNS, RFC 1918/6890 Private IP address allocations).
3. **Self-Containment & Isolation**:
   - The test suite is 100% self-contained and reproducible offline.
   - Tests do not rely on external third-party public services (e.g. `httpbin.org`, `google.com`, `check-host.net`) that could suffer from rate limits, network flakes, or ISP blocking.
   - Network interactions are exercised using ephemeral in-process Node servers (`http.createServer`, `https.createServer`, `net.createServer`, `dgram.createSocket`) bound dynamically to local loopback ports, simulating authentic network packets, handshakes, timeouts, and connection resets.
   - Database operations are isolated and gracefully stubbed or executed against in-memory mock models, allowing test execution in environments where external MongoDB or Redis instances are absent.
4. **Adversarial & Boundary Verification**:
   - Includes adversarial boundary conditions: IP address spoofing, loopback CIDRs, IPv6 bracket escapes, link-local addresses, carrier-grade NAT blocks, malformed URL structures, extreme payload sizes, abrupt connection terminations, zero/sub-millisecond timeouts, and high-frequency concurrent probes.

---

## 2. Feature Inventory Mapping to Tiers 1–4

| Feature ID | Feature Name / Area | Requirement | Mapped Test Tier | Verification Scope |
|:---|:---|:---|:---:|:---|
| **F-01** | PING Worker Probe | R1 | Tier 1, Tier 4 | ICMP echo request, RTT extraction, unreachable target, packet loss, DNS resolution |
| **F-02** | HTTP Worker Probe | R1 | Tier 1, Tier 4 | 2xx/3xx/4xx/5xx status codes, custom headers, body truncation (>1MB), redirect limits |
| **F-03** | HTTPS Worker Probe | R1 | Tier 1, Tier 4 | TLS negotiation, SNI preservation, bad certificate handling, secure cipher suites |
| **F-04** | TCP Worker Probe | R1 | Tier 1, Tier 4 | Port connect (1–65535), connection refused, timeout, slow latency (DEGRADED state) |
| **F-05** | UDP Worker Probe | R1 | Tier 1, Tier 4 | UDP packet transmission, DNS port 53 query, port unreachable, timeout handling |
| **F-06** | DNS Worker Probe | R1 | Tier 1, Tier 4 | A record query, AAAA IPv6 query, NXDOMAIN handling, invalid server address, timeout |
| **F-07** | SMTP Worker Probe | R1 | Tier 1, Tier 4 | 220 banner reception, EHLO handshake, STARTTLS on port 587, connection reset |
| **F-08** | SSL Worker Probe | R1 | Tier 1, Tier 4 | Certificate expiry countdown, wildcard SAN validation, self-signed rejection, OCSP |
| **F-09** | Health Evaluator Transitions | R2 | Tier 1, Tier 3, Tier 4 | `UP` ↔ `DEGRADED` ↔ `DOWN` state machine, hysteresis consecutive failure counters |
| **F-10** | Incident Lifecycle Management | R2, R3 | Tier 1, Tier 3, Tier 4 | Incident creation on failure threshold, deduplication, resolution on recovery, duration |
| **F-11** | Malformed Input & URL Boundaries | R1, R2 | Tier 2 | Empty targets, spaces in host, triple slash, non-standard protocol schemes (`ftp://`, `ssh://`) |
| **F-12** | Extreme Port & Payload Boundaries | R1, R2 | Tier 2 | Port 0, port 1, port 65535, port 65536, negative ports, oversized headers, massive payloads |
| **F-13** | IPv6 Address Parsing & Formatting | R1, R2 | Tier 2 | Bracketed IPv6 `[::1]`, uncompressed IPv6, IPv6 with port, IPv4-mapped IPv6 `::ffff:` |
| **F-14** | SSRF Firewall & Restricted CIDRs | R1, R2 | Tier 2, Tier 3, Tier 4 | RFC 1918 (10/8, 172.16/12, 192.168/16), loopbacks (127/8, ::1), metadata (169.254/16), CGNAT |
| **F-15** | Timeout Extremes & Resource Leaks | R1, R2 | Tier 2 | Sub-millisecond timeouts, extreme 60s timeouts, socket disposal, zero hanging handles |
| **F-16** | Rescheduling Under In-flight Check | R2 | Tier 3 | Job interval update during active probe, job ID deduplication (`scheduled:`, `immediate:`) |
| **F-17** | Rate-Limit Throttling & Backoff | R2 | Tier 3 | Multi-region provider 429 response handling, exponential backoff, fallback execution |
| **F-18** | Incident Alert Suppression | R2, R3 | Tier 3 | Flapping suppression, alert debounce window, duplicate notification dispatch prevention |
| **F-19** | Multi-Channel Alert Dispatch | R2, R3 | Tier 3 | Coordinated dispatch across Email, Slack, and Webhook channels according to policy |
| **F-20** | Multi-Protocol Mesh Simulation | R1, R2, R4 | Tier 4 | Concurrent monitoring of 8-service heterogeneous microservices architecture |
| **F-21** | Cascade Outage & Healing Lifecycle | R2, R3, R4 | Tier 4 | Cascading dependency failure, multi-incident triage, recovery detection, auto-resolution |
| **F-22** | Ingress Security & Mixed Batch Probe | R1, R2, R4 | Tier 4 | Ingesting batches with valid external endpoints and malicious SSRF attack vectors |

---

## 3. Test Architecture & Runner Invocation

### Directory Hierarchy
```
PulseGuard/
├── TEST_INFRA.md                          <- This document
├── TEST_READY.md                          <- Execution verification & checklist
└── backend/
    └── tests/
        └── e2e/
            ├── helpers/
            │   ├── ephemeral-servers.js    <- In-process local mock servers (HTTP, HTTPS, TCP, UDP, SMTP)
            │   └── test-harness.js        <- Mock stores, monitor fixtures, and result generators
            ├── tier1-feature-coverage.test.js
            ├── tier2-boundary-cases.test.js
            ├── tier3-cross-feature.test.js
            ├── tier4-real-world.test.js
            └── run-e2e-tests.js            <- Standalone runner script (Node ESM direct execution)
```

### In-Process Test Harness
To maintain strict isolation and prevent dependency on external network services or running databases:
1. **Ephemeral Protocol Servers**:
   - `HTTP Mock Server`: Dynamic port listening, supports configurable status codes (200, 301, 404, 500, 503), response delay injection, and custom header inspection.
   - `HTTPS / SSL Mock Server`: Self-signed and custom test certificate generation, valid and expired certificate validation, TLS handshake inspection.
   - `TCP Mock Server`: Dynamic port listening, accepts connection, supports instant close or persistent echo.
   - `UDP Mock Server`: Binds to dynamic UDP port, echoes datagrams or replies with simulated DNS payloads.
   - `SMTP Mock Server`: Emulates RFC 5321 server, issues `220 ... ESMTP` banner, handles `EHLO`, and responds to `STARTTLS`.
2. **In-Memory Storage & Cache Stubs**:
   - Uses `redis-cache.js` in-memory fallback enabled via `NODE_ENV=test` and `REDIS_ENABLED=false`.
   - Isolates MongoDB models (`Monitor`, `Incident`, `Check`, `User`) using memory-backed collections for test execution.
3. **Environment Determinism**:
   - When verifying workers against local ephemeral servers, `process.env.ALLOW_PRIVATE_IPS = 'true'` is enabled.
   - When verifying SSRF firewall defenses, `process.env.ALLOW_PRIVATE_IPS = 'false'` and `process.env.NODE_ENV = 'production'` are enforced.

### Runner Invocation Commands
The test suite is fully compatible with both the project Jest runner and standalone Node ESM execution:

1. **Jest Test Runner Invocation**:
   ```bash
   NODE_OPTIONS=--experimental-vm-modules /Users/harish/.nvm/versions/node/v20.19.2/bin/node ./node_modules/.bin/jest backend/tests/e2e/ --forceExit
   ```

2. **Standalone Runner Invocation**:
   ```bash
   NODE_OPTIONS=--experimental-vm-modules node backend/tests/e2e/run-e2e-tests.js
   ```

---

## 4. Real-World Application Scenarios (Tier 4)

The Tier 4 suite simulates realistic operational scenarios encountered in production:
1. **Scenario 1: Heterogeneous Cloud Fleet Monitoring**:
   - Simultaneously probes a multi-tier enterprise web application comprising: Web frontend (HTTPS), Core API (HTTP), Postgres Primary (TCP), Redis Cache (TCP), Internal DNS (DNS), Mail Delivery Agent (SMTP), and Border Gateway Router (PING).
   - Validates that each check captures accurate latency, response codes, and health classifications under normal load.
2. **Scenario 2: Catastrophic Cascade Outage and Auto-Recovery**:
   - Simulates a sudden database connectivity loss triggering downstream API HTTP 500 errors.
   - Verifies that health evaluation flags the monitors as `DOWN`, creates linked incidents without duplicate thrashing, suppresses notification storms, and upon service restoration, orchestrates automatic recovery, transitions monitors back to `UP`, resolves incidents, and calculates precise outage duration.
3. **Scenario 3: Latency Degradation & Sliding 24h Uptime Triage**:
   - Simulates gradual performance degradation where response latency crosses `degradedThresholdMs`.
   - Probes transition to `DEGRADED` status without spawning premature `DOWN` incidents.
   - Confirms that sliding 24-hour uptime metrics accurately account for degraded checks without `NaN` or divide-by-zero errors.
4. **Scenario 4: Malicious Ingress & SSRF Protection Under Attack**:
   - Simulates an adversarial user attempting to register malicious endpoints targeting AWS/GCP metadata (`http://169.254.169.254/latest/meta-data/`), internal loopbacks (`http://127.0.0.1:6379`), private VPC subnets (`http://10.0.1.5:8080`), and IPv6 bypass tricks (`http://[::1]:22`).
   - Asserts that all attack vectors are intercepted and neutralized with `SSRF_BLOCKED` error classifications and `DOWN` health states without leaking any private network traffic or hanging sockets.

---

## 5. Coverage Thresholds

| Test Tier | Focus / Scope | Minimum Test Cases Required | Implementation Target |
|:---|:---|:---:|:---:|
| **Tier 1** | Feature Coverage (8 protocols, health evaluator transitions, incident lifecycle) | >= 5 per feature (10 features) | **50+ test cases** |
| **Tier 2** | Boundary & Corner Cases (payloads, IPv6, SSRF CIDRs, timeouts, error normalization) | >= 5 per category (5 categories) | **25+ test cases** |
| **Tier 3** | Cross-Feature Combinations (rescheduling, rate-limiting, suppression, multi-channel alert) | Pairwise combinations | **15+ test cases** |
| **Tier 4** | Real-World Application Scenarios (multi-protocol mesh, cascade failure, degradation, SSRF attack) | Comprehensive simulations | **5+ scenario cases** |
| **Total** | Full E2E Test Suite | >= 95 total test cases | **100+ tests** |

---
