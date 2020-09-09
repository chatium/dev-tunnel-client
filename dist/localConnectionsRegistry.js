"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeAllLocalConnections = exports.closeLocalConnection = exports.getLocalConnection = exports.openLocalConnection = void 0;
const net_1 = require("net");
const tunnelMessages_1 = require("./tunnelMessages");
/**
 * Creates, initializes and stores a new connection to the local tunnel endpoint with the given ID
 */
function openLocalConnection(connId, ws) {
    const socket = net_1.connect({ host: 'localhost', port: ws.opts.tunnelLocalPort });
    const conn = {
        socket,
        closedFromRemote: false,
    };
    connections.set(connId, conn);
    // redirect all packets from local endpoint to the ws tunnel
    socket.on('data', chunk => {
        ws.isConnected && ws.currentSocket.send(tunnelMessages_1.DataMessage(connId, chunk));
    });
    socket.once('close', () => {
        // notify tunnel server to close the connection only if connection closing is not initialized from ws tunnel
        if (!conn.closedFromRemote) {
            ws.isConnected && ws.currentSocket.send(tunnelMessages_1.ConnectionClosedMessage(connId));
        }
        connections.delete(connId);
        console.info(`Connection ${connId} closed by ${conn.closedFromRemote ? 'remote client or tunnel' : 'local server'}`);
    });
    socket.once('error', err => {
        console.error(`Error during connection ${connId}:`, err);
        ws.isConnected && ws.currentSocket.send(tunnelMessages_1.ConnectionClosedMessage(connId));
    });
    return conn;
}
exports.openLocalConnection = openLocalConnection;
function getLocalConnection(connId) {
    return connections.get(connId);
}
exports.getLocalConnection = getLocalConnection;
function closeLocalConnection(connId) {
    const conn = connections.get(connId);
    if (conn) {
        conn.closedFromRemote = true;
        conn.socket.destroy();
    }
}
exports.closeLocalConnection = closeLocalConnection;
function closeAllLocalConnections() {
    for (const conn of connections.values()) {
        conn.closedFromRemote = true;
        conn.socket.destroy();
    }
}
exports.closeAllLocalConnections = closeAllLocalConnections;
const connections = new Map();
