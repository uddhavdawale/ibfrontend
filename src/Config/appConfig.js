export const APP_CONFIG = {
  appName: import.meta.env.VITE_APP_NAME || 'GuruIBS',
  appTagline: 'CA + Retail Suite',
  footerYear: new Date().getFullYear(),
};

export const APP_NAME = APP_CONFIG.appName;
