import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authClient } from '@/lib/authClient';
import { Loader2 } from 'lucide-react';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending) {
      if (session?.user) {
        const user = session.user;
        const hasName = (user as any).firstName && (user as any).lastName;
        navigate(hasName ? '/' : '/onboarding', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    }
  }, [session, isPending, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <h2 className="text-xl font-semibold animate-pulse">Logging you in...</h2>
    </div>
  );
};

export default AuthCallback;
