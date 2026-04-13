// app/profile/page.tsx
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '@/context/UserContext';
import { UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { api } from '@/lib/api';
import { AppsConnectorsTab } from '@/components/AppsConnectorsTab';
import { UserAvatar } from '@/components/icons';
import { ColorPicker } from '@/components/ui/color-picker';
import { 
  User, 
  Mail, 
  Palette, 
  Globe, 
  Sparkles, 
  Briefcase, 
  FileText,
  Download,
  Trash2,
  AlertTriangle,
  ArrowLeft,
  LogOut,
  Check,
  Loader2,
  Camera
} from 'lucide-react';

export default function ProfileSettingsPage() {
  const { user, updateUserProfile, logout, refetchUser } = useUser();
  const [formData, setFormData] = useState<Partial<UserProfile> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username,
        email: user.email,
        color_scheme: user.color_scheme,
        accent_color: user.accent_color,
        preferred_language: user.preferred_language,
        enable_customisation: user.enable_customisation,
        skyth_personality: user.skyth_personality,
        custom_personality: user.custom_personality,
        occupation: user.occupation,
        about_user: user.about_user,
      });
    }
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const uploadFormData = new FormData();
    uploadFormData.append('avatar', file);

    try {
      const response = await api('/user/avatar', {
        method: 'POST',
        body: uploadFormData,
      });

      if (response.ok) {
        refetchUser();
      } else {
        const error = await response.json();
        alert(`Avatar upload failed: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to upload avatar', error);
      alert('An error occurred while uploading the avatar.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!window.confirm("Are you sure you want to remove your avatar?")) return;

    try {
      const response = await api('/user/avatar', { method: 'DELETE' });
      if (response.ok) {
        refetchUser();
      } else {
        const error = await response.json();
        alert(`Failed to remove avatar: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to remove avatar', error);
      alert('An error occurred while removing the avatar.');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => (prev ? { ...prev, [name]: value } : null));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => (prev ? { ...prev, [name]: value } : null));
  };

  const handleSwitchChange = (name: string, checked: boolean) => {
    setFormData(prev => (prev ? { ...prev, [name]: checked } : null));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;
    setIsSaving(true);
    setSaveMessage('');
    const result = await updateUserProfile(formData);
    setIsSaving(false);
    if (result.success) {
      setSaveMessage('saved');
    } else {
      setSaveMessage('error');
    }
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const handleExport = (format: 'json' | 'md' | 'pdf') => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      alert('Authentication error. Please log in again.');
      return;
    }
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    const url = `${apiUrl}/user/export?format=${format}&token=${encodeURIComponent(token)}`;
    window.location.href = url;
  };

  const handleClearHistory = async () => {
    if (window.confirm("Are you sure you want to delete ALL your chat history? This action cannot be undone.")) {
      try {
        const res = await api('/user/chats/clear', { method: 'DELETE' });
        if (res.ok) {
          alert("Chat history cleared successfully.");
        } else {
          alert("Failed to clear chat history.");
        }
      } catch (error) {
        alert("An error occurred.");
      }
    }
  };

  const handleDeleteAccount = async () => {
    if (window.confirm("DANGER: Are you sure you want to delete your account? This will erase all your data and settings permanently. This action cannot be undone.")) {
      try {
        const res = await api('/user/delete', { method: 'DELETE' });
        if (res.ok) {
          await logout();
        } else {
          const errorData = await res.json();
          alert(`Failed to delete account: ${errorData.error || 'Unknown error'}`);
        }
      } catch (error) {
        console.error("Delete account error:", error);
        alert("An error occurred while trying to delete the account.");
      }
    }
  };

  if (!formData || !user) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          <p className="text-secondary-text">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-bg-color p-4 md:p-8 flex justify-center">
      {/* Card Container */}
      <div className="w-full max-w-4xl bg-surface border border-border-color rounded-3xl shadow-2xl overflow-hidden animate-slide-fade-in flex flex-col">
        
        {/* Header */}
        <header className="px-6 py-5 md:px-8 md:py-6 border-b border-border-color bg-surface/50 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-primary-text flex items-center gap-3">
              <UserAvatar username={user.username} avatarUrl={user.avatar_url} className="w-8 h-8 rounded-full" />
              Settings
            </h1>
            <p className="text-sm text-secondary-text">Manage your account and preferences.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => logout()} className="gap-2 text-red-400 hover:text-red-500 hover:bg-red-500/10">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
            <Button asChild variant="secondary" size="sm" className="gap-2">
              <Link href="/">
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Chat</span>
              </Link>
            </Button>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <form onSubmit={handleSave} className="space-y-8">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-8 h-auto rounded-xl bg-button-bg/50 p-1">
                <TabsTrigger value="general" className="flex-col gap-1 py-2 h-auto text-xs rounded-lg data-[state=active]:bg-surface data-[state=active]:shadow-sm"><User className="w-4 h-4" /><span className="hidden sm:inline md:text-sm">General</span><span className="sm:hidden">Gen</span></TabsTrigger>
                <TabsTrigger value="personalisation" className="flex-col gap-1 py-2 h-auto text-xs rounded-lg data-[state=active]:bg-surface data-[state=active]:shadow-sm"><Sparkles className="w-4 h-4" /><span className="hidden sm:inline md:text-sm">Personalize</span><span className="sm:hidden">Per</span></TabsTrigger>
                <TabsTrigger value="apps" className="flex-col gap-1 py-2 h-auto text-xs rounded-lg data-[state=active]:bg-surface data-[state=active]:shadow-sm"><Globe className="w-4 h-4" /><span className="md:text-sm">Apps</span></TabsTrigger>
                <TabsTrigger value="data" className="flex-col gap-1 py-2 h-auto text-xs rounded-lg data-[state=active]:bg-surface data-[state=active]:shadow-sm"><FileText className="w-4 h-4" /><span className="md:text-sm">Data</span></TabsTrigger>
              </TabsList>
              
              <TabsContent value="general" className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="bg-bg-color/50 border border-border-color rounded-2xl p-6 space-y-6">
                  <h3 className="text-lg font-semibold text-primary-text flex items-center gap-2"><User className="w-5 h-5" />Profile</h3>
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="relative group">
                      <UserAvatar username={user.username} avatarUrl={user.avatar_url} className="w-24 h-24 text-4xl rounded-full ring-4 ring-surface" />
                      <button type="button" onClick={() => !isUploading && fileInputRef.current?.click()} className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100 disabled:cursor-wait" disabled={isUploading}>
                        {isUploading ? <Loader2 className="w-8 h-8 animate-spin" /> : <Camera className="w-8 h-8" />}
                      </button>
                      <input type="file" ref={fileInputRef} onChange={handleAvatarUpload} accept="image/png, image/jpeg, image/gif" className="hidden" disabled={isUploading} />
                    </div>
                    <div className="w-full space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="username">Your Nickname</Label>
                        <Input id="username" name="username" value={formData.username || ''} onChange={handleInputChange} className="transition-all focus:scale-[1.01] rounded-xl bg-surface" />
                      </div>
                      {user.avatar_url && <Button type="button" size="sm" variant="ghost" onClick={handleRemoveAvatar} className="text-xs text-secondary-text hover:text-red-400 px-0">Remove Avatar</Button>}
                    </div>
                  </div>
                </div>

                <div className="bg-bg-color/50 border border-border-color rounded-2xl p-6 space-y-4">
                  <h3 className="text-lg font-semibold text-primary-text flex items-center gap-2"><Palette className="w-5 h-5" />Appearance</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2"><Label htmlFor="color_scheme">Theme</Label><Select name="color_scheme" value={formData.color_scheme} onValueChange={(v) => handleSelectChange('color_scheme', v)}><SelectTrigger className="rounded-xl bg-surface"><SelectValue placeholder="Select theme" /></SelectTrigger><SelectContent><SelectItem value="system">System</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent></Select></div>
                    <div className="space-y-2">
                      <Label htmlFor="accent_color">Accent Color</Label>
                      <div className="flex items-center gap-3">
                        <ColorPicker value={formData.accent_color || '#a7c7e7'} onChange={(color) => handleSelectChange('accent_color', color)} />
                        <span className="text-sm text-secondary-text font-mono">{formData.accent_color}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-bg-color/50 border border-border-color rounded-2xl p-6 space-y-4">
                  <h3 className="text-lg font-semibold text-primary-text flex items-center gap-2"><Mail className="w-5 h-5" />Contact Information</h3>
                  <div className="space-y-2"><Label htmlFor="email">Email (optional)</Label><Input id="email" name="email" type="email" placeholder="you@example.com" value={formData.email || ''} onChange={handleInputChange} className="transition-all focus:scale-[1.01] rounded-xl bg-surface" /></div>
                </div>
              </TabsContent>

              <TabsContent value="personalisation" className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="bg-bg-color/50 border border-border-color rounded-2xl p-6">
                  <div className="flex items-center justify-between"><div className="space-y-1"><Label className="text-base">Enable Customization</Label><p className="text-xs text-secondary-text">Tailor Skyth's personality and responses to your preferences.</p></div><Switch checked={!!formData.enable_customisation} onCheckedChange={(c) => handleSwitchChange('enable_customisation', c)} className="data-[state=checked]:bg-accent" /></div>
                </div>

                {formData.enable_customisation && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="bg-bg-color/50 border border-border-color rounded-2xl p-6 space-y-4">
                      <h3 className="text-lg font-semibold text-primary-text flex items-center gap-2"><Sparkles className="w-5 h-5" />Personality</h3>
                      <div className="space-y-4"><div className="space-y-2"><Label htmlFor="skyth_personality">Skyth Personality</Label><Select name="skyth_personality" value={formData.skyth_personality} onValueChange={(v) => handleSelectChange('skyth_personality', v)}><SelectTrigger className="rounded-xl bg-surface"><SelectValue placeholder="Select personality" /></SelectTrigger><SelectContent><SelectItem value="default">Default</SelectItem><SelectItem value="nerd">Nerd</SelectItem><SelectItem value="unhinged">Unhinged</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent></Select></div>{formData.skyth_personality === 'custom' && (<div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300"><Label htmlFor="custom_personality">Custom Instructions</Label><textarea name="custom_personality" value={formData.custom_personality || ''} onChange={handleInputChange} placeholder="e.g., You are a helpful pirate assistant who speaks in nautical terms..." className="w-full h-32 p-3 bg-surface border border-border-color rounded-2xl text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-all resize-none" /></div>)}</div>
                    </div>
                    <Separator />
                    <div className="bg-bg-color/50 border border-border-color rounded-2xl p-6 space-y-4">
                      <h3 className="text-lg font-semibold text-primary-text flex items-center gap-2"><User className="w-5 h-5" />About You</h3>
                      <div className="space-y-4"><div className="space-y-2"><Label htmlFor="occupation" className="flex items-center gap-2"><Briefcase className="w-4 h-4" />Your Occupation</Label><Input id="occupation" name="occupation" placeholder="e.g., Software Engineer" value={formData.occupation || ''} onChange={handleInputChange} className="transition-all focus:scale-[1.01] rounded-xl bg-surface" /></div><div className="space-y-2"><Label htmlFor="about_user">More About You</Label><textarea name="about_user" value={formData.about_user || ''} onChange={handleInputChange} placeholder="Tell me more about your interests, preferences, or anything else you want me to know..." className="w-full h-32 p-3 bg-surface border border-border-color rounded-2xl text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-all resize-none" /></div></div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="apps" className="animate-in fade-in slide-in-from-top-2 duration-300"><AppsConnectorsTab /></TabsContent>

              <TabsContent value="data" className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="bg-bg-color/50 border border-border-color rounded-2xl p-6 space-y-4"><h3 className="font-semibold text-primary-text flex items-center gap-2"><Download className="w-5 h-5" />Export Data</h3><p className="text-sm text-secondary-text">Download all your chat history in various formats.</p><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => handleExport('json')} className="gap-2 bg-surface hover:bg-button-bg"><Download className="w-4 h-4" />JSON</Button><Button variant="secondary" onClick={() => handleExport('md')} className="gap-2 bg-surface hover:bg-button-bg"><Download className="w-4 h-4" />Markdown</Button><Button variant="secondary" onClick={() => handleExport('pdf')} className="gap-2 bg-surface hover:bg-button-bg"><Download className="w-4 h-4" />PDF</Button></div></div>
                <div className="bg-bg-color/50 border border-border-color rounded-2xl p-6 space-y-4"><h3 className="font-semibold text-primary-text flex items-center gap-2"><Trash2 className="w-5 h-5" />Clear Chat History</h3><p className="text-sm text-secondary-text">Permanently delete all of your chats. This action cannot be undone.</p><Button variant="outline" onClick={handleClearHistory} className="gap-2 bg-surface hover:bg-yellow-500/10 hover:text-yellow-500 hover:border-yellow-500/50"><Trash2 className="w-4 h-4" />Clear All Chats</Button></div>
                <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 space-y-4"><h3 className="font-semibold text-red-400 flex items-center gap-2"><AlertTriangle className="w-5 h-5" />Danger Zone</h3><p className="text-sm text-secondary-text">This will permanently delete all your data and settings. This action cannot be undone.</p><Button variant="destructive" onClick={handleDeleteAccount} className="gap-2"><Trash2 className="w-4 h-4" />Delete Account</Button></div>
              </TabsContent>
            </Tabs>

            {/* Sticky Footer within Card */}
            <div className="sticky bottom-0 pt-4 pb-0 bg-gradient-to-t from-surface via-surface to-transparent">
              <div className="flex justify-end items-center gap-4">
                {saveMessage === 'saved' && (<p className="text-sm text-green-400 flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300"><Check className="w-4 h-4" />Saved!</p>)}
                {saveMessage === 'error' && (<p className="text-sm text-red-400 flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300"><AlertTriangle className="w-4 h-4" />Error</p>)}
                <Button type="submit" disabled={isSaving} className="gap-2 min-w-[140px] shadow-lg">
                  {isSaving ? (<><Loader2 className="w-4 h-4 animate-spin" />Saving...</>) : (<><Check className="w-4 h-4" />Save Changes</>)}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}