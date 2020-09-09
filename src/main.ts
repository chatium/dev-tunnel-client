#!/usr/bin/env node

import parseArgs from 'minimist'

import { closeAllLocalConnections } from './localConnectionsRegistry'
import ResilientWsClient from './ResilientWsClient'
import { routeIncommingWsMessage } from './tunnelWsRouter'

const args = parseArgs<Record<string, unknown>>(process.argv, {
  default: {
    server: 'wss://lt.chatium.io',
  },
  string: ['domain', 'server'],
})

const lastArg = args._.pop()

const localServerPort = lastArg && Number.isInteger(parseInt(lastArg)) ? parseInt(lastArg) : printUsage()

const tunnelServer = args.server || printUsage()

const fixedDomainHeaders = args.domain ? { 'x-tunnel-domain': args.domain } : undefined

const ws: ResilientWsClient = new ResilientWsClient(`${tunnelServer}/tunnel`, {
  tunnelLocalPort: localServerPort,
  requestArgs: {
    headers: {
      authorization: 'stub-auth',
      ...fixedDomainHeaders,
    },
  },
  onclose: () => closeAllLocalConnections(),
  onmessage: event => routeIncommingWsMessage(event.data, ws),
})

function printUsage(): never {
  console.info(`Usage: [npx] dev-tunnel [--server wss://lt.chatium.io] [--domain notrandomprefix] <port>`)
  process.exit(1)
}
