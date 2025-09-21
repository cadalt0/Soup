// API configuration and utilities
import { API_BASE_URL } from './constants';

export interface CreateWalletRequest {
  avalancheDestination: string;
}

export interface CreateWalletResponse {
  success: boolean;
  data?: {
    avalancheAddress?: string;
    baseAddress?: string;
    arbitrumAddress?: string;
  };
  error?: string;
}

export async function createWalletAll(request: CreateWalletRequest): Promise<CreateWalletResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/create-wallet-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    // Get response text first to handle non-JSON responses
    const responseText = await response.text();
    console.log('API Response Text:', responseText);
    console.log('API Response Length:', responseText.length);

    let data;
    try {
      // Try to parse as JSON
      data = JSON.parse(responseText);
      console.log('Parsed JSON data:', data);
    } catch (parseError) {
      console.log('JSON parse failed, trying plain text format...');
      // If JSON parsing fails, check if it's a plain text response
      if (responseText.includes('AVALANCHE:') || responseText.includes('BASE:') || responseText.includes('ARBITRUM:')) {
        // Handle plain text response format
        const lines = responseText.split('\n').filter(line => line.trim());
        const addresses: any = {};
        
        lines.forEach(line => {
          if (line.includes('AVALANCHE:')) {
            addresses.avalancheAddress = line.split('AVALANCHE:')[1]?.trim();
          } else if (line.includes('BASE:')) {
            addresses.baseAddress = line.split('BASE:')[1]?.trim();
          } else if (line.includes('ARBITRUM:')) {
            addresses.arbitrumAddress = line.split('ARBITRUM:')[1]?.trim();
          }
        });

        data = addresses;
        console.log('Parsed plain text addresses:', addresses);
      } else {
        console.log('Unknown response format, raw text:', responseText.substring(0, 200));
        throw new Error(`Invalid response format: ${responseText.substring(0, 100)}...`);
      }
    }

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('Error creating wallets:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// Generate a random Avalanche destination address for demo purposes
export function generateRandomAvalancheAddress(): string {
  // This is a demo function - in production, you'd get this from user input or wallet connection
  const chars = '0123456789abcdef';
  let result = '0x';
  for (let i = 0; i < 40; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
