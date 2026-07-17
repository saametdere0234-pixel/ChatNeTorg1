import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useLogin, useRegister } from "@workspace/api-client-react";
import { useAuthStore } from "@/store/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { TerminalSquare } from "lucide-react";

const authSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6),
});

type AuthValues = z.infer<typeof authSchema>;

export default function AuthPage() {
  const [_, setLocation] = useLocation();
  const setToken = useAuthStore((state) => state.setToken);
  const { toast } = useToast();

  const loginForm = useForm<AuthValues>({
    resolver: zodResolver(authSchema),
    defaultValues: { username: "", password: "" },
  });

  const registerForm = useForm<AuthValues>({
    resolver: zodResolver(authSchema),
    defaultValues: { username: "", password: "" },
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        setToken(data.token);
        setLocation("/chat");
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Access Denied",
          description: "Invalid credentials.",
        });
      },
    },
  });

  const registerMutation = useRegister({
    mutation: {
      onSuccess: (data) => {
        setToken(data.token);
        setLocation("/chat");
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Registration Failed",
          description: "Username may be taken or invalid.",
        });
      },
    },
  });

  return (
    <div className="min-h-screen w-full flex bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Visual left panel */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center border-r border-border p-12 bg-black relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, hsl(var(--primary)) 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>
        <div className="max-w-md w-full z-10 relative">
          <TerminalSquare className="w-16 h-16 text-primary mb-8" />
          <h1 className="text-6xl font-bold tracking-tighter mb-4 text-white">ChatNet</h1>
          <p className="text-xl text-muted-foreground mb-8">
            Terminal interface initialized.<br />
            Anonymity protocol engaged.<br />
            Awaiting connection...
          </p>
          <div className="font-mono text-sm text-primary opacity-50 flex flex-col gap-1">
            <span>{'>'} SYSTEM_BOOT_SEQUENCE_STARTED</span>
            <span>{'>'} LOADING_ENCRYPTION_MODULES... OK</span>
            <span>{'>'} ESTABLISHING_SECURE_TUNNEL... OK</span>
            <span className="animate-pulse">{'>'} WAITING_FOR_USER_INPUT_</span>
          </div>
        </div>
      </div>

      {/* Forms right panel */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 relative">
        <div className="absolute top-8 right-8 flex gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          <span className="font-mono text-xs text-primary/70">OFFLINE</span>
        </div>

        <div className="max-w-xl w-full grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Login Form */}
          <div className="flex flex-col">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">Connect</h2>
              <p className="text-sm text-muted-foreground">Access existing session</p>
            </div>
            
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit((data) => loginMutation.mutate({ data }))} className="space-y-4">
                <FormField
                  control={loginForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground">Identifier</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="username" 
                          className="bg-card border-border focus-visible:ring-primary font-mono rounded-none" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={loginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground">Passphrase</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="••••••••" 
                          className="bg-card border-border focus-visible:ring-primary font-mono rounded-none" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button 
                  type="submit" 
                  className="w-full rounded-none font-mono tracking-wider"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? "CONNECTING..." : "INITIALIZE_SESSION"}
                </Button>
              </form>
            </Form>
          </div>

          {/* Vertical Divider */}
          <div className="hidden md:flex flex-col items-center justify-center relative">
            <div className="h-full w-px bg-border"></div>
            <div className="absolute bg-background py-4 text-xs font-mono text-muted-foreground">OR</div>
          </div>

          {/* Register Form */}
          <div className="flex flex-col">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">Initialize</h2>
              <p className="text-sm text-muted-foreground">Generate new identity</p>
            </div>
            
            <Form {...registerForm}>
              <form onSubmit={registerForm.handleSubmit((data) => registerMutation.mutate({ data }))} className="space-y-4">
                <FormField
                  control={registerForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground">New Identifier</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="username" 
                          className="bg-card border-border focus-visible:ring-primary font-mono rounded-none" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={registerForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground">New Passphrase</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="••••••••" 
                          className="bg-card border-border focus-visible:ring-primary font-mono rounded-none" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button 
                  type="submit" 
                  variant="outline"
                  className="w-full rounded-none font-mono tracking-wider border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                  disabled={registerMutation.isPending}
                >
                  {registerMutation.isPending ? "GENERATING..." : "GENERATE_IDENTITY"}
                </Button>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
