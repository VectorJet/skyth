"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Switch } from "./ui/switch";
import { UserAvatar } from "./icons";
import { LogOut, Upload, User, Palette, BrainCircuit, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { ColorPicker } from "./ui/color-picker";
import { useTheme } from "next-themes";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export function UserMenu() {
  const { user, updateUserProfile, logout } = useUser();
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { setTheme, theme } = useTheme();
  
  // Local state for immediate feedback
  const [formData, setFormData] = useState({
    username: user?.username || '',
    occupation: user?.occupation || '',
    about_user: user?.about_user || '',
    custom_personality: user?.custom_personality || '',
    skyth_personality: user?.skyth_personality || 'default',
    enable_customisation: user?.enable_customisation || false,
    accent_color: user?.accent_color || '#3b82f6',
  });

  const handleSave = async (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    await updateUserProfile({ [key]: value });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setAvatarFile(file);
      setIsUploading(true);
      const formData = new FormData();
      formData.append('avatar', file);
      try {
        await api('/user/avatar', { method: 'POST', body: formData });
        window.location.reload(); // Simple reload to refresh avatar everywhere
      } catch (err) {
        console.error(err);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await api('/user/delete', { method: 'DELETE' });
      logout();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="flex h-[600px]">
      <Tabs defaultValue="profile" className="w-full flex" orientation="vertical">
        {/* Sidebar Navigation */}
        <div className="w-48 border-r border-border-color bg-sidebar-bg p-4 flex flex-col justify-between">
          <div>
            <div className="mb-6 px-2">
              <h2 className="font-bold text-lg">Settings</h2>
              <p className="text-xs text-secondary-text">Manage your account</p>
            </div>
            <TabsList className="flex flex-col h-auto bg-transparent gap-1 w-full">
              <TabsTrigger value="profile" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-accent-color/10 data-[state=active]:text-accent-color">
                <User className="w-4 h-4" /> Profile
              </TabsTrigger>
              <TabsTrigger value="appearance" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-accent-color/10 data-[state=active]:text-accent-color">
                <Palette className="w-4 h-4" /> Appearance
              </TabsTrigger>
              <TabsTrigger value="personality" className="w-full justify-start gap-2 px-3 py-2 data-[state=active]:bg-accent-color/10 data-[state=active]:text-accent-color">
                <BrainCircuit className="w-4 h-4" /> AI Personality
              </TabsTrigger>
            </TabsList>
          </div>
          
          <Button variant="ghost" className="w-full justify-start gap-2 text-red-400 hover:text-red-500 hover:bg-red-500/10" onClick={logout}>
            <LogOut className="w-4 h-4" /> Log out
          </Button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-bg-color p-6">
          
          {/* PROFILE TAB */}
          <TabsContent value="profile" className="space-y-6 mt-0">
            <div>
              <h3 className="text-lg font-medium mb-1">Public Profile</h3>
              <p className="text-sm text-secondary-text">How you appear to Skyth.</p>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="relative group">
                <UserAvatar username={user?.username} avatarUrl={user?.avatar_url} className="w-24 h-24 text-3xl" />
                <label className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                  {isUploading ? <Loader2 className="w-6 h-6 animate-spin text-white" /> : <Upload className="w-6 h-6 text-white" />}
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={isUploading} />
                </label>
              </div>
              <div className="space-y-1">
                <Label>Display Name</Label>
                <Input 
                  value={formData.username} 
                  onChange={(e) => handleSave('username', e.target.value)} 
                  className="max-w-xs"
                />
              </div>
            </div>

            <div className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label>Occupation / Role</Label>
                <Input 
                  value={formData.occupation} 
                  onChange={(e) => handleSave('occupation', e.target.value)} 
                  placeholder="e.g. Software Engineer"
                />
              </div>
              <div className="space-y-2">
                <Label>About You</Label>
                <textarea 
                  className="flex w-full rounded-md border border-border-color bg-input-bg px-3 py-2 text-sm text-primary-text placeholder:text-secondary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-active"
                  rows={4}
                  value={formData.about_user}
                  onChange={(e) => handleSave('about_user', e.target.value)}
                  placeholder="Tell Skyth about your interests and context..."
                />
                <p className="text-xs text-secondary-text">Skyth uses this to personalize answers.</p>
              </div>
            </div>

            <div className="pt-6 border-t border-border-color">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="gap-2">
                    <Trash2 className="w-4 h-4" /> Delete Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete your account and remove your data from our servers.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteAccount} className="bg-red-600 hover:bg-red-700">Delete Account</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </TabsContent>

          {/* APPEARANCE TAB */}
          <TabsContent value="appearance" className="space-y-6 mt-0">
            <div>
              <h3 className="text-lg font-medium mb-1">Appearance</h3>
              <p className="text-sm text-secondary-text">Customize the interface.</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-border-color rounded-lg">
                <div className="space-y-0.5">
                  <Label className="text-base">Theme</Label>
                  <p className="text-xs text-secondary-text">Switch between light and dark mode.</p>
                </div>
                <div className="flex gap-2 bg-input-bg p-1 rounded-lg">
                  <button onClick={() => setTheme('light')} className={`px-3 py-1 rounded text-sm ${theme === 'light' ? 'bg-surface shadow' : ''}`}>Light</button>
                  <button onClick={() => setTheme('dark')} className={`px-3 py-1 rounded text-sm ${theme === 'dark' ? 'bg-surface shadow' : ''}`}>Dark</button>
                  <button onClick={() => setTheme('system')} className={`px-3 py-1 rounded text-sm ${theme === 'system' ? 'bg-surface shadow' : ''}`}>System</button>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border border-border-color rounded-lg">
                <div className="space-y-0.5">
                  <Label className="text-base">Accent Color</Label>
                  <p className="text-xs text-secondary-text">Primary color for buttons and links.</p>
                </div>
                <ColorPicker 
                  value={formData.accent_color} 
                  onChange={(val) => {
                    handleSave('accent_color', val);
                    document.documentElement.style.setProperty('--accent-color', val);
                  }} 
                />
              </div>
            </div>
          </TabsContent>

          {/* PERSONALITY TAB */}
          <TabsContent value="personality" className="space-y-6 mt-0">
            <div>
              <h3 className="text-lg font-medium mb-1">AI Personality</h3>
              <p className="text-sm text-secondary-text">Control how Skyth responds to you.</p>
            </div>

            <div className="flex items-center justify-between p-4 border border-border-color rounded-lg bg-accent-color/5">
              <div className="space-y-0.5">
                <Label className="text-base">Enable Customization</Label>
                <p className="text-xs text-secondary-text">Allow Skyth to use your profile data.</p>
              </div>
              <Switch 
                checked={formData.enable_customisation} 
                onCheckedChange={(checked) => handleSave('enable_customisation', checked)}
              />
            </div>

            <div className={`space-y-4 transition-opacity ${!formData.enable_customisation ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="grid grid-cols-3 gap-3">
                {['default', 'nerd', 'unhinged'].map((p) => (
                  <button
                    key={p}
                    onClick={() => handleSave('skyth_personality', p)}
                    className={`p-3 rounded-lg border text-left transition-all ${formData.skyth_personality === p ? 'border-accent-color bg-accent-color/10 ring-1 ring-accent-color' : 'border-border-color hover:border-accent-color/50'}`}
                  >
                    <div className="font-semibold capitalize mb-1">{p}</div>
                    <div className="text-xs text-secondary-text">
                      {p === 'default' && 'Helpful & Concise'}
                      {p === 'nerd' && 'Technical & Detailed'}
                      {p === 'unhinged' && 'Chaotic & Fun'}
                    </div>
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <Label>Custom System Prompt</Label>
                <textarea 
                  className="flex w-full rounded-md border border-border-color bg-input-bg px-3 py-2 text-sm font-mono text-primary-text placeholder:text-secondary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-active"
                  rows={6}
                  value={formData.custom_personality}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, custom_personality: e.target.value, skyth_personality: 'custom' }));
                  }}
                  onBlur={() => handleSave('custom_personality', formData.custom_personality)}
                  placeholder="Overrides the preset personalities. Example: 'You are a pirate who loves coding...'"
                />
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}