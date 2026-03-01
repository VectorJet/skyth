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
  import User from "@lucide/svelte/icons/user";
  import Plus from "@lucide/svelte/icons/plus";
  import Search from "@lucide/svelte/icons/search";
  import PanelLeft from "@lucide/svelte/icons/panel-left";
  import { goto } from "$app/navigation";
  import { globalState } from "$lib/state.svelte";
  import Logo from "$lib/components/icons/icon.svelte";
  import { useSidebar } from "$lib/components/ui/sidebar/context.svelte.js";

  const sidebar = useSidebar();

  function logout() {
    globalState.setToken(null);
    globalState.setUsername('');
    goto('/auth');
  }

  function createNewChat() {
    // Logic for new chat
  }
</script>

<Sidebar collapsible="icon" class="border-none bg-[#121212] text-white">
  <SidebarHeader class="pt-5 pb-2 px-4">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <div class="flex h-8 w-8 items-center justify-center overflow-hidden">
          <Logo class="h-7 w-7 text-white" />
        </div>
        <span class="text-xl font-semibold tracking-tight text-white group-data-[collapsible=icon]:hidden">
          Skyth
        </span>
      </div>
      <button 
        onclick={() => sidebar.toggle()}
        class="p-1 hover:bg-[#3c3c40] rounded-md text-zinc-400 transition-colors group-data-[collapsible=icon]:hidden"
      >
        <PanelLeft size={20} />
      </button>
    </div>

    <SidebarMenu>
       <SidebarMenuItem>
         <SidebarMenuButton 
            onclick={createNewChat}
            class="w-full justify-start gap-3 bg-[#1e1e1e] hover:bg-[#2a2a2a] rounded-full px-4 py-6 transition-all group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:mx-auto"
         >
           <div class="flex items-center gap-3">
             <Plus size={20} strokeWidth={2} class="text-white" />
             <span class="text-[15px] font-medium text-white group-data-[collapsible=icon]:hidden">New Chat</span>
           </div>
         </SidebarMenuButton>
       </SidebarMenuItem>
    </SidebarMenu>
  </SidebarHeader>

  <SidebarContent class="px-4">
    <SidebarGroup class="p-0 mt-4">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton class="hover:bg-transparent hover:text-white rounded-xl py-2 px-0">
              <div class="flex items-center gap-3">
                <Search size={18} class="text-zinc-400" />
                <span class="text-[15px] text-zinc-400 group-data-[collapsible=icon]:hidden">Search Chats</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>

    <SidebarGroup class="p-0 mt-8">
      <SidebarGroupLabel class="px-0 py-2 text-[13px] font-medium text-zinc-500 tracking-normal group-data-[collapsible=icon]:hidden">Chats</SidebarGroupLabel>
      <SidebarGroupContent class="mt-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton class="hover:bg-transparent rounded-xl py-2 px-0 h-auto">
              <span class="text-[15px] text-zinc-100 group-data-[collapsible=icon]:hidden truncate">Understanding Mathematical I...</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton class="hover:bg-transparent rounded-xl py-2 px-0 h-auto">
              <span class="text-[15px] text-zinc-100 group-data-[collapsible=icon]:hidden truncate">Frontend Design Review</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
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
