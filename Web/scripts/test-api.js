#!/usr/bin/env node

// Test script for the create-wallet-all API
const API_URL = process.env.API_URL || 'http://localhost:3011';

async function testCreateWalletAll() {
  const avalancheDestination = '0x1234567890123456789012345678901234567890';
  
  try {
    console.log('Testing create-wallet-all API...');
    console.log('API URL:', `${API_URL}/api/create-wallet-all`);
    console.log('Payload:', { avalancheDestination });
    
    const response = await fetch(`${API_URL}/api/create-wallet-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ avalancheDestination }),
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return;
    }

    const data = await response.json();
    console.log('Success response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error calling API:', error.message);
  }
}

// Run the test
testCreateWalletAll();
