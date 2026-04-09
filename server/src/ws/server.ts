import type { WebSocket } from 'ws';

interface ConnectionMeta {
  userId: string;
  bandIds: Set<string>;
  sessionIds: Set<string>;
}

class WebSocketManager {
  private bandRooms    = new Map<string, Set<WebSocket>>();
  private sessionRooms = new Map<string, Set<WebSocket>>();
  private connMeta     = new Map<WebSocket, ConnectionMeta>();

  registerConnection(ws: WebSocket, userId: string, bandIds: string[]) {
    const meta: ConnectionMeta = { userId, bandIds: new Set(bandIds), sessionIds: new Set() };
    this.connMeta.set(ws, meta);
    for (const bandId of bandIds) {
      if (!this.bandRooms.has(bandId)) this.bandRooms.set(bandId, new Set());
      this.bandRooms.get(bandId)!.add(ws);
    }
    console.log(`[WS] ${userId} connected — ${bandIds.length} band(s)`);
  }

  joinSession(ws: WebSocket, sessionId: string) {
    const meta = this.connMeta.get(ws);
    if (!meta) return;
    meta.sessionIds.add(sessionId);
    if (!this.sessionRooms.has(sessionId)) this.sessionRooms.set(sessionId, new Set());
    this.sessionRooms.get(sessionId)!.add(ws);
  }

  leaveSession(ws: WebSocket, sessionId: string) {
    this.connMeta.get(ws)?.sessionIds.delete(sessionId);
    this.sessionRooms.get(sessionId)?.delete(ws);
  }

  updateBandSubscriptions(ws: WebSocket, newBandIds: string[]) {
    const meta = this.connMeta.get(ws);
    if (!meta) return;
    for (const old of meta.bandIds) {
      if (!newBandIds.includes(old)) this.bandRooms.get(old)?.delete(ws);
    }
    for (const bandId of newBandIds) {
      if (!meta.bandIds.has(bandId)) {
        if (!this.bandRooms.has(bandId)) this.bandRooms.set(bandId, new Set());
        this.bandRooms.get(bandId)!.add(ws);
      }
    }
    meta.bandIds = new Set(newBandIds);
  }

  removeConnection(ws: WebSocket) {
    const meta = this.connMeta.get(ws);
    if (!meta) return;
    for (const bandId of meta.bandIds) this.bandRooms.get(bandId)?.delete(ws);
    for (const sid of meta.sessionIds)  this.sessionRooms.get(sid)?.delete(ws);
    this.connMeta.delete(ws);
    console.log(`[WS] ${meta.userId} disconnected`);
  }

  broadcastToBand(bandId: string, message: unknown, excludeWs?: WebSocket) {
    const room = this.bandRooms.get(bandId);
    if (!room) return;
    const payload = JSON.stringify(message);
    for (const ws of room) {
      if (ws !== excludeWs && ws.readyState === 1 /* OPEN */) {
        try { ws.send(payload); } catch {}
      }
    }
  }

  broadcastToSession(sessionId: string, message: unknown, excludeWs?: WebSocket) {
    const room = this.sessionRooms.get(sessionId);
    if (!room) return;
    const payload = JSON.stringify(message);
    for (const ws of room) {
      if (ws !== excludeWs && ws.readyState === 1) {
        try { ws.send(payload); } catch {}
      }
    }
  }

  getConnectionCount() { return this.connMeta.size; }
}

export const wsManager = new WebSocketManager();
