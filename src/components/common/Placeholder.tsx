import { router } from 'expo-router';
import { AppButton } from './AppButton';
import { PageTitle, Screen } from './Screen';
export function Placeholder({ title, detail }: { title: string; detail: string }) {
  return <Screen><PageTitle title={title} subtitle={detail} /><AppButton title="返回首页" onPress={() => router.dismissTo('/')} /></Screen>;
}
