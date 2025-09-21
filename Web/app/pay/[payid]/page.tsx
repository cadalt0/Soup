"use client"

import { useState, useEffect, useRef } from "react"

// MetaMask types
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>
    }
  }
}
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle, CreditCard, Copy, Wallet } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { BackgroundPaths } from "@/components/ui/background-paths"
import { ThemeToggle } from "@/components/theme-toggle"

interface PaymentRequest {
  payid: string
  email: string
  smartwallets: {
    base: string
    arbitrum: string
    avalanche: string
  }
  amount: string
  status: string | null
  hash: string | null
  created_at: string
  updated_at: string
  descriptions: string | null
}

export default function PayPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentComplete, setPaymentComplete] = useState(false)
  const [selectedChain, setSelectedChain] = useState("")
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isWalletConnected, setIsWalletConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  
  // Payment protection refs
  const isProcessingRef = useRef(false)
  const lastPaymentTime = useRef(0)
  const clickCounter = useRef(0)
  const componentId = useRef(Math.random().toString(36).substr(2, 8))
  
  // Global payment protection using localStorage
  const globalPaymentKey = `payment-processing-${params.payid}`
  
  // Global payment processing flag (immediate check)
  const globalProcessingFlag = `global-processing-${params.payid}`
  
  // Check for duplicate component instances
  useEffect(() => {
    console.log(`[${componentId.current}] PayPage component mounted/rendered`)
    const existingInstance = localStorage.getItem('paypage-instance')
    if (existingInstance && existingInstance !== componentId.current) {
      console.warn(`[${componentId.current}] Duplicate PayPage instance detected! Existing: ${existingInstance}`)
    }
    localStorage.setItem('paypage-instance', componentId.current)
    
    return () => {
      console.log(`[${componentId.current}] PayPage component unmounted`)
      localStorage.removeItem('paypage-instance')
    }
  }, [])

  // Fetch payment request data from database
  useEffect(() => {
    const fetchPaymentRequest = async () => {
      if (!params.payid) return

      try {
        setIsLoading(true)
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3011'}/api/monomarequests/${params.payid}`)
        
        if (!response.ok) {
          if (response.status === 404) {
            setError('Payment request not found')
          } else {
            setError('Failed to load payment request')
          }
          return
        }

        const data = await response.json()
        console.log('Payment request loaded:', data)
        
        if (data.request) {
          setPaymentRequest(data.request)
        } else {
          setError('Invalid payment request data')
        }
      } catch (error) {
        console.error('Error fetching payment request:', error)
        setError('Failed to load payment request')
      } finally {
        setIsLoading(false)
      }
    }

    fetchPaymentRequest()
  }, [params.payid])

  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
      toast({
        title: "MetaMask Not Found",
        description: "Please install MetaMask to continue",
        variant: "destructive",
      })
      return
    }

    setIsConnecting(true)
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      })
      
      if (accounts.length > 0) {
        setWalletAddress(accounts[0])
        setIsWalletConnected(true)
        toast({
          title: "Wallet Connected!",
          description: `Connected to ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`,
        })
      }
    } catch (error) {
      console.error('Error connecting wallet:', error)
      toast({
        title: "Connection Failed",
        description: "Failed to connect wallet. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const switchToTestnet = async (chain: string) => {
    const testnetConfigs = {
      base: {
        chainId: '0x14a34', // Base Sepolia testnet
        chainName: 'Base Sepolia',
        rpcUrls: ['https://sepolia.base.org'],
        blockExplorerUrls: ['https://sepolia.basescan.org'],
        nativeCurrency: {
          name: 'ETH',
          symbol: 'ETH',
          decimals: 18,
        },
      },
      arbitrum: {
        chainId: '0x66eee', // Arbitrum Sepolia testnet
        chainName: 'Arbitrum Sepolia',
        rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'],
        blockExplorerUrls: ['https://sepolia.arbiscan.io'],
        nativeCurrency: {
          name: 'ETH',
          symbol: 'ETH',
          decimals: 18,
        },
      },
      avalanche: {
        chainId: '0xa869', // Avalanche Fuji testnet
        chainName: 'Avalanche Fuji',
        rpcUrls: ['https://api.avax-test.network/ext/bc/C/rpc'],
        blockExplorerUrls: ['https://testnet.snowtrace.io'],
        nativeCurrency: {
          name: 'AVAX',
          symbol: 'AVAX',
          decimals: 18,
        },
      },
    }

    const config = testnetConfigs[chain as keyof typeof testnetConfigs]
    if (!config) return

    try {
      await window.ethereum!.request({
        method: 'wallet_addEthereumChain',
        params: [config],
      })
    } catch (error) {
      console.error('Error switching network:', error)
      toast({
        title: "Network Switch Failed",
        description: `Failed to switch to ${config.chainName}. Please switch manually.`,
        variant: "destructive",
      })
    }
  }

  const disconnectWallet = () => {
    setWalletAddress("")
    setIsWalletConnected(false)
    setSelectedChain("")
    toast({
      title: "Wallet Disconnected",
      description: "You have been disconnected from your wallet",
    })
  }

  const handlePayment = async (e?: React.MouseEvent) => {
    // Increment click counter
    clickCounter.current += 1
    const clickId = `${componentId.current}-${clickCounter.current}`
    
    console.log(`[${clickId}] Payment button clicked - Component: ${componentId.current}, Click: ${clickCounter.current}`)
    
    // Prevent event bubbling
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    
    // IMMEDIATE global processing check
    if (localStorage.getItem(globalProcessingFlag)) {
      console.log(`[${clickId}] Preventing double payment - already processing globally`)
      return
    }
    
    // Set global processing flag IMMEDIATELY at function start
    localStorage.setItem(globalProcessingFlag, 'true')
    
    // Global payment check using localStorage
    const globalPaymentTime = localStorage.getItem(globalPaymentKey)
    const now = Date.now()
    
    if (globalPaymentTime && (now - parseInt(globalPaymentTime)) < 10000) {
      console.log(`[${clickId}] Preventing double payment - global check failed (10s cooldown)`)
      return
    }
    
    // Prevent double payment processing
    if (isProcessing || isProcessingRef.current) {
      console.log(`[${clickId}] Preventing double payment - already processing`)
      return
    }
    
    // Debounce: prevent payments within 5 seconds
    if (now - lastPaymentTime.current < 5000) {
      console.log(`[${clickId}] Preventing double payment - too soon after last payment`)
      return
    }
    
    // Set global payment time IMMEDIATELY
    localStorage.setItem(globalPaymentKey, now.toString())
    lastPaymentTime.current = now
    
    // Additional check: if we're already processing this exact request
    const processingKey = `processing-${globalPaymentKey}`
    if (localStorage.getItem(processingKey)) {
      console.log(`[${clickId}] Request already being processed globally`)
      return
    }
    
    // Set processing flag IMMEDIATELY
    localStorage.setItem(processingKey, 'true')
    
    if (!selectedChain || !isWalletConnected || !paymentRequest) {
      toast({
        title: "Error",
        description: "Please select a chain and connect your wallet",
        variant: "destructive",
      })
      return
    }

    setIsProcessing(true)
    isProcessingRef.current = true

    try {
      // Get the payment address for the selected chain
      const paymentAddress = paymentRequest.smartwallets[selectedChain as keyof typeof paymentRequest.smartwallets]
      
      if (!paymentAddress) {
        throw new Error(`No payment address available for ${selectedChain}`)
      }

      // USDC contract addresses for testnets
      const usdcContracts = {
        base: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
        arbitrum: '0x75faf114eafb1BDbe2F0316DF893FD58CE46AA4d', // Arbitrum Sepolia USDC
        avalanche: '0x5425890298aed601595a70AB815c96711a31Bc65', // Avalanche Fuji USDC
      }

      const usdcContract = usdcContracts[selectedChain as keyof typeof usdcContracts]
      if (!usdcContract) {
        throw new Error(`USDC not supported on ${selectedChain} testnet`)
      }

      // Convert amount to wei (USDC has 6 decimals)
      const amount = parseFloat(paymentRequest.amount)
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Invalid amount for USDC transfer')
      }
      
      const amountInWei = Math.floor(amount * Math.pow(10, 6)).toString()
      console.log('Amount calculation:', {
        originalAmount: paymentRequest.amount,
        parsedAmount: amount,
        amountInWei: amountInWei,
        amountHex: `0x${parseInt(amountInWei).toString(16)}`
      })

      // Create USDC transfer function call data
      // transfer(address to, uint256 amount) -> 0xa9059cbb + 32 bytes address + 32 bytes amount
      const transferFunction = '0xa9059cbb'
      const addressParam = paymentAddress.slice(2).padStart(64, '0')
      const amountParam = parseInt(amountInWei).toString(16).padStart(64, '0')
      const data = transferFunction + addressParam + amountParam
      
      console.log('Transaction data:', {
        transferFunction,
        addressParam,
        amountParam,
        fullData: data
      })

      // Prepare transaction parameters for USDC transfer
      const transactionParams = {
        to: usdcContract,
        from: walletAddress,
        value: '0x0', // No ETH value for token transfer
        data: data,
        gas: '0x186A0', // 100,000 gas limit (more appropriate for token transfers)
      }
      
      console.log('Transaction parameters:', {
        to: usdcContract,
        from: walletAddress,
        value: '0x0',
        data: data,
        gas: '0x186A0',
        amount: paymentRequest.amount,
        amountInWei: amountInWei
      })

      // Request transaction
      const txHash = await window.ethereum!.request({
        method: 'eth_sendTransaction',
        params: [transactionParams],
      })

      console.log('USDC Transfer sent:', txHash)

      // Wait for transaction confirmation
      const receipt = await waitForTransactionConfirmation(txHash) as any
      
      if (receipt.status === '0x1') {
    setPaymentComplete(true)
    toast({
      title: "Payment Successful!",
          description: `USDC ${formatUSDCAmount(paymentRequest.amount)} sent successfully. TX: ${txHash.slice(0, 10)}...`,
        })
        
        // Call USDC transfer API after 3 seconds
        setTimeout(async () => {
          try {
            // Get the destination wallet address for the selected chain
            const destinationAddress = paymentRequest.smartwallets[selectedChain as keyof typeof paymentRequest.smartwallets]
            
            console.log('Calling USDC transfer API after 3 seconds...')
            console.log('Transfer details:', {
              walletAddress: destinationAddress,  // Destination wallet (where user paid TO)
              chain: selectedChain,
              amount: paymentRequest.amount,
              sourceWallet: walletAddress,  // Source wallet (where user paid FROM)
              destinationWallet: destinationAddress
            })
            
            const transferResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3011'}/api/transfer-usdc`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                walletAddress: destinationAddress,  // Destination wallet address
                chain: selectedChain,
                amount: paymentRequest.amount,
              }),
            })
            
            if (transferResponse.ok) {
              const transferData = await transferResponse.json()
              console.log('USDC transfer API called successfully:', transferData)
            } else {
              console.error('USDC transfer API failed:', transferResponse.status, await transferResponse.text())
            }
          } catch (error) {
            console.error('Error calling USDC transfer API:', error)
          }
        }, 3000)
        
      } else {
        throw new Error('Transaction failed')
      }

    } catch (error) {
      console.error('Payment error:', error)
      toast({
        title: "Payment Failed",
        description: error instanceof Error ? error.message : 'Transaction failed. Please try again.',
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
      isProcessingRef.current = false
      // Clear global payment time and processing flags
      localStorage.removeItem(globalPaymentKey)
      localStorage.removeItem(processingKey)
      localStorage.removeItem(globalProcessingFlag)
    }
  }

  const waitForTransactionConfirmation = async (txHash: string) => {
    return new Promise((resolve, reject) => {
      const checkConfirmation = async () => {
        try {
          const receipt = await window.ethereum!.request({
            method: 'eth_getTransactionReceipt',
            params: [txHash],
          })
          
          if (receipt) {
            resolve(receipt)
          } else {
            // Check again in 2 seconds
            setTimeout(checkConfirmation, 2000)
          }
        } catch (error) {
          reject(error)
        }
      }
      
      checkConfirmation()
    })
  }

  const handleBackToHome = () => {
    router.push("/home")
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied!",
      description: "Text copied to clipboard",
    })
  }

  const getChainIcon = (chain: string) => {
    switch (chain) {
      case 'base':
        return 'https://avatars.githubusercontent.com/u/108554348?s=280&v=4'
      case 'arbitrum':
        return 'https://cdn3d.iconscout.com/3d/premium/thumb/arbitrum-arb-3d-icon-png-download-11757502.png'
      case 'avalanche':
        return 'https://raw.githubusercontent.com/ErikThiart/cryptocurrency-icons/master/16/avalanche.png'
      default:
        return ''
    }
  }

  const getChainColor = (chain: string) => {
    switch (chain) {
      case 'base':
        return 'bg-blue-600'
      case 'arbitrum':
        return 'bg-blue-400'
      case 'avalanche':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const formatUSDCAmount = (amount: string) => {
    const num = parseFloat(amount)
    return num.toFixed(6).replace(/\.?0+$/, '') // Remove trailing zeros
  }

  if (paymentComplete) {
    return (
      <div className="relative min-h-screen">
        {/* Background Paths */}
        <div className="absolute inset-0">
          <BackgroundPaths title="" />
        </div>
        
        {/* Content */}
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <Card className="max-w-md w-full mx-4 text-center bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="space-y-6">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Payment Successful!</h2>
                  <p className="text-gray-600 dark:text-gray-300">
                    Your payment of {formatUSDCAmount(paymentRequest?.amount || '0')} USDC has been processed
                  </p>
              </div>
                <div className="bg-gray-50 dark:bg-neutral-800/50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-300">Transaction settled via Soup</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Cross-chain settlement completed</p>
              </div>
              <Button onClick={handleBackToHome} className="w-full bg-indigo-600 hover:bg-indigo-700">
                Back to Home
              </Button>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="relative min-h-screen">
        {/* Background Paths */}
        <div className="absolute inset-0">
          <BackgroundPaths title="" />
        </div>
        
        {/* Content */}
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <Card className="max-w-md w-full mx-4 text-center bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <span className="ml-2 text-gray-600 dark:text-gray-300">Loading payment request...</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error || !paymentRequest) {
    return (
      <div className="relative min-h-screen">
        {/* Background Paths */}
        <div className="absolute inset-0">
          <BackgroundPaths title="" />
        </div>
        
        {/* Content */}
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <Card className="max-w-md w-full mx-4 text-center bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="space-y-6">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto">
                  <span className="text-2xl">⚠️</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Payment Not Found</h2>
                  <p className="text-gray-600 dark:text-gray-300">{error || 'This payment request does not exist'}</p>
                </div>
                <Button onClick={handleBackToHome} className="w-full bg-indigo-600 hover:bg-indigo-700">
                  Back to Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen">
      {/* Background Paths */}
      <div className="absolute inset-0">
        <BackgroundPaths title="" />
      </div>
      
      {/* Header */}
      <div className="relative z-10 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm shadow-sm border-b border-black/10 dark:border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button onClick={handleBackToHome} variant="ghost" size="sm" className="flex items-center gap-2 hover:bg-black/10 dark:hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div>
              <h1 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">Soup Payment</h1>
              <p className="text-sm text-gray-600 dark:text-gray-300">Secure Cross-Chain Settlement</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isWalletConnected ? (
              <Button
                onClick={connectWallet}
                disabled={isConnecting}
                variant="outline"
                size="sm"
                className="flex items-center gap-2 hover:bg-black/10 dark:hover:bg-white/10"
              >
                <Wallet className="w-4 h-4" />
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-2 bg-green-100 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </span>
                </div>
                <Button
                  onClick={disconnectWallet}
                  variant="outline"
                  size="sm"
                  className="hover:bg-black/10 dark:hover:bg-white/10"
                >
                  Disconnect
                </Button>
              </div>
            )}
                   <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">
        <Card className="bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm border-black/10 dark:border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
              <CreditCard className="w-5 h-5" />
              Payment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Payment Info */}
            <div className="bg-gray-50 dark:bg-neutral-800/50 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600 dark:text-gray-300">Amount</span>
                <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{formatUSDCAmount(paymentRequest.amount)} USDC</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600 dark:text-gray-300">Description</span>
                <span className="font-medium text-gray-900 dark:text-white">{paymentRequest.descriptions || 'No description'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-300">Payment ID</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-gray-900 dark:text-white">{paymentRequest.payid}</span>
                  <Button
                    onClick={() => copyToClipboard(paymentRequest.payid)}
                    variant="outline"
                    size="sm"
                    className="hover:bg-black/10 dark:hover:bg-white/10"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Chain Selection */}
            <div className="space-y-2">
              <Label htmlFor="chain" className="text-gray-700 dark:text-gray-300">Select Payment Chain (Testnet)</Label>
              <Select value={selectedChain} onValueChange={(value) => {
                setSelectedChain(value)
                switchToTestnet(value)
              }}>
                <SelectTrigger className="bg-white dark:bg-neutral-800 border-black/10 dark:border-white/10">
                  <SelectValue placeholder="Choose your preferred testnet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">
                    <div className="flex items-center gap-2">
                      <img src={getChainIcon('base')} alt="Base" className="w-4 h-4 rounded-full" />
                      <div>
                        <div className="font-medium">Base Sepolia (Testnet)</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                          {paymentRequest.smartwallets.base ? 
                            `${paymentRequest.smartwallets.base.slice(0, 6)}...${paymentRequest.smartwallets.base.slice(-4)}` : 
                            'No wallet available'
                          }
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="arbitrum">
                    <div className="flex items-center gap-2">
                      <img src={getChainIcon('arbitrum')} alt="Arbitrum" className="w-4 h-4 rounded-full" />
                      <div>
                        <div className="font-medium">Arbitrum Sepolia (Testnet)</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                          {paymentRequest.smartwallets.arbitrum ? 
                            `${paymentRequest.smartwallets.arbitrum.slice(0, 6)}...${paymentRequest.smartwallets.arbitrum.slice(-4)}` : 
                            'No wallet available'
                          }
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="avalanche">
                    <div className="flex items-center gap-2">
                      <img src={getChainIcon('avalanche')} alt="Avalanche" className="w-4 h-4 rounded-full" />
                      <div>
                        <div className="font-medium">Avalanche Fuji (Testnet)</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                          {paymentRequest.smartwallets.avalanche ? 
                            `${paymentRequest.smartwallets.avalanche.slice(0, 6)}...${paymentRequest.smartwallets.avalanche.slice(-4)}` : 
                            'No wallet available'
                          }
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Selected Chain Wallet Address - Only show when wallet is connected */}
            {isWalletConnected && selectedChain && paymentRequest.smartwallets[selectedChain as keyof typeof paymentRequest.smartwallets] && (
              <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-200 dark:border-indigo-700">
                <h3 className="font-semibold text-indigo-900 dark:text-indigo-300 mb-2 flex items-center gap-2">
                  <img src={getChainIcon(selectedChain)} alt={selectedChain} className="w-4 h-4 rounded-full" />
                  Payment Address ({selectedChain.charAt(0).toUpperCase() + selectedChain.slice(1)} Testnet)
                </h3>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-indigo-700 dark:text-indigo-300 font-mono break-all">
                    {paymentRequest.smartwallets[selectedChain as keyof typeof paymentRequest.smartwallets]}
                  </p>
                  <Button
                    onClick={() => copyToClipboard(paymentRequest.smartwallets[selectedChain as keyof typeof paymentRequest.smartwallets] || '')}
                    variant="outline"
                    size="sm"
                    className="hover:bg-black/10 dark:hover:bg-white/10"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-2">
                  Send {formatUSDCAmount(paymentRequest.amount)} USDC to this address on {selectedChain.charAt(0).toUpperCase() + selectedChain.slice(1)} testnet
                </p>
              </div>
            )}

            {/* Wallet Not Connected Message */}
            {!isWalletConnected && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Wallet className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                <p className="text-lg font-medium mb-2">Wallet Not Connected</p>
                <p className="text-sm">Please connect your wallet using the button in the header to proceed with payment</p>
            </div>
            )}

            {/* Settlement Info */}
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-700">
              <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">USDC Testnet Payment</h3>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                This is a testnet payment. You will send {formatUSDCAmount(paymentRequest.amount)} USDC to the selected testnet address. 
                Make sure you have testnet USDC in your wallet.
              </p>
            </div>

            {/* Pay Button - Only show when wallet is connected */}
            {isWalletConnected && (
            <Button
              key={`payment-button-${componentId.current}`}
              onClick={handlePayment}
              disabled={isProcessing || !selectedChain}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-lg py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Processing Payment...
                </div>
              ) : (
                  `Send ${formatUSDCAmount(paymentRequest.amount)} USDC (Testnet)`
              )}
            </Button>
            )}

            {/* Security Notice */}
            <div className="text-center text-xs text-gray-500 dark:text-gray-400">
              <p>Secured by Soup Settlement Layer</p>
              <p>Your payment is protected by cross-chain security protocols</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
