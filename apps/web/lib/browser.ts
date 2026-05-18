export function isSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/Chrom(e|ium)|CriOS|FxiOS|Edg/i.test(ua);
}
