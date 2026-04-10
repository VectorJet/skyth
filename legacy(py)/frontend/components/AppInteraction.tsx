// components/AppInteraction.tsx
import React from "react";
import { AgentCall } from "@/types";
import { useUser } from "@/context/UserContext";
import { Loader2 } from "lucide-react";

interface AppInteractionProps {
	agentCall?: AgentCall | null;
	isLoading: boolean;
}

const AppInteraction = ({ agentCall, isLoading }: AppInteractionProps) => {
	const { connectedApps } = useUser();

	if (!agentCall || !agentCall.app_name) return null;

	const app = connectedApps.find(
		(a) => a.name.toLowerCase() === agentCall.app_name!.toLowerCase(),
	);

	// If we don't have app metadata yet (maybe loading), show a skeleton or generic UI
	const iconUrl = app?.icon_url || "/globe.svg";
	const appDisplayName = app?.name || agentCall.app_name;

	return null;
};

export default AppInteraction;
