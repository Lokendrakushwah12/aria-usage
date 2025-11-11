'use server';

import {
  type AccessibilityCheckState,
  normalizeUrl,
} from '@/lib/accessibility-types';

const API_PATH = '/api/check';

export async function checkAccessibilityAction(
  _prevState: AccessibilityCheckState | undefined,
  formData: FormData
): Promise<AccessibilityCheckState> {
  const rawUrl = (formData.get('url') || '').toString().trim();

  if (!rawUrl) {
    return {
      ok: false,
      summary: 'Please provide a URL to check.',
      errors: ['Missing URL'],
    };
  }

  const normalizedUrl = normalizeUrl(rawUrl);
  const apiUrl = new URL(API_PATH, resolveBaseUrl());

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: normalizedUrl }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const message = `Accessibility service returned ${response.status}`;
      return {
        ok: false,
        summary: `Unable to complete accessibility check for ${normalizedUrl}`,
        url: normalizedUrl,
        errors: [message],
      };
    }

    const payload = (await response.json()) as AccessibilityCheckState;
    return payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      ok: false,
      summary: `Unable to complete accessibility check for ${normalizedUrl}`,
      url: normalizedUrl,
      errors: [message],
    };
  }
}

function resolveBaseUrl(): string {
  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return 'https://localhost';
}
