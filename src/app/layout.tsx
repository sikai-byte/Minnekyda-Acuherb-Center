import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const sans = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Minnekyda Acuherb Center',
  description: 'Patient records, intake, and clinical notes for Minnekyda Acuherb Center',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
