import { useState, useEffect } from 'react';

export const useConfig = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/config.json')
      .then(res => res.json())
      .then(setConfig)
      .catch(err => {
        console.warn('Config not found, using defaults');
        setConfig({
          shop: { name: 'Your Shop Name', gstin: '', address: '', phone: '' },
          features: { gst_enabled: true, offline_mode: true }
        });
      })
      .finally(() => setLoading(false));
  }, []);

  return { config, loading };
};