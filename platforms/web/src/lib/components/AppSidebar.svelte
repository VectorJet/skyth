<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    Sidebar, 
    SidebarHeader, 
    SidebarContent, 
    SidebarFooter, 
    SidebarGroup, 
    SidebarGroupLabel, 
    SidebarGroupContent, 
    SidebarMenu, 
    SidebarMenuItem, 
    SidebarMenuButton,
    SidebarRail
  } from "$lib/components/ui/sidebar/index.js";
  import User from "@lucide/svelte/icons/user";
  import Compose from "$lib/components/icons/compose.svelte";
  import Search from "@lucide/svelte/icons/search";
  import SidebarIcon from "$lib/components/icons/sidebar.svelte";
  import MessageSquare from "@lucide/svelte/icons/message-square";
  import { goto } from "$app/navigation";
  import { globalState } from "$lib/state.svelte";
  import Logo from "$lib/components/icons/icon.svelte";
  import { useSidebar } from "$lib/components/ui/sidebar/context.svelte.js";

  const sidebar = useSidebar();
  let sessions = $state<any[]>([]);

  onMount(() => {
    if (globalState.token) {
      loadSessions();
    }
  });

  async function loadSessions() {
    const API_BASE = typeof window !== 'undefined' ? `${window.location.origin}` : '';
    try {
      const res = await fetch(`${API_BASE}/api/sessions`, {
        headers: {
          'Authorization': globalState.token || ''
        }
      });
      const data = await res.json();
      if (data.success && data.sessions) {
        sessions = data.sessions;
      }
    } catch (e) {
      // noop
    }
  }

  function logout() {
    globalState.setToken(null);
    globalState.setUsername('');
    goto('/auth');
  }

  function createNewChat() {
    const newChatId = 'session-' + Math.random().toString(36).slice(2, 9);
    globalState.setChatId(newChatId);
    loadSessions(); // Reload sessions in case it appears
    if (window.innerWidth < 768) {
      sidebar.setOpenMobile(false);
    }
  }

  function selectChat(chatId: string) {
    // Strip "web:" prefix if it exists
    const cleanId = chatId.startsWith('web:') ? chatId.slice(4) : chatId;
    globalState.setChatId(cleanId);
    if (window.innerWidth < 768) {
      sidebar.setOpenMobile(false);
    }
  }

  // Reload sessions whenever the current chatId changes, effectively making new chats visible
  $effect(() => {
    if (globalState.currentChatId) {
      loadSessions();
    }
  });
</script>

<Sidebar collapsible="icon" class="border-none bg-[#121212] text-white">
  <SidebarHeader class="pt-5 pb-2 px-4">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <button 
          onclick={() => sidebar.toggle()}
          class="flex h-8 w-8 items-center justify-center relative group/logo rounded-md group-data-[collapsible=icon]:hover:bg-[#3c3c40] transition-colors cursor-default group-data-[collapsible=icon]:cursor-pointer"
        >
          <Logo class="h-7 w-7 text-white transition-opacity duration-200 group-data-[collapsible=icon]:group-hover/logo:opacity-0" />
          <SidebarIcon class="absolute size-5 text-zinc-400 opacity-0 transition-opacity duration-200 group-data-[collapsible=icon]:group-hover/logo:opacity-100" />
        </button>
        <span class="text-xl font-semibold tracking-tight text-white group-data-[collapsible=icon]:hidden">
          Skyth
        </span>
      </div>
      <button 
        onclick={() => sidebar.toggle()}
        class="p-1 hover:bg-[#3c3c40] rounded-md text-zinc-500/70 transition-colors group-data-[collapsible=icon]:hidden"
      >
        <SidebarIcon class="size-5" />
      </button>
    </div>

    <SidebarMenu class="gap-3">
       <SidebarMenuItem>
         <SidebarMenuButton 
            onclick={createNewChat}
            class="w-full justify-start gap-3 bg-[#1e1e1e] hover:bg-[#2a2a2a] rounded-full px-4 py-6 transition-all group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:mx-auto"
         >
           <div class="flex items-center gap-3">
             <Compose class="size-5 text-white" />
             <span class="text-[15px] font-medium text-white group-data-[collapsible=icon]:hidden">New Chat</span>
           </div>
         </SidebarMenuButton>
       </SidebarMenuItem>
       <SidebarMenuItem>
         <SidebarMenuButton 
            class="w-full justify-start gap-3 hover:bg-[#1e1e1e] rounded-full px-4 py-5 transition-all group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:mx-auto"
         >
           <div class="flex items-center gap-3">
             <Search size={20} class="text-zinc-400" />
             <span class="text-[15px] text-zinc-400 group-data-[collapsible=icon]:hidden">Search Chats</span>
           </div>
         </SidebarMenuButton>
       </SidebarMenuItem>
    </SidebarMenu>
  </SidebarHeader>

  <SidebarContent class="px-4">
    <SidebarGroup class="p-0 mt-4">
      <SidebarGroupLabel class="px-0 py-2 text-[13px] font-medium text-zinc-500 tracking-normal group-data-[collapsible=icon]:hidden">Chats</SidebarGroupLabel>
      <SidebarGroupContent class="mt-2">
        <SidebarMenu>
          {#each sessions as session (session.id || session.key)}
            <SidebarMenuItem>
              <SidebarMenuButton 
                onclick={() => selectChat(session.key)}
                isActive={globalState.currentChatId === (session.key.startsWith('web:') ? session.key.slice(4) : session.key)}
                class="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-[#1e1e1e] hover:text-zinc-200 transition-colors data-[active=true]:bg-[#1e1e1e] data-[active=true]:text-white data-[active=true]:font-medium group-data-[collapsible=icon]:justify-center"
              >
                <MessageSquare class="size-4 opacity-70 group-data-[active=true]:opacity-100 group-data-[active=true]:text-primary group-data-[collapsible=icon]:hidden" />
                <span class="truncate group-data-[collapsible=icon]:hidden">{session.name || session.key.replace('web:', '')}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          {/each}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  </SidebarContent>

  <SidebarFooter class="p-4 mt-auto">
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton class="hover:bg-transparent p-0 h-auto">
          <div class="flex items-center gap-3">
            <div class="h-9 w-9 rounded-full bg-[#3c3c40] flex items-center justify-center overflow-hidden">
               <span class="text-sm font-medium text-zinc-300">
                 {(globalState.username || 'LJ').substring(0, 2).toUpperCase()}
               </span>
            </div>
            <span class="text-[15px] font-medium text-zinc-200 group-data-[collapsible=icon]:hidden">
              {globalState.username || 'Linear Jetto'}
            </span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarFooter>
  <SidebarRail />
</Sidebar>

<style>
  @media (max-width: 768px) {
    :global([data-sidebar="sidebar-rail"]) {
      display: none !important;
    }
  }
</style>
