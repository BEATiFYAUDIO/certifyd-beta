import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Certifyd Beta',
  description: 'Certifyd technical beta management.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
