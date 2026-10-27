import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Simulicity IA — Urban simulation workspace',
  description:
    'An extensible urban simulation research workspace. Explore real geography and prepare reproducible scenarios.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
