"use client"

import { BackgroundPaths } from "@/components/ui/background-paths"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { AccountCreation } from "@/components/account-creation"
import { WalletAddressForm } from "@/components/wallet-address-form"
import { useAuth } from "@/contexts/auth-context"
import { getUserFromDb } from "@/lib/db"
import { Card } from "@/components/ui/card"
import { motion } from "framer-motion"

type AppState = "main" | "checking-user" | "wallet-form" | "account-creation"

export default function LandingPage() {
  const router = useRouter()
  const [appState, setAppState] = useState<AppState>("main")
  const [walletAddress, setWalletAddress] = useState("")
  const [isCheckingUser, setIsCheckingUser] = useState(false)
  const { isAuthenticated, user } = useAuth()

  // This redirect is now handled by the user existence check below

  // Check if user exists when they become authenticated
  useEffect(() => {
    const checkUserExists = async () => {
      if (isAuthenticated && user?.email) {
        console.log('User authenticated, checking if exists in database...');
        setIsCheckingUser(true);
        setAppState("checking-user");
        
        try {
          console.log('Checking if user exists:', user.email);
          const result = await getUserFromDb(user.email);
          
          console.log('Database response:', result);
          
          // Check if user exists in the response
          console.log('Checking response conditions:');
          console.log('- result.success:', result.success);
          console.log('- result.data:', result.data);
          console.log('- result.data.user:', result.data?.user);
          console.log('- result.data.error:', result.data?.error);
          
          if (result.success && result.data && result.data.user) {
            console.log('✅ User already exists in database:', result.data.user);
            // User exists, redirect to home
            router.push('/home');
            return;
          } else if (!result.success && result.data && result.data.error === "not found") {
            console.log('❌ User not found in database (404), proceeding to wallet form');
            // User doesn't exist, go to wallet form
            setAppState("wallet-form");
          } else if (result.success && result.data && result.data.error === "not found") {
            console.log('❌ User not found in database (JSON error), proceeding to wallet form');
            // User doesn't exist, go to wallet form
            setAppState("wallet-form");
          } else {
            console.log('❓ Unexpected response format, proceeding to wallet form');
            console.log('Full result:', JSON.stringify(result, null, 2));
            // Unexpected response, assume new user
            setAppState("wallet-form");
          }
        } catch (error) {
          console.error('Error checking user existence:', error);
          // On error, proceed to wallet form (assume new user)
          setAppState("wallet-form");
        } finally {
          setIsCheckingUser(false);
        }
      }
    };

    checkUserExists();
  }, [isAuthenticated, user?.email, router]);

  const handleLoginClick = () => {
    // This will be handled by the useEffect above
  }

  const handleAddressSubmit = (address: string) => {
    setWalletAddress(address)
    setAppState("account-creation")
  }

  const handleBackToMain = () => {
    setAppState("main")
    setWalletAddress("")
  }

  const handleBackToForm = () => {
    setAppState("wallet-form")
  }

  if (appState === "checking-user") {
    return (
      <div className="relative min-h-screen">
        {/* Background Paths */}
        <div className="absolute inset-0">
          <BackgroundPaths title="" />
        </div>
        
        {/* Content */}
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <Card className="p-8 max-w-md w-full mx-4 text-center bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm">
            <div className="space-y-6">
              <div className="text-center">
                <motion.h2 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-2xl font-bold text-gray-900 dark:text-white mb-2"
                >
                  Checking Account
                </motion.h2>
                <motion.p 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-sm text-gray-600 dark:text-gray-300"
                >
                  Verifying if account already exists...
                </motion.p>
              </div>
              
              <div className="flex justify-center">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (appState === "wallet-form") {
    return (
      <WalletAddressForm 
        onAddressSubmit={handleAddressSubmit}
        onBack={handleBackToMain}
      />
    )
  }

  if (appState === "account-creation") {
    return (
      <AccountCreation 
        avalancheDestination={walletAddress}
        onBack={handleBackToForm}
      />
    )
  }

  return (
    <div className="relative">
      {/* Website Logo in Left Corner */}
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
      
      {/* Navigation Buttons */}
      <div className="absolute top-4 right-20 z-20 flex gap-2">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => router.push("/home")}
          className="text-black dark:text-white hover:bg-black/10 dark:hover:bg-white/10"
        >
          Home
        </Button>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => router.push("/pay")}
          className="text-black dark:text-white hover:bg-black/10 dark:hover:bg-white/10"
        >
          Pay
        </Button>
      </div>
      
      {/* Theme Toggle */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      
      {/* Background Paths Component */}
      <BackgroundPaths 
        title="Stable Coin Settlement Layer" 
        onLoginClick={handleLoginClick}
      />
    </div>
  )
}
