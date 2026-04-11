import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'FastDevBuilds Admin',
  description: 'Private admin panel for FastDevBuilds',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className={`${geist.variable} h-full`}>
      <body className="h-full bg-bg text-text font-sans">{children}</body>
    </html>
  )
}
