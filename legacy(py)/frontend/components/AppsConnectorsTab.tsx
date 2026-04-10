"use client";

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { App } from '@/types';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Globe, Loader2, Check, AlertCircle } from 'lucide-react';

export function AppsConnectorsTab() {
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchApps = async () => {
      try {
        const response = await api('/apps');
        if (response.ok) {
          const data = await response.json();
          setApps(data);
        } else {
          setError('Failed to load applications.');
        }
      } catch (err) {
        setError('An error occurred while fetching applications.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchApps();
  }, []);

  const toggleAppConnection = async (appName: string, currentStatus: boolean) => {
    try {
      const method = currentStatus ? 'DELETE' : 'POST';
      const response = await api(`/apps/${appName}/connect`, { method });
      
      if (response.ok) {
        setApps(prev => prev.map(app => 
          app.name === appName ? { ...app, is_connected: !currentStatus } : app
        ));
      } else {
        alert('Failed to update app connection.');
      }
    } catch (err) {
      console.error('App toggle error:', err);
      alert('An error occurred.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 flex flex-col items-center gap-3">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-red-400 font-medium">{error}</p>
        <Button onClick={() => window.location.reload()} variant="outline" size="sm">Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-bg-color/50 border border-border-color rounded-2xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-primary-text flex items-center gap-2">
          <Globe className="w-5 h-5" />
          App Connectors
        </h3>
        <p className="text-sm text-secondary-text">
          Connect Skyth to your favorite services to enable powerful tool integrations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {apps.map((app) => (
          <div key={app.name} className="bg-bg-color/50 border border-border-color rounded-2xl p-5 flex items-center justify-between group hover:border-accent/30 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-surface border border-border-color flex items-center justify-center text-2xl">
                {app.icon_url ? <img src={app.icon_url} alt={app.name} className="w-8 h-8 object-contain" /> : <Globe className="w-6 h-6 text-secondary-text" />}
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-primary-text">{app.name}</h4>
                <p className="text-xs text-secondary-text line-clamp-1">{app.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {app.is_connected && <Check className="w-4 h-4 text-green-400" />}
              <Switch 
                checked={app.is_connected} 
                onCheckedChange={() => toggleAppConnection(app.name, app.is_connected)}
                className="data-[state=checked]:bg-green-500"
              />
            </div>
          </div>
        ))}

        {apps.length === 0 && (
          <div className="col-span-full py-12 text-center border-2 border-dashed border-border-color rounded-2xl">
            <p className="text-secondary-text">No app connectors available yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
