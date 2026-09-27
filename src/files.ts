/** Files the browser's way: downloads out, file pickers in. */

/** Save a blob as a file via the browser's download. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Opens the system file picker; must be called from a user gesture. */
export function pickFiles(accept: string, multiple: boolean, onPick: (files: File[]) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = multiple;
  input.onchange = () => {
    const files = [...(input.files ?? [])];
    if (files.length) onPick(files);
  };
  input.click();
}
