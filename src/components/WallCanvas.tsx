 
import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { useWallStore } from '../store/wallStore';
import { C } from '../theme';

const ROW_H = 140;
const PAD = 36;
const MAX_M = 12;
const GRID_M = 1;
const HIT = 36; // radius area sentuh titik geser (dp)
const MIN_VIEW_H = ROW_H * 2;
const MAX_VIEW_H = 330;
const TAP_SLOP = 8;

const clampLen = (v: number) => Math.min(MAX_M, Math.max(0.5, Math.round(v * 10) / 10));

export default function WallCanvas() {
  const { width } = useWindowDimensions();
  const walls = useWallStore((s) => s.walls);
  const selectedId = useWallStore((s) => s.selectedId);
  const selectWall = useWallStore((s) => s.selectWall);
  const setLength = useWallStore((s) => s.setLength);

  const pxPerM = (width - PAD * 2) / MAX_M;
  const totalH = walls.length * ROW_H;
  const viewH = Math.max(MIN_VIEW_H, Math.min(totalH, MAX_VIEW_H));
  const maxScroll = Math.max(0, totalH - viewH);

  const [live, setLive] = useState<number | null>(null); // panjang sementara saat digeser
  const [scrollY, setScrollY] = useState(0);

  // Ref berisi nilai terbaru agar PanResponder (dibuat sekali) tidak memakai data basi.
  const ctx = useRef({ pxPerM, maxScroll, scrollY });
  ctx.current = { pxPerM, maxScroll, scrollY };

  const gesture = useRef({
    mode: 'none' as 'none' | 'drag' | 'scroll',
    startLen: 5,
    startScroll: 0,
    contentY: 0,
    moved: false,
  });

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,

        onPanResponderGrant: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          const st = useWallStore.getState();
          const c = ctx.current;
          const g = gesture.current;
          g.moved = false;
          g.startScroll = c.scrollY;
          g.contentY = locationY + c.scrollY;

          const idx = st.walls.findIndex((w) => w.id === st.selectedId);
          const w = st.walls[idx];
          if (w) {
            const hx = PAD + w.length_meters * c.pxPerM;
            const hy = idx * ROW_H + 70;
            if (Math.abs(locationX - hx) <= HIT && Math.abs(g.contentY - hy) <= HIT) {
              g.mode = 'drag';
              g.startLen = w.length_meters;
              return;
            }
          }
          g.mode = 'scroll';
        },

        onPanResponderMove: (_e, s) => {
          const g = gesture.current;
          const c = ctx.current;
          if (Math.abs(s.dx) > TAP_SLOP || Math.abs(s.dy) > TAP_SLOP) g.moved = true;
          if (g.mode === 'drag') {
            setLive(clampLen(g.startLen + s.dx / c.pxPerM));
          } else if (g.mode === 'scroll' && c.maxScroll > 0) {
            setScrollY(Math.min(c.maxScroll, Math.max(0, g.startScroll - s.dy)));
          }
        },

        onPanResponderRelease: (_e, s) => {
          const g = gesture.current;
          const c = ctx.current;
          if (g.mode === 'drag') {
            setLength(clampLen(g.startLen + s.dx / c.pxPerM));
            setLive(null);
          } else if (g.mode === 'scroll' && !g.moved) {
            // ketukan: pilih dinding pada baris yang disentuh
            const st = useWallStore.getState();
            const row = Math.floor(g.contentY / ROW_H);
            const target = st.walls[row];
            if (target) st.selectWall(target.id);
          }
          g.mode = 'none';
        },

        onPanResponderTerminate: () => {
          gesture.current.mode = 'none';
          setLive(null);
        },
      }),
    [setLength],
  );

  return (
    <View
      {...pan.panHandlers}
      collapsable={false}
      style={{ width, height: viewH, backgroundColor: C.bg, overflow: 'hidden' }}
    >
      <View pointerEvents="none">
        <Svg width={width} height={viewH}>
          <Rect x={0} y={0} width={width} height={viewH} fill={C.bg} />

          {/* grid vertikal */}
          {Array.from({ length: Math.floor(MAX_M / GRID_M) + 1 }, (_, gi) => {
            const gx = PAD + gi * GRID_M * pxPerM;
            return (
              <Line key={`vg-${gi}`} x1={gx} y1={0} x2={gx} y2={viewH} stroke={C.grid} strokeOpacity={0.5} strokeWidth={1} />
            );
          })}

          {walls.map((wall, i) => {
            const y = i * ROW_H + 70 - scrollY;
            const isActive = wall.id === selectedId;
            const col = isActive ? C.primary : '#89ceff';
            const len = isActive ? (live ?? wall.length_meters) : wall.length_meters;
            const x1 = PAD;
            const x2 = PAD + len * pxPerM;
            const area = len * wall.height_meters;
            return (
              <G key={wall.id}>
                {isActive && (
                  <Rect x={0} y={y - 70} width={width} height={ROW_H} fill={C.primary} fillOpacity={0.05} />
                )}

                <SvgText x={10} y={y - 30} fill={col} fontSize={12} fontWeight="bold">
                  {wall.name}
                </SvgText>

                {/* garis dimensi */}
                <Line x1={x1} y1={y - 40} x2={x2} y2={y - 40} stroke={col} strokeWidth={1.5} />
                <Line x1={x1} y1={y - 48} x2={x1} y2={y - 8} stroke={col} strokeOpacity={0.6} />
                <Line x1={x2} y1={y - 48} x2={x2} y2={y - 8} stroke={col} strokeOpacity={0.6} />
                <Rect x={(x1 + x2) / 2 - 36} y={y - 66} width={72} height={20} rx={4} fill={col} />
                <SvgText x={(x1 + x2) / 2} y={y - 52} fill="#582200" fontSize={12} fontWeight="bold" textAnchor="middle">
                  {len.toFixed(2)} m
                </SvgText>

                {/* dinding */}
                <Line x1={x1} y1={y} x2={x2} y2={y} stroke={col} strokeWidth={8} strokeLinecap="square" />

                {/* titik sudut */}
                <Circle cx={x1} cy={y} r={6} fill={col} />
                <Circle cx={x2} cy={y} r={isActive ? 18 : 14} fill={col} fillOpacity={0.3} />
                <Circle cx={x2} cy={y} r={7} fill={col} />

                {/* bukaan pintu/jendela (dinding terpilih) */}
                {isActive &&
                  (wall.openings ?? []).map((o, oi) => {
                    const oW = o.width_meters * pxPerM;
                    const oX = PAD + oi * (oW + 4);
                    const oY = y - 28;
                    const fill = o.type === 'pintu' ? '#ffb95f' : '#89ceff';
                    return (
                      <G key={o.id}>
                        <Rect x={oX} y={oY} width={oW} height={14} rx={3} fill={fill} />
                        <SvgText x={oX + oW / 2} y={oY + 10} fill="#fff" fontSize={7} fontWeight="bold" textAnchor="middle">
                          {o.quantity > 1 ? o.quantity + '×' : ''}
                        </SvgText>
                      </G>
                    );
                  })}

                <SvgText x={PAD} y={y + 30} fill={C.secondary} fontSize={11}>
                  {`Tinggi: ${wall.height_meters.toFixed(2)} m`}
                </SvgText>
                <SvgText x={PAD} y={y + 50} fill={C.text} fontSize={12} fontWeight="bold">
                  {`Luas: ${area.toFixed(2)} m²`}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </View>
    </View>
  );
}
`  `