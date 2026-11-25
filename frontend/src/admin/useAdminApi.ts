import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from 'react-oidc-context';
import { adminApi } from '../lib/api';

export function useAdminApi() {
  const auth = useAuth();
  const token = auth.user?.access_token ?? '';
  return useMemo(() => adminApi(token), [token]);
}

/** After any write, refresh both admin views and the public listing. */
export function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['admin'] });
    void qc.invalidateQueries({ queryKey: ['posts'] });
    void qc.invalidateQueries({ queryKey: ['post'] });
    void qc.invalidateQueries({ queryKey: ['comments'] });
  };
}
