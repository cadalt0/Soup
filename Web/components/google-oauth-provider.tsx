"use client";

import { GoogleOAuthProvider as GoogleProvider } from '@react-oauth/google';
import { useEffect, useState } from 'react';

interface GoogleOAuthProviderProps {
  children: React.ReactNode;
}

export function GoogleOAuthProvider({ children }: GoogleOAuthProviderProps) {
  const [clientId, setClientId] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
    setClientId(id);
    setIsLoaded(true);
  }, []);

  if (!isLoaded) {
    return <>{children}</>;
  }

  if (!clientId) {
    console.warn('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set. Google OAuth will not work.');
    return <>{children}</>;
  }

  return (
    <GoogleProvider clientId={clientId}>
      {children}
    </GoogleProvider>
  );
}
