"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
import { Copy, LogOut, Plus, Wallet } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { BackgroundPaths } from "@/components/ui/background-paths"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuth } from "@/contexts/auth-context"
import { savePaymentRequestToDb, PaymentRequestData, getUserFromDb, getPaymentRequestsFromDb } from "@/lib/db"

interface PaymentRequest {
  id: string
  amount: string
  description: string
  paymentLink: string
  created: string
}

export default function HomePage() {
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const isSubmittingRef = useRef(false)
  const lastSubmissionTime = useRef(0)
  const isRefreshingRef = useRef(false)
  const clickCounter = useRef(0)
  const componentId = useRef(Math.random().toString(36).substr(2, 8))
  
  // Check if this is a duplicate component instance
  useEffect(() => {
    const existingInstance = localStorage.getItem('homepage-instance')
    if (existingInstance && existingInstance !== componentId.current) {
      console.warn(`[${componentId.current}] Duplicate HomePage instance detected! Existing: ${existingInstance}`)
    }
    localStorage.setItem('homepage-instance', componentId.current)
    
    return () => {
      localStorage.removeItem('homepage-instance')
    }
  }, [])
  const [userSmartWallets, setUserSmartWallets] = useState<{
    arbitrum: string;
    base: string;
    avalanche: string;
  } | null>(null)
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [walletData, setWalletData] = useState<any>(null)
  const [isLoadingPayments, setIsLoadingPayments] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const { user, logout, isAuthenticated } = useAuth()

  // Global submission tracking
  const globalSubmissionKey = `payment-submission-${user?.email || 'unknown'}`

  // Track component mounts
  useEffect(() => {
    console.log(`[${componentId.current}] HomePage component mounted`)
    return () => {
      console.log(`[${componentId.current}] HomePage component unmounted`)
      // Clean up global submission time
      localStorage.removeItem(globalSubmissionKey)
    }
  }, [globalSubmissionKey])

  // Redirect to login if not authenticated
  useEffect(() => {
    console.log('Home page auth check:', { isAuthenticated, user });
    if (!isAuthenticated) {
      console.log('User not authenticated, redirecting to main page');
      router.push("/")
    }
  }, [isAuthenticated, router, user])

  // Fetch user's smart wallets when component mounts
  useEffect(() => {
    const fetchUserWallets = async () => {
      if (user?.email) {
        try {
          const result = await getUserFromDb(user.email)
          if (result.success && result.data) {
            // Handle the API response format: { user: { smartwallets: {...} } }
            const userData = result.data.user || result.data
            console.log('API Response:', result.data)
            console.log('User Data:', userData)
            
            if (userData.smartwallets) {
              setUserSmartWallets({
                arbitrum: userData.smartwallets.arbitrum || '',
                base: userData.smartwallets.base || '',
                avalanche: userData.smartwallets.avalanche || '',
              })
              setWalletData(userData) // Store full user data for wallet modal
              console.log('User smart wallets loaded:', userData.smartwallets)
            }
          } else {
            console.error('Failed to load user wallets:', result.error)
          }
        } catch (error) {
          console.error('Error fetching user wallets:', error)
        }
      }
    }

    fetchUserWallets()
  }, [user])

  // Load payment requests when component mounts
  useEffect(() => {
    if (user?.email) {
      setIsLoadingPayments(true)
      refreshPaymentRequests().finally(() => {
        setIsLoadingPayments(false)
      })
    }
  }, [user])

  const handleLogout = () => {
    logout()
    router.push("/")
  }

  const handleShowWallets = () => {
    if (!user?.email) {
      toast({
        title: "Error",
        description: "User not found",
        variant: "destructive",
      })
      return
    }

    if (!walletData) {
      toast({
        title: "Error",
        description: "Wallet data not loaded yet. Please wait a moment and try again.",
        variant: "destructive",
      })
      return
    }

    setShowWalletModal(true)
  }

  const refreshPaymentRequests = async () => {
    if (!user?.email) return
    
    // Prevent multiple simultaneous refreshes
    if (isRefreshingRef.current) {
      console.log('Refresh already in progress, skipping...')
      return
    }
    
    isRefreshingRef.current = true

    try {
      const refreshId = Math.random().toString(36).substr(2, 8)
      console.log(`[${refreshId}] Refreshing payment requests for:`, user.email)
      const result = await getPaymentRequestsFromDb(user.email)
      if (result.success && result.data) {
        const requests = result.data.requests || []
        console.log(`[${refreshId}] Raw payment requests from DB:`, requests)
        
        const formattedRequests = requests.map((req: any, index: number) => ({
          id: req.payid || req.id || `temp-${index}`,
          amount: req.amount,
          description: req.descriptions || req.description || 'No description provided',
          paymentLink: `${window.location.origin}/pay/${req.payid || req.id}`,
          created: new Date(req.created_at || req.created).toLocaleDateString(),
        }))
        
        console.log(`[${refreshId}] Formatted payment requests:`, formattedRequests)
        
        // Remove duplicates based on payid
        const uniqueRequests = formattedRequests.filter((req: any, index: number, self: any[]) => 
          index === self.findIndex((r: any) => r.id === req.id)
        )
        
        console.log(`[${refreshId}] Unique payment requests after deduplication:`, uniqueRequests)
        console.log(`[${refreshId}] Setting payment requests count:`, uniqueRequests.length)
        setPaymentRequests(uniqueRequests)
      }
    } catch (error) {
      console.error('Error refreshing payment requests:', error)
    } finally {
      isRefreshingRef.current = false
    }
  }

  const handleCreatePaymentRequest = async (e?: React.MouseEvent) => {
    // Increment click counter
    clickCounter.current += 1
    const clickId = `${componentId.current}-${clickCounter.current}`
    
    console.log(`[${clickId}] Button clicked - Component: ${componentId.current}, Click: ${clickCounter.current}`)
    
    // Prevent event bubbling
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    
    // Global submission check using localStorage
    const globalSubmissionTime = localStorage.getItem(globalSubmissionKey)
    const now = Date.now()
    
    if (globalSubmissionTime && (now - parseInt(globalSubmissionTime)) < 5000) {
      console.log(`[${clickId}] Preventing double submission - global check failed`)
      return
    }
    
    // Additional check: if we're already processing this exact request
    const processingKey = `processing-${globalSubmissionKey}`
    if (localStorage.getItem(processingKey)) {
      console.log(`[${clickId}] Request already being processed`)
      return
    }
    
    // Set processing flag
    localStorage.setItem(processingKey, 'true')
    
    // Prevent double submission using ref for immediate check
    if (isSubmitting || isSubmittingRef.current) {
      console.log(`[${clickId}] Preventing double submission - already submitting`)
      return
    }
    
    // Debounce: prevent submissions within 2 seconds
    if (now - lastSubmissionTime.current < 2000) {
      console.log(`[${clickId}] Preventing double submission - too soon after last submission`)
      return
    }
    
    // Set global submission time
    localStorage.setItem(globalSubmissionKey, now.toString())
    lastSubmissionTime.current = now
    
    console.log(`[${clickId}] Starting payment request creation...`)

    // Validate amount
    const amountNum = parseFloat(amount)
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount greater than 0",
        variant: "destructive",
      })
      return
    }

    if (!user?.email) {
      toast({
        title: "Error",
        description: "User not found",
        variant: "destructive",
      })
      return
    }

    if (!userSmartWallets) {
      toast({
        title: "Error",
        description: "User wallets not loaded",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    isSubmittingRef.current = true

    try {
      // Check for duplicate payment requests
      const existingRequest = paymentRequests.find(req => 
        req.amount === amountNum.toString() && 
        req.description === (description || "No description provided")
      )
      
      if (existingRequest) {
        console.log('Duplicate request found:', existingRequest)
        toast({
          title: "Duplicate Request",
          description: "A payment request with the same amount and description already exists",
          variant: "destructive",
        })
        setIsSubmitting(false)
        isSubmittingRef.current = false
        return
      }

      const payid = Math.random().toString(36).substr(2, 10)
      console.log('Generated payid:', payid)
      
      // Save to database
      const paymentData: PaymentRequestData = {
        payid,
        email: user.email,
        smartwallets: userSmartWallets,
        amount: amountNum.toString(), // Ensure amount is properly formatted
        status: "pending",
        hash: "",
        descriptions: description || "No description provided",
      }

      console.log(`[${clickId}] Saving payment request to database:`, paymentData)
      console.log(`[${clickId}] Current payment requests before save:`, paymentRequests.length)
      
      // Add a unique timestamp to the payment data to prevent duplicates
      const paymentDataWithTimestamp = {
        ...paymentData,
        timestamp: now,
        clickId: clickId
      }
      
      const dbResult = await savePaymentRequestToDb(paymentDataWithTimestamp)
      
      if (dbResult.success) {
        console.log('Payment request saved successfully')
        
        // Clear form first
    setAmount("")
    setDescription("")
    setIsCreating(false)
        
        // Add a small delay before refreshing to ensure database is updated
        setTimeout(async () => {
          await refreshPaymentRequests()
        }, 500)

    toast({
      title: "Payment Request Created",
      description: "Your payment link is ready to share",
    })
      } else {
        throw new Error(dbResult.error || 'Failed to save payment request')
      }
    } catch (error) {
      console.error('Error saving payment request:', error)
      toast({
        title: "Error",
        description: "Failed to create payment request. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
      isSubmittingRef.current = false
      // Clear processing flag
      localStorage.removeItem(processingKey)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied!",
      description: "Payment link copied to clipboard",
    })
  }

  const formatUSDCAmount = (amount: string) => {
    const num = parseFloat(amount)
    return num.toFixed(6).replace(/\.?0+$/, '') // Remove trailing zeros
  }

  return (
    <div className="relative min-h-screen">
      {/* Background Paths */}
      <div className="absolute inset-0">
        <BackgroundPaths title="" />
      </div>
      
      {/* Header */}
      <div className="relative z-10 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm shadow-sm border-b border-black/10 dark:border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img 
              src="/logosoup.png" 
              alt="Soup Logo" 
              width={32} 
              height={32}
              className="w-8 h-8"
            />
            <div>
              <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Soup</h1>
              {user && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Logged in as: {user.email}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              onClick={handleShowWallets} 
              variant="outline" 
              size="sm"
              className="flex items-center gap-2 bg-transparent hover:bg-black/10 dark:hover:bg-white/10"
              disabled={!walletData}
            >
              <Wallet className="w-4 h-4" />
              {!walletData ? "Loading..." : "Wallets"}
            </Button>
            <ThemeToggle />
            <Button onClick={handleLogout} variant="outline" className="flex items-center gap-2 bg-transparent hover:bg-black/10 dark:hover:bg-white/10">
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Create Payment Request Section */}
        <Card className="mb-8 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm border-black/10 dark:border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
              <Plus className="w-5 h-5" />
              Create Payment Request
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!isCreating ? (
              <Button onClick={() => setIsCreating(true)} className="bg-indigo-600 hover:bg-indigo-700">
                New Payment Request
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="amount">Amount (USDC)</Label>
                    <Input
                      id="amount"
                      type="number"
                      placeholder="100.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description (Optional)</Label>
                    <Input
                      id="description"
                      placeholder="Payment for services"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    key={`create-request-${componentId.current}`}
                    onClick={handleCreatePaymentRequest} 
                    disabled={isSubmitting}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Creating...
                      </div>
                    ) : (
                      "Create Request"
                    )}
                  </Button>
                  <Button 
                    onClick={() => setIsCreating(false)} 
                    variant="outline"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Requests List */}
        <Card className="bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm border-black/10 dark:border-white/10">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">
              Payment Requests
              {paymentRequests.length > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({paymentRequests.length} request{paymentRequests.length !== 1 ? 's' : ''})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingPayments ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <span className="ml-2 text-gray-600 dark:text-gray-300">Loading payment requests...</span>
              </div>
            ) : paymentRequests.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p>No payment requests yet</p>
                <p className="text-sm">Create your first payment request to get started</p>
              </div>
            ) : (
              <div className="space-y-4">
                {paymentRequests.map((request) => (
                  <div key={request.id} className="border border-black/10 dark:border-white/10 rounded-lg p-4 bg-white/50 dark:bg-neutral-800/50 backdrop-blur-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                               <h3 className="font-semibold text-gray-900 dark:text-white">{request.description}</h3>
                               <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{formatUSDCAmount(request.amount)} USDC</p>
                               <p className="text-sm text-gray-500 dark:text-gray-400">Created: {request.created}</p>
                      </div>
                      <Button
                        onClick={() => copyToClipboard(request.paymentLink)}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2 hover:bg-black/10 dark:hover:bg-white/10"
                      >
                        <Copy className="w-4 h-4" />
                        Copy Link
                      </Button>
                    </div>
                    <div className="mt-3 p-2 bg-white/80 dark:bg-neutral-700/80 rounded border border-black/10 dark:border-white/10">
                      <p className="text-xs text-gray-600 dark:text-gray-300 break-all">{request.paymentLink}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Wallet Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <Card className="max-w-2xl w-full max-h-[80vh] overflow-y-auto bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
                <Wallet className="w-5 h-5" />
                Wallet Information
              </CardTitle>
              <Button
                onClick={() => setShowWalletModal(false)}
                variant="outline"
                size="sm"
                className="hover:bg-black/10 dark:hover:bg-white/10"
              >
                ✕
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {walletData ? (
                <div className="space-y-4">
                  {/* User Info */}
                  <div className="p-4 bg-gray-50 dark:bg-neutral-800/50 rounded-lg">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Account Details</h3>
                    <div className="space-y-1 text-sm">
                      <p><span className="font-medium">Email:</span> {walletData.email}</p>
                      <p><span className="font-medium">Account Status:</span> 
                        <span className={`ml-2 px-2 py-1 rounded text-xs ${
                          walletData.account 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' 
                            : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                        }`}>
                          {walletData.account ? 'Active' : 'Inactive'}
                        </span>
                      </p>
                      <p><span className="font-medium">Chains:</span> {walletData.chains}</p>
                      <p><span className="font-medium">Created:</span> {new Date(walletData.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>

                  {/* Smart Wallets */}
                  <div className="p-4 bg-gray-50 dark:bg-neutral-800/50 rounded-lg">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Smart Wallets</h3>
                    <div className="space-y-3">
                      {Object.entries(walletData.smartwallets || {}).map(([chain, address]) => {
                        const addressString = typeof address === 'string' ? address : ''
                        return (
                          <div key={chain} className="flex items-center justify-between p-3 bg-white dark:bg-neutral-700/50 rounded border border-black/10 dark:border-white/10">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/20 rounded-full flex items-center justify-center">
                                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase">
                                  {chain.charAt(0)}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white capitalize">{chain}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono break-all">
                                  {addressString || 'Not available'}
                                </p>
                              </div>
                            </div>
                            {addressString && (
                              <Button
                                onClick={() => {
                                  navigator.clipboard.writeText(addressString)
                                  toast({
                                    title: "Copied!",
                                    description: `${chain} address copied to clipboard`,
                                  })
                                }}
                                variant="outline"
                                size="sm"
                                className="hover:bg-black/10 dark:hover:bg-white/10"
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Destination Address */}
                  {walletData.destined_address && (
                    <div className="p-4 bg-gray-50 dark:bg-neutral-800/50 rounded-lg">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Destination Address</h3>
                      <div className="flex items-center justify-between p-3 bg-white dark:bg-neutral-700/50 rounded border border-black/10 dark:border-white/10">
                        <p className="text-xs text-gray-600 dark:text-gray-300 font-mono break-all">
                          {walletData.destined_address}
                        </p>
                        <Button
                          onClick={() => {
                            navigator.clipboard.writeText(walletData.destined_address)
                            toast({
                              title: "Copied!",
                              description: "Destination address copied to clipboard",
                            })
                          }}
                          variant="outline"
                          size="sm"
                          className="hover:bg-black/10 dark:hover:bg-white/10"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No wallet data available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
