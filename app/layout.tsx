import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'FastDevBuilds Admin',
  description: 'Private admin panel for FastDevBuilds',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
