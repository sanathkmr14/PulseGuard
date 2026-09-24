import mongoose from 'mongoose';
import http from 'http';
import https from 'https';
import net from 'net';
import tls from 'tls';
import dgram from 'dgram';
import dns from 'dns';
import child_process from 'child_process';
import { EventEmitter } from 'events';
import { promisify } from 'util';

import runner from '../../../src/services/runner.js';
import {
    detectErrorType,
    determineHealthStateFromError,
    formatErrorMessage
} from '../../../src/utils/error-classifications.js';
import {
    getStatusCodeCategory,
    shouldTreatAsUp,
    shouldTreatAsDown,
    shouldTreatAsDegraded
} from '../../../src/utils/http-status-codes.js';
import notificationService from '../../../src/services/notification.service.js';
import Incident from '../../../src/models/Incident.js';
import Monitor from '../../../src/models/Monitor.js';

/**
 * Creates a standard result object for worker calls
 */
export function createResult() {
    return {
        isUp: false,
        responseTime: 0,
        statusCode: null,
        errorType: null,
        errorMessage: null,
        healthState: 'UNKNOWN',
        meta: {},
        checkStartTime: Date.now()
    };
}

/**
 * Standard options passed to workers by runner
 */
export function getWorkerOptions() {
    return {
        getStatusCodeCategory,
        shouldTreatAsUp,
        shouldTreatAsDown,
        shouldTreatAsDegraded,
        detectErrorType,
        determineHealthStateFromError,
        formatErrorMessage,
        parseUrl: runner.parseUrl.bind(runner)
    };
}

/**
 * In-memory Mock Store & Transport Harness for Database-Free, Network-Free E2E Testing
 */
export class InMemoryHarness {
    constructor() {
        this.incidents = [];
        this.monitors = [];
        this.notifications = {
            emails: [],
            slacks: [],
            webhooks: []
        };
        this.isSmtp = false;
        this.smtpBanner = null;
        this.customHttpHandler = null;
        this.customTcpHandler = null;
        this.customUdpHandler = null;
        this.customTlsHandler = null;
        this.customPingHandler = null;
        this.customDnsHandler = null;
        this._original = {};
    }

    setup() {
        this._setupDatabaseAndNotifications();
        this._setupTransports();
    }

    _setupDatabaseAndNotifications() {
        // Mock notification service
        this._original.sendEmail = notificationService.sendEmail;
        this._original.sendSlack = notificationService.sendSlack;
        this._original.sendWebhook = notificationService.sendWebhook;

        notificationService.sendEmail = async (to, subject, html) => {
            this.notifications.emails.push({ to, subject, html, time: new Date() });
            return { success: true };
        };

        notificationService.sendSlack = async (webhook, payload) => {
            this.notifications.slacks.push({ webhook, payload, time: new Date() });
            return { success: true };
        };

        notificationService.sendWebhook = async (url, payload) => {
            this.notifications.webhooks.push({ url, payload, time: new Date() });
            return { success: true };
        };

        // Mock Incident model methods
        this._original.incidentCreate = Incident.create;
        this._original.incidentFindOne = Incident.findOne;
        this._original.incidentFind = Incident.find;
        this._original.incidentFindById = Incident.findById;
        this._original.incidentUpdateOne = Incident.updateOne;
        this._original.incidentUpdateMany = Incident.updateMany;
        this._original.incidentFindOneAndUpdate = Incident.findOneAndUpdate;
        this._original.incidentDeleteMany = Incident.deleteMany;

        Incident.create = async (doc) => {
            const newDoc = {
                _id: new mongoose.Types.ObjectId(),
                startTime: new Date(),
                status: 'ongoing',
                notificationsSent: {},
                ...doc
            };
            this.incidents.push(newDoc);
            return newDoc;
        };

        Incident.findOne = (query) => {
            const matches = this._findMatchingIncidents(query);
            const found = matches[0] || null;
            return {
                sort: () => ({
                    lean: async () => found,
                    then: (resolve) => resolve(found)
                }),
                lean: async () => found,
                then: (resolve) => resolve(found)
            };
        };

        Incident.find = (query) => {
            const matches = this._findMatchingIncidents(query);
            return {
                lean: async () => matches,
                sort: () => ({
                    lean: async () => matches,
                    then: (resolve) => resolve(matches)
                }),
                select: () => ({
                    lean: async () => matches,
                    then: (resolve) => resolve(matches)
                }),
                then: (resolve) => resolve(matches)
            };
        };

        Incident.findById = async (id) => {
            const idStr = id?.toString();
            return this.incidents.find((i) => i._id.toString() === idStr) || null;
        };

        Incident.updateOne = async (filter, update) => {
            const matches = this._findMatchingIncidents(filter);
            if (matches.length > 0) {
                const target = matches[0];
                if (update.$set) {
                    for (const [key, val] of Object.entries(update.$set)) {
                        if (key.includes('.')) {
                            const [top, sub] = key.split('.');
                            target[top] = target[top] || {};
                            target[top][sub] = val;
                        } else {
                            target[key] = val;
                        }
                    }
                }
                return { matchedCount: 1, modifiedCount: 1 };
            }
            return { matchedCount: 0, modifiedCount: 0 };
        };

        Incident.findOneAndUpdate = async (filter, update) => {
            await Incident.updateOne(filter, update);
            const matches = this._findMatchingIncidents(filter);
            return matches[0] || null;
        };

        Incident.updateMany = async (filter, update) => {
            const matches = this._findMatchingIncidents(filter);
            let modifiedCount = 0;
            for (const target of matches) {
                if (Array.isArray(update)) {
                    const stage = update[0]?.$set;
                    if (stage) {
                        target.status = stage.status || target.status;
                        target.endTime = new Date();
                        target.duration = target.startTime ? (Date.now() - new Date(target.startTime).getTime()) : 1000;
                        target.resolvedBy = stage.resolvedBy || 'auto';
                        modifiedCount++;
                    }
                } else if (update.$set) {
                    for (const [key, val] of Object.entries(update.$set)) {
                        target[key] = val;
                    }
                    modifiedCount++;
                }
            }
            return { matchedCount: matches.length, modifiedCount };
        };

        Incident.deleteMany = async () => {
            this.incidents = [];
            return { deletedCount: 0 };
        };

        // Mock Monitor model methods
        this._original.monitorFindById = Monitor.findById;
        this._original.monitorFindOne = Monitor.findOne;
        this._original.monitorFind = Monitor.find;

        Monitor.findById = (id) => ({
            populate: async () => ({
                _id: id,
                name: 'Test Monitor',
                user: { email: 'alert@example.com', notificationPreferences: { email: true, slack: true, webhook: true } }
            }),
            lean: async () => ({
                _id: id,
                name: 'Test Monitor',
                user: { email: 'alert@example.com', notificationPreferences: { email: true, slack: true, webhook: true } }
            }),
            then: (resolve) => resolve({
                _id: id,
                name: 'Test Monitor',
                user: { email: 'alert@example.com', notificationPreferences: { email: true, slack: true, webhook: true } }
            })
        });

        Monitor.findOne = () => ({
            lean: async () => null,
            then: (resolve) => resolve(null)
        });

        Monitor.find = () => ({
            select: () => ({
                lean: async () => [],
                then: (resolve) => resolve([])
            }),
            lean: async () => [],
            then: (resolve) => resolve([])
        });
    }

    _setupTransports() {
        const self = this;

        // 1. HTTP & HTTPS Request Interception
        this._original.httpRequest = http.request;
        this._original.httpsRequest = https.request;

        const createMockClientRequest = (options, isHttps = false) => {
            const req = new EventEmitter();
            req.headers = options.headers || {};
            req.path = options.path || '/';
            req.method = options.method || 'GET';
            let isEnded = false;

            req.setTimeout = (ms, cb) => {
                req.timeoutMs = ms;
                if (cb) req.on('timeout', cb);
                return req;
            };

            req.write = () => true;
            req.destroy = () => { isEnded = true; };
            req.abort = () => { isEnded = true; };

            req.end = () => {
                if (isEnded) return req;
                isEnded = true;

                process.nextTick(() => {
                    let handled = null;
                    if (self.customHttpHandler) {
                        handled = self.customHttpHandler(options, isHttps);
                    }

                    if (!handled) {
                        const pathStr = String(options.path || '');
                        const port = Number(options.port);
                        if (port === 49999 || port === 49998 || pathStr.includes('refused')) {
                            const err = new Error('connect ECONNREFUSED 127.0.0.1:' + port);
                            err.code = 'ECONNREFUSED';
                            req.emit('error', err);
                            return;
                        }
                        if (pathStr.includes('timeout')) {
                            req.emit('timeout');
                            return;
                        }
                        if (pathStr.includes('404')) {
                            handled = { statusCode: 404, body: 'Not Found' };
                        } else if (pathStr.includes('500')) {
                            handled = { statusCode: 500, body: 'Server Error' };
                        } else if (pathStr.includes('503')) {
                            handled = { statusCode: 503, body: 'Service Unavailable' };
                        } else if (pathStr.includes('429')) {
                            handled = { statusCode: 429, body: 'Rate Limit' };
                        } else {
                            handled = { statusCode: 200, body: JSON.stringify({ status: 'ok', https: isHttps }) };
                        }
                    }

                    if (handled.error) {
                        req.emit('error', handled.error);
                        return;
                    }
                    if (handled.timeout) {
                        req.emit('timeout');
                        return;
                    }

                    const res = new EventEmitter();
                    res.statusCode = handled.statusCode || 200;
                    res.headers = handled.headers || { 'content-type': 'application/json' };
                    res.socket = {
                        destroy: () => { },
                        remoteAddress: '127.0.0.1'
                    };

                    req.emit('response', res);

                    const bodyData = handled.body !== undefined ? handled.body : '{"ok":true}';
                    const chunks = Buffer.isBuffer(bodyData) ? [bodyData] : [Buffer.from(String(bodyData))];

                    for (const chunk of chunks) {
                        res.emit('data', chunk);
                    }
                    res.emit('end');
                });

                return req;
            };

            return req;
        };

        http.request = (options, cb) => {
            const req = createMockClientRequest(options, false);
            if (cb) req.on('response', cb);
            return req;
        };

        https.request = (options, cb) => {
            const req = createMockClientRequest(options, true);
            if (cb) req.on('response', cb);
            return req;
        };

        // 2. TCP & SMTP Socket Interception
        this._original.netSocket = net.Socket;
        this._original.netConnect = net.connect;

        class MockSocket extends EventEmitter {
            constructor() {
                super();
                this.writable = true;
                this.readable = true;
                this.destroyed = false;
            }

            setTimeout(ms, cb) {
                this.timeoutMs = ms;
                if (cb) this.on('timeout', cb);
                return this;
            }

            setNoDelay() { return this; }
            setKeepAlive() { return this; }
            ref() { return this; }
            unref() { return this; }

            connect(port, host, cb) {
                const targetPort = typeof port === 'object' ? port.port : port;
                const targetHost = typeof port === 'object' ? port.host : host;
                if (typeof host === 'function') cb = host;
                if (cb) this.once('connect', cb);

                process.nextTick(() => {
                    if (self.customTcpHandler) {
                        const handled = self.customTcpHandler(targetPort, targetHost, this);
                        if (handled === 'REFUSED') {
                            const err = new Error(`connect ECONNREFUSED ${targetHost}:${targetPort}`);
                            err.code = 'ECONNREFUSED';
                            this.emit('error', err);
                            return;
                        }
                    }

                    if (targetPort >= 49990 && targetPort <= 49997) {
                        const err = new Error(`connect ECONNREFUSED ${targetHost}:${targetPort}`);
                        err.code = 'ECONNREFUSED';
                        this.emit('error', err);
                        return;
                    }

                    this.emit('connect');

                    // If SMTP check, emit banner automatically
                    const isSmtpPort = self.isSmtp || targetPort === 25 || targetPort === 587 || targetPort === 2525;
                    if (isSmtpPort) {
                        process.nextTick(() => {
                            if (self.smtpBanner === '500') {
                                this.emit('data', Buffer.from('500 Service Unavailable\r\n'));
                            } else {
                                this.emit('data', Buffer.from('220 mail.pulseguard.test ESMTP PulseGuard Ready\r\n'));
                            }
                        });
                    }
                });

                return this;
            }

            write(data, cb) {
                const str = data.toString();
                process.nextTick(() => {
                    if (str.startsWith('EHLO') || str.startsWith('HELO')) {
                        this.emit('data', Buffer.from('250-mail.pulseguard.test\r\n250-STARTTLS\r\n250 OK\r\n'));
                    } else if (str.startsWith('STARTTLS')) {
                        this.emit('data', Buffer.from('220 2.0.0 Ready to start TLS\r\n'));
                    } else if (str.startsWith('QUIT')) {
                        this.emit('data', Buffer.from('221 2.0.0 Bye\r\n'));
                    }
                });
                if (cb) cb();
                return true;
            }

            destroy() {
                this.destroyed = true;
                this.emit('close');
                return this;
            }

            end() {
                this.emit('end');
                this.destroy();
                return this;
            }
        }

        net.Socket = MockSocket;
        net.connect = (...args) => {
            const socket = new MockSocket();
            return socket.connect(...args);
        };

        // 3. TLS Socket Interception (SSL Worker)
        this._original.tlsConnect = tls.connect;
        tls.connect = (port, host, options, cb) => {
            // Check if socket upgrade (e.g. for SMTP STARTTLS)
            if (typeof port === 'object' && port.socket) {
                const existingSocket = port.socket;
                process.nextTick(() => {
                    existingSocket.emit('secureConnect');
                    if (typeof host === 'function') host();
                    if (typeof options === 'function') options();
                });
                return existingSocket;
            }

            const socket = new MockSocket();
            let targetPort = port;
            let targetHost = host;
            let targetOptions = options;

            if (typeof port === 'object') {
                targetOptions = port;
                targetPort = targetOptions.port;
                targetHost = targetOptions.host;
            }
            if (typeof host === 'function') cb = host;
            if (typeof options === 'function') cb = options;
            if (cb) socket.once('secureConnect', cb);

            socket.getPeerCertificate = (detailed) => {
                if (self.customTlsHandler) {
                    const customCert = self.customTlsHandler(targetPort, targetHost);
                    if (customCert) return customCert;
                }

                // Default valid certificate (expires in 60 days)
                const validTo = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toUTCString();
                const validFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toUTCString();

                return {
                    valid_to: validTo,
                    valid_from: validFrom,
                    subject: { CN: targetOptions?.servername || targetHost || 'example.com' },
                    issuer: { O: 'PulseGuard Trust Services', CN: 'PulseGuard Root CA' },
                    subjectaltname: `DNS:${targetOptions?.servername || 'example.com'}, DNS:*.example.com`,
                    serialNumber: 'ABCDEF1234567890',
                    bits: 2048
                };
            };

            process.nextTick(() => {
                if (targetPort === 49995) {
                    const err = new Error(`connect ECONNREFUSED ${targetHost}:${targetPort}`);
                    err.code = 'ECONNREFUSED';
                    socket.emit('error', err);
                    return;
                }
                socket.emit('secureConnect');
            });

            return socket;
        };

        // 4. UDP Socket Interception
        this._original.dgramCreateSocket = dgram.createSocket;
        dgram.createSocket = (type, cb) => {
            const socket = new EventEmitter();
            if (cb) socket.on('message', cb);

            socket.bind = (port, addr, onBind) => {
                if (typeof addr === 'function') onBind = addr;
                process.nextTick(() => {
                    if (onBind) onBind();
                    socket.emit('listening');
                });
            };

            socket.address = () => ({ address: '127.0.0.1', port: 53535, family: 'IPv4' });

            socket.send = (msg, offset, length, port, address, onSend) => {
                if (typeof offset === 'number' && typeof length === 'number') {
                    // msg, offset, length, port, address, cb
                } else {
                    onSend = address;
                    address = length;
                    port = offset;
                }

                process.nextTick(() => {
                    if (onSend) onSend(null, msg.length);

                    let handled = null;
                    if (self.customUdpHandler) {
                        handled = self.customUdpHandler(msg, port, address);
                    } else {
                        handled = { reply: Buffer.from('UDP_REPLY_OK') };
                    }

                    if (handled && handled.reply) {
                        socket.emit('message', handled.reply, { address: address || '127.0.0.1', port: port || 53 });
                    }
                });
            };

            socket.close = (onClose) => {
                process.nextTick(() => {
                    if (onClose) onClose();
                    socket.emit('close');
                });
            };

            return socket;
        };

        // 5. Ping Execution Interception
        this._original.execFile = child_process.execFile;
        const mockExecFile = (file, args, options, cb) => {
            if (typeof options === 'function') {
                cb = options;
                options = {};
            }

            process.nextTick(() => {
                if (self.customPingHandler) {
                    const res = self.customPingHandler(file, args, options);
                    return cb(res.err || null, res.stdout || '', res.stderr || '');
                }

                const target = args[args.length - 1];
                if (target === '192.0.2.1' || String(target).includes('unreachable') || String(target).includes('invalid')) {
                    const unreachableOutput = `
PING ${target} (${target}): 56 data bytes

--- ${target} ping statistics ---
2 packets transmitted, 0 packets received, 100.0% packet loss
`;
                    const err = new Error('Command failed: ping');
                    err.code = 2;
                    return cb(err, unreachableOutput, '');
                }

                // Default healthy ping
                const successOutput = `
PING ${target} (${target}): 56 data bytes
64 bytes from ${target}: icmp_seq=0 ttl=64 time=1.234 ms
64 bytes from ${target}: icmp_seq=1 ttl=64 time=1.456 ms

--- ${target} ping statistics ---
2 packets transmitted, 2 packets received, 0.0% packet loss
round-trip min/avg/max/stddev = 1.234/1.345/1.456/0.111 ms
`;
                return cb(null, successOutput, '');
            });
        };

        mockExecFile[promisify.custom] = (file, args, options) => {
            return new Promise((resolve, reject) => {
                mockExecFile(file, args, options, (err, stdout, stderr) => {
                    if (err) {
                        err.stdout = stdout;
                        err.stderr = stderr;
                        reject(err);
                    } else {
                        resolve({ stdout, stderr });
                    }
                });
            });
        };

        child_process.execFile = mockExecFile;

        // 6. DNS resolve4 & resolve6 Interception
        this._original.dnsResolve4 = dns.resolve4;
        this._original.dnsResolve6 = dns.resolve6;
        this._original.dnsLookup = dns.lookup;

        const mockResolve4 = (hostname, cb) => {
            process.nextTick(() => {
                if (self.customDnsHandler) {
                    return self.customDnsHandler(hostname, 4, cb);
                }
                if (hostname.includes('nxdomain') || hostname.includes('unresolvable') || hostname.includes('invalid')) {
                    const err = new Error(`queryA ENOTFOUND ${hostname}`);
                    err.code = 'ENOTFOUND';
                    return cb(err);
                }
                return cb(null, ['127.0.0.1']);
            });
        };

        const mockResolve6 = (hostname, cb) => {
            process.nextTick(() => {
                if (self.customDnsHandler) {
                    return self.customDnsHandler(hostname, 6, cb);
                }
                if (hostname.includes('nxdomain') || hostname.includes('unresolvable') || hostname.includes('invalid')) {
                    const err = new Error(`queryAaaa ENOTFOUND ${hostname}`);
                    err.code = 'ENOTFOUND';
                    return cb(err);
                }
                return cb(null, ['::1']);
            });
        };

        mockResolve4[promisify.custom] = (hostname) => {
            return new Promise((resolve, reject) => {
                mockResolve4(hostname, (err, addrs) => (err ? reject(err) : resolve(addrs)));
            });
        };

        mockResolve6[promisify.custom] = (hostname) => {
            return new Promise((resolve, reject) => {
                mockResolve6(hostname, (err, addrs) => (err ? reject(err) : resolve(addrs)));
            });
        };

        dns.resolve4 = mockResolve4;
        dns.resolve6 = mockResolve6;
    }

    _findMatchingIncidents(filter) {
        return this.incidents.filter((inc) => {
            for (const [key, value] of Object.entries(filter)) {
                if (key === 'monitor') {
                    const expected = value?.toString();
                    const actual = inc.monitor?.toString();
                    if (expected !== actual) return false;
                } else if (key === 'status') {
                    if (inc.status !== value) return false;
                } else if (key === '_id') {
                    const expected = value?.toString();
                    const actual = inc._id?.toString();
                    if (expected !== actual) return false;
                }
            }
            return true;
        });
    }

    reset() {
        this.incidents = [];
        this.monitors = [];
        this.notifications = { emails: [], slacks: [], webhooks: [] };
        this.isSmtp = false;
        this.smtpBanner = null;
        this.customHttpHandler = null;
        this.customTcpHandler = null;
        this.customUdpHandler = null;
        this.customTlsHandler = null;
        this.customPingHandler = null;
        this.customDnsHandler = null;
    }

    teardown() {
        if (this._original.sendEmail) notificationService.sendEmail = this._original.sendEmail;
        if (this._original.sendSlack) notificationService.sendSlack = this._original.sendSlack;
        if (this._original.sendWebhook) notificationService.sendWebhook = this._original.sendWebhook;

        if (this._original.incidentCreate) Incident.create = this._original.incidentCreate;
        if (this._original.incidentFindOne) Incident.findOne = this._original.incidentFindOne;
        if (this._original.incidentFind) Incident.find = this._original.incidentFind;
        if (this._original.incidentFindById) Incident.findById = this._original.incidentFindById;
        if (this._original.incidentUpdateOne) Incident.updateOne = this._original.incidentUpdateOne;
        if (this._original.incidentUpdateMany) Incident.updateMany = this._original.incidentUpdateMany;
        if (this._original.incidentFindOneAndUpdate) Incident.findOneAndUpdate = this._original.incidentFindOneAndUpdate;
        if (this._original.incidentDeleteMany) Incident.deleteMany = this._original.incidentDeleteMany;

        if (this._original.monitorFindById) Monitor.findById = this._original.monitorFindById;
        if (this._original.monitorFindOne) Monitor.findOne = this._original.monitorFindOne;
        if (this._original.monitorFind) Monitor.find = this._original.monitorFind;

        if (this._original.httpRequest) http.request = this._original.httpRequest;
        if (this._original.httpsRequest) https.request = this._original.httpsRequest;
        if (this._original.netSocket) net.Socket = this._original.netSocket;
        if (this._original.netConnect) net.connect = this._original.netConnect;
        if (this._original.tlsConnect) tls.connect = this._original.tlsConnect;
        if (this._original.dgramCreateSocket) dgram.createSocket = this._original.dgramCreateSocket;
        if (this._original.execFile) child_process.execFile = this._original.execFile;
        if (this._original.dnsResolve4) dns.resolve4 = this._original.dnsResolve4;
        if (this._original.dnsResolve6) dns.resolve6 = this._original.dnsResolve6;
    }
}
