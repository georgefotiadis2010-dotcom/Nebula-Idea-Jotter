const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function parseHexColor(raw: string): string | null {
  const trimmed = raw.trim();
  if (!HEX_REGEX.test(trimmed)) return null;

  const digits = trimmed.slice(1);
  if (digits.length === 3 || digits.length === 4) {
    const expanded = digits
      .split('')
      .map((c) => c + c)
      .join('');
    return `#${expanded.toUpperCase()}`;
  }
  return `#${digits.toUpperCase()}`;
}

/** WCAG relative luminance fallback for contrast-aware text on hex swatches */
export function getContrastFallbackColor(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  return luminance > 0.179 ? '#0B0D10' : '#F8FAFC';
}

export function parseUrlPayload(raw: string): { url: string; domain: string; title: string } | null {
  const trimmed = raw.trim();
  if (/\s/.test(trimmed)) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;

  try {
    const parsed = new URL(trimmed);
    const domain = parsed.hostname.replace(/^www\./i, '');
    const pathPart = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
    const title = pathPart ? `${domain}${pathPart}` : domain;
    return {
      url: parsed.toString(),
      domain,
      title: title.length > 56 ? `${title.slice(0, 53)}...` : title,
    };
  } catch {
    return null;
  }
}

export function looksLikeCode(text: string): boolean {
  const lines = text.split('\n');
  if (lines.length >= 2 && /^( {2,}|\t)/m.test(text)) return true;
  if (/[{};]\s*$/m.test(text)) return true;
  if (/\b(const|let|var|function|return|import|export|class|interface|type|def|async|await)\b/.test(text)) return true;
  if (/(=>|===|!==|::|<\/[a-zA-Z]+>)/.test(text)) return true;
  return false;
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as Data URL'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}

export function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 320, height: img.naturalHeight || 220 });
    };
    img.onerror = () => resolve({ width: 320, height: 220 });
    img.src = dataUrl;
  });
}

function legacyCopy(text: string): boolean {
  const field = Object.assign(document.createElement('textarea'), { value: text });
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } finally {
    field.remove();
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyCopy(text);
  }
}
