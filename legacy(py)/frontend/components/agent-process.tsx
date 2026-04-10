// components/agent-process.tsx
import React, { useState } from 'react';
import { AgentStep } from '@/types';
import { ChevronDown, ChevronRight, CheckCircle2, BrainCircuit, Wrench, TerminalSquare, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AgentProcessProps {
  steps: AgentStep[];
  isLoading: boolean;
}

const StepIcon = ({ type, status }: { type: string, status?: string }) => {
  if (status === 'error') return <AlertTriangle className="w-4 h-4 text-red-500" />;
  if (type === 'thought') return <BrainCircuit className="w-4 h-4 text-purple-400" />;
  if (type === 'tool_call') return <Wrench className="w-4 h-4 text-blue-400" />;
  if (type === 'tool_result') return <TerminalSquare className="w-4 h-4 text-green-400" />;
  return <CheckCircle2 className="w-4 h-4 text-secondary-text" />;
};

const AgentProcess = ({ steps, isLoading }: AgentProcessProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Group steps logically: A tool call and its result should be grouped if possible
  // For now, we render them linearly but with visual connectors
  
  if (steps.length === 0 && !isLoading) return null;

  const currentStep = steps[steps.length - 1];

  return (
    <div className="w-full my-2 bg-surface/50 border border-border-color rounded-xl overflow-hidden shadow-sm">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 text-sm hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-5 h-5 flex items-center justify-center rounded-full ${isLoading ? 'bg-accent/10' : 'bg-green-500/10'}`}>
            {isLoading ? (
              <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            )}
          </div>
          <div className="flex flex-col items-start">
            <span className="font-medium text-primary-text">{isLoading ? 'Skyth is working' : 'Process Finished'}</span>
          </div>
        </div>
        {isExpanded ? <ChevronDown className="w-4 h-4 text-secondary-text" /> : <ChevronRight className="w-4 h-4 text-secondary-text" />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border-color bg-black/20"
          >
            <div className="p-3 space-y-3">
              {steps.map((step, index) => (
                <div key={index} className="flex gap-3 text-sm animate-in fade-in slide-in-from-top-1 duration-300">
                  <div className="mt-0.5 flex-shrink-0">
                    <StepIcon type={step.type} />
                  </div>
                  <div className="flex-grow min-w-0">
                    {step.type === 'thought' && (
                      <p className="text-secondary-text italic">{step.content}</p>
                    )}
                    {step.type === 'tool_call' && (
                      <div className="space-y-1">
                        <p className="font-mono text-xs text-blue-300 flex items-center gap-2">
                          <span className="bg-blue-500/10 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider">Tool</span>
                          {step.tool}
                        </p>
                        <pre className="text-xs bg-black/30 p-2 rounded border border-white/5 overflow-x-auto text-secondary-text/80 font-mono">
                          {JSON.stringify(step.args, null, 2)}
                        </pre>
                      </div>
                    )}
                    {step.type === 'tool_result' && (
                      <div className="space-y-1">
                        <p className="font-mono text-xs text-green-300 flex items-center gap-2">
                          <span className="bg-green-500/10 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider">Result</span>
                          {step.tool}
                        </p>
                        <pre className="text-xs bg-black/30 p-2 rounded border border-white/5 overflow-x-auto text-secondary-text/80 font-mono max-h-32">
                          {typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AgentProcess;