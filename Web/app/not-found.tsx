"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { BackgroundPaths } from "@/components/ui/background-paths"
import { ThemeToggle } from "@/components/theme-toggle"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Home, ArrowLeft } from "lucide-react"

export default function NotFound() {
  const router = useRouter()

  return (
    <div className="relative min-h-screen">
      {/* Background Paths */}
      <div className="absolute inset-0">
        <BackgroundPaths title="" />
      </div>
      
      {/* Logo in Left Corner */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-3">
        <img 
          src="/logosoup.png" 
          alt="Soup Logo" 
          width={32} 
          height={32}
          className="w-8 h-8"
        />
        <h1 className="text-2xl font-bold text-black dark:text-white">Soup</h1>
      </div>
      
      {/* Theme Toggle */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      
      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <Card className="p-8 max-w-md w-full text-center bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            {/* 404 Number */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-8xl font-bold text-indigo-600 dark:text-indigo-400"
            >
              404
            </motion.div>
            
            {/* Error Message */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="space-y-2"
            >
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Page Not Found
              </h2>
              <p className="text-gray-600 dark:text-gray-300">
                The page you're looking for doesn't exist or has been moved.
              </p>
            </motion.div>
            
            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="flex flex-col sm:flex-row gap-3 justify-center"
            >
              <Button
                onClick={() => router.push("/")}
                className="flex items-center gap-2"
              >
                <Home className="w-4 h-4" />
                Go Home
              </Button>
              <Button
                onClick={() => router.back()}
                variant="outline"
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Go Back
              </Button>
            </motion.div>
            
            {/* Help Text */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.5 }}
              className="pt-4 border-t border-gray-200 dark:border-gray-700"
            >
              <p className="text-sm text-gray-500 dark:text-gray-400">
                If you believe this is an error, please contact support.
              </p>
            </motion.div>
          </motion.div>
        </Card>
      </div>
    </div>
  )
}
