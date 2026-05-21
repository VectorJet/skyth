export function generateSessionId(): string {
	return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

export class SessionManager {
	private sessionId: string | null = null;

	getSessionId(): string | null {
		return this.sessionId;
	}

	createSession(): string {
		this.sessionId = generateSessionId();
		return this.sessionId;
	}

	hasSession(): boolean {
		return this.sessionId !== null;
	}
}
