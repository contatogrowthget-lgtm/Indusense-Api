import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createPublicKey, verify as verifySig, JsonWebKey } from 'crypto';

export type SocialProfile = { email: string; nome?: string; provedor: 'google' | 'apple' };

const lista = (v?: string) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/**
 * Valida o idToken do Google pelo endpoint oficial tokeninfo.
 * GOOGLE_CLIENT_IDS = IDs de cliente aceitos (iOS, Android/web), separados por vírgula.
 */
export async function verifyGoogle(idToken: string, clientIds?: string): Promise<SocialProfile> {
  const aceitos = lista(clientIds);
  if (!aceitos.length) {
    throw new ServiceUnavailableException('Login com Google não configurado na API (GOOGLE_CLIENT_IDS).');
  }
  let data: Record<string, string>;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!res.ok) throw new UnauthorizedException('Token do Google inválido ou expirado.');
    data = (await res.json()) as Record<string, string>;
  } catch (e) {
    if (e instanceof UnauthorizedException) throw e;
    throw new ServiceUnavailableException('Não foi possível validar o login no Google. A API tem internet?');
  }
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(data.iss)) {
    throw new UnauthorizedException('Token do Google com emissor inválido.');
  }
  if (!aceitos.includes(data.aud)) {
    throw new UnauthorizedException('Este app não está autorizado (aud do Google não está em GOOGLE_CLIENT_IDS).');
  }
  if (!data.email || String(data.email_verified) !== 'true') {
    throw new UnauthorizedException('A conta Google não tem e-mail verificado.');
  }
  return { email: data.email.toLowerCase(), nome: data.name, provedor: 'google' };
}

let appleKeys: { keys: (JsonWebKey & { kid: string })[]; at: number } | null = null;

async function chavesApple() {
  if (appleKeys && Date.now() - appleKeys.at < 6 * 3600e3) return appleKeys.keys;
  try {
    const res = await fetch('https://appleid.apple.com/auth/keys');
    const json = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
    appleKeys = { keys: json.keys, at: Date.now() };
    return json.keys;
  } catch {
    throw new ServiceUnavailableException('Não foi possível validar o login na Apple. A API tem internet?');
  }
}

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * Valida o identityToken do "Sign in with Apple" com as chaves públicas da Apple.
 * APPLE_CLIENT_IDS = bundle IDs aceitos (ex.: com.suaempresa.indusense), separados por vírgula.
 */
export async function verifyApple(identityToken: string, clientIds?: string): Promise<SocialProfile> {
  const aceitos = lista(clientIds);
  if (!aceitos.length) {
    throw new ServiceUnavailableException('Login com Apple não configurado na API (APPLE_CLIENT_IDS).');
  }
  const partes = identityToken.split('.');
  if (partes.length !== 3) throw new UnauthorizedException('Token da Apple inválido.');
  const [h, p, s] = partes;
  const header = JSON.parse(b64url(h).toString('utf8')) as { kid: string; alg: string };
  const payload = JSON.parse(b64url(p).toString('utf8')) as Record<string, any>;

  const jwk = (await chavesApple()).find((k) => k.kid === header.kid);
  if (!jwk || header.alg !== 'RS256') throw new UnauthorizedException('Token da Apple com chave desconhecida.');
  const ok = verifySig('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), b64url(s));
  if (!ok) throw new UnauthorizedException('Assinatura do token da Apple inválida.');

  if (payload.iss !== 'https://appleid.apple.com') throw new UnauthorizedException('Token da Apple com emissor inválido.');
  if (!aceitos.includes(payload.aud)) {
    throw new UnauthorizedException('Este app não está autorizado (bundle ID não está em APPLE_CLIENT_IDS).');
  }
  if (Number(payload.exp) * 1000 < Date.now()) throw new UnauthorizedException('Token da Apple expirado.');
  if (!payload.email) {
    throw new UnauthorizedException('A Apple não enviou o e-mail. Remova o app em Ajustes > ID Apple e tente de novo.');
  }
  return { email: String(payload.email).toLowerCase(), provedor: 'apple' };
}
