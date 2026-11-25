import { useQueryClient } from '@tanstack/react-query';

/** After any write, refresh studio views and the public pages that may show it. */
export function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    for (const key of ['studio', 'admin', 'posts', 'post', 'comments', 'author', 'me']) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };
}
