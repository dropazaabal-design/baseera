// Uploaded logos/avatars are downscaled and stored as data URLs: small enough
// for localStorage, and same-origin so the exporter never hits CORS.
export function readImageFile(file, maxSize = 480) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const longest = Math.max(img.naturalWidth, img.naturalHeight) || maxSize;
      // SVGs have no real pixel size; rasterise them at full maxSize.
      const scale = file.type === 'image/svg+xml' ? maxSize / longest : Math.min(1, maxSize / longest);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round((img.naturalWidth || maxSize) * scale);
      canvas.height = Math.round((img.naturalHeight || maxSize) * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/webp', 0.92));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('تعذّرت قراءة الصورة'));
    };
    img.src = url;
  });
}
