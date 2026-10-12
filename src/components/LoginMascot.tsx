import React, { useEffect, useRef } from 'react';
import { View, Animated, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle, Rect, Path, Ellipse } from 'react-native-svg';

export default function LoginMascot({ covering = false, size = 160 }: { covering?: boolean; size?: number }) {
  const dims = useWindowDimensions();
  const s = dims.height < 600 ? 120 : size;
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      Animated.timing(float, { toValue: -10, duration: 700, useNativeDriver: Platform.OS !== 'web' }).start();
      setTimeout(() => Animated.timing(float, { toValue: 0, duration: 700, useNativeDriver: Platform.OS !== 'web' }).start(), 700);
    }, 1400);
    return () => clearInterval(timer);
  }, []);

  const cx = s / 2;

  return (
    <View style={[styles.container, { width: s, height: s + 40, opacity: covering ? 0.9 : 1 }]}>
      <Animated.View style={{ transform: [{ translateY: float }] }}>
        <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          {/* Tubuh biru di bawah wajah */}
          <Rect x={s * 0.22} y={s * 0.72} width={s * 0.56} height={s * 0.22} rx={s * 0.1} fill="#89ceff" />
          {/* Wajah oranye */}
          <Rect x={s * 0.18} y={s * 0.42} width={s * 0.64} height={s * 0.36} rx={s * 0.2} fill="#f97316" />
          {/* Helm putih (menutupi bagian atas kepala) */}
          <Ellipse cx={cx} cy={s * 0.28} rx={s * 0.36} ry={s * 0.18} fill="#fff" stroke="#cbd5e1" strokeWidth={2} />
          <Rect x={cx - s * 0.07} y={s * 0.12} width={s * 0.14} height={s * 0.1} rx={3} fill="#fff" />
          <Path d={`M ${cx - s*0.08} ${s*0.2} Q ${cx} ${s*0.08} ${cx + s*0.08} ${s*0.2}`} stroke="#cbd5e1" strokeWidth={2} fill="none" />
          <Rect x={s * 0.20} y={s * 0.27} width={s * 0.6} height={s * 0.12} rx={s * 0.08} fill="#fff" stroke="#e2e8f0" strokeWidth={1.5} />
          {/* Mata (selalu ada; disembunyikan saat covering) */}
          <Circle cx={s * 0.32} cy={s * 0.55} r={s * 0.06} fill="#131b2e" opacity={covering ? 0 : 1} />
          <Circle cx={s * 0.68} cy={s * 0.55} r={s * 0.06} fill="#131b2e" opacity={covering ? 0 : 1} />
          {/* Tangan / sarung tangan */}
          {covering ? (
            <>
              <Circle cx={s * 0.32} cy={s * 0.55} r={s * 0.09} fill="#f8fafc" stroke="#89ceff" strokeWidth={2} />
              <Circle cx={s * 0.68} cy={s * 0.55} r={s * 0.09} fill="#f8fafc" stroke="#89ceff" strokeWidth={2} />
            </>
          ) : (
            <>
              <Circle cx={s * 0.28} cy={s * 0.82} r={s * 0.08} fill="#f8fafc" stroke="#89ceff" strokeWidth={2} />
              <Circle cx={s * 0.72} cy={s * 0.82} r={s * 0.08} fill="#f8fafc" stroke="#89ceff" strokeWidth={2} />
            </>
          )}
          {/* Mulut */}
          <Path d={`M ${cx - 8} ${s * 0.78} Q ${cx} ${s * 0.84} ${cx + 8} ${s * 0.78}`} stroke="#fff" strokeWidth={2} fill="none" strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
});
