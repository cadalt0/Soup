"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { BackgroundPaths } from "@/components/ui/background-paths";
import { useAuth } from "@/contexts/auth-context";

interface WalletAddressFormProps {
  onAddressSubmit: (address: string) => void;
  onBack: () => void;
}

export function WalletAddressForm({ onAddressSubmit, onBack }: WalletAddressFormProps) {
  const [address, setAddress] = useState("");
  const [isValid, setIsValid] = useState(false);
  const { user } = useAuth();

  const validateAddress = (addr: string) => {
    // Basic Ethereum address validation (0x followed by 40 hex characters)
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    return ethAddressRegex.test(addr);
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAddress(value);
    setIsValid(validateAddress(value));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) {
      onAddressSubmit(address);
    }
  };

  return (
    <div className="relative min-h-screen">
      {/* Background Paths */}
      <div className="absolute inset-0">
        <BackgroundPaths title="Enter Wallet Address" />
      </div>
      
      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center">
        <Card className="p-8 max-w-md w-full mx-4 text-center bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Enter Destination Wallet
              </h2>
              {user && (
                <p className="text-sm text-indigo-600 dark:text-indigo-400 mb-2">
                  Welcome, {user.email}
                </p>
              )}
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                Please enter your Avalanche wallet address where funds will be sent
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="text-left">
                <Label htmlFor="wallet-address" className="text-gray-700 dark:text-gray-300">
                  Avalanche Wallet Address
                </Label>
                <Input
                  id="wallet-address"
                  type="text"
                  placeholder="0x1234567890123456789012345678901234567890"
                  value={address}
                  onChange={handleAddressChange}
                  className={`mt-1 ${
                    address && !isValid 
                      ? 'border-red-500 focus:border-red-500' 
                      : isValid 
                        ? 'border-green-500 focus:border-green-500'
                        : ''
                  }`}
                />
                {address && !isValid && (
                  <p className="text-red-500 text-xs mt-1">
                    Please enter a valid Ethereum address (0x followed by 40 characters)
                  </p>
                )}
                {isValid && (
                  <p className="text-green-500 text-xs mt-1">
                    ✓ Valid address format
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onBack}
                  className="flex-1 hover:bg-black/10 dark:hover:bg-white/10"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={!isValid}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Account
                </Button>
              </div>
            </form>
          </motion.div>
        </Card>
      </div>
    </div>
  );
}
