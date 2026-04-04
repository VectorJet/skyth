import type { InboundMessage } from "@/bus/events";
import type { MentalImageObservation } from "@/memory/backend";

export function buildMentalImageObservation(
	msg: InboundMessage,
): MentalImageObservation | null {
	if (msg.senderId === "heartbeat" || msg.senderId === "cron") return null;
	return {
		senderId: msg.senderId,
		channel: msg.channel,
		content: msg.content,
		timestampMs: msg.timestamp?.getTime() ?? Date.now(),
	};
}

export function recordMentalImage(
	updater: { updateMentalImage(obs: MentalImageObservation): void },
	msg: InboundMessage,
): void {
	const obs = buildMentalImageObservation(msg);
	if (!obs) return;
	updater.updateMentalImage(obs);
}
