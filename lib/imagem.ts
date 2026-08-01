// Só roda no navegador (createImageBitmap, canvas) — compartilhado entre o
// report de turno real e o playground de admin, que precisam do mesmo
// pré-processamento antes de mandar pro /api/ocr.

/** Reduz para 1568px no lado maior — o statement continua legível e custa metade. */
export async function reduzirImagem(arquivo: Blob): Promise<{ blob: Blob; base64: string }> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), 'image/jpeg', 0.9));
  const base64 = await new Promise<string>((ok) => {
    const leitor = new FileReader();
    leitor.onload = () => ok((leitor.result as string).split(',')[1]);
    leitor.readAsDataURL(blob);
  });

  return { blob, base64 };
}
