export function generateQRToken(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

export function generatePIN(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function encodeSessionData(sessionId: string, qrToken: string, expiresAt: string): string {
  const data = {
    sessionId,
    qrToken,
    expiresAt,
  };
  return btoa(JSON.stringify(data));
}

export function decodeSessionData(encodedData: string): {
  sessionId: string;
  qrToken: string;
  expiresAt: string;
} | null {
  try {
    const decoded = atob(encodedData);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function isSessionExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}
