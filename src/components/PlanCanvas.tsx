import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, View, Alert, Platform, Pressable, Text as RNText, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Text as SVGText, Rect } from 'react-native-svg';
import { useWallStore, selectActiveWall } from '../store/wallStore';
import { C } from '../theme';
import { openingGeometry } from '../utils/openings';
import { snapToGrid, snapOrthogonal, distancePointToSegment, wallLength, nearestPoint, normalizePointsEqual, distance } from '../utils/geometry';
import type { Point } from '../types';

const GRID_STEP = 1;
const TAP_RADIUS = 22; // px
const VERTEX_R = 8;
const MIN_LEN = 0.3;

export default function PlanCanvas({ fitTrigger = 0 }: { fitTrigger?: number }) {
  const walls = useWallStore((s) => s.walls);
  const selectedId = useWallStore((s) => s.selectedId);
  const rooms = useWallStore((s) => s.rooms);
  const selectWall = useWallStore((s) => s.selectWall);
  const addWallAt = useWallStore((s) => s.addWallAt);
  const moveVertex = useWallStore((s) => s.moveVertex);
  const removeWall = useWallStore((s) => s.removeWall);
  const setWallLength = useWallStore((s) => s.setWallLength);

  const [scale, setScale] = useState(50);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [canvasW, setCanvasW] = useState(360);
  const [canvasH, setCanvasH] = useState(320);
  const [userAdjusted, setUserAdjusted] = useState(false);
  const [tool, setTool] = useState<'select' | 'draw' | 'delete'>('select');
  const [snapGrid, setSnapGrid] = useState(true);
  const [snapOrtho, setSnapOrtho] = useState(true);
  const [magnetOn, setMagnetOn] = useState(true);
  const [mode, setMode] = useState<'none' | 'pan' | 'dragVertex' | 'draw' | 'deleteTap'>('none');
  const [prestart, setPrestart] = useState<Point | null>(null);
  const [preend, setPreend] = useState<Point | null>(null);
  const [dragVertexPoint, setDragVertexPoint] = useState<Point | null>(null);
  const [dragVertexWallId, setDragVertexWallId] = useState<string | null>(null);
  const [snapTarget, setSnapTarget] = useState<Point | null>(null);
  // panStart/panOffsetStart + ref cermin state. PanResponder dibuat sekali (stabil)
  // dan membaca nilai terbaru lewat ref, jadi tidak dibuat ulang di tengah gesture.
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const panOffsetStartRef = useRef<Point>({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  const scaleRef = useRef(scale);
  const modeRef = useRef(mode);
  const toolRef = useRef(tool);
  const snapGridRef = useRef(snapGrid);
  const snapOrthoRef = useRef(snapOrtho);
  const magnetOnRef = useRef(magnetOn);
  const wallsRef = useRef(walls);
  const prestartRef = useRef(prestart);
  const preendRef = useRef(preend);
  const dragVertexPointRef = useRef(dragVertexPoint);
  const dragVertexWallIdRef = useRef(dragVertexWallId);
  const canvasWRef = useRef(canvasW);
  const canvasHRef = useRef(canvasH);

  const { width: screenW, height: screenH } = useWindowDimensions();
  const viewW = 360;
  const viewH = Math.max(260, Math.min(420, Math.round(screenH * 0.40)));

  const toScreen = (p: Point) => ({ x: (p.x * scale) + offset.x, y: (p.y * scale) + offset.y });
  const toWorld = (x: number, y: number) => ({ x: (x - offsetRef.current.x) / scaleRef.current, y: (y - offsetRef.current.y) / scaleRef.current });

  // compute bbox for fitToContent
  const [fitTriggerState, setFitTriggerState] = useState(0);
  React.useEffect(() => {
    if (fitTrigger && fitTrigger !== fitTriggerState) {
      fitToContent();
      setFitTriggerState(fitTrigger);
      hasFittedRef.current = true;
    }
  }, [fitTrigger]);

  const hasFittedRef = useRef(false);
  React.useEffect(() => {
    if (!hasFittedRef.current && walls.length > 0 && mode === 'none') {
      fitToContent();
      hasFittedRef.current = true;
    }
  }, [walls]);

  // Hitung ulang fit saat ukuran kanvas asli terukur via onLayout (atau berubah),
  // selama user belum menyesuaikan zoom/geser sendiri. Memastikan denah tetap di
  // tengah pada kanvas lebar (mis. desktop) dan saat proyek dibuka kembali, tanpa
  // mereset preferensi user.
  React.useEffect(() => {
    if (walls.length > 0 && mode === 'none' && !userAdjusted) {
      fitToContent();
    }
  }, [canvasW, canvasH]);

  const bbox = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const addPoint = (p: Point) => {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    };
    for (const w of walls) {
      addPoint(w.p1); addPoint(w.p2);
      for (const o of w.openings ?? []) {
        const half = o.width_meters / 2;
        addPoint({ x: w.p1.x + ((w.p2.x - w.p1.x) / (wallLength(w.p1, w.p2) || 1)) * (o.offset_meters - half), y: w.p1.y + ((w.p2.y - w.p1.y) / (wallLength(w.p1, w.p2) || 1)) * (o.offset_meters - half) });
        addPoint({ x: w.p1.x + ((w.p2.x - w.p1.x) / (wallLength(w.p1, w.p2) || 1)) * (o.offset_meters + half), y: w.p1.y + ((w.p2.y - w.p1.y) / (wallLength(w.p1, w.p2) || 1)) * (o.offset_meters + half) });
      }
    }
    for (const r of rooms ?? []) {
      if (r.seed) addPoint(r.seed);
    }
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 5, maxY: 4 };
    return { minX: minX - 0.5, minY: minY - 0.5, maxX: maxX + 0.5, maxY: maxY + 0.5 };
  }, [walls, rooms]);

  const fitToContent = () => {
    const pad = 24;
    const w = bbox.maxX - bbox.minX || 5;
    const h = bbox.maxY - bbox.minY || 4;
    const cw = canvasW > 0 ? canvasW : viewW;
    const ch = canvasH > 0 ? canvasH : viewH;
    const s = Math.min(Math.max(15, Math.min((cw - pad * 2) / w, (ch - pad * 2) / h)), 80);
    const ox = (cw - w * s) / 2 - bbox.minX * s;
    const oy = (ch - h * s) / 2 - bbox.minY * s;
    setScale(s);
    setOffset({ x: ox, y: oy });
    setUserAdjusted(false);
  };

  const allPoints = useMemo(() => {
    const pts: Point[] = [];
    for (const w of walls) {
      pts.push(w.p1, w.p2);
    }
    return pts;
  }, [walls]);

  const allPointsRef = useRef(allPoints);
  const bboxRef = useRef(bbox);
  // Sinkronkan ref cermin dengan state terbaru (tiap render) agar PanResponder stabil
  // tetap melihat nilai paling baru tanpa dibuat ulang.
  offsetRef.current = offset;
  scaleRef.current = scale;
  modeRef.current = mode;
  toolRef.current = tool;
  snapGridRef.current = snapGrid;
  snapOrthoRef.current = snapOrtho;
  magnetOnRef.current = magnetOn;
  wallsRef.current = walls;
  prestartRef.current = prestart;
  preendRef.current = preend;
  dragVertexPointRef.current = dragVertexPoint;
  dragVertexWallIdRef.current = dragVertexWallId;
  canvasWRef.current = canvasW;
  canvasHRef.current = canvasH;
  allPointsRef.current = allPoints;
  bboxRef.current = bbox;

  // Batas pan yang memperhitungkan skala zoom: denah boleh digeser ke segala arah,
  // tapi selalu menyisakan minimal PAN_MARGIN px konten di layar (tidak hilang total).
  // Kalau konten lebih kecil dari kanvas (zoom out), kunci di tengah.
  const clampOffset = (off: Point): Point => {
    const PAN_MARGIN = 40;
    const s = scaleRef.current;
    const cw = canvasWRef.current;
    const ch = canvasHRef.current;
    const b = bboxRef.current;
    let x = off.x;
    let y = off.y;
    const maxOffX = cw - PAN_MARGIN - b.minX * s;
    const minOffX = PAN_MARGIN - b.maxX * s;
    x = maxOffX >= minOffX ? Math.min(Math.max(x, minOffX), maxOffX) : (minOffX + maxOffX) / 2;
    const maxOffY = ch - PAN_MARGIN - b.minY * s;
    const minOffY = PAN_MARGIN - b.maxY * s;
    y = maxOffY >= minOffY ? Math.min(Math.max(y, minOffY), maxOffY) : (minOffY + maxOffY) / 2;
    return { x, y };
  };

  const snapWorld = (p: Point): Point => {
    if (!magnetOnRef.current) return p;
    // endpoint snap
    const snapEP = nearestPoint(p, allPointsRef.current, 0.3);
    if (snapEP) return snapEP;
    // segment snap (closest projection)
    let bestProj: Point | null = null;
    let bestDist = 0.3;
    for (const w of wallsRef.current) {
      const d = distancePointToSegment(p, w.p1, w.p2);
      if (d <= bestDist) {
        bestDist = d;
        // projection
        const ab = { x: w.p2.x - w.p1.x, y: w.p2.y - w.p1.y };
        const ap = { x: p.x - w.p1.x, y: p.y - w.p1.y };
        const ab2 = ab.x * ab.x + ab.y * ab.y;
        if (ab2 === 0) { bestProj = { ...w.p1 }; }
        else {
          let t = (ap.x * ab.x + ap.y * ab.y) / ab2;
          t = Math.max(0, Math.min(1, t));
          bestProj = { x: w.p1.x + t * ab.x, y: w.p1.y + t * ab.y };
        }
      }
    }
    if (bestProj) return bestProj;
    // orthogonal align using nearest endpoint as from reference? keep simple
    return p;
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      const wpt = toWorld(locationX, locationY);
      // Mode Gambar: satu jari di kanvas = gambar dinding (bukan pan).
      if (toolRef.current === 'draw' && modeRef.current === 'none') {
        const snap = snapGridRef.current ? snapToGrid(wpt, 0.1) : wpt;
        prestartRef.current = snap; setPrestart(snap);
        preendRef.current = snap; setPreend(snap);
        modeRef.current = 'draw'; setMode('draw');
        return;
      }
      // Mode Pilih: sentuh dinding = pilih/geser titik; area kosong = pan.
      if (toolRef.current === 'select') {
        // try select wall by line proximity
        let best: { w: typeof walls[0]; d: number } | null = null;
        for (const w of wallsRef.current) {
          const d = distancePointToSegment(wpt, w.p1, w.p2);
          if (d < 0.35) { // ~35 px at 50 scale? use world distance ~0.35m ~ 17px
            if (!best || d < best.d) best = { w, d };
          }
        }
        if (best) {
          selectWall(best.w.id);
          // try drag vertex if near endpoint
          const nearP1 = distance(wpt, best.w.p1) < 0.25;
          const nearP2 = distance(wpt, best.w.p2) < 0.25;
          if (nearP1 || nearP2) {
            const vp = nearP1 ? best.w.p1 : best.w.p2;
            dragVertexPointRef.current = vp; setDragVertexPoint(vp);
            dragVertexWallIdRef.current = best.w.id; setDragVertexWallId(best.w.id);
            modeRef.current = 'dragVertex'; setMode('dragVertex');
            return;
          }
        }
      }
      // Area kosong: mulai pan. Simpan offset awal gesture agar translasi jari diakumulasi.
      panStartRef.current = { x: locationX, y: locationY };
      panOffsetStartRef.current = { ...offsetRef.current };
      modeRef.current = 'pan'; setMode('pan');
    },
    onPanResponderMove: (_e, gs) => {
      if (modeRef.current === 'pan') {
        // offset baru = offset saat gesture mulai + total translasi jari, lalu clamp ke batas.
        const raw = { x: panOffsetStartRef.current.x + gs.dx, y: panOffsetStartRef.current.y + gs.dy };
        setOffset(clampOffset(raw));
        setUserAdjusted(true);
      } else if (modeRef.current === 'draw') {
        const wpt = toWorld(gs.moveX, gs.moveY);
        let p = snapGridRef.current ? snapToGrid(wpt, 0.1) : wpt;
        if (snapOrthoRef.current && prestartRef.current) {
          p = snapOrthogonal(prestartRef.current, p, 7);
        }
        if (magnetOnRef.current) {
          p = snapWorld(p);
          setSnapTarget(p);
        } else {
          setSnapTarget(null);
        }
        preendRef.current = p; setPreend(p);
      } else if (modeRef.current === 'dragVertex') {
        const wpt = toWorld(gs.moveX, gs.moveY);
        let p = snapGridRef.current ? snapToGrid(wpt, 0.1) : wpt;
        // snap to existing points
        const near = nearestPoint(p, allPointsRef.current, 0.3);
        if (near) p = near;
        if (magnetOnRef.current) {
          p = snapWorld(p);
          setSnapTarget(p);
        } else {
          setSnapTarget(null);
        }
        if (dragVertexPointRef.current && dragVertexWallIdRef.current) {
          // only update preview, commit on release
          dragVertexPointRef.current = p; setDragVertexPoint(p);
        }
      }
    },
    onPanResponderRelease: (e, gs) => {
      if (modeRef.current === 'draw') {
        if (prestartRef.current && preendRef.current) {
          let p1 = prestartRef.current;
          let p2 = preendRef.current;
          if (snapOrthoRef.current) p2 = snapOrthogonal(p1, p2, 7);
          const len = wallLength(p1, p2);
          if (len >= MIN_LEN) {
            // snap to existing points if near
            const nearP1 = nearestPoint(p1, allPointsRef.current, 0.3);
            const nearP2 = nearestPoint(p2, allPointsRef.current, 0.3);
            if (nearP1) p1 = nearP1;
            if (nearP2) p2 = nearP2;
            if (magnetOnRef.current) {
              p1 = snapWorld(p1);
              p2 = snapWorld(p2);
            }
            addWallAt(p1, p2);
          }
        }
        prestartRef.current = null; setPrestart(null);
        preendRef.current = null; setPreend(null);
        setSnapTarget(null);
        modeRef.current = 'none'; setMode('none');
        return;
      }
      if (modeRef.current === 'dragVertex') {
        const wpt = toWorld(e.nativeEvent.locationX, e.nativeEvent.locationY);
        let p = snapGridRef.current ? snapToGrid(wpt, 0.1) : wpt;
        if (magnetOnRef.current) {
          p = snapWorld(p);
        }
        const near = nearestPoint(p, allPointsRef.current, 0.3);
        if (near) p = near;
        if (dragVertexPointRef.current && dragVertexWallIdRef.current) {
          moveVertex(dragVertexPointRef.current, p);
        }
        dragVertexPointRef.current = null; setDragVertexPoint(null);
        dragVertexWallIdRef.current = null; setDragVertexWallId(null);
        setSnapTarget(null);
        modeRef.current = 'none'; setMode('none');
        setUserAdjusted(true);
        return;
      }
      if (modeRef.current === 'deleteTap') {
        const wpt = toWorld(e.nativeEvent.locationX, e.nativeEvent.locationY);
        for (const w of wallsRef.current) {
          if (distancePointToSegment(wpt, w.p1, w.p2) < 0.35) {
            Alert.alert('Hapus dinding', `Hapus ${w.name}?`, [
              { text: 'Batal', style: 'cancel' },
              { text: 'Hapus', onPress: () => removeWall(w.id), style: 'destructive' },
            ]);
            break;
          }
        }
        modeRef.current = 'none'; setMode('none');
        return;
      }
      // Akhir gesture pan: offset sudah tersimpan di state (tidak di-reset).
      modeRef.current = 'none'; setMode('none');
    },
    onPanResponderTerminate: () => {
      modeRef.current = 'none'; setMode('none');
      prestartRef.current = null; setPrestart(null);
      preendRef.current = null; setPreend(null);
    },
  }), []);

  // render helpers
  const ptScreen = (p: Point) => toScreen(p);

  if (walls.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0b1021', justifyContent: 'center', alignItems: 'center' }}>
        <RNText style={{ color: '#89ceff', fontSize: 14 }}>Ketuk + Ruangan untuk mulai</RNText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {/* Toolbar left */}
      <View style={{ width: 56, backgroundColor: '#131b2e', paddingVertical: 8, alignItems: 'center', gap: 6 }}>
        {[{ k: 'select', l: 'Pilih' }, { k: 'draw', l: 'Gambar' }, { k: 'delete', l: 'Hapus' }].map((t) => (
          <Pressable key={t.k} onPress={() => setTool(t.k as any)} style={{ padding: 6, borderRadius: 8, backgroundColor: tool === t.k ? C.primary : '#1e293b', width: 44, alignItems: 'center' }}>
            <RNText style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{t.l}</RNText>
          </Pressable>
        ))}
        <Pressable onPress={() => setSnapGrid((v) => !v)} style={{ padding: 4, borderRadius: 6, backgroundColor: snapGrid ? C.primary : '#1e293b', width: 44, alignItems: 'center' }}>
          <RNText style={{ color: '#fff', fontSize: 9 }}>Snap</RNText>
        </Pressable>
        <Pressable onPress={() => setMagnetOn((v) => !v)} style={{ padding: 4, borderRadius: 6, backgroundColor: magnetOn ? C.primary : '#1e293b', width: 44, alignItems: 'center' }}>
          <RNText style={{ color: '#fff', fontSize: 9 }}>{magnetOn ? 'Magnet ON' : 'Magnet OFF'}</RNText>
        </Pressable>
        <Pressable onPress={() => setSnapOrtho((v) => !v)} style={{ padding: 4, borderRadius: 6, backgroundColor: snapOrtho ? C.primary : '#1e293b', width: 44, alignItems: 'center' }}>
          <RNText style={{ color: '#fff', fontSize: 9 }}>Siku</RNText>
        </Pressable>
        <Pressable onPress={fitToContent} style={{ padding: 4, borderRadius: 6, backgroundColor: '#1e293b', width: 44, alignItems: 'center' }}>
          <RNText style={{ color: '#fff', fontSize: 9 }}>Pas</RNText>
        </Pressable>
        <Pressable onPress={() => { setScale((s) => Math.min(150, s + 10)); }} style={{ padding: 4, borderRadius: 6, backgroundColor: '#1e293b', width: 44, alignItems: 'center' }}>
          <RNText style={{ color: '#fff', fontSize: 14 }}>+</RNText>
        </Pressable>
        <Pressable onPress={() => { setScale((s) => Math.max(15, s - 10)); }} style={{ padding: 4, borderRadius: 6, backgroundColor: '#1e293b', width: 44, alignItems: 'center' }}>
          <RNText style={{ color: '#fff', fontSize: 14 }}>−</RNText>
        </Pressable>
        {tool === 'draw' && (
          <RNText style={{ color: '#89ceff', fontSize: 10, textAlign: 'center', marginTop: 4 }}>Seret di kanvas</RNText>
        )}
      </View>
      {/* Canvas */}
      <View style={{ flex: 1, backgroundColor: '#0b1021' }} {...pan.panHandlers} onLayout={(e) => { const { width, height } = e.nativeEvent.layout; setCanvasW(width); setCanvasH(height); }}>
        <Svg width={canvasW > 0 ? canvasW : viewW} height={canvasH > 0 ? canvasH : viewH} viewBox={`0 0 ${canvasW > 0 ? canvasW : viewW} ${canvasH > 0 ? canvasH : viewH}`}>
          {/* grid */}
          <G>
            {Array.from({ length: 21 }).map((_, i) => (
              <Line key={`v${i}`} x1={i * scale + offset.x} y1={0} x2={i * scale + offset.x} y2={viewH} stroke={i % 5 === 0 ? '#334155' : '#1e293b'} strokeWidth={i % 5 === 0 ? 0.8 : 0.3} />
            ))}
            {Array.from({ length: 21 }).map((_, i) => (
              <Line key={`h${i}`} x1={0} y1={i * scale + offset.y} x2={viewW} y2={i * scale + offset.y} stroke={i % 5 === 0 ? '#334155' : '#1e293b'} strokeWidth={i % 5 === 0 ? 0.8 : 0.3} />
            ))}
          </G>
          {/* walls */}
          {walls.map((w) => {
            const s1 = ptScreen(w.p1);
            const s2 = ptScreen(w.p2);
            const isSel = w.id === selectedId;
            return (
              <G key={w.id}>
                <Line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke={isSel ? '#f97316' : '#89ceff'} strokeWidth={isSel ? 6 : 4} strokeLinecap="round" />
                {/* endpoints */}
                <Circle cx={s1.x} cy={s1.y} r={VERTEX_R} fill={isSel ? '#f97316' : '#89ceff'} />
                <Circle cx={s2.x} cy={s2.y} r={VERTEX_R} fill={isSel ? '#f97316' : '#89ceff'} />
                {/* label length */}
                <SVGText x={(s1.x + s2.x) / 2} y={(s1.y + s2.y) / 2 - 6} fill="#fff" fontSize="10" textAnchor="middle" fontWeight="600">{w.length_meters.toFixed(2)} m</SVGText>
                {/* label name near selected */}
                {isSel && (
                  <SVGText x={(s1.x + s2.x) / 2} y={(s1.y + s2.y) / 2 + 10} fill="#f97316" fontSize="9" textAnchor="middle">{w.name}</SVGText>
                )}
                {(w.openings ?? []).map((o) => {
                  const geo = openingGeometry(w, o);
                  const sW = ptScreen(geo.startWorld);
                  const eW = ptScreen(geo.endWorld);
                  const isSelOpen = isSel && w.id === selectedId && o.id === (w.openings?.find(x => x.id === o.id)?.id); // not needed; just show all
                  return (
                    <G key={o.id}>
                      {/* gap in wall line represented by not drawing over opening; already done by drawing opening over */}
                      <Line x1={sW.x} y1={sW.y} x2={eW.x} y2={eW.y} stroke={o.type === 'pintu' ? '#ffb95f' : '#89ceff'} strokeWidth={o.type === 'pintu' ? 4 : 3} />
                      {o.type === 'pintu' && (
                        <>
                          <Line x1={sW.x} y1={sW.y} x2={sW.x + (eW.x - sW.x) * 0.3} y2={sW.y + (eW.y - sW.y) * 0.3} stroke="#ffb95f" strokeWidth={2} />
                          <Line x1={eW.x} y1={eW.y} x2={eW.x - (eW.x - sW.x) * 0.2} y2={eW.y - (eW.y - sW.y) * 0.2} stroke="#ffb95f" strokeWidth={2} strokeDasharray="4 2" />
                        </>
                      )}
                      {o.type === 'jendela' && (
                        <>
                          <Line x1={sW.x} y1={sW.y} x2={eW.x} y2={eW.y} stroke="#89ceff" strokeWidth={1} />
                          <Line x1={sW.x + (eW.x - sW.x) * 0.5} y1={sW.y + (eW.y - sW.y) * 0.5 - 3} x2={sW.x + (eW.x - sW.x) * 0.5} y2={sW.y + (eW.y - sW.y) * 0.5 + 3} stroke="#89ceff" strokeWidth={1} />
                        </>
                      )}
                    </G>
                  );
                })}
              </G>
            );
          })}
          {/* openings indicator on selected */}
          {selectedId && (() => {
            const w = walls.find((x) => x.id === selectedId);
            if (!w) return null;
            const s1 = ptScreen(w.p1);
            const s2 = ptScreen(w.p2);
            const len = Math.hypot(s2.x - s1.x, s2.y - s1.y) || 1;
            return (w.openings ?? []).map((o) => {
              const cx = s1.x + (o.width_meters / w.length_meters) * (s2.x - s1.x) * 0.5; // rough
              return <Rect key={o.id} x={cx - 4} y={Math.min(s1.y, s2.y) - 8} width={8} height={8} fill={o.type === 'pintu' ? '#ffb95f' : '#89ceff'} rx={2} />;
            });
          })()}
          {/* snap indicator */}
          {snapTarget && (
            <Circle cx={ptScreen(snapTarget).x} cy={ptScreen(snapTarget).y} r={10} fill="none" stroke="#fbbf24" strokeWidth={2} />
          )}
          {/* preview draw */}
          {prestart && preend && (
            <Line x1={ptScreen(prestart).x} y1={ptScreen(prestart).y} x2={ptScreen(preend).x} y2={ptScreen(preend).y} stroke="#f97316" strokeWidth={2} strokeDasharray="6 3" />
          )}
          {prestart && preend && (
            <SVGText x={(ptScreen(prestart).x + ptScreen(preend).x) / 2} y={Math.min(ptScreen(prestart).y, ptScreen(preend).y) - 8} fill="#f97316" fontSize="10" textAnchor="middle">{wallLength(prestart, preend).toFixed(2)} m</SVGText>
          )}
          {/* green snap indicator */}
          {prestart && preend && (() => {
            const near = nearestPoint(preend, allPoints, 0.3);
            if (!near) return null;
            const sn = ptScreen(near);
            return <Circle cx={sn.x} cy={sn.y} r={6} fill="#4ade80" />;
          })()}
        </Svg>
      </View>
    </View>
  );
}
