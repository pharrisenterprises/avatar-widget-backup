export const dynamic = 'force-dynamic';
export const revalidate = 0;

import './globals.css'; // keep if you have it
import FloatingAvatarWidget from './components/FloatingAvatarWidget';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* D-ID–style floating assistant available everywhere */}
        <FloatingAvatarWidget defaultOpen={false} defaultShowChat={true} quality="low" />
      </body>
    </html>
  );
}
