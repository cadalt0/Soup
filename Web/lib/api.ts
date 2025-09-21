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
    const apiUrl = `${API_BASE_URL}/api/create-wallet-all`;
    console.log('=== API REQUEST DEBUG ===');
    console.log('API URL:', apiUrl);
    console.log('API Base URL:', API_BASE_URL);
    console.log('Request payload:', request);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    // Get response text first to handle non-JSON responses
    const responseText = await response.text();
    console.log('=== API RESPONSE DEBUG ===');
    console.log('API Response Text:', responseText);
    console.log('API Response Length:', responseText.length);
    console.log('API Response Type:', typeof responseText);
    console.log('API Response includes AVALANCHE:', responseText.includes('AVALANCHE'));
    console.log('API Response includes BASE:', responseText.includes('BASE'));
    console.log('API Response includes ARBITRUM:', responseText.includes('ARBITRUM'));

    let data;
    try {
      // Try to parse as JSON
      data = JSON.parse(responseText);
      console.log('✅ Successfully parsed as JSON:', data);
      console.log('JSON data type:', typeof data);
      console.log('JSON data keys:', Object.keys(data || {}));
    } catch (parseError) {
      console.log('❌ JSON parse failed, trying plain text format...');
      console.log('Parse error:', parseError);
      
      // If JSON parsing fails, check if it's a plain text response
      if (responseText.includes('AVALANCHE:') || responseText.includes('BASE:') || responseText.includes('ARBITRUM:')) {
        console.log('✅ Found plain text format with chain keywords');
        // Handle plain text response format
        const lines = responseText.split('\n').filter(line => line.trim());
        console.log('Split lines:', lines);
        const addresses: any = {};
        
        lines.forEach((line, index) => {
          console.log(`Processing line ${index}:`, line);
          const trimmedLine = line.trim();
          
          if (trimmedLine.includes('AVALANCHE:')) {
            const address = trimmedLine.split('AVALANCHE:')[1]?.trim();
            addresses.avalancheAddress = address;
            console.log('✅ Found Avalanche address:', address);
          } else if (trimmedLine.includes('BASE:')) {
            const address = trimmedLine.split('BASE:')[1]?.trim();
            addresses.baseAddress = address;
            console.log('✅ Found Base address:', address);
          } else if (trimmedLine.includes('ARBITRUM:')) {
            const address = trimmedLine.split('ARBITRUM:')[1]?.trim();
            addresses.arbitrumAddress = address;
            console.log('✅ Found Arbitrum address:', address);
          }
        });

        data = addresses;
        console.log('✅ Final parsed plain text addresses:', addresses);
        console.log('Avalanche:', addresses.avalancheAddress);
        console.log('Base:', addresses.baseAddress);
        console.log('Arbitrum:', addresses.arbitrumAddress);
      } else {
        console.log('❌ Unknown response format, raw text:', responseText.substring(0, 200));
        console.log('Response preview:', responseText);
        throw new Error(`Invalid response format: ${responseText.substring(0, 100)}...`);
      }
    }

    console.log('Final parsed data being returned:', data);
    
    // Test the parsing with the exact format you provided
    const testResponse = `AVALANCHE: 0x374dD9F3235d2145acb9B0e1663F07859Dff495A
ARBITRUM: 0xAd5f5e097633862419B488c3452eF11d4763bc87
BASE: 0x8aa42826C397375989B9177C89D1f1dcA54e87B5`;
    
    console.log('=== TESTING PARSING WITH YOUR FORMAT ===');
    console.log('Test response:', testResponse);
    const testLines = testResponse.split('\n').filter(line => line.trim());
    console.log('Test lines:', testLines);
    
    const testAddresses: any = {};
    testLines.forEach((line, index) => {
      console.log(`Test processing line ${index}:`, line);
      const trimmedLine = line.trim();
      
      if (trimmedLine.includes('AVALANCHE:')) {
        const address = trimmedLine.split('AVALANCHE:')[1]?.trim();
        testAddresses.avalancheAddress = address;
        console.log('✅ Test Avalanche address:', address);
      } else if (trimmedLine.includes('BASE:')) {
        const address = trimmedLine.split('BASE:')[1]?.trim();
        testAddresses.baseAddress = address;
        console.log('✅ Test Base address:', address);
      } else if (trimmedLine.includes('ARBITRUM:')) {
        const address = trimmedLine.split('ARBITRUM:')[1]?.trim();
        testAddresses.arbitrumAddress = address;
        console.log('✅ Test Arbitrum address:', address);
      }
    });
    
    console.log('✅ Test parsed addresses:', testAddresses);
    
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
