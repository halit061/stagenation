import React, { useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../src/hooks/useAuth';
import LoginScreen from '../src/screens/LoginScreen';
import EventSelectScreen from '../src/screens/EventSelectScreen';
import ScannerScreen from '../src/screens/ScannerScreen';
import StatsScreen from '../src/screens/StatsScreen';

type Entrance = {
  id: string;
  name: string;
};

type AppState =
  | { screen: 'login' }
  | { screen: 'events' }
  | { screen: 'scanner'; eventId: string; eventName: string; entrance?: Entrance }
  | { screen: 'stats'; eventId: string; eventName: string; entrance?: Entrance };

export default function App() {
  const { session, loading, signIn, signOut } = useAuth();
  const [state, setState] = useState<AppState>({ screen: 'events' });

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#22d3ee" />
        <StatusBar style="light" />
      </View>
    );
  }

  if (!session) {
    return (
      <>
        <StatusBar style="light" />
        <LoginScreen onLogin={signIn} />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      {state.screen === 'events' && (
        <EventSelectScreen
          onSelectEvent={(event, entrance) =>
            setState({
              screen: 'scanner',
              eventId: event.id,
              eventName: event.name,
              entrance,
            })
          }
          onLogout={async () => {
            await signOut();
            setState({ screen: 'events' });
          }}
        />
      )}
      {state.screen === 'scanner' && (
        <ScannerScreen
          eventId={state.eventId}
          eventName={state.eventName}
          entranceName={state.entrance?.name}
          onOpenStats={() =>
            setState({
              screen: 'stats',
              eventId: state.eventId,
              eventName: state.eventName,
              entrance: state.entrance,
            })
          }
          onBack={() => setState({ screen: 'events' })}
        />
      )}
      {state.screen === 'stats' && (
        <StatsScreen
          eventId={state.eventId}
          eventName={state.eventName}
          entranceName={state.entrance?.name}
          onBack={() =>
            setState({
              screen: 'scanner',
              eventId: state.eventId,
              eventName: state.eventName,
              entrance: state.entrance,
            })
          }
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
