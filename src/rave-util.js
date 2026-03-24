import net from 'node:net';

export function notifyLaunched() {
    console.log('launched, sending signal');
    const sock = net.createConnection({
        host: '127.0.0.2', port: 8888,
    }, () => {
        sock.write('signal:launched\n');
        sock.end();
    });
    sock.on('error', (err) => {
        console.error('Socket error:', err);
    });
}
