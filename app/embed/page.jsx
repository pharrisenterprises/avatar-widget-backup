// app/embed/page.jsx
'use client';

import { Suspense } from 'react';
import FloatingAvatarWidget from '../components/FloatingAvatarWidget';

export default function EmbedPage() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
      <FloatingAvatarWidget
        defaultOpen={true}
        defaultShowChat={false}
        showLauncher={false}
        quality="low"
      />
    </Suspense>
  );
}
