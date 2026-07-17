import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuthContext } from '@/hooks/use-auth-context';
import { Terminal } from 'lucide-react';

export default function IndexPage() {
  const { isAuthenticated, isLoading } = useAuthContext();
  const [_, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        setLocation('/chat');
      } else {
        setLocation('/auth');
      }
    }
  }, [isLoading, isAuthenticated, setLocation]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-primary font-mono">
      <Terminal className="w-12 h-12 mb-4 animate-pulse" />
      <p className="tracking-widest">{'>'} ROUTING_CONNECTION...</p>
    </div>
  );
}
