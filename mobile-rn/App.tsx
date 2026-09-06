import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MayApp } from './src/shop/MayApp';

export default function App() {
  return (
    <SafeAreaProvider>
      <MayApp />
    </SafeAreaProvider>
  );
}
