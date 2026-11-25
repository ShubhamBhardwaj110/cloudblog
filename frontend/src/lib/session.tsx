import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WebStorageStateStore } from 'oidc-client-ts';
import { type ReactNode, useMemo } from 'react';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { adminApi, userApi } from './api';
import { config } from './config';

export function SessionProvider({ children }: { children: ReactNode }) {
  const cfg = config();
  const oidc = useMemo(
    () => ({
      authority: `https://cognito-idp.${cfg.region}.amazonaws.com/${cfg.userPoolId}`,
      client_id: cfg.clientId,
      redirect_uri: `${window.location.origin}/auth/callback`,
      post_logout_redirect_uri: `${window.location.origin}/`,
      response_type: 'code', // Authorization Code + PKCE: no client secret in the browser
      scope: 'openid email profile',
      automaticSilentRenew: true,
      userStore: new WebStorageStateStore({ store: window.localStorage }),
    }),
    [cfg],
  );
  return <AuthProvider {...oidc}>{children}</AuthProvider>;
}

/**
 * One hook for everything about the current visitor: sign-in state, their
 * profile (`me`), role, and API clients bound to their ID token.
 */
export function useSession() {
  const auth = useAuth();
  const qc = useQueryClient();
  // The API authorizer validates the Cognito *ID* token (it carries email + groups).
  const token = auth.user && !auth.user.expired ? auth.user.id_token : undefined;
  const api = useMemo(() => (token ? userApi(token) : undefined), [token]);
  const admin = useMemo(() => (token ? adminApi(token) : undefined), [token]);

  const meQuery = useQuery({
    queryKey: ['me', auth.user?.profile.sub],
    queryFn: () => api!.me(),
    enabled: !!api,
    staleTime: 5 * 60_000,
  });

  const signIn = (returnTo = window.location.pathname + window.location.search) =>
    auth.signinRedirect({ state: { returnTo } });

  const signOut = async () => {
    const { cognitoDomain, clientId } = config();
    await auth.removeUser();
    qc.clear();
    // Cognito has no standard end_session endpoint, so use its /logout URL.
    window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(`${window.location.origin}/`)}`;
  };

  return {
    auth,
    isLoading: auth.isLoading || (!!api && meQuery.isPending),
    isSignedIn: !!token,
    me: meQuery.data,
    meError: meQuery.error,
    isAdmin: !!meQuery.data?.isAdmin,
    api,
    admin,
    signIn,
    signOut,
  };
}
