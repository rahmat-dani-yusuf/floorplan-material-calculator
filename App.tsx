import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore, initAuthListener } from './src/store/authStore';
import { useAuthHydrated } from './src/hooks/useAuthHydrated';
import LoginScreen from './src/screens/LoginScreen';
import EditorScreen from './src/screens/EditorScreen';
import ResultScreen from './src/screens/ResultScreen';
import PriceSettingsScreen from './src/screens/PriceSettingsScreen';
import AdminPriceScreen from './src/screens/AdminPriceScreen';
import { useProjectStore } from './src/store/projectStore';
import ProjectsScreen from './src/screens/ProjectsScreen';

export default function App() {
  useEffect(() => { initAuthListener(); }, []);
  const hasHydrated = useAuthHydrated();
  const auth = useAuthStore();
  const [screen, setScreen] = React.useState<'editor' | 'result' | 'prices' | 'adminPrices' | 'projects'>('editor');
  const [fromScreen, setFromScreen] = React.useState<'editor' | 'result'>('editor');

  if (!hasHydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0b1326', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  if (!auth.user && !auth.isGuest) {
    return <LoginScreen onLogin={(name) => { /* handled by auth listener */ }} onGuest={() => auth.enterGuest()} />;
  }

  const openPrices = (origin: 'editor' | 'result') => { setFromScreen(origin); setScreen('prices'); };
  const openProjects = (origin: 'editor' | 'result') => { setFromScreen(origin); setScreen('projects'); };
  const goBackToOrigin = () => setScreen(fromScreen);
  const openAdminPrices = () => setScreen('adminPrices');
  const backToPrices = () => setScreen('prices');
  const backToProjects = () => setScreen('projects');
  const handleSelectProject = (id: string) => {
    useProjectStore.getState().openProject(id);
    setScreen('editor');
  };

  return (
    <>
      <StatusBar style="light" />
      {screen === 'editor' ? (
        <EditorScreen onCalculate={() => setScreen('result')} onOpenPrices={() => openPrices('editor')} onOpenProjects={() => openProjects('editor')} />
      ) : screen === 'result' ? (
        <ResultScreen onBack={() => setScreen('editor')} onOpenPrices={() => openPrices('result')} onOpenProjects={() => openProjects('result')} />
      ) : screen === 'prices' ? (
        <PriceSettingsScreen onBack={goBackToOrigin} onOpenAdmin={openAdminPrices} />
      ) : screen === 'adminPrices' ? (
        <AdminPriceScreen onBack={backToPrices} />
      ) : (
        <ProjectsScreen onBack={goBackToOrigin} onSelect={handleSelectProject} />
      )}
    </>
  );
}
