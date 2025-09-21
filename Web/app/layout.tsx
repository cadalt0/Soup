import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/components/theme-provider"
import { GoogleOAuthProvider } from "@/components/google-oauth-provider"
import { AuthProvider } from "@/contexts/auth-context"
import { Suspense } from "react"
import "./globals.css"

export const metadata: Metadata = {
  title: "Soup - Stable Coin Settlement Layer",
  description: "Settle stable coins from Base, Arbitrum to Avalanche",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script src="https://accounts.google.com/gsi/client" async defer></script>
      </head>
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <GoogleOAuthProvider>
          <AuthProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <Suspense fallback={null}>
                {children}
                <Toaster />
              </Suspense>
              <Analytics />
            </ThemeProvider>
          </AuthProvider>
        </GoogleOAuthProvider>
      </body>
    </html>
  )
}
