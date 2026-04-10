import { authClient } from '@/lib/authClient';

const WS_URL = (import.meta.env.VITE_API_URL as string).replace(/^http/, 'ws');

type MessageHandler = (msg: unknown) => void;
type DeltaHandler   = (bandId: string, table: string, version: number) => void;

class WsClient {
  private ws:           WebSocket | null = null;
  private reconnectMs = 3000;
  private maxDelay    = 30000;
  private handlers    = new Set<MessageHandler>();
  private deltaHandlers = new Set<DeltaHandler>();
  private sessionIds  = new Set<string>();
  private destroyed   = false;

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.destroyed) return;
    this._open();
  }

  private async _open() {
    try {
      const session = await authClient.getSession();
      const token   = (session?.data?.session as any)?.token ?? '';
      if (!token) {
        return;
      }
      const url     = `${WS_URL}/ws${token ? `?token=${token}` : ''}`;
      const ws      = new WebSocket(url);
      this.ws       = ws;

      ws.onopen = () => {
        console.log('[WS] Connected');
        this.reconnectMs = 3000;
        // Rejoin any active sessions
        for (const sid of this.sessionIds) {
          this._send({ type: 'join_session', sessionId: sid });
        }
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'delta') {
            for (const h of this.deltaHandlers) {
              h(msg.bandId, msg.table, msg.version);
            }
          }
          for (const h of this.handlers) h(msg);
        } catch {}
      };

      ws.onclose = () => {
        if (!this.destroyed) this._scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (err) {
      console.warn('[WS] Failed to resolve session for WS connection');
      if (!this.destroyed) this._scheduleReconnect();
    }
  }

  private _scheduleReconnect() {
    setTimeout(() => this._open(), this.reconnectMs);
    this.reconnectMs = Math.min(this.reconnectMs * 2, this.maxDelay);
  }

  private _send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  joinSession(sessionId: string) {
    this.sessionIds.add(sessionId);
    this._send({ type: 'join_session', sessionId });
  }

  leaveSession(sessionId: string) {
    this.sessionIds.delete(sessionId);
    this._send({ type: 'leave_session', sessionId });
  }

  ping() { this._send({ type: 'ping' }); }

  onMessage(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onDelta(handler: DeltaHandler) {
    this.deltaHandlers.add(handler);
    return () => this.deltaHandlers.delete(handler);
  }

  disconnect() {
    this.destroyed = true;
    this.ws?.close();
    this.ws = null;
  }
}

export const wsClient = new WsClient();
