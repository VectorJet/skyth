export class GlobalState {
  status = $state<'disconnected' | 'connecting' | 'connected'>('disconnected');
  username = $state('');
  token = $state<string | null>(null);
  currentChatId = $state<string>('web-session');

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
      this.username = localStorage.getItem('username') || '';
      this.currentChatId = localStorage.getItem('currentChatId') || 'web-session';
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) localStorage.setItem('auth_token', token);
    else localStorage.removeItem('auth_token');
  }

  setUsername(username: string) {
    this.username = username;
    if (username) localStorage.setItem('username', username);
    else localStorage.removeItem('username');
  }

  setChatId(id: string) {
    this.currentChatId = id;
    if (typeof window !== 'undefined') localStorage.setItem('currentChatId', id);
  }

  setStatus(status: 'disconnected' | 'connecting' | 'connected') {
    this.status = status;
  }
}

export const globalState = new GlobalState();
