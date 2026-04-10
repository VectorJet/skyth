"use client";

import { useEffect, useState } from "react";
import { App } from "@/types";
import { api } from "@/lib/api";
import { useUser } from "@/context/UserContext";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Search, Info, Check } from "lucide-react";
import { Input } from "./ui/input";

export default function AppGrid() {
  const [apps, setApps] = useState<App[]>([]);
  const [filter, setFilter] = useState("");
  const { refetchApps } = useUser();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api('/apps');
        if (res.ok) setApps(await res.json());
      } catch (e) { console.error(e); }
    };
    load();
  }, []);

  const toggleApp = async (appName: string, currentState: boolean) => {
    // Optimistic update
    setApps(prev => prev.map(a => a.name === appName ? { ...a, is_connected: !currentState } : a));
    
    try {
      const endpoint = currentState ? '/user/apps/disconnect' : '/user/apps/connect';
      await api(endpoint, { method: 'POST', body: JSON.stringify({ app_name: appName }) });
      refetchApps();
    } catch (e) {
      // Revert on failure
      setApps(prev => prev.map(a => a.name === appName ? { ...a, is_connected: currentState } : a));
      console.error(e);
    }
  };

  const filteredApps = apps.filter(app => 
    app.name.toLowerCase().includes(filter.toLowerCase()) || 
    app.description.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-bg-color">
      <div className="p-6 border-b border-border-color bg-surface/50 backdrop-blur-sm">
        <h2 className="text-2xl font-bold mb-2">Apps & Integrations</h2>
        <p className="text-secondary-text mb-4">Connect external tools to give Skyth super powers.</p>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-text" />
          <Input 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)} 
            placeholder="Search apps..." 
            className="pl-9 bg-input-bg border-border-color"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredApps.map((app) => (
            <div key={app.name} className="flex flex-col justify-between p-4 rounded-xl border border-border-color bg-surface hover:border-accent-color/50 transition-all shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div className="w-12 h-12 rounded-lg bg-input-bg p-2 border border-border-color flex items-center justify-center">
                  {app.icon_url ? (
                    <img src={app.icon_url} alt={app.name} className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-xl font-bold">{app.name[0]}</div>
                  )}
                </div>
                <Switch 
                  checked={app.is_connected} 
                  onCheckedChange={() => toggleApp(app.name, app.is_connected)}
                />
              </div>
              
              <div>
                <h3 className="font-bold text-lg mb-1">{app.name}</h3>
                <p className="text-sm text-secondary-text line-clamp-3 mb-4 h-10">{app.description}</p>
                
                <div className="flex items-center gap-2 text-xs">
                  <span className={`px-2 py-1 rounded-full flex items-center gap-1 ${app.is_connected ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'}`}>
                    {app.is_connected ? <Check className="w-3 h-3" /> : <Info className="w-3 h-3" />}
                    {app.is_connected ? 'Active' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}