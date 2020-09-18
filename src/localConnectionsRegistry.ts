import { connect, Socket } from 'net'

import ResilientWsClient from './ResilientWsClient'
import { ConnectionClosedMessage, DataMessage } from './tunnelMessages'

/**
 * Creates, initializes and stores a new connection to the local tunnel endpoint with the given ID
 */
export function openLocalConnection(connId: number, ws: ResilientWsClient): LocalConnection {
  const socket = connect({ host: 'localhost', port: ws.opts.tunnelLocalPort })
  const conn: LocalConnection = {
    socket,
    closedFromRemote: false,
  }

  connections.set(connId, conn)

  // redirect all packets from local endpoint to the ws tunnel
  socket.on('data', chunk => {
    ws.isConnected && ws.currentSocket.send(DataMessage(connId, chunk))
  })

  socket.once('close', () => {
    // prevent collision when new connection replaced the old one with the same ID
    //  while old socket hasn't been fully closed yet
    if (connections.get(connId)?.socket === socket) {
      // notify tunnel server to close the connection only if connection closing is not initialized from ws tunnel
      if (!conn.closedFromRemote) {
        ws.isConnected && ws.currentSocket.send(ConnectionClosedMessage(connId))
      }
      connections.delete(connId)
    }

    console.info(`Connection ${connId} closed by ${conn.closedFromRemote ? 'remote client or tunnel' : 'local server'}`)
  })

  socket.once('error', err => {
    console.error(`Error during connection ${connId}:`, err)
    ws.isConnected && ws.currentSocket.send(ConnectionClosedMessage(connId))
  })

  return conn
}

export function getLocalConnection(connId: number): LocalConnection | undefined {
  return connections.get(connId)
}

export function closeLocalConnection(connId: number): void {
  const conn = connections.get(connId)
  if (conn) {
    conn.closedFromRemote = true
    conn.socket.destroy()
  }
}

export function closeAllLocalConnections(): void {
  for (const conn of connections.values()) {
    conn.closedFromRemote = true
    conn.socket.destroy()
  }
}

const connections = new Map<number, LocalConnection>()

interface LocalConnection {
  socket: Socket
  closedFromRemote: boolean
}
