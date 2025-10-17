import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';

// Load .env file if it exists (for testing)
dotenv.config({ path: path.join(process.cwd(), '.env') });

export interface BitbucketConfig {
  baseUrl: string;
  ATLASSIAN_USER_EMAIL: string;
  ATLASSIAN_API_TOKEN: string;
  authType: 'basic' | 'bearer';
  defaultDestinationBranch: string;
}

export function loadConfig(cwd: string = process.cwd()): BitbucketConfig {
  const fromEnv: BitbucketConfig | null = (() => {
    // Check if .env file exists and has the required values
    const envPath = path.join(cwd, '.env');
    if (fs.existsSync(envPath)) {
      // .env values take precedence in tests
      const envEmail = process.env.ATLASSIAN_USER_EMAIL;
      const envToken = process.env.ATLASSIAN_API_TOKEN;
      const envUrl = process.env.ATLASSIAN_SITE_URL;
      if (envEmail && envToken) {
        const baseUrl = envUrl === 'bitbucket' ? 'https://api.bitbucket.org/2.0' : (envUrl || 'https://api.bitbucket.org/2.0');
        const authType = baseUrl.includes('api.bitbucket.org') ? 'basic' : 'bearer';
        const defaultDestinationBranch = process.env.BITBUCKET_DEFAULT_DEST_BRANCH || 'main';
        return {
          baseUrl,
          ATLASSIAN_USER_EMAIL: envEmail,
          ATLASSIAN_API_TOKEN: envToken,
          authType,
          defaultDestinationBranch,
        };
      }
    }

    // Fall back to direct environment variables
    if (process.env.ATLASSIAN_API_TOKEN && process.env.ATLASSIAN_USER_EMAIL) {
      const baseUrl = process.env.ATLASSIAN_SITE_URL === 'bitbucket' ? 'https://api.bitbucket.org/2.0' : (process.env.ATLASSIAN_SITE_URL || 'https://api.bitbucket.org/2.0');
      const authType = baseUrl.includes('api.bitbucket.org') ? 'basic' : 'bearer';
      const defaultDestinationBranch = process.env.BITBUCKET_DEFAULT_DEST_BRANCH || 'main';
      return {
        baseUrl,
        ATLASSIAN_USER_EMAIL: process.env.ATLASSIAN_USER_EMAIL!,
        ATLASSIAN_API_TOKEN: process.env.ATLASSIAN_API_TOKEN!,
        authType,
        defaultDestinationBranch,
      };
    }
    return null;
  })();

  const configPaths = [
    path.join(cwd, 'mcp.config.json'),
    path.join(cwd, '.mcp.config.json'),
    path.join(cwd, '.bitbucket.mcp.json'),
  ];

  for (const p of configPaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as any;
        if (raw && raw.bitbucket && raw.bitbucket.environments) {
          const e = raw.bitbucket.environments;
          const baseUrl = e.ATLASSIAN_SITE_URL === 'bitbucket' ? 'https://api.bitbucket.org/2.0' : e.ATLASSIAN_SITE_URL;
          const authType = baseUrl.includes('api.bitbucket.org') ? 'basic' : 'bearer';
          const defaultDestinationBranch = e.BITBUCKET_DEFAULT_DEST_BRANCH || raw.bitbucket.defaultDestinationBranch || 'main';
          return {
            baseUrl,
            ATLASSIAN_USER_EMAIL: e.ATLASSIAN_USER_EMAIL,
            ATLASSIAN_API_TOKEN: e.ATLASSIAN_API_TOKEN,
            authType,
            defaultDestinationBranch,
          } as BitbucketConfig;
        }
      } catch (e) {
        // fallthrough to env
      }
    }
  }

  if (!fromEnv) {
    throw new Error(
      'Missing credentials. Provide env vars ATLASSIAN_USER_EMAIL and ATLASSIAN_API_TOKEN or mcp.config.json with bitbucket.environments.'
    );
  }

  return fromEnv;
}

export function basicAuthHeader(email: string, token: string): string {
  const b64 = Buffer.from(`${email}:${token}`).toString('base64');
  return `Basic ${b64}`;
}

export function bearerAuthHeader(token: string): string {
  return `Bearer ${token}`;
}

export function getAuthHeader(email: string, token: string, authType: 'basic' | 'bearer'): string {
  if (authType === 'bearer') {
    return bearerAuthHeader(token);
  } else {
    return basicAuthHeader(email, token);
  }
}
