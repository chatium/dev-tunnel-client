import { closeAllLocalConnections } from './localConnectionsRegistry'
import ResilientWsClient from './ResilientWsClient'
import { routeIncommingWsMessage } from './tunnelWsRouter'

const ws: ResilientWsClient = new ResilientWsClient('ws://localhost:8081/tunnel', {
  requestArgs: { headers: { authorization: '1234' } },
  onclose: () => closeAllLocalConnections(),
  onmessage: event => routeIncommingWsMessage(event.data, ws),
})
