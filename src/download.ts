/**
 * Save a blob as a file: through a Save dialog in the Mac app, or as a download on
 * the website. Resolves to whether it was saved (the dialog can be cancelled).
 */
export async function download(blob: Blob, filename: string): Promise<boolean> {
  if (__NATIVE_APP__) return (await import('./native')).saveFile(blob, filename);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
