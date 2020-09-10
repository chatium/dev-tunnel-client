"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeIncommingWsMessage = void 0;
const localConnectionsRegistry_1 = require("./localConnectionsRegistry");
const tunnelMessages_1 = require("./tunnelMessages");
exports.routeIncommingWsMessage = (msg, ws) => {
    if (Buffer.isBuffer(msg)) {
        const messageType = tunnelMessages_1.readMessageType(msg);
        switch (messageType) {
            case tunnelMessages_1.TunnelMessageType.Data:
                console.info(`Incomming data: conn ${tunnelMessages_1.readConnectionId(msg)}, size ${tunnelMessages_1.readDataPayload(msg).length}`);
                sendIncommingChunkToLocalServer(tunnelMessages_1.readConnectionId(msg), tunnelMessages_1.readDataPayload(msg), ws);
                return;
            case tunnelMessages_1.TunnelMessageType.ConnectionClosed:
                console.info(`Remote ConnectionClosed: conn ${tunnelMessages_1.readConnectionId(msg)}`);
                localConnectionsRegistry_1.closeLocalConnection(tunnelMessages_1.readConnectionId(msg));
                return;
            case tunnelMessages_1.TunnelMessageType.AssignedDomain:
                // eslint-disable-next-line no-case-declarations
                const domain = tunnelMessages_1.readCmdPayload(msg).toString();
                // prevent randomly switching domain on every reconnect
                ws.setReconnectHeaders({
                    'x-tunnel-domain': domain.split('.')[0],
                });
                console.info('🔗 \x1b[36m\x1b[1mTunnel external address:\x1b[0m', `${ws.url.startsWith('wss://') ? 'https' : 'http'}://${domain}${smartlyExtractPortFromUrl(ws.url)}`);
                return;
            default:
                console.error(`routeIncommingWsMessage: received unexpected message type ${messageType}`);
        }
    }
    else {
        console.info(`ws: ${typeof msg} message from tunnel server:`, msg);
    }
};
function sendIncommingChunkToLocalServer(connId, chunk, ws) {
    const existingConn = localConnectionsRegistry_1.getLocalConnection(connId);
    if (existingConn) {
        existingConn.socket.write(chunk, err => {
            if (err) {
                // it may be that local server closed keep-alive connection while new request arrived from the tunnel
                // we can try to fix the situation by checking back after timeout
                //  to give opportunity to clean existing local connection, initialize new one and retry
                console.warn(`WARN: detected possible keep-alive connection (${connId}) collision. Will retry...`);
                setTimeout(() => {
                    if (!localConnectionsRegistry_1.getLocalConnection(connId)) {
                        localConnectionsRegistry_1.openLocalConnection(connId, ws).socket.write(chunk);
                        console.info(`Re-opened connection (${connId}) after possible keep-alive collision`);
                    }
                    else {
                        console.warn(`WARN: possible keep-alive connection (${connId}) collision is not resolved. Skipping...`);
                    }
                }, 10);
            }
        });
    }
    else {
        localConnectionsRegistry_1.openLocalConnection(connId, ws).socket.write(chunk);
    }
}
function smartlyExtractPortFromUrl(url) {
    if (url.includes(':')) {
        const matches = url.match(/^.+:(\d+).+$/);
        if (matches) {
            const port = +matches[1];
            if (!(port === 80 && url.startsWith('ws://')) && !(port === 443 && url.startsWith('wss://'))) {
                return `:${port}`;
            }
        }
    }
    return '';
}
