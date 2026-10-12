import { Alert, Platform } from 'react-native';

export function confirm(title: string, message?: string, onConfirm?: () => void, onCancel?: () => void): void {
  if (Platform.OS === 'web') {
    const ok = window.confirm(message || title);
    if (ok) {
      onConfirm?.();
    } else {
      onCancel?.();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Batal', onPress: () => onCancel?.(), style: 'cancel' },
      { text: 'Ya', onPress: () => onConfirm?.(), style: 'destructive' },
    ]);
  }
}
