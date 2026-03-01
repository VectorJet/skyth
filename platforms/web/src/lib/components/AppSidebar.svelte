<script lang="ts">
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
  import Activity from "@lucide/svelte/icons/activity";
  import User from "@lucide/svelte/icons/user";
  import Plus from "@lucide/svelte/icons/plus";
  import Search from "@lucide/svelte/icons/search";
  import Settings from "@lucide/svelte/icons/settings";
  import LayoutGrid from "@lucide/svelte/icons/layout-grid";
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import Circle from "@lucide/svelte/icons/circle";
  import { goto } from "$app/navigation";
  import { globalState } from "$lib/state.svelte";
  import Logo from "$lib/components/icons/icon.svelte";

  function logout() {
    globalState.setToken(null);
    globalState.setUsername('');
    goto('/auth');
  }

  function createNewChat() {
    // Logic for new chat
  }
</script>

<Sidebar collapsible="icon" class="border-r border-border bg-sidebar">
  <SidebarHeader class="pt-4 pb-2 px-3">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2.5">
        <div class="flex h-9 w-9 items-center justify-center text-xl overflow-hidden">
          <Logo class="h-6 w-6 rotate-45 text-foreground" />
        </div>
        <span class="text-base font-semibold tracking-tight text-foreground group-data-[collapsible=icon]:hidden">
          SKYTH
        </span>
      </div>
      <button 
        onclick={createNewChat}
        class="p-2 hover:bg-accent rounded-lg text-muted-foreground transition-colors group-data-[collapsible=icon]:hidden"
      >
        <Plus size={20} strokeWidth={2.5} />
      </button>
    </div>

    <SidebarMenu>
       <SidebarMenuItem>
         <SidebarMenuButton 
            onclick={createNewChat}
            class="w-full justify-start gap-3 bg-accent hover:bg-accent/80 rounded-xl px-3 py-6 transition-all group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:mx-auto"
         >
           <div class="flex items-center gap-3">
             <Plus size={20} strokeWidth={2.5} class="text-primary-foreground" />
             <span class="font-medium text-foreground group-data-[collapsible=icon]:hidden">New Chat</span>
           </div>
         </SidebarMenuButton>
       </SidebarMenuItem>
    </SidebarMenu>
  </SidebarHeader>

  <SidebarContent class="px-2">
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton class="hover:bg-accent rounded-xl py-5">
              <div class="flex items-center gap-3">
                <Search size={18} class="text-muted-foreground" />
                <span class="text-muted-foreground group-data-[collapsible=icon]:hidden">Search</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton class="hover:bg-accent rounded-xl py-5">
              <div class="flex items-center gap-3">
                <LayoutGrid size={18} class="text-muted-foreground" />
                <span class="text-muted-foreground group-data-[collapsible=icon]:hidden">Workspace</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>

    <div class="my-2 border-t border-border mx-2 group-data-[collapsible=icon]:hidden"></div>

    <SidebarGroup>
      <SidebarGroupLabel class="px-4 py-2 text-[11px] font-semibold text-muted-foreground tracking-wider group-data-[collapsible=icon]:hidden">CHATS</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton isActive class="rounded-xl py-5 data-[active=true]:bg-accent">
              <div class="flex items-center gap-3">
                <MessageCircle size={18} class="text-muted-foreground" />
                <span class="text-muted-foreground group-data-[collapsible=icon]:hidden font-medium">Main Channel</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  </SidebarContent>

  <SidebarFooter class="p-3 border-t border-border">
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton class="hover:bg-accent rounded-xl py-5">
          <div class="flex items-center gap-3">
            <div class="relative">
              <Activity size={18} class={globalState.status === 'connected' ? 'text-green-500' : globalState.status === 'connecting' ? 'text-yellow-500' : 'text-red-500'} />
              {#if globalState.status === 'connected'}
                <span class="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 border-2 border-background"></span>
              {/if}
            </div>
            <span class="text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
              System: <span class="font-medium text-foreground">{globalState.status.toUpperCase()}</span>
            </span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
      
      <SidebarMenuItem>
        <SidebarMenuButton class="hover:bg-accent rounded-xl py-5">
          <div class="flex items-center gap-3">
            <Settings size={18} class="text-muted-foreground" />
            <span class="text-muted-foreground group-data-[collapsible=icon]:hidden">Settings</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <SidebarMenuItem class="group-data-[collapsible=icon]:hidden">
        <SidebarMenuButton class="hover:bg-accent rounded-xl py-6 mt-1">
          <div class="flex items-center gap-3">
            <div class="h-8 w-8 rounded-full bg-accent flex items-center justify-center overflow-hidden">
               <User size={18} class="text-muted-foreground" />
            </div>
            <div class="flex flex-col">
              <span class="text-sm font-medium text-foreground">{globalState.username || 'Operator'}</span>
              <span class="text-[10px] text-muted-foreground uppercase tracking-tighter">Level 1 Access</span>
            </div>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
      
      <SidebarMenuItem class="hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center pt-2">
        <div class="flex flex-col items-center gap-2">
          <div class="h-8 w-8 rounded-full bg-accent flex items-center justify-center overflow-hidden">
             <User size={18} class="text-muted-foreground" />
          </div>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarFooter>
  <SidebarRail />
</Sidebar>

<style>
  :global(.group-data-\[collapsible\=icon\]\:hidden) {
    display: none;
  }
  
  :global(.group-data-\[collapsible\=icon\]\:flex) {
    display: flex;
  }
  
  :global([data-state=expanded] .group-data-\[collapsible\=icon\]\:hidden) {
    display: flex;
  }

  @media (max-width: 768px) {
    :global([data-sidebar="sidebar-rail"]) {
      display: none !important;
    }
  }
</style>
