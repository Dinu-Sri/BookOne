export async function toQrDataUrl(text: string): Promise<string | null> {
  if (!text) return null;
  try {
    const mod = await import('qrcode');
    const toDataURL = (mod.default?.toDataURL ?? mod.toDataURL) as (
      t: string,
      o: { margin: number; width: number; errorCorrectionLevel: string },
    ) => Promise<string>;
    return await toDataURL(text, { margin: 1, width: 128, errorCorrectionLevel: 'M' });
  } catch {
    return null;
  }
}
