import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuthContext } from "@/hooks/use-auth-context";
import { Sidebar } from "@/components/chat/sidebar";
import { GeneralChat } from "@/components/chat/general-chat";
import { DmChat } from "@/components/chat/dm-chat";

export default function ChatLayout() {
  const { isAuthenticated, isLoading, isSocketConnected } = useAuthContext();
  const [_, setLocation] = useLocation();
  const [currentTab, setCurrentTab] = useState<"general" | string>("general");
  const [friendLabel, setFriendLabel] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/auth");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground font-mono text-sm">
        <p>connecting...</p>
      </div>
    );
  }

  const handleSelectTab = (tabId: string, label?: string) => {
    setCurrentTab(tabId);
    if (label) setFriendLabel(label);
    setSidebarOpen(false); // close sidebar on mobile after selecting
  };

  const tabTitle = currentTab === "general" ? "#general" : friendLabel;

  return (
    <div className="h-screen w-full flex bg-background overflow-hidden relative">
      {!isSocketConnected && (
        <div className="absolute top-0 left-0 right-0 bg-destructive text-destructive-foreground text-xs font-mono text-center py-0.5 z-50">
          connection lost — reconnecting...
        </div>
      )}

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar: always visible on md+, overlay on mobile */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 md:relative md:z-auto md:flex md:shrink-0
          ${sidebarOpen ? "flex" : "hidden md:flex"}
        `}
      >
        <Sidebar
          currentTab={currentTab}
          onSelectTab={handleSelectTab}
        />
      </div>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col relative overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-2 px-3 h-9 border-b border-border bg-card shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-muted-foreground hover:text-foreground font-mono text-base leading-none"
            title="Open menu"
            aria-label="Open sidebar"
          >
            ≡
          </button>
          <span className="text-xs font-mono text-foreground">{tabTitle}</span>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {currentTab === "general" ? (
            <GeneralChat />
          ) : (
            <DmChat friendId={currentTab} friendLabel={friendLabel} />
          )}
        </div>
      </main>
    </div>
  );
}
