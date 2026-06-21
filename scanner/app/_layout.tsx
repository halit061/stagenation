import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

// IMMEDIATELY hide splash - don't wait for component mount
// This runs the instant the JS bundle evaluates this module
SplashScreen.hideAsync().catch(() => {});

export default function RootLayout() {
  useEffect(() => {
    // Backup: hide again after component mounts
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
