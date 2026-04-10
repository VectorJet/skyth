// components/AgentCallDisplay.tsx
import React from 'react';
import { AgentCall } from '@/types';
import { Bot, Sparkles } from 'lucide-react';

const AgentCallDisplay = ({ agentCall }: { agentCall: AgentCall }) => {
  // We want to hide this for apps_agent because AppInteraction handles it better visually
  if (agentCall.agent === 'apps_agent') return null;

  return (
    <div className="flex items-center gap-2 text-xs text-secondary-text mb-2 bg-surface/50 w-fit px-2 py-1 rounded-full border border-border-color">
      {agentCall.agent === 'research_agent' ? (
        <Bot className="w-3.5 h-3.5 text-blue-400" />
      ) : (
        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
      )}
      <span>
        Active Agent: <span className="font-medium text-primary-text capitalize">{agentCall.agent.replace('_', ' ')}</span>
      </span>
    </div>
  );
};

export default AgentCallDisplay;