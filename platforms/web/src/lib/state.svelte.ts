export class GlobalState {
  status = $state<'disconnected' | 'connecting' | 'connected'>('disconnected');
  username = $state('');
  token = $state<string | null>(null);

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
      this.username = localStorage.getItem('username') || '';
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

  setStatus(status: 'disconnected' | 'connecting' | 'connected') {
    this.status = status;
  }
}

export const globalState = new GlobalState();
