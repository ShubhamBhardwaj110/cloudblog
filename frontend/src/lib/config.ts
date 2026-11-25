export interface AppConfig {
  apiUrl: string;
  region: string;
  userPoolId: string;
  clientId: string;
  cognitoDomain: string;
  siteTitle: string;
  siteTagline: string;
}

let current: AppConfig | undefined;

/**
 * Runtime config is fetched from /config.json (written by the deploy pipeline from
 * Terraform outputs), so one build artifact works in any environment.
 */
export async function loadConfig(): Promise<AppConfig> {
  const res = await fetch('/config.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Missing /config.json. Run scripts/write-config.sh (see README).');
  current = (await res.json()) as AppConfig;
  return current;
}

export function config(): AppConfig {
  if (!current) throw new Error('config() called before loadConfig()');
  return current;
}
