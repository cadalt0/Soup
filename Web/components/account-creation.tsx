"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BackgroundPaths } from "@/components/ui/background-paths";
import { createWalletAll } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { saveUserToDb, UserData, getUserFromDb } from "@/lib/db";
import { useRouter } from "next/navigation";

type AccountStep = "avalanche" | "base" | "arbitrum" | null;

interface AccountCreationProps {
  avalancheDestination: string;
  onBack: () => void;
}

export function AccountCreation({ avalancheDestination, onBack }: AccountCreationProps) {
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [accountStep, setAccountStep] = useState<AccountStep>(null);
  const [walletAddresses, setWalletAddresses] = useState<{
    avalanche?: string;
    base?: string;
    arbitrum?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const handleCreateAccount = async () => {
    setIsCreatingAccount(true);
    setError(null);

    try {
      console.log('Using provided Avalanche destination:', avalancheDestination);

      // Show Avalanche first
      setAccountStep("avalanche");
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Call API to create wallets
      const result = await createWalletAll({ avalancheDestination });
      
      if (result.success && result.data) {
        // Map API response to our state structure
        const mappedAddresses = {
          avalanche: result.data.avalancheAddress,
          base: result.data.baseAddress,
          arbitrum: result.data.arbitrumAddress,
        };
        setWalletAddresses(mappedAddresses);
        console.log('Wallet creation successful:', mappedAddresses);
      } else {
        throw new Error(result.error || 'Failed to create wallets');
      }

      // Show Base
      setAccountStep("base");
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Show Arbitrum
      setAccountStep("arbitrum");
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Save user data to database
      if (user) {
        console.log('API Response data:', result.data);
        
        const userData: UserData = {
          email: user.email,
          smartwallets: {
            arbitrum: walletAddresses.arbitrum || '',
            base: walletAddresses.base || '',
            avalanche: walletAddresses.avalanche || avalancheDestination,
          },
          account: true,
          chains: "arbitrum,base,avalanche",
          destinedAddress: avalancheDestination,
        };
        
        console.log('Mapped user data:', userData);

        console.log('Saving user to database:', userData);
        const dbResult = await saveUserToDb(userData);
        
        if (dbResult.success) {
          console.log('User successfully saved to database');
        } else {
          console.error('Failed to save user to database:', dbResult.error);
          // Still redirect even if DB save fails
        }
      }

      // Complete - redirect to home
      window.location.href = "/home";
    } catch (err) {
      console.error('Error creating account:', err);
      setError(err instanceof Error ? err.message : 'Failed to create account');
      
      // Try to save user data even if wallet creation failed
      if (user) {
        const userData: UserData = {
          email: user.email,
          smartwallets: {
            arbitrum: '',
            base: '',
            avalanche: '',
          },
          account: false,
          chains: "arbitrum,base,avalanche",
          destinedAddress: avalancheDestination,
        };

        console.log('Saving user to database (with error):', userData);
        const dbResult = await saveUserToDb(userData);
        
        if (dbResult.success) {
          console.log('User saved to database despite error');
        } else {
          console.error('Failed to save user to database:', dbResult.error);
        }
      }
      
      // Still redirect after showing error
      setTimeout(() => {
        window.location.href = "/home";
      }, 2000);
    }
  };

  // Auto-start account creation when component mounts
  useEffect(() => {
    handleCreateAccount();
  }, []);

  if (isCreatingAccount) {
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
                  Creating Account
                </motion.h2>
                {user && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-indigo-500/10 to-purple-500/10 dark:from-indigo-400/20 dark:to-purple-400/20 border border-indigo-200/20 dark:border-indigo-400/20 backdrop-blur-sm"
                  >
                    <div className="w-2 h-2 bg-indigo-500 dark:bg-indigo-400 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                      {user.email}
                    </span>
                  </motion.div>
                )}
              </div>

              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-sm text-gray-600 dark:text-gray-300"
              >
                This process may take a few minutes. Please be patient.
              </motion.p>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg"
                >
                  <p className="text-red-700 dark:text-red-300 text-sm">
                    Error: {error}
                  </p>
                </motion.div>
              )}

              {accountStep === "avalanche" && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                  className="space-y-4"
                >
                  <div className="w-16 h-16 mx-auto bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                    <img 
                      src="https://raw.githubusercontent.com/ErikThiart/cryptocurrency-icons/master/16/avalanche.png" 
                      alt="Avalanche" 
                      className="w-8 h-8"
                    />
                  </div>
                  <p className="text-gray-600 dark:text-gray-300">Creating Avalanche account...</p>
                </motion.div>
              )}

              {accountStep === "base" && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                  className="space-y-4"
                >
                  <div className="w-16 h-16 mx-auto bg-blue-600 rounded-full flex items-center justify-center animate-pulse">
                    <img 
                      src="https://avatars.githubusercontent.com/u/108554348?s=280&v=4" 
                      alt="Base" 
                      className="w-8 h-8 rounded-full"
                    />
                  </div>
                  <p className="text-gray-600 dark:text-gray-300">Setting up Base integration...</p>
                </motion.div>
              )}

              {accountStep === "arbitrum" && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                  className="space-y-4"
                >
                  <div className="w-16 h-16 mx-auto bg-blue-400 rounded-full flex items-center justify-center animate-pulse">
                    <img 
                      src="https://cdn3d.iconscout.com/3d/premium/thumb/arbitrum-arb-3d-icon-png-download-11757502.png" 
                      alt="Arbitrum" 
                      className="w-8 h-8"
                    />
                  </div>
                  <p className="text-gray-600 dark:text-gray-300">Configuring Arbitrum connection...</p>
                </motion.div>
              )}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return null;
}
