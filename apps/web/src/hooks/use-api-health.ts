'use client';
import { useEffect, useState } from 'react';
import { healthSchema } from '@simulicity/shared';

export function useApiHealth() {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>(
    'checking',
  );
  useEffect(() => {
    const controller = new AbortController();
    const check = async () => {
      try {
        const response = await fetch('/api/health', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('API unavailable');
        healthSchema.parse(await response.json());
        if (!controller.signal.aborted) setStatus('online');
      } catch {
        if (!controller.signal.aborted) setStatus('offline');
      }
    };
    void check();
    const timer = setInterval(() => void check(), 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  return status;
}
