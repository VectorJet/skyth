// components/AppInteraction.tsx
import React from 'react';
import { AgentCall } from '@/types';
import { useUser } from '@/context/UserContext';
import { Loader2 } from 'lucide-react';

interface AppInteractionProps {
  agentCall: AgentCall;
  isLoading: boolean;
}

const AppInteraction = ({ agentCall, isLoading }: AppInteractionProps) => {
  const { connectedApps } = useUser();
  
  if (!agentCall.app_name) return null;

  const app = connectedApps.find(a => a.name.toLowerCase() === agentCall.app_name?.toLowerCase());
  
  // If we don't have app metadata yet (maybe loading), show a skeleton or generic UI
  const iconUrl = app?.icon_url || '/globe.svg';
  const appDisplayName = app?.name || agentCall.app_name;

  return (
    <div className="flex items-center gap-2 text-sm text-secondary-text my-1 animate-in fade-in slide-in-from-left-2 duration-300">
      <div className="relative">
        <img src={iconUrl} alt={appDisplayName} className="w-5 h-5 rounded-md" />
        {isLoading && (
          <div className="absolute -bottom-1 -right-1 bg-surface rounded-full p-[1px]">
            <Loader2 className="w-3 h-3 text-accent animate-spin" />
          </div>
        )}
      </div>
      <span className="font-medium text-primary-text">
        {isLoading ? `Asking ${appDisplayName}...` : `Used ${appDisplayName}`}
      </span>
    </div>
  );
};

export default AppInteraction;