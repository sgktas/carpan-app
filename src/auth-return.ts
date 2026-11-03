function hasUnsafeCharacters(value: string): boolean {
  return value.includes('\\') || Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

export function walletSetupReturn(value:unknown,requested:boolean):string{
  const next=normalizeLoginReturn(value);
  return requested&&!next.startsWith('/wallet/setup')?'/wallet/setup?continue='+encodeURIComponent(next):next;
}

/** Preserve an internal product destination across wallet, OAuth and email sign-in. */
export function normalizeLoginReturn(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') ||
      value.startsWith('//') || hasUnsafeCharacters(value)) return '/';
  try {
    const url = new URL(value, 'https://carpan.invalid');
    const decodedPath = decodeURIComponent(url.pathname);
    if (url.origin !== 'https://carpan.invalid' || decodedPath.startsWith('//') ||
        hasUnsafeCharacters(decodedPath) ||
        /^\/(?:login|register)(?:\/|$)/i.test(decodedPath) ||
        /^\/api(?:\/|$)/i.test(decodedPath) ||
        new URLSearchParams(url.hash.slice(1)).has('email_token')) return '/';
    // Authentication control parameters must not reopen sign-in on arrival.
    for (const key of ['login', 'next', 'error']) url.searchParams.delete(key);
    return url.pathname + url.search + url.hash;
  } catch {
    return '/';
  }
}
