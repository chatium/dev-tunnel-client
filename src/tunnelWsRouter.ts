import WebSocket from 'ws'

import { closeLocalConnection, getLocalConnection, openLocalConnection } from './localConnectionsRegistry'
import ResilientWsClient from './ResilientWsClient'
import { readCmdPayload, readConnectionId, readDataPayload, readMessageType, TunnelMessageType } from './tunnelMessages'

export const routeIncommingWsMessage = (msg: WebSocket.Data, ws: ResilientWsClient): void => {
  if (Buffer.isBuffer(msg)) {
    const messageType = readMessageType(msg)
    switch (messageType) {
      case TunnelMessageType.Data:
        console.info(`Incomming data: conn ${readConnectionId(msg)}, size ${readDataPayload(msg).length}`)
        sendIncommingChunkToLocalServer(readConnectionId(msg), readDataPayload(msg), ws)
        return

      case TunnelMessageType.ConnectionClosed:
        console.info(`Remote ConnectionClosed: conn ${readConnectionId(msg)}`)
        closeLocalConnection(readConnectionId(msg))
        return

      case TunnelMessageType.AssignedDomain:
        console.info('🔗 \x1b[36m\x1b[1mTunnel external address:\x1b[0m', `http://${readCmdPayload(msg).toString()}`)
        return

      default:
        console.error(`routeIncommingWsMessage: received unexpected message type ${messageType}`)
    }
  } else {
    console.info(`ws: ${typeof msg} message from tunnel server:`, msg)
  }
}

function sendIncommingChunkToLocalServer(connId: number, chunk: Buffer, ws: ResilientWsClient): void {
  const conn = getLocalConnection(connId) || openLocalConnection(connId, ws)
  conn.socket.write(chunk)
}
