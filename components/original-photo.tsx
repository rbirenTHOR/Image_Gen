"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function OriginalPhoto({ src, alt, className }: {src:string; alt:string; className?:string}) {
  const [status, setStatus] = useState('loading');
  const [revision, setRevision] = useState(0);
  return <div className="original-photo">
    {status !== 'ready' && <div role="status" className="original-status">
      <p>{status === 'error' ? 'The original could not load.' : 'Loading full-resolution original…'}</p>
      {status === 'error' && <Button variant="outline" onClick={() => { setStatus('loading'); setRevision(n => n + 1); }}>Retry original</Button>}
    </div>}
    <img src={src + (revision ? '?retry=' + revision : '')} alt={alt} className={className}
      onLoad={() => setStatus('ready')} onError={() => setStatus('error')} />
  </div>;
}
