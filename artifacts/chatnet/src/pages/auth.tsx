import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin, useRegister, useGuestLogin } from "@workspace/api-client-react";
import { useAuthStore } from "@/store/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

// ── schemas ──────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, "letters, numbers, _ only"),
  password: z.string().min(6, "at least 6 characters"),
});

const loginSchema = z.object({
  id: z.string().min(1, "required"), // 'id' field maps to username on the backend
  password: z.string().min(1, "required"),
});

const guestSchema = z.object({
  displayName: z.string().min(1, "required").max(30),
});

type RegisterValues = z.infer<typeof registerSchema>;
type LoginValues    = z.infer<typeof loginSchema>;
type GuestValues    = z.infer<typeof guestSchema>;

// ── component ────────────────────────────────────────────────────────────────

type Mode = "landing" | "create" | "login";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("landing");
  const [_, setLocation] = useLocation();
  const { toast } = useToast();

  const setToken = useAuthStore(s => s.setToken);
  const setSavedFriendToken = useAuthStore(s => s.setSavedFriendToken);
  const savedFriendToken = useAuthStore(s => s.savedFriendToken);

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
        setToken(data.token);
        setSavedFriendToken(data.user.friendToken ?? null);
        setLocation("/chat");
      },
      onError: () => {
        toast({ variant: "destructive", title: "Error", description: "Username may be taken or invalid." });
      },
    },
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
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
        setToken(data.token);
        setLocation("/chat");
      },
      onError: () => {
        toast({ variant: "destructive", title: "Error", description: "Could not create guest session." });
      },
    },
  });

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
              className="block w-full text-left px-2 py-1.5 text-sm text-foreground border border-border mb-2 hover:bg-accent"
            >
              [ Create Account ]
            </button>
            <button
              onClick={() => setMode("login")}
              className="block w-full text-left px-2 py-1.5 text-sm text-foreground border border-border hover:bg-accent"
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

        {/* ── LOGIN ── */}
        {mode === "login" && (
          <div className="border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-foreground">Login</span>
              <button onClick={() => setMode("landing")} className="text-xs text-muted-foreground hover:text-foreground">[back]</button>
            </div>

            <form onSubmit={loginForm.handleSubmit(data => loginMutation.mutate({ data }))} className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-0.5">username</label>
                <input
                  {...loginForm.register("id")}
                  autoComplete="username"
                  className="w-full bg-background border border-border px-2 py-1 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground"
                  placeholder="your username"
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
