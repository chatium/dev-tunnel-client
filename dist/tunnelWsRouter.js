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
                console.info('🔗 \x1b[36m\x1b[1mTunnel external address:\x1b[0m', `${ws.url.startsWith('wss://') ? 'https' : 'http'}://${domain}`);
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
    const conn = localConnectionsRegistry_1.getLocalConnection(connId) || localConnectionsRegistry_1.openLocalConnection(connId, ws);
    conn.socket.write(chunk);
}
