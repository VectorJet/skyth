// app/page.tsx
"use client";

import Chat from "@/components/chat";

export default function HomePage() {
  // All loading and onboarding checks are now handled by AppShell.
  // This component's only responsibility is to render the chat interface.
  return <Chat />;
}