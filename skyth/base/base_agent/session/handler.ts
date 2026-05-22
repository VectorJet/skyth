import type { Session } from "@/base/base_agent/session/core/manager";
import { SessionManager } from "@/base/base_agent/session/core/manager";

export class SessionHandler {
	constructor(private readonly manager: SessionManager) {}

	getOrCreate(key: string): Session {
		return this.manager.getOrCreate(key);
	}

	save(session: Session): void {
		this.manager.save(session);
	}

	clear(session: Session): void {
		session.clear();
		this.manager.save(session);
	}

	invalidate(key: string): void {
		this.manager.invalidate(key);
	}
}
