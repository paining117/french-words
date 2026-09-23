import { ActivityIndicator, Text, View } from 'react-native';
import { AppButton } from './AppButton';
import { colors } from '../../theme/colors';
import { BlurredHomeBackground } from './BlurredHomeBackground';
export function LoadState({ error, retry, inline = false, message = '正在加载…' }: { error?: boolean; retry?: () => void; inline?: boolean; message?: string }) {
  return <View style={{ flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 28, backgroundColor: inline ? 'transparent' : colors.pageBackground }}>
    {!inline && <BlurredHomeBackground />}
    {error ? <><Text style={{ color: colors.text }}>加载失败，请重试</Text>{retry && <AppButton title="重试" onPress={retry} />}</> : <><ActivityIndicator color={colors.forest} /><Text style={{ color: colors.secondary }}>{message}</Text></>}
  </View>;
}
