#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
// read .env file. IMPORTANT: this line must be on top!
require("dotenv/config");
const minimist_1 = tslib_1.__importDefault(require("minimist"));
const localConnectionsRegistry_1 = require("./localConnectionsRegistry");
const ResilientWsClient_1 = tslib_1.__importDefault(require("./ResilientWsClient"));
const tunnelWsRouter_1 = require("./tunnelWsRouter");
const args = minimist_1.default(process.argv, {
    default: {
        server: 'wss://lt.chatium.io',
    },
    string: ['domain', 'server'],
});
const lastArg = args._.pop();
const localServerPort = lastArg && Number.isInteger(parseInt(lastArg)) ? parseInt(lastArg) : printUsage();
const tunnelServer = process.env.DEV_TUNNEL_SERVER || args.server || printUsage();
const fixedDomain = process.env.DEV_TUNNEL_DOMAIN || args.domain;
const fixedDomainHeaders = fixedDomain ? { 'x-tunnel-domain': fixedDomain } : undefined;
const ws = new ResilientWsClient_1.default(`${tunnelServer}/tunnel`, {
    tunnelLocalPort: localServerPort,
    requestArgs: {
        headers: {
            authorization: 'stub-auth',
            ...fixedDomainHeaders,
        },
    },
    onclose: () => localConnectionsRegistry_1.closeAllLocalConnections(),
    onmessage: event => tunnelWsRouter_1.routeIncommingWsMessage(event.data, ws),
});
function printUsage() {
    console.info(`Usage: [npx] dev-tunnel [--server wss://lt.chatium.io] [--domain notrandomprefix] <port>`);
    process.exit(1);
}
