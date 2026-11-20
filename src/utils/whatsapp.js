const isMobileDevice = (targetWindow) => (
  /Android|iPhone|iPad|iPod/i.test(targetWindow.navigator.userAgent)
  || (targetWindow.navigator.platform === 'MacIntel' && targetWindow.navigator.maxTouchPoints > 1)
);

export const openWhatsAppChat = (phone, message, targetWindow = window) => {
  const digits = String(phone || '').replace(/\D/g, '');
  const whatsappPhone = digits.length === 10 ? `91${digits}` : digits;
  const encodedMessage = encodeURIComponent(message);
  const webUrl = `https://wa.me/${whatsappPhone}?text=${encodedMessage}`;

  if (!isMobileDevice(targetWindow)) {
    const chatWindow = targetWindow.open(webUrl, '_blank');
    if (chatWindow) chatWindow.opener = null;
    else targetWindow.location.href = webUrl;
    return;
  }

  const appUrl = `whatsapp://send?phone=${whatsappPhone}&text=${encodedMessage}`;
  const appWindow = targetWindow.open(appUrl, '_blank');
  const fallbackWindow = appWindow || targetWindow;

  if (!appWindow) targetWindow.location.href = appUrl;

  let fallbackTimer;
  const handleVisibilityChange = () => {
    if (targetWindow.document.hidden) {
      targetWindow.clearTimeout(fallbackTimer);
      targetWindow.document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };

  targetWindow.document.addEventListener('visibilitychange', handleVisibilityChange);
  fallbackTimer = targetWindow.setTimeout(() => {
    targetWindow.document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (!targetWindow.document.hidden) fallbackWindow.location.href = webUrl;
  }, 1500);
};
