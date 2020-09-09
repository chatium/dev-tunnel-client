"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readCmdPayload = exports.readDataPayload = exports.readConnectionId = exports.readMessageType = exports.DataMessage = exports.ConnectionClosedMessage = exports.TunnelMessageType = void 0;
var TunnelMessageType;
(function (TunnelMessageType) {
    TunnelMessageType[TunnelMessageType["AssignedDomain"] = 0] = "AssignedDomain";
    TunnelMessageType[TunnelMessageType["Data"] = 1] = "Data";
    TunnelMessageType[TunnelMessageType["ConnectionClosed"] = 2] = "ConnectionClosed";
})(TunnelMessageType = exports.TunnelMessageType || (exports.TunnelMessageType = {}));
exports.ConnectionClosedMessage = (connId) => {
    const msg = Buffer.from([TunnelMessageType.ConnectionClosed, 0, 0, 0, 0]);
    msg.writeInt32BE(connId, 1);
    return msg;
};
exports.DataMessage = (connId, payload) => {
    const idBuffer = Buffer.alloc(4);
    idBuffer.writeInt32BE(connId, 0);
    return Buffer.concat([Buffer.from([TunnelMessageType.Data]), idBuffer, payload]);
};
exports.readMessageType = (msg) => msg.readUInt8(0);
exports.readConnectionId = (msg) => msg.readUInt32BE(1);
exports.readDataPayload = (msg) => msg.slice(5);
exports.readCmdPayload = (msg) => msg.slice(1);
