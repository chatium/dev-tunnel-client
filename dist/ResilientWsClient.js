"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const ws_1 = tslib_1.__importDefault(require("ws"));
var WebSocketState;
(function (WebSocketState) {
    WebSocketState[WebSocketState["OPEN"] = ws_1.default.OPEN] = "OPEN";
    WebSocketState[WebSocketState["CONNECTING"] = ws_1.default.CONNECTING] = "CONNECTING";
    WebSocketState[WebSocketState["CLOSED"] = ws_1.default.CLOSED] = "CLOSED";
    WebSocketState[WebSocketState["CLOSING"] = ws_1.default.CLOSING] = "CLOSING";
})(WebSocketState || (WebSocketState = {}));
/**
 * Wrapper for WebSocket aimed to provide rock-stable connection, handly trying to recconect
 *  and periodically sending keep-alive messages.
 * Also automatically JSON.stringifyes when trying to send objects.
 */
class ResilientWsClient {
    constructor(url, options) {
        this.opts = {
            reconnectDelay: 500,
            maxReconnectDelay: 5000,
            checkInterval: 60000,
            connectTimeout: 15000,
            keepAliveInterval: 45000,
            keepAliveMessage: 'ping',
            // todo: keep-alive response checking is not implemented yet
            keepAliveRequireResponse: false,
            keepAliveResponseMessage: 'pong',
            keepAliveResponseTimeout: 20000,
            onmessage: noop,
            tunnelLocalPort: 0,
        };
        this.wasConnected = false;
        this.forceClose = false;
        this.attempt = 0;
        this.lastSendTime = 0; // ms
        this.readyState = ws_1.default.CLOSED;
        this.ws = null;
        this.reconnectTimer = null;
        this.timeoutTimer = null;
        this.checkTimer = null;
        this.keepAliveTimer = null;
        /**
         * Some dynamic headers that are memorized after connection init to be re-sent on reconnect
         */
        this.reconnectHeaders = {};
        this.connect = () => {
            var _a;
            this.clearTimers();
            if (this.forceClose)
                return;
            this.attempt++;
            this.readyState = ws_1.default.CONNECTING;
            this.ws = new ws_1.default(this.url, {
                ...this.opts.requestArgs,
                headers: {
                    ...(_a = this.opts.requestArgs) === null || _a === void 0 ? void 0 : _a.headers,
                    ...this.reconnectHeaders,
                },
            });
            this.ws.onmessage = this.opts.onmessage;
            this.ws.onopen = this.onOpen;
            this.ws.onclose = this.onClose;
            this.ws.onerror = this.onError;
            if (this.opts.connectTimeout && !this.timeoutTimer) {
                this.timeoutTimer = setTimeout(this.reconnect, this.opts.connectTimeout);
            }
        };
        this.onOpen = (event) => {
            // this.stream = createWebSocketStream(this.currentSocket)
            this.readyState = ws_1.default.OPEN;
            this.clearTimers();
            this.attempt = 0;
            this.checkTimer = setInterval(this.checkConnection, this.opts.checkInterval);
            this.keepAliveTimer = setTimeout(this.keepAlive, this.opts.keepAliveInterval);
            if (this.opts.onopen) {
                this.opts.onopen(event);
            }
            if (this.wasConnected) {
                if (this.opts.onreconnect) {
                    this.opts.onreconnect(event);
                }
            }
            else {
                this.wasConnected = true;
                if (this.opts.onconnect) {
                    this.opts.onconnect(event);
                }
            }
        };
        this.onClose = (event) => {
            this.readyState = ws_1.default.CLOSED;
            if (this.forceClose) {
                this.clearTimers();
            }
            else {
                console.warn(`resilient-ws: socket connection closed, code ${event.code}${event.reason ? ` (${event.reason})` : ''}, ` +
                    'trying to reconnect...');
                this.reconnect();
            }
            if (this.opts.onclose) {
                this.opts.onclose(event);
            }
        };
        this.onError = (event) => {
            this.readyState = ws_1.default.CLOSED;
            console.warn('resilient-ws: socket connection error, trying to reconnect...', event.error);
            this.reconnect();
            if (this.opts.onclose) {
                this.opts.onclose(event);
            }
            if (this.opts.onerror) {
                this.opts.onerror(event);
            }
        };
        /**
         * Performs cleanup, delay (increasing over time) and retries connection after fail.
         */
        this.reconnect = () => {
            if (!this.reconnectTimer) {
                // prevent double call
                if (this.ws) {
                    // fully clear old connection, just in case...
                    this.ws.onmessage = noop;
                    this.ws.onopen = noop;
                    this.ws.onclose = noop;
                    this.ws.onerror = noop;
                    this.ws.close();
                    this.ws = null;
                }
                let delay = this.attempt * this.opts.reconnectDelay;
                if (delay > this.opts.maxReconnectDelay)
                    delay = this.opts.maxReconnectDelay;
                this.reconnectTimer = setTimeout(this.connect, delay);
            }
        };
        /**
         * Periodically checks if websocket connection is in the right state
         */
        this.checkConnection = () => {
            if (!this.ws ||
                (this.readyState !== ws_1.default.OPEN &&
                    this.readyState !== ws_1.default.CONNECTING &&
                    this.ws.readyState !== ws_1.default.OPEN &&
                    this.ws.readyState !== ws_1.default.CONNECTING)) {
                console.warn('resilient-ws: checkConnection failed. state is %s', this.readyState);
                this.reconnect();
            }
        };
        /**
         * Periodically sends ping message to keep websocket connection alive.
         */
        this.keepAlive = () => {
            var _a;
            let delay = this.opts.keepAliveInterval;
            const currentTime = new Date().getTime();
            // check if some message was sent within interval and ping can be skipped
            if (this.lastSendTime + this.opts.keepAliveInterval < currentTime + 1000) {
                (_a = this.ws) === null || _a === void 0 ? void 0 : _a.send(this.opts.keepAliveMessage);
            }
            else {
                // adjust delay so ping will be sent according to the keep-alive interval
                delay = this.opts.keepAliveInterval - (currentTime - this.lastSendTime);
            }
            this.keepAliveTimer = setTimeout(this.keepAlive, delay);
        };
        this.url = url;
        if (typeof options === 'object')
            Object.assign(this.opts, options);
        this.connect();
    }
    get currentSocket() {
        if (!this.ws) {
            throw new Error(`ResilientWsClient: currentSocket should not be called in unconnected state!`);
        }
        return this.ws;
    }
    get isConnected() {
        return this.readyState === ws_1.default.OPEN;
    }
    setReconnectHeaders(headers) {
        this.reconnectHeaders = headers;
    }
    clearTimers() {
        clearTimeout(this.reconnectTimer);
        clearTimeout(this.timeoutTimer);
        clearTimeout(this.checkTimer);
        clearTimeout(this.keepAliveTimer);
        this.reconnectTimer = null;
        this.timeoutTimer = null;
        this.checkTimer = null;
        this.keepAliveTimer = null;
    }
}
exports.default = ResilientWsClient;
// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = function () { };
