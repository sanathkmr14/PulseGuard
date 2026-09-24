import http from 'http';
import https from 'https';
import net from 'net';
import dgram from 'dgram';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../../../node_modules/ocsp/test/fixtures');

let cert, key;
try {
    cert = fs.readFileSync(path.join(fixturesDir, 'good-cert.pem'));
    key = fs.readFileSync(path.join(fixturesDir, 'good-key.pem'));
} catch (e) {
    // Fallback if fixture path varies
    console.warn('Could not read cert fixtures from ocsp fixtures directory:', e.message);
}

/**
 * Creates an ephemeral HTTP server with configurable response behavior.
 */
export async function createHttpServer(options = {}) {
    const sockets = new Set();
    const server = http.createServer((req, res) => {
        const statusCode = options.statusCode || 200;
        const delay = options.delay || 0;
        const headers = options.headers || { 'Content-Type': 'application/json' };

        if (options.onRequest) {
            options.onRequest(req);
        }

        setTimeout(() => {
            if (res.writableEnded) return;
            res.writeHead(statusCode, headers);
            if (options.body !== undefined) {
                res.end(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
            } else if (options.hugeBodySize) {
                res.end(Buffer.alloc(options.hugeBodySize, 'A'));
            } else {
                res.end(JSON.stringify({ status: 'ok', time: Date.now() }));
            }
        }, delay);
    });

    server.on('connection', (sock) => {
        sockets.add(sock);
        sock.on('close', () => sockets.delete(sock));
    });

    await new Promise((resolve, reject) => {
        server.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
    });

    const port = server.address().port;
    const url = `http://127.0.0.1:${port}`;

    return {
        server,
        port,
        url,
        close: async () => {
            for (const sock of sockets) {
                sock.destroy();
            }
            await new Promise((resolve) => server.close(resolve));
        }
    };
}

/**
 * Creates an ephemeral HTTPS server with TLS support.
 */
export async function createHttpsServer(options = {}) {
    const sockets = new Set();
    const serverOptions = {
        key: options.key || key,
        cert: options.cert || cert
    };

    const server = https.createServer(serverOptions, (req, res) => {
        const statusCode = options.statusCode || 200;
        const delay = options.delay || 0;

        if (options.onRequest) {
            options.onRequest(req);
        }

        setTimeout(() => {
            if (res.writableEnded) return;
            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'secure_ok', path: req.url }));
        }, delay);
    });

    server.on('connection', (sock) => {
        sockets.add(sock);
        sock.on('close', () => sockets.delete(sock));
    });

    await new Promise((resolve, reject) => {
        server.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
    });

    const port = server.address().port;
    const url = `https://127.0.0.1:${port}`;

    return {
        server,
        port,
        url,
        close: async () => {
            for (const sock of sockets) {
                sock.destroy();
            }
            await new Promise((resolve) => server.close(resolve));
        }
    };
}

/**
 * Creates an ephemeral TCP server.
 */
export async function createTcpServer(options = {}) {
    const sockets = new Set();
    const server = net.createServer((socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));

        if (options.immediateClose) {
            socket.destroy();
            return;
        }

        if (options.delay) {
            setTimeout(() => {
                socket.write(options.greeting || 'PULSEGUARD_TCP_OK\r\n');
            }, options.delay);
        } else {
            socket.write(options.greeting || 'PULSEGUARD_TCP_OK\r\n');
        }

        socket.on('data', (data) => {
            if (options.echo) {
                socket.write(data);
            }
        });
    });

    await new Promise((resolve, reject) => {
        server.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
    });

    const port = server.address().port;

    return {
        server,
        port,
        close: async () => {
            for (const sock of sockets) {
                sock.destroy();
            }
            await new Promise((resolve) => server.close(resolve));
        }
    };
}

/**
 * Creates an ephemeral UDP server (e.g. for echo or DNS emulation).
 */
export async function createUdpServer(options = {}) {
    const socket = dgram.createSocket('udp4');

    socket.on('message', (msg, rinfo) => {
        if (options.delay) {
            setTimeout(() => {
                try {
                    socket.send(options.reply || msg, rinfo.port, rinfo.address);
                } catch (e) { }
            }, options.delay);
        } else if (!options.dropPacket) {
            try {
                // If DNS simulation packet
                if (options.isDns) {
                    const response = Buffer.from(msg);
                    if (response.length >= 12) {
                        response.writeUInt16BE(0x8180, 2); // Standard query response, No error
                    }
                    socket.send(response, rinfo.port, rinfo.address);
                } else {
                    socket.send(options.reply || msg, rinfo.port, rinfo.address);
                }
            } catch (e) { }
        }
    });

    await new Promise((resolve, reject) => {
        socket.bind(0, '127.0.0.1', () => resolve());
    });

    const port = socket.address().port;

    return {
        socket,
        port,
        close: async () => {
            await new Promise((resolve) => socket.close(resolve));
        }
    };
}

/**
 * Creates an ephemeral SMTP server for protocol testing.
 */
export async function createSmtpServer(options = {}) {
    const sockets = new Set();
    const server = net.createServer((socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));

        if (options.badBanner) {
            socket.write('500 Service Unavailable\r\n');
            return;
        }

        // Send 220 banner greeting
        socket.write('220 mail.pulseguard.test ESMTP Service Ready\r\n');

        socket.on('data', (data) => {
            const str = data.toString();
            if (str.startsWith('EHLO') || str.startsWith('HELO')) {
                socket.write('250-mail.pulseguard.test\r\n250-STARTTLS\r\n250 OK\r\n');
            } else if (str.startsWith('STARTTLS')) {
                socket.write('220 2.0.0 Ready to start TLS\r\n');
            } else if (str.startsWith('QUIT')) {
                socket.write('221 2.0.0 Bye\r\n');
                socket.end();
            }
        });
    });

    await new Promise((resolve, reject) => {
        server.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
    });

    const port = server.address().port;

    return {
        server,
        port,
        close: async () => {
            for (const sock of sockets) {
                sock.destroy();
            }
            await new Promise((resolve) => server.close(resolve));
        }
    };
}
