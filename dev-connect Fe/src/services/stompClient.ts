import { Client } from '@stomp/stompjs';
import type { IMessage, StompSubscription } from '@stomp/stompjs';
// @ts-ignore
import SockJS from 'sockjs-client';

const WS_URL = import.meta.env.VITE_WS_URL;

let stompClient: Client | null = null;
let connected = false;
const pendingSubscriptions: Array<{
  destination: string;
  callback: MessageCallback;
  resolve: (sub: StompSubscription | null) => void;
}> = [];

export type MessageCallback = (message: any) => void;

export function isStompConnected(): boolean {
  return connected && !!stompClient?.active;
}

export function activateStompClient(): void {
  if (stompClient?.active) return;

  let token = localStorage.getItem('token') || '';
  // Fix: if token is a JSON string (old bug), extract accessToken
  if (token.startsWith('{')) {
    try {
      const parsed = JSON.parse(token);
      token = parsed?.data?.accessToken || parsed?.accessToken || token;
      localStorage.setItem('token', token);
    } catch {}
  }
  console.log('[STOMP] Connecting to:', WS_URL);
  console.log('[STOMP] Token (first 50 chars):', token.substring(0, 50) + '...');

  try {
    stompClient = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      connectHeaders: {
        Authorization: `Bearer ${token}`,
      },
      onConnect: () => {
        console.log('[STOMP] Connected successfully!');
        connected = true;
        while (pendingSubscriptions.length > 0) {
          const pending = pendingSubscriptions.shift()!;
          const sub = doSubscribe(pending.destination, pending.callback);
          pending.resolve(sub);
        }
      },
      onStompError: (frame) => {
        console.error('[STOMP] Error:', frame.headers['message']);
        connected = false;
      },
      onDisconnect: () => {
        console.log('[STOMP] Disconnected');
        connected = false;
      },
      onWebSocketClose: (event: any) => {
        console.error('[STOMP] WebSocket closed. Code:', event?.code, 'Reason:', event?.reason);
        connected = false;
      },
      onWebSocketError: (event) => {
        console.error('[STOMP] WebSocket error — check if backend is running at', WS_URL, event);
        connected = false;
      },
    });

    stompClient.activate();
  } catch (err) {
    console.warn('Failed to initialize STOMP client', err);
  }
}

export function deactivateStompClient() {
  try {
    if (stompClient?.active) {
      stompClient.deactivate();
    }
  } catch {
    // ignore
  }
  stompClient = null;
  connected = false;
  pendingSubscriptions.length = 0;
}

function doSubscribe(destination: string, callback: MessageCallback): StompSubscription | null {
  if (!stompClient?.active) return null;
  try {
    return stompClient.subscribe(destination, (msg: IMessage) => {
      try {
        callback(JSON.parse(msg.body));
      } catch {
        callback(msg.body);
      }
    });
  } catch {
    return null;
  }
}

export function subscribe(destination: string, callback: MessageCallback): Promise<StompSubscription | null> {
  if (stompClient?.active) {
    return Promise.resolve(doSubscribe(destination, callback));
  }
  return new Promise((resolve) => {
    pendingSubscriptions.push({ destination, callback, resolve });
  });
}

// --- Send messages via STOMP ---

export function sendGlobalMessage(content: string) {
  stompClient?.publish({
    destination: '/app/global',
    body: JSON.stringify({ content, roomType: 'GLOBAL', roomId: 'global' }),
  });
}

export function sendPrivateMessage(recipientId: number | string, content: string) {
  stompClient?.publish({
    destination: `/app/private/${recipientId}`,
    body: JSON.stringify({ content, roomType: 'PRIVATE' }),
  });
}

export function sendGroupMessage(groupId: number | string, content: string) {
  stompClient?.publish({
    destination: `/app/group/${groupId}`,
    body: JSON.stringify({ content, roomType: 'GROUP' }),
  });
}

// --- Game ---

function stompPublish(destination: string, body?: string) {
  if (!stompClient?.active) {
    console.error('[STOMP] Not connected, cannot publish to', destination);
    return;
  }
  console.log('[STOMP] Publishing to', destination, body || '');
  stompClient.publish({ destination, body });
}

export function gameJoinRoom(roomId: string) {
  stompPublish(`/app/game/join/${roomId}`);
}

export function gameSelectNumber(roomId: string, secretNumber: number) {
  stompPublish('/app/game/select-number', JSON.stringify({ roomId, secretNumber }));
}

export function gameGuess(roomId: string, guess: number) {
  stompPublish('/app/game/guess', JSON.stringify({ roomId, guess }));
}

export function gameChat(roomId: string, message: string) {
  stompPublish('/app/game/chat', JSON.stringify({ roomId, message }));
}

export function gameRematch(roomId: string) {
  stompPublish('/app/game/rematch', JSON.stringify({ roomId }));
}

// --- Party Games ---

export function partyJoin(roomId: string) {
  stompPublish(`/app/party/join/${roomId}`);
}

export function partyLeave(roomId: string) {
  stompPublish(`/app/party/leave/${roomId}`);
}

export function partyStart(roomId: string) {
  stompPublish(`/app/party/start/${roomId}`);
}

export function partyAction(roomId: string, data: any) {
  stompPublish('/app/party/action', JSON.stringify({ roomId, data }));
}

export function partyChat(roomId: string, message: string) {
  stompPublish('/app/party/chat', JSON.stringify({ roomId, message }));
}

export function partyRematch(roomId: string) {
  stompPublish(`/app/party/rematch/${roomId}`);
}

// --- WebRTC Signaling ---

export function sendSignal(signal: any) {
  if (!stompClient?.active) {
    console.error('[Signal] STOMP not connected, cannot send signal:', signal.type);
    return;
  }
  console.log('[Signal] Sending:', signal.type, 'to:', signal.receiver);
  stompClient.publish({
    destination: '/app/signal',
    body: JSON.stringify(signal),
  });
}
