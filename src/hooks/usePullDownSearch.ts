import { useMemo, useRef } from 'react';
import { PanResponder } from 'react-native';

export function usePullDownSearch(onOpen: () => void, enabled: boolean) {
  const current = useRef({ onOpen, enabled });
  current.current = { onOpen, enabled };
  return useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // Capture downward drags anywhere on the home content, including buttons;
    // taps, horizontal movement and upward scrolling retain their normal use.
    onMoveShouldSetPanResponderCapture: (_, gesture) => current.current.enabled && gesture.numberActiveTouches === 1 && gesture.dy > 12 && gesture.dy > Math.abs(gesture.dx) * 1.4,
    onPanResponderRelease: (_, gesture) => {
      if (current.current.enabled && gesture.dy >= 64 && gesture.dy > Math.abs(gesture.dx) * 1.4) current.current.onOpen();
    },
    onPanResponderTerminationRequest: () => false,
  }), []).panHandlers;
}
