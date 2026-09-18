export async function toQrDataUrl(text: string): Promise<string | null> {
  if (!text) return null;
  try {
    const QRCode = (await import('qrcode')).default;
    return await QRCode.toDataURL(text, { margin: 1, width: 128, errorCorrectionLevel: 'M' });
  } catch {
    return null;
  }
}
