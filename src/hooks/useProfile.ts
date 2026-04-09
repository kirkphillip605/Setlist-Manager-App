import { useAuth } from '@/context/AuthContext';

// With BetterAuth, the profile is derived directly from the session user.
// This hook provides a react-query-compatible interface for backwards compat.

export const useProfile = () => {
  const { profile, loading } = useAuth();
  return {
    data:       profile,
    isLoading:  loading,
    isError:    false,
    refetch:    () => {},
  };
};
