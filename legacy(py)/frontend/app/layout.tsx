// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { UserProvider } from "@/context/UserContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import AppShell from "@/components/AppShell";
import { ChatProvider } from "@/context/ChatContext";

export const metadata: Metadata = {
  title: "SKYTH",
  description: "MCP Agent Interface",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <link 
          rel="stylesheet" 
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" 
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css"
        />
      </head>
      <body className="h-full overflow-hidden font-sans bg-bg-color">
        {/* --- FIX: Immediate theme script to prevent flicker --- */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme');
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else if (theme === 'light') {
                    document.documentElement.classList.remove('dark');
                  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {
                  // Fails in environments where localStorage is not available.
                }
              })();
            `,
          }}
        />
        <UserProvider>
          <ThemeProvider>
            <ChatProvider>
              <AppShell>
                {children}
              </AppShell>
            </ChatProvider>
          </ThemeProvider>
        </UserProvider>
      </body>
    </html>
  );
}