import http, { OutgoingHttpHeaders } from 'http'
import WebSocket from 'ws'

interface SocketOptions {
  requestArgs?: http.ClientRequestArgs
  reconnectDelay: number
  maxReconnectDelay: number
  checkInterval: number
  connectTimeout: number
  keepAliveInterval: number
  keepAliveMessage: string
  keepAliveRequireResponse: boolean // not implemented
  keepAliveResponseMessage: string
  keepAliveResponseTimeout: number

  onopen?: (ev: WebSocket.OpenEvent) => unknown // every connection
  onconnect?: (ev: WebSocket.OpenEvent) => unknown // only first-time connection
  onreconnect?: (ev: WebSocket.OpenEvent) => unknown // only reconnection
  onmessage: (ev: WebSocket.MessageEvent) => unknown
  onclose?: (ev: WebSocket.CloseEvent | WebSocket.ErrorEvent) => unknown // every disconnect
  onerror?: (ev: WebSocket.ErrorEvent) => unknown

  // which port to connect on localhost for tunneled connections
  // stored here because this ws object is passed down the proxying functions
  tunnelLocalPort: number
}

enum WebSocketState {
  OPEN = WebSocket.OPEN,
  CONNECTING = WebSocket.CONNECTING,
  CLOSED = WebSocket.CLOSED,
  CLOSING = WebSocket.CLOSING,
}

/**
 * Wrapper for WebSocket aimed to provide rock-stable connection, handly trying to recconect
 *  and periodically sending keep-alive messages.
 * Also automatically JSON.stringifyes when trying to send objects.
 */
export default class ResilientWsClient {
  readonly url: string

  readonly opts: SocketOptions = {
    reconnectDelay: 500, // ms
    maxReconnectDelay: 5000, // ms
    checkInterval: 60000, // ms
    connectTimeout: 15000, // ms
    keepAliveInterval: 45000, // ms
    keepAliveMessage: 'ping',

    // todo: keep-alive response checking is not implemented yet
    keepAliveRequireResponse: false,
    keepAliveResponseMessage: 'pong',
    keepAliveResponseTimeout: 20000, // ms

    onmessage: noop,

    tunnelLocalPort: 0,
  }

  private wasConnected = false
  private forceClose = false
  private attempt = 0
  private lastSendTime = 0 // ms
  private readyState: WebSocketState = WebSocket.CLOSED

  private ws: WebSocket | null = null

  private reconnectTimer: NodeJS.Timeout | null = null
  private timeoutTimer: NodeJS.Timeout | null = null
  private checkTimer: NodeJS.Timeout | null = null
  private keepAliveTimer: NodeJS.Timeout | null = null

  /**
   * Some dynamic headers that are memorized after connection init to be re-sent on reconnect
   */
  private reconnectHeaders: OutgoingHttpHeaders = {}

  constructor(url: string, options?: Partial<SocketOptions>) {
    this.url = url
    if (typeof options === 'object') Object.assign(this.opts, options)
    this.connect()
  }

  get currentSocket(): WebSocket {
    if (!this.ws) {
      throw new Error(`ResilientWsClient: currentSocket should not be called in unconnected state!`)
    }
    return this.ws
  }

  get isConnected(): boolean {
    return this.readyState === WebSocket.OPEN
  }

  setReconnectHeaders(headers: OutgoingHttpHeaders): void {
    this.reconnectHeaders = headers
  }

  private connect = (): void => {
    this.clearTimers()
    if (this.forceClose) return

    this.attempt++
    this.readyState = WebSocket.CONNECTING

    this.ws = new WebSocket(this.url, {
      ...this.opts.requestArgs,
      headers: {
        ...this.opts.requestArgs?.headers,
        ...this.reconnectHeaders,
      },
    })

    this.ws.onmessage = this.opts.onmessage
    this.ws.onopen = this.onOpen
    this.ws.onclose = this.onClose
    this.ws.onerror = this.onError

    if (this.opts.connectTimeout && !this.timeoutTimer) {
      this.timeoutTimer = setTimeout(this.reconnect, this.opts.connectTimeout)
    }
  }

  private onOpen = (event: WebSocket.OpenEvent): void => {
    // this.stream = createWebSocketStream(this.currentSocket)
    this.readyState = WebSocket.OPEN
    this.clearTimers()
    this.attempt = 0
    this.checkTimer = setInterval(this.checkConnection, this.opts.checkInterval)
    this.keepAliveTimer = setTimeout(this.keepAlive, this.opts.keepAliveInterval)
    if (this.opts.onopen) {
      this.opts.onopen(event)
    }
    if (this.wasConnected) {
      if (this.opts.onreconnect) {
        this.opts.onreconnect(event)
      }
    } else {
      this.wasConnected = true
      if (this.opts.onconnect) {
        this.opts.onconnect(event)
      }
    }
  }

  private onClose = (event: WebSocket.CloseEvent): void => {
    this.readyState = WebSocket.CLOSED
    if (this.forceClose) {
      this.clearTimers()
    } else {
      console.warn(
        `resilient-ws: socket connection closed, code ${event.code}${event.reason ? ` (${event.reason})` : ''}, ` +
          'trying to reconnect...',
      )
      this.reconnect()
    }
    if (this.opts.onclose) {
      this.opts.onclose(event)
    }
  }

  private onError = (event: WebSocket.ErrorEvent) => {
    this.readyState = WebSocket.CLOSED
    console.warn('resilient-ws: socket connection error, trying to reconnect...', event.error)
    this.reconnect()
    if (this.opts.onclose) {
      this.opts.onclose(event)
    }
    if (this.opts.onerror) {
      this.opts.onerror(event)
    }
  }

  /**
   * Performs cleanup, delay (increasing over time) and retries connection after fail.
   */
  private reconnect = () => {
    if (!this.reconnectTimer) {
      // prevent double call
      if (this.ws) {
        // fully clear old connection, just in case...
        this.ws.onmessage = noop
        this.ws.onopen = noop
        this.ws.onclose = noop
        this.ws.onerror = noop
        this.ws.close()
        this.ws = null
      }
      let delay = this.attempt * this.opts.reconnectDelay
      if (delay > this.opts.maxReconnectDelay) delay = this.opts.maxReconnectDelay
      this.reconnectTimer = setTimeout(this.connect, delay)
    }
  }

  /**
   * Periodically checks if websocket connection is in the right state
   */
  private checkConnection = () => {
    if (
      !this.ws ||
      (this.readyState !== WebSocket.OPEN &&
        this.readyState !== WebSocket.CONNECTING &&
        this.ws.readyState !== WebSocket.OPEN &&
        this.ws.readyState !== WebSocket.CONNECTING)
    ) {
      console.warn('resilient-ws: checkConnection failed. state is %s', this.readyState)
      this.reconnect()
    }
  }

  /**
   * Periodically sends ping message to keep websocket connection alive.
   */
  private keepAlive = (): void => {
    let delay = this.opts.keepAliveInterval
    const currentTime = new Date().getTime()
    // check if some message was sent within interval and ping can be skipped
    if (this.lastSendTime + this.opts.keepAliveInterval < currentTime + 1000) {
      this.ws?.send(this.opts.keepAliveMessage)
    } else {
      // adjust delay so ping will be sent according to the keep-alive interval
      delay = this.opts.keepAliveInterval - (currentTime - this.lastSendTime)
    }
    this.keepAliveTimer = setTimeout(this.keepAlive, delay)
  }

  private clearTimers(): void {
    clearTimeout(this.reconnectTimer!)
    clearTimeout(this.timeoutTimer!)
    clearTimeout(this.checkTimer!)
    clearTimeout(this.keepAliveTimer!)
    this.reconnectTimer = null
    this.timeoutTimer = null
    this.checkTimer = null
    this.keepAliveTimer = null
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = function () {}
