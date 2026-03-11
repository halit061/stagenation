export function generateSecureToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  // SECURITY: Use crypto.getRandomValues instead of Math.random for unpredictable order numbers
  const array = new Uint8Array(4);
  crypto.getRandomValues(array);
  const random = Array.from(array, b => b.toString(36)).join('').substring(0, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

export function generateTicketNumber(orderNumber: string, index: number): string {
  return `${orderNumber}-T${(index + 1).toString().padStart(3, '0')}`;
}

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function encodeQRData(ticketId: string, token: string): string {
  return JSON.stringify({
    tid: ticketId,
    tok: token,
    v: 1
  });
}

export function decodeQRData(qrData: string): { tid: string; tok: string; v: number } | null {
  try {
    const data = JSON.parse(qrData);
    if (data.tid && data.tok && data.v) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}
