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
  };

  return (
    <div className="h-screen w-full flex bg-background overflow-hidden">
      {!isSocketConnected && (
        <div className="absolute top-0 left-0 right-0 bg-destructive text-destructive-foreground text-xs font-mono text-center py-0.5 z-50">
          connection lost — reconnecting...
        </div>
      )}

      <Sidebar currentTab={currentTab} onSelectTab={handleSelectTab} />

      <main className="flex-1 min-w-0 relative">
        {currentTab === "general" ? (
          <GeneralChat />
        ) : (
          <DmChat friendId={currentTab} friendLabel={friendLabel} />
        )}
      </main>
    </div>
  );
}
