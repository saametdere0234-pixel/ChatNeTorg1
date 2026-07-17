import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin, useRegister, useGuestLogin } from "@workspace/api-client-react";
import { useAuthStore } from "@/store/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

// ── schemas ──────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, "letters, numbers, _ only"),
  password: z.string().min(6, "at least 6 characters"),
});

const loginSchema = z.object({
  id: z.string().min(1, "required"), // friend token used as login ID
  password: z.string().min(1, "required"),
});

const guestSchema = z.object({
  displayName: z.string().min(1, "required").max(30),
});

type RegisterValues = z.infer<typeof registerSchema>;
type LoginValues    = z.infer<typeof loginSchema>;
type GuestValues    = z.infer<typeof guestSchema>;

// ── component ────────────────────────────────────────────────────────────────

type Mode = "landing" | "create" | "registered" | "login";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("landing");
  const [newFriendToken, setNewFriendToken] = useState<string>("");
  const [newToken, setNewToken] = useState<string>("");
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const setToken = useAuthStore(s => s.setToken);
  const setSavedFriendToken = useAuthStore(s => s.setSavedFriendToken);
  const clearAllData = useAuthStore(s => s.clearAllData);
  const savedFriendToken = useAuthStore(s => s.savedFriendToken);

  // Clear any stale session before starting fresh auth
  const resetSession = () => {
    clearAllData();
    queryClient.clear();
  };

  // ── forms ──
  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", password: "" },
  });

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { id: savedFriendToken ?? "", password: "" },
  });

  const guestForm = useForm<GuestValues>({
    resolver: zodResolver(guestSchema),
    defaultValues: { displayName: "" },
  });

  // ── mutations ──
  const registerMutation = useRegister({
    mutation: {
      onSuccess: (data) => {
        // Don't set the token yet — show the user their ID first
        setNewFriendToken(data.user.friendToken ?? "");
        setNewToken(data.token);
        setSavedFriendToken(data.user.friendToken ?? null);
        setMode("registered");
      },
      onError: () => {
        toast({ variant: "destructive", title: "Error", description: "Username may be taken or invalid." });
      },
    },
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        resetSession();
        setToken(data.token);
        setSavedFriendToken(data.user.friendToken ?? null);
        setLocation("/chat");
      },
      onError: () => {
        toast({ variant: "destructive", title: "Error", description: "Invalid ID or password." });
      },
    },
  });

  const guestMutation = useGuestLogin({
    mutation: {
      onSuccess: (data) => {
        resetSession();
        setToken(data.token);
        setLocation("/chat");
      },
      onError: () => {
        toast({ variant: "destructive", title: "Error", description: "Could not create guest session." });
      },
    },
  });

  const handleEnterChat = () => {
    // Clear any stale query cache from a prior session without touching savedFriendToken
    queryClient.clear();
    setToken(newToken);
    setLocation("/chat");
  };

  const copyToken = () => {
    navigator.clipboard.writeText(newFriendToken);
    toast({ title: "Copied", description: "Your ID copied to clipboard." });
  };

  // ── render ──
  return (
    <div className="min-h-screen bg-background flex items-start justify-center pt-16 px-4 font-mono">
      <div className="w-full max-w-xs">

        {/* Logo */}
        <div className="mb-6 text-center">
          <span className="text-2xl font-bold" style={{ color: 'var(--logo-chat)' }}>Chat</span>
          <span className="text-2xl font-bold" style={{ color: 'var(--logo-net)' }}>Net</span>
        </div>

        {/* ── LANDING ── */}
        {mode === "landing" && (
          <div className="border border-border bg-card p-4">
            <button
              onClick={() => setMode("create")}
              className="block w-full text-left px-3 py-3 sm:py-1.5 text-sm text-foreground border border-border mb-2 hover:bg-accent"
            >
              [ Create Account ]
            </button>
            <button
              onClick={() => setMode("login")}
              className="block w-full text-left px-3 py-3 sm:py-1.5 text-sm text-foreground border border-border hover:bg-accent"
            >
              [ Login ]
            </button>
          </div>
        )}

        {/* ── CREATE ACCOUNT ── */}
        {mode === "create" && (
          <div className="border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-foreground">Create Account</span>
              <button onClick={() => setMode("landing")} className="text-xs text-muted-foreground hover:text-foreground">[back]</button>
            </div>

            <form onSubmit={registerForm.handleSubmit(data => registerMutation.mutate({ data }))} className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-0.5">username</label>
                <input
                  {...registerForm.register("username")}
                  autoComplete="username"
                  className="w-full bg-background border border-border px-2 py-1 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground"
                  placeholder="letters, numbers, _"
                />
                {registerForm.formState.errors.username && (
                  <p className="text-xs text-destructive mt-0.5">{registerForm.formState.errors.username.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-0.5">password</label>
                <input
                  {...registerForm.register("password")}
                  type="password"
                  autoComplete="new-password"
                  className="w-full bg-background border border-border px-2 py-1 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground"
                  placeholder="min 6 characters"
                />
                {registerForm.formState.errors.password && (
                  <p className="text-xs text-destructive mt-0.5">{registerForm.formState.errors.password.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={registerMutation.isPending}
                className="w-full border border-border px-2 py-1.5 text-sm text-foreground hover:bg-accent disabled:opacity-40 mt-1"
              >
                {registerMutation.isPending ? "creating..." : "[ Create Account ]"}
              </button>
            </form>
          </div>
        )}

        {/* ── REGISTERED — show ID before entering ── */}
        {mode === "registered" && (
          <div className="border border-border bg-card p-4">
            <div className="mb-3">
              <span className="text-sm text-foreground">Account Created</span>
            </div>

            <p className="text-xs text-muted-foreground mb-3">
              Save your login ID — you'll need it every time you log in. Your username is only used in chat.
            </p>

            <div className="border border-primary bg-background px-3 py-2 mb-3">
              <div className="text-[10px] text-muted-foreground mb-1">your login ID</div>
              <div className="text-base font-bold text-primary tracking-widest">{newFriendToken}</div>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={copyToken}
                className="flex-1 border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                [ Copy ID ]
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground mb-3">
              This ID is also shown in the sidebar whenever you're logged in.
            </p>

            <button
              onClick={handleEnterChat}
              className="w-full border border-border px-2 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              [ Enter Chat ]
            </button>
          </div>
        )}

        {/* ── LOGIN ── */}
        {mode === "login" && (
          <div className="border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-foreground">Login</span>
              <button onClick={() => setMode("landing")} className="text-xs text-muted-foreground hover:text-foreground">[back]</button>
            </div>

            <form onSubmit={loginForm.handleSubmit(data => loginMutation.mutate({ data }))} className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-0.5">your ID</label>
                <input
                  {...loginForm.register("id")}
                  autoComplete="username"
                  className="w-full bg-background border border-border px-2 py-1 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground"
                  placeholder="xx.xx.xx.xx"
                />
                {loginForm.formState.errors.id && (
                  <p className="text-xs text-destructive mt-0.5">{loginForm.formState.errors.id.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-0.5">password</label>
                <input
                  {...loginForm.register("password")}
                  type="password"
                  autoComplete="current-password"
                  className="w-full bg-background border border-border px-2 py-1 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground"
                  placeholder="password"
                />
                {loginForm.formState.errors.password && (
                  <p className="text-xs text-destructive mt-0.5">{loginForm.formState.errors.password.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full border border-border px-2 py-1.5 text-sm text-foreground hover:bg-accent disabled:opacity-40 mt-1"
              >
                {loginMutation.isPending ? "logging in..." : "[ Login ]"}
              </button>
            </form>

            {/* Guest divider */}
            <div className="mt-4 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">or enter without an account</p>

              <form onSubmit={guestForm.handleSubmit(data => guestMutation.mutate({ data }))} className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-0.5">display name</label>
                  <input
                    {...guestForm.register("displayName")}
                    autoComplete="off"
                    className="w-full bg-background border border-border px-2 py-1 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground"
                    placeholder="pick any name"
                  />
                  {guestForm.formState.errors.displayName && (
                    <p className="text-xs text-destructive mt-0.5">{guestForm.formState.errors.displayName.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={guestMutation.isPending}
                  className="w-full border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40"
                >
                  {guestMutation.isPending ? "entering..." : "[ Enter as Guest ]"}
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
