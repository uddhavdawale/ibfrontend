const isMobileDevice = () => (
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);

export const openWhatsAppChat = (phone, message) => {
  const digits = String(phone || '').replace(/\D/g, '');
  const whatsappPhone = digits.length === 10 ? `91${digits}` : digits;
  const encodedMessage = encodeURIComponent(message);
  const webUrl = `https://wa.me/${whatsappPhone}?text=${encodedMessage}`;

  if (!isMobileDevice()) {
    window.open(webUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  const appUrl = `whatsapp://send?phone=${whatsappPhone}&text=${encodedMessage}`;
  const appWindow = window.open(appUrl, '_blank');

  if (!appWindow) {
    window.open(webUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  let fallbackTimer;
  const handleVisibilityChange = () => {
    if (document.hidden) {
      window.clearTimeout(fallbackTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  fallbackTimer = window.setTimeout(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (!document.hidden) appWindow.location.href = webUrl;
  }, 1500);
};

export const supportsPdfSharing = () => {
  if (
    !isMobileDevice()
    || typeof navigator.share !== 'function'
    || typeof navigator.canShare !== 'function'
    || typeof File === 'undefined'
  ) {
    return false;
  }

  const testFile = new File([''], 'invoice.pdf', { type: 'application/pdf' });
  return navigator.canShare({ files: [testFile] });
};

export const sharePdfFile = (file, title, text) => navigator.share({
  files: [file],
  title,
  text,
});
