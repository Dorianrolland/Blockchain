export interface ScannerPayload {
  tokenId: string;
  deadline?: string;
  signature?: string;
}

export function parseScannerPayload(rawValue: string): ScannerPayload | null {
  const trimmed = rawValue.trim();
  if (!trimmed.length) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.tokenId) {
      return {
        tokenId: String(parsed.tokenId),
        deadline: parsed.deadline ? String(parsed.deadline) : undefined,
        signature: parsed.signature ? String(parsed.signature) : undefined,
      };
    }
  } catch (e) {
    // Ignorer si ce n'est pas du JSON
  }

  if (/^\d+$/.test(trimmed)) return { tokenId: trimmed };
  
  const fromQuery = trimmed.match(/[?&]tokenId=(\d+)/i);
  if (fromQuery?.[1]) return { tokenId: fromQuery[1] };
  
  const fromPath = trimmed.match(/\/(\d+)(?:\D*)$/);
  if (fromPath?.[1]) return { tokenId: fromPath[1] };
  
  const firstDigits = trimmed.match(/(\d{1,})/);
  if (firstDigits?.[1]) return { tokenId: firstDigits[1] };

  return null;
}

export function extractTokenId(rawValue: string): string | null {
  const payload = parseScannerPayload(rawValue);
  return payload ? payload.tokenId : null;
}
