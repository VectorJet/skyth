<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { globalState } from '$lib/state.svelte';
  import ChatView from './ChatView.svelte';

  interface Message {
    id: string;
    sender: string;
    content: string;
    reasoning?: string;
    timestamp: string;
    isOwn: boolean;
  }

  // State
  let messages = $state<Message[]>([]);
  let ws = $state<WebSocket | null>(null);
  let isLoading = $state(false);

  const GATEWAY_URL = typeof window !== 'undefined' ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}` : '';
  const API_BASE = typeof window !== 'undefined' ? `${window.location.origin}` : '';

  onMount(() => {
    if (globalState.token) {
      connectWebSocket();
    } else {
      goto('/auth');
    }
  });

  function connectWebSocket() {
    if (!globalState.token) return;
    globalState.setStatus('connecting');
    ws = new WebSocket(GATEWAY_URL);

    ws.onopen = () => {
      globalState.setStatus('connected');
      // Authenticate the WS connection
      ws?.send(JSON.stringify({
        type: 'request',
        id: 'auth-1',
        method: 'connect.auth',
        params: { token: globalState.token }
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'event' && data.event === 'chat.message') {
        const payload = data.payload;
        messages = [...messages, {
          id: Math.random().toString(36).slice(2),
          sender: 'Skyth',
          content: payload.content,
          reasoning: payload.metadata?.reasoning,
          timestamp: new Date(payload.timestamp).toLocaleTimeString(),
          isOwn: false
        }];
        isLoading = false;
      }
    };

    ws.onclose = () => {
      globalState.setStatus('disconnected');
      if (globalState.token) {
        setTimeout(connectWebSocket, 3000);
      }
    };
  }

  async function sendMessage(content: string) {
    if (!globalState.token) return;

    // Optimistic UI
    messages = [...messages, {
      id: Math.random().toString(36).slice(2),
      sender: globalState.username,
      content,
      timestamp: new Date().toLocaleTimeString(),
      isOwn: true
    }];

    isLoading = true;

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': globalState.token
        },
        body: JSON.stringify({
          content,
          senderId: globalState.username,
          chatId: 'web-session'
        })
      });
      const data = await res.json();
      if (data.error === 'Unauthorized') {
        globalState.setToken(null);
        goto('/auth');
      }
    } catch (e) {
      // noop
    }
  }
</script>

<ChatView 
  {messages} 
  {isLoading}
  status={globalState.status} 
  onSendMessage={sendMessage} 
/>
