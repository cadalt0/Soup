import { API_BASE_URL } from './constants';

export interface UserData {
  email: string;
  smartwallets: {
    arbitrum: string;
    base: string;
    avalanche?: string;
  };
  account: boolean;
  chains: string;
  destinedAddress: string;
}

export interface PaymentRequestData {
  payid: string;
  email: string;
  smartwallets: {
    arbitrum: string;
    base: string;
    avalanche: string;
  };
  amount: string;
  status: string;
  hash: string;
  descriptions: string;
}

export interface DbResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export async function saveUserToDb(userData: UserData): Promise<DbResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/monomausers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API Error Response:', errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('User saved to database:', data);

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('Error saving user to database:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function getUserFromDb(email: string): Promise<DbResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/monomausers/${encodeURIComponent(email)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          data: { error: 'not found' },
        };
      }
      const errorText = await response.text();
      console.error('Database API Error Response:', errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('Error fetching user from database:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function savePaymentRequestToDb(paymentData: PaymentRequestData): Promise<DbResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/monomarequests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paymentData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Payment Request API Error Response:', errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Payment request saved to database:', data);

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('Error saving payment request to database:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function getPaymentRequestsFromDb(email: string): Promise<DbResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/monomarequests/mail/${encodeURIComponent(email)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: true,
          data: { count: 0, requests: [] },
        };
      }
      const errorText = await response.text();
      console.error('Payment Requests API Error Response:', errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Payment requests fetched from database:', data);

    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('Error fetching payment requests from database:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
