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
        // eslint-disable-next-line no-case-declarations
        const domain = readCmdPayload(msg).toString()

        // prevent randomly switching domain on every reconnect
        ws.setReconnectHeaders({
          'x-tunnel-domain': domain.split('.')[0],
        })

        console.info(
          '🔗 \x1b[36m\x1b[1mTunnel external address:\x1b[0m',
          `${ws.url.startsWith('wss://') ? 'https' : 'http'}://${domain}${smartlyExtractPortFromUrl(ws.url)}`,
        )
        return

      default:
        console.error(`routeIncommingWsMessage: received unexpected message type ${messageType}`)
    }
  } else {
    console.info(`ws: ${typeof msg} message from tunnel server:`, msg)
  }
}

function sendIncommingChunkToLocalServer(connId: number, chunk: Buffer, ws: ResilientWsClient): void {
  const existingConn = getLocalConnection(connId)
  if (existingConn && !existingConn.closedFromRemote) {
    existingConn.socket.write(chunk, err => {
      if (err) {
        // it may be that local server closed keep-alive connection while new request arrived from the tunnel
        // we can try to fix the situation by checking back after timeout
        //  to give opportunity to clean existing local connection, initialize new one and retry
        console.warn(`WARN: detected possible keep-alive connection (${connId}) collision. Will retry...`)
        setTimeout(() => {
          if (!getLocalConnection(connId)) {
            openLocalConnection(connId, ws).socket.write(chunk)
            console.info(`Re-opened connection (${connId}) after possible keep-alive collision`)
          } else {
            console.warn(`WARN: possible keep-alive connection (${connId}) collision is not resolved. Skipping...`)
          }
        }, 10)
      }
    })
  } else {
    openLocalConnection(connId, ws).socket.write(chunk)
  }
}

function smartlyExtractPortFromUrl(url: string): string {
  if (url.includes(':')) {
    const matches = url.match(/^.+:(\d+).+$/)
    if (matches) {
      const port = +matches[1]
      if (!(port === 80 && url.startsWith('ws://')) && !(port === 443 && url.startsWith('wss://'))) {
        return `:${port}`
      }
    }
  }
  return ''
}
