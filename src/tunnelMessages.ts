export enum TunnelMessageType {
  AssignedDomain = 0,
  Data = 1,
  ConnectionClosed = 2,
}

export const ConnectionClosedMessage = (connId: number) => {
  const msg = Buffer.from([TunnelMessageType.ConnectionClosed, 0, 0, 0, 0])
  msg.writeInt32BE(connId, 1)
  return msg
}

export const DataMessage = (connId: number, payload: Buffer) => {
  const idBuffer = Buffer.alloc(4)
  idBuffer.writeInt32BE(connId, 0)
  return Buffer.concat([Buffer.from([TunnelMessageType.Data]), idBuffer, payload])
}

export const readMessageType = (msg: Buffer): TunnelMessageType => msg.readUInt8(0)
export const readConnectionId = (msg: Buffer): number => msg.readUInt32BE(1)
export const readDataPayload = (msg: Buffer): Buffer => msg.slice(5)
export const readCmdPayload = (msg: Buffer): Buffer => msg.slice(1)
