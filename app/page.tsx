'use client';

import { useEffect, useState } from 'react';
import { LiveAccumulator } from '../components/live-accumulator';
import { GoonFxBot } from '../components/goonfx-bot';
import { normalizeAppConfig, type AccumulatorsAppConfig } from '../lib/app-config';

export default function AccumulatorPage() {
  const [config, setConfig] = useState<AccumulatorsAppConfig | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    fetch(`${base}/app-config.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setConfig(data ? normalizeAppConfig(data) : null);
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      });
    return () => { cancelled = true; };
  }, []);

  if (config === undefined) return <div className="min-h-dvh bg-background" />;
  return (
    <>
      <LiveAccumulator appConfig={config ?? undefined} />
      <GoonFxBot />
    </>
  );
}
