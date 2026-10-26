import React, { useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import PlanCanvas from '../components/PlanCanvas';
import Stepper from '../components/Stepper';
import ChipGroup from '../components/ChipGroup';
import { useWallStore, selectActiveWall } from '../store/wallStore';
import { useProjectStore } from '../store/projectStore';
import { confirm } from '../utils/confirm';
import { peringatan } from '../utils/confirm';
import { useAuthStore } from '../store/authStore';
import { keluar } from '../services/authService';
import { BRICK_LABEL, DEFAULT_PINTU, DEFAULT_JENDELA, OPENING_LIMITS } from '../constants/materials';
import type { BrickType, MortarRatio, Point } from '../types';
import { minRadius, radiusFromSagitta, effectiveWallLength } from '../utils/geometry';
import { MARGIN } from '../utils/openings';
import { C } from '../theme';
import NamaProyekModal from '../components/NamaProyekModal';
import TemplateModal from '../components/TemplateModal';

const BRICKS = (Object.keys(BRICK_LABEL) as BrickType[]).map((k) => ({ value: k, label: BRICK_LABEL[k] }));
const MORTARS: { value: MortarRatio; label: string }[] = [
  { value: '1:4', label: '1:4 Standar' },
  { value: '1:2', label: '1:2 Kedap Air' },
];

// Gaya khusus web untuk handle seret panel: tanpa ini browser mengambil
// gesture (drag gambar / scroll) sehingga PanResponder tidak menerima event.
// `any` dipakai karena properti web (touchAction/cursor) tidak ada di tipe
// ViewStyle native.
const HANDLE_WEB_STYLE: any = Platform.select({
  web: { touchAction: 'none', userSelect: 'none', cursor: 'row-resize' },
  default: {},
});

/** Slider kelengkungan dua arah: tengah = lurus, ujung = setengah lingkaran.
 * Area sentuh 44px; hanya merebut gesture horizontal agar scroll panel tetap lancar. */
function ArcSlider({ sagitta, maxSag, onSlide }: { sagitta: number; maxSag: number; onSlide: (v: number) => void }) {
  const trackWRef = useRef(0);
  const maxSagRef = useRef(maxSag);
  maxSagRef.current = maxSag;
  const onSlideRef = useRef(onSlide);
  onSlideRef.current = onSlide;

  const setFromX = (x: number) => {
    const w = trackWRef.current;
    if (!(w > 0)) return;
    const cx = Math.max(0, Math.min(w, x));
    const t = cx / w;
    onSlideRef.current(Math.round(((t * 2 - 1) * maxSagRef.current) * 100) / 100);
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, gs) => Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.2,
    onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
    onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    onPanResponderTerminationRequest: () => false,
  }), []);

  const t = maxSag > 1e-9 ? Math.max(0, Math.min(1, (sagitta / maxSag + 1) / 2)) : 0.5;
  const fillLeft = Math.min(t, 0.5) * 100;
  const fillWidth = Math.abs(t - 0.5) * 100;
  return (
    <View
      {...pan.panHandlers}
      style={{ minHeight: 44, justifyContent: 'center' }}
      accessibilityRole="adjustable"
      accessibilityLabel="Kelengkungan dinding"
      accessibilityValue={{ text: Math.abs(sagitta) < 0.05 ? 'Lurus' : `${sagitta.toFixed(2)} m` }}
    >
      <View
        onLayout={(e) => { trackWRef.current = e.nativeEvent.layout.width; }}
        style={{ height: 6, borderRadius: 3, backgroundColor: C.surfaceHighest }}
      >
        <View style={{ position: 'absolute', left: `${fillLeft}%`, width: `${fillWidth}%`, top: 0, bottom: 0, backgroundColor: C.primary, borderRadius: 3 }} />
        <View style={{ position: 'absolute', left: '50%', top: -3, width: 2, height: 12, marginLeft: -1, backgroundColor: C.outline, borderRadius: 1 }} />
      </View>
      <View style={{ position: 'absolute', left: `${t * 100}%`, top: 22, width: 28, height: 28, marginLeft: -14, marginTop: -14, borderRadius: 14, backgroundColor: C.primary, borderWidth: 2, borderColor: '#fff' }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ color: C.outline, fontSize: 10 }}>â—€ kiri</Text>
        <Text style={{ color: C.outline, fontSize: 10 }}>lurus</Text>
        <Text style={{ color: C.outline, fontSize: 10 }}>kanan â–¶</Text>
      </View>
    </View>
  );
}

export default function EditorScreen({ onCalculate, onOpenPrices, onOpenProjects }: { onCalculate: () => void; onOpenPrices?: () => void; onOpenProjects?: () => void }) {
  const s = useWallStore();
  const walls = s.walls;
  const selectedId = s.selectedId;
  const [warn, setWarn] = useState('');
  const [warnColor, setWarnColor] = useState('#ffb4ab');
  const [roomModal, setRoomModal] = useState(false);
  const [roomShape, setRoomShape] = useState<'persegi' | 'L'>('persegi');
  const [roomW, setRoomW] = useState('3');
  const [roomL, setRoomL] = useState('3');
  const saveCurrentAs = useProjectStore((s) => s.saveCurrentAs);
  const [modalVisible, setModalVisible] = useState(false);
  const [defaultNama, setDefaultNama] = useState('Proyek ' + new Date().toLocaleDateString('id-ID'));
  const [templateModal, setTemplateModal] = useState(false);
  const [roomPreset, setRoomPreset] = useState('kamar');
  const [roomCustomW, setRoomCustomW] = useState('3');
  const [roomCustomL, setRoomCustomL] = useState('3');
  const [roomRotated, setRoomRotated] = useState(false);
  const [roomSide, setRoomSide] = useState<'luar' | 'dalam'>('luar');
  const [roomDoor, setRoomDoor] = useState(true);
  const [roomOffset, setRoomOffset] = useState('0');
  const [samakanPanjang, setSamakanPanjang] = useState(false);
  const [roomCutW, setRoomCutW] = useState('2');
  const [roomCutL, setRoomCutL] = useState('2');
  const [fitTrigger, setFitTrigger] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [panelH, setPanelH] = useState<number | null>(null); // tinggi panel bawah (px); null = default flex
  const { height: winH } = useWindowDimensions();
  // Tinggi TERUKUR panel (layout aktual), bukan nilai state â€” state bisa null
  // (default flex) sehingga membaca state saat grant memberi 320 yang salah.
  const panelMeasuredHRef = useRef(320);
  // Tinggi awal gesture: diisi saat grant, dibaca saat move (tidak dari state).
  const startHeightRef = useRef(320);
  // Batas seret mengikuti tinggi layar terbaru tanpa membuat ulang PanResponder.
  // Batas WAJIB memuat tinggi panel saat ini: kalau tidak, begitu digerakkan
  // nilai langsung terpental ke min/max (efek "loncat"), bukan mengikuti jari.
  const panelLimitsRef = useRef({ minH: 120, maxH: 480 });
  const baseMinH = 120;
  const baseMaxH = Math.max(baseMinH + 40, winH - Math.round(winH * 0.35) - 150);
  const measuredH = panelMeasuredHRef.current;
  panelLimitsRef.current = {
    minH: Math.min(baseMinH, measuredH),
    maxH: Math.max(baseMaxH, measuredH),
  };
  // Batas BEKU selama satu gesture: dibuat ulang hanya saat grant. Kalau batas
  // ikut bergeser tiap render, panel bisa tumbuh melewati batas atas.
  const gestureLimitsRef = useRef<{ minH: number; maxH: number }>({ minH: 120, maxH: 480 });
  const setPanelHRef = useRef(setPanelH);
  setPanelHRef.current = setPanelH;
  const clampPanelH = (h: number) => {
    const { minH, maxH } = panelLimitsRef.current;
    return Math.round(Math.min(Math.max(h, minH), maxH));
  };

  // Handle seret di tepi atas panel: PanResponder tersendiri (terpisah dari
  // gesture kanvas) sehingga tidak bentrok dengan pan/zoom/gambar dinding.
  // Dibuat sekali (dep kosong): grant menyimpan tinggi aktual di ref, move
  // memakai startHeightRef - gs.dy secara kontinu tanpa snapping.
  const panelDrag = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      console.log('handle grant');
      // Simpan tinggi panel saat gesture dimulai (bukan dari state).
      startHeightRef.current = panelMeasuredHRef.current;
      // Bekukan batas seret untuk gesture ini.
      gestureLimitsRef.current = { ...panelLimitsRef.current };
    },
    onPanResponderMove: (_e, gs) => {
      console.log('handle move', gs.dy);
      // Seret ke atas (dy negatif) = panel membesar; ke bawah = mengecil.
      // Kontinu mengikuti jari/mouse; posisi akhir dipertahankan saat dilepas.
      const { minH, maxH } = gestureLimitsRef.current;
      const next = Math.round(Math.min(Math.max(startHeightRef.current - gs.dy, minH), maxH));
      setPanelHRef.current(next);
    },
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  }), []);
  const addRoom = useWallStore((s) => s.addRoom);
  const loadPlan = useWallStore((s) => s.loadPlan);
  const loadWalls = useWallStore((s) => s.loadWalls);
  const setRooms = useWallStore((s) => s.setRooms);
  const auth = useAuthStore();
  const project = useProjectStore((s) => s.currentProjectId ? s.projects.find((p) => p.id === s.currentProjectId) : null);
  const saveCurrent = useProjectStore((s) => s.saveCurrent);
  const newProject = useProjectStore((s) => s.newProject);
  const floors = useWallStore((s) => s.floors);
  const activeFloorId = useWallStore((s) => s.activeFloorId);
  const setActiveFloor = useWallStore((s) => s.setActiveFloor);
  const addFloor = useWallStore((s) => s.addFloor);
  const removeFloor = useWallStore((s) => s.removeFloor);
  const [copyFromBelow, setCopyFromBelow] = useState(true);
  const [arcRadiusText, setArcRadiusText] = useState('');
  const [cornerRadiusText, setCornerRadiusText] = useState('0,3');
  const cornerPoint = useWallStore((s) => s.cornerPoint);
  const selectCorner = useWallStore((s) => s.selectCorner);
  const wall = selectActiveWall(s);

  const tool = (label: string, onPress: () => void, enabled = true, danger = false) => (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      style={{
        paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8,
        backgroundColor: danger ? '#93000a55' : C.surface, opacity: enabled ? 1 : 0.4,
      }}
    >
      <Text style={{ color: danger ? C.error : C.text, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );

  const summary = useMemo(() => {
    const count = walls.length;
    const total = walls.reduce((s, w) => s + w.length_meters, 0);
    const gross = walls.reduce((s, w) => s + w.length_meters * w.height_meters, 0);
    return { count, total, gross };
  }, [walls]);

  const wallSummary = useMemo(() => {
    const gross = wall.length_meters * wall.height_meters;
    const open = (wall.openings ?? []).reduce((sum, o) => sum + o.width_meters * o.height_meters * o.quantity, 0);
    const net = Math.max(0, gross - open);
    const over = open > gross + 0.001;
    return { gross, open, net, over };
  }, [wall]);

  const isDefaultPlan = JSON.stringify(walls.map((w) => ({ id: w.id, name: w.name, p1: w.p1, p2: w.p2, length: w.length_meters }))) === JSON.stringify([
    { id: 'w-1', name: 'W-01', p1: { x: 0, y: 4 }, p2: { x: 5, y: 4 }, length: 5 },
    { id: 'w-2', name: 'W-02', p1: { x: 5, y: 4 }, p2: { x: 5, y: 0 }, length: 4 },
    { id: 'w-3', name: 'W-03', p1: { x: 5, y: 0 }, p2: { x: 0, y: 0 }, length: 5 },
    { id: 'w-4', name: 'W-04', p1: { x: 0, y: 0 }, p2: { x: 0, y: 4 }, length: 4 },
  ]);

  const handleTemplateSelect = (template: string) => {
    if (!isDefaultPlan) {
      confirm('Ganti denah?', 'Denah saat ini akan diganti dengan template.', () => applyTemplate(template));
    } else {
      applyTemplate(template);
    }
  };

  const applyTemplate = (template: string) => {
    setTemplateModal(false);
    const h = 3.2;
    const brick = 'bata_merah' as const;
    const mortar = '1:4' as const;
    const p = DEFAULT_PINTU;
    const j = DEFAULT_JENDELA;
    if (template === '48') {
      loadWalls([
        { id: 'w-1', name: 'W-01', p1: { x: 0, y: 0 }, p2: { x: 8, y: 0 }, length_meters: 8, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-1', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 2, swing: 1 }] },
        { id: 'w-2', name: 'W-02', p1: { x: 8, y: 0 }, p2: { x: 8, y: 6 }, length_meters: 6, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-2', type: 'jendela', width_meters: j.width_meters, height_meters: j.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }, { id: 'o-3', type: 'jendela', width_meters: j.width_meters, height_meters: j.height_meters, quantity: 1, offset_meters: 4.5, swing: 1 }] },
        { id: 'w-3', name: 'W-03', p1: { x: 8, y: 6 }, p2: { x: 0, y: 6 }, length_meters: 8, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-4', type: 'jendela', width_meters: j.width_meters, height_meters: j.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }, { id: 'o-5', type: 'jendela', width_meters: j.width_meters, height_meters: j.height_meters, quantity: 1, offset_meters: 4.5, swing: 1 }, { id: 'o-6', type: 'jendela', width_meters: j.width_meters, height_meters: j.height_meters, quantity: 1, offset_meters: 7, swing: 1 }] },
        { id: 'w-4', name: 'W-04', p1: { x: 0, y: 6 }, p2: { x: 0, y: 0 }, length_meters: 6, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-7', type: 'jendela', width_meters: j.width_meters, height_meters: j.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }, { id: 'o-8', type: 'jendela', width_meters: j.width_meters, height_meters: j.height_meters, quantity: 1, offset_meters: 4.5, swing: 1 }] },
        { id: 'w-5', name: 'W-05', p1: { x: 0, y: 3 }, p2: { x: 8, y: 3 }, length_meters: 8, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-9', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }, { id: 'o-10', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 4.5, swing: 1 }, { id: 'o-11', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 7, swing: 1 }] },
        { id: 'w-6', name: 'W-06', p1: { x: 4, y: 0 }, p2: { x: 4, y: 3 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-12', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
        { id: 'w-7', name: 'W-07', p1: { x: 3, y: 3 }, p2: { x: 3, y: 6 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-13', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
        { id: 'w-8', name: 'W-08', p1: { x: 6, y: 3 }, p2: { x: 6, y: 6 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-14', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
      ] as any);
      setRooms([
        { id: 'r-1', name: 'Ruang Tamu', seed: { x: 2, y: 1.5 } },
        { id: 'r-2', name: 'Dapur', seed: { x: 6, y: 1.5 } },
        { id: 'r-3', name: 'Kamar 1', seed: { x: 1.5, y: 4.5 } },
        { id: 'r-4', name: 'Kamar 2', seed: { x: 4.5, y: 4.5 } },
        { id: 'r-5', name: 'Kamar Mandi', seed: { x: 7, y: 4.5 } },
      ]);
    } else if (template === '21') {
      loadWalls([
        { id: 'w-1', name: 'W-01', p1: { x: 0, y: 0 }, p2: { x: 3, y: 0 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [] },
        { id: 'w-2', name: 'W-02', p1: { x: 3, y: 0 }, p2: { x: 6, y: 0 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-1', type: 'jendela', width_meters: 0.6, height_meters: j.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
        { id: 'w-3', name: 'W-03', p1: { x: 6, y: 0 }, p2: { x: 6, y: 1.5 }, length_meters: 1.5, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [] },
        { id: 'w-4', name: 'W-04', p1: { x: 6, y: 1.5 }, p2: { x: 6, y: 3.5 }, length_meters: 2, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-2', type: 'jendela', width_meters: j.width_meters, height_meters: j.height_meters, quantity: 1, offset_meters: 1, swing: 1 }] },
        { id: 'w-5', name: 'W-05', p1: { x: 6, y: 3.5 }, p2: { x: 3, y: 3.5 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-3', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
        { id: 'w-6', name: 'W-06', p1: { x: 3, y: 3.5 }, p2: { x: 0, y: 3.5 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [] },
        { id: 'w-7', name: 'W-07', p1: { x: 0, y: 3.5 }, p2: { x: 0, y: 0 }, length_meters: 3.5, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-4', type: 'jendela', width_meters: j.width_meters, height_meters: j.height_meters, quantity: 1, offset_meters: 1.75, swing: 1 }] },
        { id: 'w-8', name: 'W-08', p1: { x: 3, y: 0 }, p2: { x: 3, y: 1.5 }, length_meters: 1.5, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [] },
        { id: 'w-9', name: 'W-09', p1: { x: 3, y: 1.5 }, p2: { x: 3, y: 3.5 }, length_meters: 2, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-5', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 1, swing: 1 }] },
        { id: 'w-10', name: 'W-10', p1: { x: 3, y: 1.5 }, p2: { x: 6, y: 1.5 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-6', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
      ] as any);
      setRooms([
        { id: 'r-1', name: 'Ruang Tamu', seed: { x: 1.5, y: 0.75 } },
        { id: 'r-2', name: 'Dapur', seed: { x: 4.5, y: 0.75 } },
        { id: 'r-3', name: 'Kamar 1', seed: { x: 1.5, y: 2.5 } },
        { id: 'r-4', name: 'Kamar Mandi', seed: { x: 4.5, y: 2.5 } },
      ]);
    } else if (template === '36') {
      loadWalls([
        { id: 'w-1', name: 'W-01', p1: { x: 0, y: 0 }, p2: { x: 3, y: 0 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [] },
        { id: 'w-2', name: 'W-02', p1: { x: 3, y: 0 }, p2: { x: 6, y: 0 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [] },
        { id: 'w-3', name: 'W-03', p1: { x: 6, y: 0 }, p2: { x: 6, y: 3 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-1', type: 'jendela', width_meters: j.width_meters, height_meters: j.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
        { id: 'w-4', name: 'W-04', p1: { x: 6, y: 3 }, p2: { x: 6, y: 6 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-2', type: 'jendela', width_meters: 0.6, height_meters: j.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
        { id: 'w-5', name: 'W-05', p1: { x: 6, y: 6 }, p2: { x: 4.5, y: 6 }, length_meters: 1.5, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [] },
        { id: 'w-6', name: 'W-06', p1: { x: 4.5, y: 6 }, p2: { x: 0, y: 6 }, length_meters: 4.5, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-3', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 2.25, swing: 1 }] },
        { id: 'w-7', name: 'W-07', p1: { x: 0, y: 6 }, p2: { x: 0, y: 3 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-4', type: 'jendela', width_meters: j.width_meters, height_meters: j.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
        { id: 'w-8', name: 'W-08', p1: { x: 0, y: 3 }, p2: { x: 0, y: 0 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-5', type: 'jendela', width_meters: j.width_meters, height_meters: j.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
        { id: 'w-9', name: 'W-09', p1: { x: 0, y: 3 }, p2: { x: 3, y: 3 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-6', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
        { id: 'w-10', name: 'W-10', p1: { x: 3, y: 3 }, p2: { x: 4.5, y: 3 }, length_meters: 1.5, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-7', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 0.75, swing: 1 }] },
        { id: 'w-11', name: 'W-11', p1: { x: 4.5, y: 3 }, p2: { x: 6, y: 3 }, length_meters: 1.5, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [] },
        { id: 'w-12', name: 'W-12', p1: { x: 3, y: 0 }, p2: { x: 3, y: 3 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [] },
        { id: 'w-13', name: 'W-13', p1: { x: 4.5, y: 3 }, p2: { x: 4.5, y: 6 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-8', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
      ] as any);
      setRooms([
        { id: 'r-1', name: 'Ruang Tamu', seed: { x: 2.25, y: 4.5 } },
        { id: 'r-2', name: 'Dapur', seed: { x: 4.5, y: 1.5 } },
        { id: 'r-3', name: 'Kamar 1', seed: { x: 1.5, y: 1.5 } },
        { id: 'r-4', name: 'Kamar 2', seed: { x: 5.25, y: 4.5 } },
      ]);
    } else if (template === '45') {
      loadWalls([
        { id: 'w-1', name: 'W-01', p1: { x: 0, y: 0 }, p2: { x: 3, y: 0 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [] },
        { id: 'w-2', name: 'W-02', p1: { x: 3, y: 0 }, p2: { x: 6, y: 0 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-1', type: 'jendela', width_meters: j.width_meters, height_meters: j.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
        { id: 'w-3', name: 'W-03', p1: { x: 6, y: 0 }, p2: { x: 7.5, y: 0 }, length_meters: 1.5, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-2', type: 'jendela', width_meters: 0.6, height_meters: j.height_meters, quantity: 1, offset_meters: 0.75, swing: 1 }] },
        { id: 'w-4', name: 'W-04', p1: { x: 7.5, y: 0 }, p2: { x: 7.5, y: 3 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [] },
        { id: 'w-5', name: 'W-05', p1: { x: 7.5, y: 3 }, p2: { x: 7.5, y: 6 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-3', type: 'jendela', width_meters: j.width_meters, height_meters: j.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
        { id: 'w-6', name: 'W-06', p1: { x: 7.5, y: 6 }, p2: { x: 4.5, y: 6 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [] },
        { id: 'w-7', name: 'W-07', p1: { x: 4.5, y: 6 }, p2: { x: 0, y: 6 }, length_meters: 4.5, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-4', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 2.25, swing: 1 }] },
        { id: 'w-8', name: 'W-08', p1: { x: 0, y: 6 }, p2: { x: 0, y: 3 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-5', type: 'jendela', width_meters: j.width_meters, height_meters: j.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
        { id: 'w-9', name: 'W-09', p1: { x: 0, y: 3 }, p2: { x: 0, y: 0 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-6', type: 'jendela', width_meters: j.width_meters, height_meters: j.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
        { id: 'w-10', name: 'W-10', p1: { x: 0, y: 3 }, p2: { x: 3, y: 3 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-7', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
        { id: 'w-11', name: 'W-11', p1: { x: 3, y: 3 }, p2: { x: 4.5, y: 3 }, length_meters: 1.5, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-8', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 0.75, swing: 1 }] },
        { id: 'w-12', name: 'W-12', p1: { x: 4.5, y: 3 }, p2: { x: 6, y: 3 }, length_meters: 1.5, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [] },
        { id: 'w-13', name: 'W-13', p1: { x: 6, y: 3 }, p2: { x: 7.5, y: 3 }, length_meters: 1.5, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-9', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 0.75, swing: 1 }] },
        { id: 'w-14', name: 'W-14', p1: { x: 3, y: 0 }, p2: { x: 3, y: 3 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [] },
        { id: 'w-15', name: 'W-15', p1: { x: 6, y: 0 }, p2: { x: 6, y: 3 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [] },
        { id: 'w-16', name: 'W-16', p1: { x: 4.5, y: 3 }, p2: { x: 4.5, y: 6 }, length_meters: 3, height_meters: h, brick_type: brick, mortar_ratio: mortar, openings: [{ id: 'o-10', type: 'pintu', width_meters: p.width_meters, height_meters: p.height_meters, quantity: 1, offset_meters: 1.5, swing: 1 }] },
      ] as any);
      setRooms([
        { id: 'r-1', name: 'Ruang Tamu', seed: { x: 2.25, y: 4.5 } },
        { id: 'r-2', name: 'Dapur', seed: { x: 4.5, y: 1.5 } },
        { id: 'r-3', name: 'Kamar 1', seed: { x: 1.5, y: 1.5 } },
        { id: 'r-4', name: 'Kamar 2', seed: { x: 6.75, y: 4.5 } },
      ]);
    }
    setFitTrigger((v) => v + 1);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* header â€” disembunyikan saat mode penuh */}
      {!isFullscreen && (
      <View style={{ paddingTop: 48, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: '#131b2e' }}>
        <Text style={{ color: C.text, fontSize: 18, fontWeight: '600' }}>Edit Dinding</Text>
        <Text style={{ color: C.secondary, fontSize: 12 }}>{project ? project.name : 'Proyek Baru'}</Text>
        <Text numberOfLines={1} style={{ color: C.tertiary, fontSize: 11 }}>{auth.user ? (auth.user.nama || auth.user.email || 'Pengguna') : (auth.isGuest ? 'Tamu' : '')}</Text>
        <Pressable onPress={async () => {
          const projectStore = useProjectStore.getState();
          await projectStore.flushPendingUploads();
          const status = useProjectStore.getState().syncStatus;
          if (status === 'galat') {
            confirm('Ada proyek yang belum tersinkron dan akan hilang jika keluar. Tetap keluar?', '', () => { auth.logout(); keluar(); });
          } else {
            auth.logout(); keluar();
          }
        }} style={{ position: 'absolute', right: 16, top: 48, padding: 6 }}>
          <Text style={{ color: C.error, fontSize: 12, fontWeight: '600' }}>Keluar</Text>
        </Pressable>
        <Text style={{ color: C.secondary, fontSize: 12 }}>Geser titik oranye untuk ubah panjang â€¢ Ketuk dinding untuk memilih</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {tool('â†¶ Undo', s.undo, s.past.length > 0)}
          {tool('â†· Redo', s.redo, s.future.length > 0)}
          {tool('Reset', () => confirm('Reset Denah', 'Semua dinding akan dikembalikan ke kondisi awal?', () => s.reset()), true, true)}
          {tool('Rapikan Sudut', () => {
            const r = s.rapikanSudut();
            const ada = r.sambungan > 0 || r.dihapus > 0;
            peringatan('Rapikan Sudut', ada ? `${r.sambungan} sambungan dirapikan, ${r.dihapus} dinding sangat pendek dihapus` : 'Sudah rapi');
          }, true)}
          {onOpenPrices ? tool('Harga', onOpenPrices, true) : null}
          {onOpenProjects ? tool('Proyek', onOpenProjects, true) : null}
          {tool('Template', () => setTemplateModal(true), true)}
          {tool('Simpan', () => { setDefaultNama('Proyek ' + new Date().toLocaleDateString('id-ID')); setModalVisible(true); }, true)}
        </View>
      </View>
      )}

      <View style={{ flex: 1, position: 'relative' }}>
        <PlanCanvas fitTrigger={fitTrigger} isFullscreen={isFullscreen} onToggleFullscreen={() => setIsFullscreen((v) => !v)} />
        {isFullscreen && (
          <View style={{ position: 'absolute', top: 48, right: 12, flexDirection: 'row', gap: 8 }}>
            {tool('Undo', s.undo, s.past.length > 0)}
            {tool('Redo', s.redo, s.future.length > 0)}
            {tool('Simpan', () => { setDefaultNama('Proyek ' + new Date().toLocaleDateString('id-ID')); setModalVisible(true); }, true)}
          </View>
        )}
      </View>

      {/* panel parameter â€” disembunyikan saat mode penuh */}
      {!isFullscreen && (
      <>
      {/* handle seret tepi atas panel: mengubah tinggi kanvas vs panel.
          Sengaja DI LUAR ScrollView agar gesture tidak direbut scroll panel. */}
      <View
        {...panelDrag.panHandlers}
        style={[
          {
            height: 32,
            backgroundColor: C.surfaceHighest,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
          },
          HANDLE_WEB_STYLE,
        ]}
      >
        <View style={{ width: 56, height: 5, borderRadius: 3, backgroundColor: C.outline }} />
        <View style={{ position: 'absolute', right: 10, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable
            onPress={() => setPanelH((h) => clampPanelH((h ?? panelMeasuredHRef.current) - 80))}
            hitSlop={8}
            style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: C.surfaceHighest }}
          >
            <Text style={{ color: C.text, fontSize: 11, fontWeight: '700' }}>Kecilkan</Text>
          </Pressable>
          <Pressable
            onPress={() => setPanelH((h) => clampPanelH((h ?? panelMeasuredHRef.current) + 80))}
            hitSlop={8}
            style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: C.surfaceHighest }}
          >
            <Text style={{ color: C.text, fontSize: 11, fontWeight: '700' }}>Besarkan</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView
        onLayout={(e) => { panelMeasuredHRef.current = Math.round(e.nativeEvent.layout.height); }}
        style={panelH != null
          ? { flexGrow: 0, flexShrink: 0, height: panelH, backgroundColor: C.surfaceHigh }
          : { flex: 1, backgroundColor: C.surfaceHigh }}
        contentContainerStyle={{ padding: 16, gap: 12 }}
      >
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ color: C.secondary, fontSize: 11 }}>{summary.count} dinding</Text>
          <Text style={{ color: C.secondary, fontSize: 11 }}>â€¢ Total panjang {summary.total.toFixed(2)} m</Text>
          <Text style={{ color: C.secondary, fontSize: 11 }}>â€¢ Luas kotor {summary.gross.toFixed(2)} mآ²</Text>
        </View>

        <Pressable onPress={() => {
          const sel = walls.find((w) => w.id === selectedId);
          if (!sel) {
            peringatan('Ketuk dinding dulu', 'Ketuk dinding dulu untuk menempelkan ruangan');
            return;
          }
          setRoomModal(true);
        }} style={{ backgroundColor: C.primary, borderRadius: 10, padding: 10, alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>+ Ruangan</Text>
        </Pressable>

        <Pressable onPress={() => s.toggleDedupe()} style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: s.dedupeOverlap ? '#f97316' : C.surface, marginLeft: 4 }}>
          <Text style={{ color: s.dedupeOverlap ? '#fff' : C.text, fontSize: 10, fontWeight: '600' }}>{s.dedupeOverlap ? 'Hitung sekali' : 'Hitung semua'}</Text>
        </Pressable>

        {/* tab/selector lantai */}
        <View style={{ backgroundColor: C.surface, borderRadius: 10, padding: 10, marginBottom: 4 }}>
          <Text style={{ color: C.textDim, fontSize: 12, marginBottom: 6 }}>Lantai ({floors.length})</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {floors.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => setActiveFloor(f.id)}
                style={{
                  paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
                  backgroundColor: f.id === activeFloorId ? C.primary : C.surfaceHighest,
                }}
              >
                <Text style={{ color: f.id === activeFloorId ? '#fff' : C.text, fontSize: 12, fontWeight: f.id === activeFloorId ? '700' : '400' }}>
                  {f.name}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => addFloor({ copyFromBelow })}
              style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: C.surfaceHighest }}
            >
              <Text style={{ color: C.text, fontSize: 12, fontWeight: '700' }}>+ Lantai</Text>
            </Pressable>
            {floors.length > 1 && activeFloorId && (
              <Pressable
                onPress={() => confirm('Hapus lantai?', `Hapus ${floors.find((f) => f.id === activeFloorId)?.name ?? 'lantai ini'} beserta dindingnya?`, () => removeFloor(activeFloorId))}
                style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#93000a55' }}
              >
                <Text style={{ color: C.error, fontSize: 12, fontWeight: '700' }}>Hapus lantai</Text>
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={() => setCopyFromBelow((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, backgroundColor: C.surfaceHighest, borderRadius: 8, marginTop: 6 }}
          >
            <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: C.primary, backgroundColor: copyFromBelow ? C.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{copyFromBelow && <Text style={{ color: '#fff', fontSize: 10 }}>âœ“</Text>}</View>
            <Text style={{ color: C.text, fontSize: 11 }}>Salin dari lantai bawah saat tambah lantai</Text>
          </Pressable>
        </View>

        {/* tab dinding */}
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {walls.map((w) => (
            <Pressable
              key={w.id}
              onPress={() => s.selectWall(w.id)}
              style={{
                paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
                backgroundColor: w.id === selectedId ? C.primary : C.surface,
              }}
            >
              <Text style={{ color: w.id === selectedId ? '#fff' : C.text, fontSize: 12, fontWeight: w.id === selectedId ? '700' : '400' }}>
                {w.name}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={s.addWall}
            style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: C.surfaceHighest }}
          >
            <Text style={{ color: C.text, fontSize: 12, fontWeight: '700' }}>+ Gambar Dinding (seret di kanvas)</Text>
          </Pressable>
          {walls.length > 1 && (
            <Pressable
              onPress={() => s.removeWall(selectedId)}
              style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#93000a55' }}
            >
              <Text style={{ color: C.error, fontSize: 12, fontWeight: '700' }}>Hapus Dinding Ini</Text>
            </Pressable>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stepper label="Panjang Dinding" value={wall.length_meters} onChange={s.stepLength} />
          <Stepper label="Tinggi Dinding" value={wall.height_meters} onChange={s.stepHeight} />
        </View>
        <ChipGroup label="Jenis Bata" options={BRICKS} selected={wall.brick_type} onSelect={s.setBrickType} />
        <ChipGroup label="Tipe Adukan" options={MORTARS} selected={wall.mortar_ratio} onSelect={s.setMortarRatio} />

        {/* Sudut: bulatkan / luruskan kembali */}
        <View style={{ backgroundColor: C.surface, borderRadius: 10, padding: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: C.text, fontSize: 12, fontWeight: '700' }}>Sudut</Text>
            {cornerPoint
              ? <Text style={{ color: C.secondary, fontSize: 11 }}>({cornerPoint.x.toFixed(2)}, {cornerPoint.y.toFixed(2)})</Text>
              : <Text style={{ color: C.textDim, fontSize: 11 }}>Ketuk titik sudut di kanvas</Text>}
          </View>
          <Text style={{ color: C.textDim, fontSize: 11, marginTop: 6 }}>Radius (m)</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Pressable
              onPress={() => {
                const cur = parseFloat((cornerRadiusText || '0').replace(',', '.'));
                const next = Math.max(0, Math.round(((Number.isFinite(cur) ? cur : 0.3) - 0.1) * 100) / 100);
                setCornerRadiusText(String(next).replace('.', ','));
              }}
              style={{ padding: 8, backgroundColor: C.surfaceHighest, borderRadius: 6 }}
            >
              <Text style={{ color: C.text }}>âˆ’</Text>
            </Pressable>
            <TextInput
              value={cornerRadiusText}
              onChangeText={setCornerRadiusText}
              keyboardType="decimal-pad"
              placeholder="0,3"
              placeholderTextColor={C.outline}
              style={{ flex: 1, backgroundColor: C.bg, borderRadius: 6, padding: 8, color: C.text, fontSize: 13, textAlign: 'center' }}
            />
            <Pressable
              onPress={() => {
                const cur = parseFloat((cornerRadiusText || '0').replace(',', '.'));
                const next = Math.round(((Number.isFinite(cur) ? cur : 0.3) + 0.1) * 100) / 100;
                setCornerRadiusText(String(next).replace('.', ','));
              }}
              style={{ padding: 8, backgroundColor: C.surfaceHighest, borderRadius: 6 }}
            >
              <Text style={{ color: C.text }}>+</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            <Pressable
              onPress={() => {
                if (!cornerPoint) { peringatan('Belum ada sudut', 'Ketuk titik sudut di kanvas pada mode Pilih.'); return; }
                const r = parseFloat((cornerRadiusText || '0').replace(',', '.'));
                if (!(r > 0)) { peringatan('Radius tidak valid', 'Masukkan radius lebih dari 0, contoh 0,3.'); return; }
                const res = s.roundCorner(cornerPoint, r);
                if (!res.ok) peringatan('Tidak bisa dibulatkan', res.reason);
              }}
              style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: C.primary, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Bulatkan</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const res = s.unroundCorner();
                if (!res.ok) peringatan('Tidak bisa diluruskan', res.reason);
              }}
              style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: C.surfaceHighest, alignItems: 'center' }}
            >
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 12 }}>Lurus kembali</Text>
            </Pressable>
            {cornerPoint && (
              <Pressable
                onPress={() => selectCorner(null)}
                style={{ padding: 10, borderRadius: 8, backgroundColor: C.surfaceHighest, alignItems: 'center' }}
              >
                <Text style={{ color: C.text, fontSize: 12 }}>Batal</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Dinding melengkung */}
        {(() => {
          const sag = wall.arc_sagitta_m || 0;
          const curved = Math.abs(sag) >= 1e-9;
          const chord = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
          const maxSag = chord / 2;
          const minR = minRadius(wall.p1, wall.p2);
          const curR = curved ? radiusFromSagitta(wall.p1, wall.p2, sag) : 0;
          const shownR = arcRadiusText !== '' ? arcRadiusText : (curved && Number.isFinite(curR) ? String(Math.round(curR * 100) / 100) : '');
          return (
            <View style={{ backgroundColor: C.surface, borderRadius: 10, padding: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: C.text, fontSize: 12, fontWeight: '700' }}>Lengkung</Text>
                <Pressable
                  onPress={() => { setArcRadiusText(''); s.toggleArc(wall.id, !curved); }}
                  style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: curved ? C.primary : C.surfaceHighest }}
                >
                  <Text style={{ color: curved ? '#fff' : C.text, fontSize: 12, fontWeight: '700' }}>{curved ? 'Aktif' : 'Lurus'}</Text>
                </Pressable>
              </View>
              {curved && (
                <>
                  <Text style={{ color: C.textDim, fontSize: 11, marginTop: 6 }}>Radius (m) â€¢ min {minR.toFixed(2)} m â€¢ tali {chord.toFixed(2)} m</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Pressable
                      onPress={() => {
                        const cur = arcRadiusText !== '' ? parseFloat(arcRadiusText.replace(',', '.')) : curR;
                        const next = (Number.isFinite(cur) ? cur : minR) - 0.1;
                        const r = Math.round(next * 100) / 100;
                        if (!(r >= minR - 1e-9)) { peringatan('Radius terlalu kecil', `Radius minimum ${minR.toFixed(2)} m.`); return; }
                        if (!s.setArcRadius(wall.id, r)) { peringatan('Radius terlalu kecil', `Radius minimum ${minR.toFixed(2)} m.`); return; }
                        setArcRadiusText(String(r));
                      }}
                      style={{ padding: 8, backgroundColor: C.surfaceHighest, borderRadius: 6 }}
                    >
                      <Text style={{ color: C.text }}>âˆ’</Text>
                    </Pressable>
                    <TextInput
                      value={shownR}
                      onChangeText={setArcRadiusText}
                      onBlur={() => {
                        if (arcRadiusText === '') return;
                        const r = parseFloat(arcRadiusText.replace(',', '.'));
                        if (!Number.isFinite(r)) { peringatan('Radius tidak valid', 'Masukkan angka, contoh 2.5.'); return; }
                        if (!(r >= minR - 1e-9)) { peringatan('Radius terlalu kecil', `Radius minimum ${minR.toFixed(2)} m.`); return; }
                        if (!s.setArcRadius(wall.id, r)) peringatan('Radius terlalu kecil', `Radius minimum ${minR.toFixed(2)} m.`);
                      }}
                      keyboardType="decimal-pad"
                      placeholder={minR.toFixed(2)}
                      placeholderTextColor={C.outline}
                      style={{ flex: 1, backgroundColor: C.bg, borderRadius: 6, padding: 8, color: C.text, fontSize: 13, textAlign: 'center' }}
                    />
                    <Pressable
                      onPress={() => {
                        const cur = arcRadiusText !== '' ? parseFloat(arcRadiusText.replace(',', '.')) : curR;
                        const next = (Number.isFinite(cur) ? cur : minR) + 0.1;
                        const r = Math.round(next * 100) / 100;
                        if (!s.setArcRadius(wall.id, r)) { peringatan('Radius terlalu kecil', `Radius minimum ${minR.toFixed(2)} m.`); return; }
                        setArcRadiusText(String(r));
                      }}
                      style={{ padding: 8, backgroundColor: C.surfaceHighest, borderRadius: 6 }}
                    >
                      <Text style={{ color: C.text }}>+</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => s.flipArc(wall.id)}
                      style={{ paddingVertical: 8, paddingHorizontal: 10, backgroundColor: C.surfaceHighest, borderRadius: 6 }}
                    >
                      <Text style={{ color: C.text, fontSize: 11 }}>Balik arah</Text>
                    </Pressable>
                  </View>
                  {/* Slider kelengkungan dua arah, di bawah input radius */}
                  {maxSag >= 0.005 && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ color: C.textDim, fontSize: 11 }}>Kelengkungan</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        <View style={{ flex: 1 }}>
                          <ArcSlider
                            sagitta={sag}
                            maxSag={maxSag}
                            onSlide={(v) => { setArcRadiusText(''); s.setArcSagitta(wall.id, v); }}
                          />
                        </View>
                        <Text style={{ color: C.text, fontSize: 11, width: 118, textAlign: 'right' }}>
                          {Math.abs(sag) < 0.05 || !Number.isFinite(curR) ? 'Lurus' : `R = ${curR.toFixed(2)} m آ· busur ${wall.length_meters.toFixed(2)} m`}
                        </Text>
                      </View>
                    </View>
                  )}
                  <Text style={{ color: C.secondary, fontSize: 11, marginTop: 4 }}>Panjang busur {wall.length_meters.toFixed(2)} m</Text>
                </>
              )}
            </View>
          );
        })()}

        {/* Bukaan */}
        <View style={{ marginTop: 4 }}>
          <Text style={{ color: C.textDim, fontSize: 12, marginBottom: 6 }}>Pintu & Jendela</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => {
                const gross = wall.length_meters * wall.height_meters;
                const current = (wall.openings ?? []).reduce((sum, o) => sum + o.width_meters * o.height_meters * o.quantity, 0);
                const added = DEFAULT_PINTU.width_meters * DEFAULT_PINTU.height_meters;
                if (current + added > gross + 0.001) {
                  setWarn('Luas bukaan melebihi luas dinding');
                  setWarnColor('#ffb4ab');
                  return;
                }
                setWarn('');
                const ok = s.addOpening(wall.id, 'pintu');
                if (!ok) peringatan('Tidak ada ruang kosong', 'Tidak cukup ruang pada dinding ini');
              }}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: C.surfaceHighest, alignItems: 'center' }}
            >
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 12 }}>+ Pintu</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const gross = wall.length_meters * wall.height_meters;
                const current = (wall.openings ?? []).reduce((sum, o) => sum + o.width_meters * o.height_meters * o.quantity, 0);
                const added = DEFAULT_JENDELA.width_meters * DEFAULT_JENDELA.height_meters;
                if (current + added > gross + 0.001) {
                  setWarn('Luas bukaan melebihi luas dinding');
                  setWarnColor('#ffb4ab');
                  return;
                }
                setWarn('');
                const ok = s.addOpening(wall.id, 'jendela');
                if (!ok) peringatan('Tidak ada ruang kosong', 'Tidak cukup ruang pada dinding ini');
              }}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: C.surfaceHighest, alignItems: 'center' }}
            >
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 12 }}>+ Jendela</Text>
            </Pressable>
          </View>

          {(wall.openings ?? []).map((o) => (
            <View key={o.id} style={{ backgroundColor: C.surface, borderRadius: 10, padding: 10, marginTop: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 12 }}>{o.type === 'pintu' ? 'Pintu' : 'Jendela'}</Text>
                <Pressable onPress={() => s.removeOpening(wall.id, o.id)}>
                  <Text style={{ color: C.error, fontSize: 12, fontWeight: '700' }}>Hapus</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.textDim, fontSize: 10 }}>Lebar (m)</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Pressable onPress={() => s.updateOpening(wall.id, o.id, { width_meters: Math.round(Math.max(OPENING_LIMITS.min, o.width_meters - 0.1) * 10) / 10 })} style={{ padding: 4, backgroundColor: C.surfaceHighest, borderRadius: 6 }}><Text style={{ color: C.text }}>âˆ’</Text></Pressable>
                    <Text style={{ color: C.text, fontWeight: '700' }}>{o.width_meters.toFixed(1)}</Text>
                    <Pressable onPress={() => s.updateOpening(wall.id, o.id, { width_meters: Math.round(Math.min(OPENING_LIMITS.max, o.width_meters + 0.1) * 10) / 10 })} style={{ padding: 4, backgroundColor: C.surfaceHighest, borderRadius: 6 }}><Text style={{ color: C.text }}>+</Text></Pressable>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.textDim, fontSize: 10 }}>Tinggi (m)</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Pressable onPress={() => s.updateOpening(wall.id, o.id, { height_meters: Math.round(Math.max(OPENING_LIMITS.min, o.height_meters - 0.1) * 10) / 10 })} style={{ padding: 4, backgroundColor: C.surfaceHighest, borderRadius: 6 }}><Text style={{ color: C.text }}>âˆ’</Text></Pressable>
                    <Text style={{ color: C.text, fontWeight: '700' }}>{o.height_meters.toFixed(1)}</Text>
                    <Pressable onPress={() => s.updateOpening(wall.id, o.id, { height_meters: Math.round(Math.min(OPENING_LIMITS.max, o.height_meters + 0.1) * 10) / 10 })} style={{ padding: 4, backgroundColor: C.surfaceHighest, borderRadius: 6 }}><Text style={{ color: C.text }}>+</Text></Pressable>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.textDim, fontSize: 10 }}>Posisi (m)</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Pressable onPress={() => s.moveOpening(wall.id, o.id, Math.round(Math.max(MARGIN + o.width_meters / 2, (o.offset_meters || 0) - 0.05) * 20) / 20)} style={{ padding: 4, backgroundColor: C.surfaceHighest, borderRadius: 6 }}><Text style={{ color: C.text }}>âˆ’</Text></Pressable>
                    <Text style={{ color: C.text, fontWeight: '700' }}>{(o.offset_meters || 0).toFixed(2)}</Text>
                    <Pressable onPress={() => s.moveOpening(wall.id, o.id, Math.round(Math.min(effectiveWallLength(wall) - MARGIN - o.width_meters / 2, (o.offset_meters || 0) + 0.05) * 20) / 20)} style={{ padding: 4, backgroundColor: C.surfaceHighest, borderRadius: 6 }}><Text style={{ color: C.text }}>+</Text></Pressable>
                  </View>
                </View>
                {o.type === 'pintu' && (
                  <Pressable onPress={() => s.flipOpening(wall.id, o.id)} style={{ padding: 4, backgroundColor: C.surfaceHighest, borderRadius: 6, marginTop: 2 }}>
                    <Text style={{ color: C.text, fontSize: 11 }}>Balik Arah</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}

          {/* ringkasan luas */}
          <View style={{ backgroundColor: C.surface, borderRadius: 10, padding: 10, marginTop: 6 }}>
            <Text style={{ color: C.text, fontSize: 12, fontWeight: '600' }}>
              Luas kotor {wallSummary.gross.toFixed(2)} mآ² âˆ’ bukaan {wallSummary.open.toFixed(2)} mآ² = netto {wallSummary.net.toFixed(2)} mآ²
            </Text>
          </View>

          {wallSummary.over && (warn ? (
            <Text style={{ color: warnColor, fontSize: 12, fontWeight: '600', marginTop: 4 }}>{warn}</Text>
          ) : (
            <Text style={{ color: '#ffb95f', fontSize: 12, fontWeight: '600', marginTop: 4 }}>Luas bukaan melebihi luas dinding</Text>
          ))}
        </View>

        <Pressable
          onPress={onCalculate}
          style={{ backgroundColor: C.primary, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4 }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Hitung Material & RAB â†’</Text>
        </Pressable>
      </ScrollView>
      </>
      )}

      <Modal visible={roomModal} transparent animationType="slide" onRequestClose={() => setRoomModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{ backgroundColor: C.surface, borderRadius: 16, padding: 20, width: '100%', maxWidth: 380, gap: 10 }}>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>Tambah Ruangan</Text>
            {!selectedId ? (
              <Text style={{ color: C.error }}>Ketuk dinding dulu untuk menempelkan ruangan</Text>
            ) : (
              <>
                <Text style={{ color: C.secondary, fontSize: 12 }}>Dinding terpilih: {wall?.name || 'â€”'}</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { key: 'kamar', label: 'Kamar Tidur 3أ—3' },
                    { key: 'mandi', label: 'Kamar Mandi 2أ—2' },
                    { key: 'dapur', label: 'Dapur 3أ—3' },
                    { key: 'tamu', label: 'Ruang Tamu 4أ—3' },
                    { key: 'garasi', label: 'Garasi 3أ—6' },
                    { key: 'custom', label: 'Kustom' },
                  ].map((opt) => (
                    <Pressable key={opt.key} onPress={() => setRoomPreset(opt.key)} style={{ padding: 6, borderRadius: 8, backgroundColor: roomPreset === opt.key ? C.primary : C.surfaceHighest, flex: 1 }}>
                      <Text style={{ color: roomPreset === opt.key ? '#fff' : C.text, fontSize: 11, textAlign: 'center' }}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
                {roomPreset === 'custom' && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.secondary, fontSize: 11 }}>Lebar (m)</Text>
                      <TextInput value={roomCustomW} onChangeText={setRoomCustomW} keyboardType="decimal-pad" style={{ backgroundColor: C.bg, borderRadius: 8, padding: 8, color: C.text }} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.secondary, fontSize: 11 }}>Panjang (m)</Text>
                      <TextInput value={roomCustomL} onChangeText={setRoomCustomL} keyboardType="decimal-pad" style={{ backgroundColor: C.bg, borderRadius: 8, padding: 8, color: C.text }} />
                    </View>
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Text style={{ color: C.secondary, fontSize: 11 }}>Sisi:</Text>
                  <Pressable onPress={() => setRoomSide('luar')} style={{ padding: 6, borderRadius: 6, backgroundColor: roomSide === 'luar' ? C.primary : C.surfaceHighest, flex: 1 }}><Text style={{ color: '#fff', fontSize: 11, textAlign: 'center' }}>{roomSide === 'luar' ? 'Luar' : 'Luar'}</Text></Pressable>
                  <Pressable onPress={() => setRoomSide('dalam')} style={{ padding: 6, borderRadius: 6, backgroundColor: roomSide === 'dalam' ? C.primary : C.surfaceHighest, flex: 1 }}><Text style={{ color: '#fff', fontSize: 11, textAlign: 'center' }}>{roomSide === 'dalam' ? 'Dalam' : 'Dalam'}</Text></Pressable>
                  <Pressable onPress={() => setRoomSide(roomSide === 'luar' ? 'dalam' : 'luar')} style={{ padding: 6, borderRadius: 6, backgroundColor: C.surfaceHighest }}><Text style={{ color: C.text, fontSize: 11 }}>Balik Sisi</Text></Pressable>
                  <Pressable onPress={() => setRoomRotated((v) => !v)} style={{ padding: 6, borderRadius: 6, backgroundColor: roomRotated ? C.primary : C.surfaceHighest }}><Text style={{ color: '#fff', fontSize: 11, textAlign: 'center' }}>{roomRotated ? 'Diputar' : 'Putar 90°'}</Text></Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ color: C.secondary, fontSize: 10 }}>Geser (m):</Text>
                  <TextInput value={roomOffset} onChangeText={setRoomOffset} keyboardType="decimal-pad" style={{ width: 60, backgroundColor: C.bg, borderRadius: 6, padding: 4, color: C.text, fontSize: 11 }} />
                  <Pressable onPress={() => setRoomOffset('0')} style={{ padding: 4, borderRadius: 6, backgroundColor: C.surfaceHighest }}><Text style={{ color: C.text, fontSize: 10 }}>Awal</Text></Pressable>
                  <Pressable onPress={() => { const wlen = (wall ? Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y) : 0); const shared = samakanPanjang ? wlen : (roomPreset === 'kamar' ? 3 : roomPreset === 'mandi' ? 2 : roomPreset === 'dapur' ? 3 : roomPreset === 'tamu' ? 3 : roomPreset === 'garasi' ? 6 : parseFloat(roomCustomW) || 3); const mid = Math.max(0, (wlen - shared) / 2); setRoomOffset(String(Math.round(mid * 100) / 100)); }} style={{ padding: 4, borderRadius: 6, backgroundColor: C.surfaceHighest }}><Text style={{ color: C.text, fontSize: 10 }}>Tengah</Text></Pressable>
                  <Pressable onPress={() => { const wlen = (wall ? Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y) : 0); const shared = samakanPanjang ? wlen : (roomPreset === 'kamar' ? 3 : roomPreset === 'mandi' ? 2 : roomPreset === 'dapur' ? 3 : roomPreset === 'tamu' ? 3 : roomPreset === 'garasi' ? 6 : parseFloat(roomCustomW) || 3); const end = Math.max(0, wlen - shared); setRoomOffset(String(Math.round(end * 100) / 100)); }} style={{ padding: 4, borderRadius: 6, backgroundColor: C.surfaceHighest }}><Text style={{ color: C.text, fontSize: 10 }}>Akhir</Text></Pressable>
                </View>
                <Pressable onPress={() => { if (roomPreset !== 'custom') setSamakanPanjang(false); else setSamakanPanjang(v => !v); }} disabled={roomPreset !== 'custom'} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, backgroundColor: C.surfaceHighest, borderRadius: 8, opacity: roomPreset === 'custom' ? 1 : 0.6 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: C.primary, backgroundColor: samakanPanjang ? C.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{samakanPanjang && <Text style={{ color: '#fff', fontSize: 10 }}>âœ“</Text>}</View>
                  <Text style={{ color: C.text, fontSize: 11 }}>{roomPreset === 'custom' ? 'Samakan dengan panjang dinding' : 'Samakan (hanya Kustom)'}</Text>
                </Pressable>
                <Pressable onPress={() => setRoomDoor((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, backgroundColor: C.surfaceHighest, borderRadius: 8 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: C.primary, backgroundColor: roomDoor ? C.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{roomDoor && <Text style={{ color: '#fff', fontSize: 10 }}>âœ“</Text>}</View>
                  <Text style={{ color: C.text, fontSize: 11 }}>Beri pintu di dinding bersama</Text>
                </Pressable>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <Pressable onPress={() => setRoomModal(false)} style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: C.surfaceHighest, alignItems: 'center' }}>
                    <Text style={{ color: C.text, fontWeight: '600' }}>Batal</Text>
                  </Pressable>
                  <Pressable onPress={() => {
                    const w = wall;
                    if (!w) { peringatan('Pilih dinding', 'Pilih dinding terlebih dahulu'); return; }
                    let depthBase = 3;
                    if (roomPreset === 'kamar') depthBase = 3;
                    else if (roomPreset === 'mandi') depthBase = 2;
                    else if (roomPreset === 'dapur') depthBase = 3;
                    else if (roomPreset === 'tamu') depthBase = 3;
                    else if (roomPreset === 'garasi') depthBase = 6;
                    else if (roomPreset === 'custom') depthBase = parseFloat(roomCustomL) || 3;
                    const wlen = Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y) || 1;
                    let sharedLen = samakanPanjang ? wlen : (roomPreset === 'kamar' ? 3 : roomPreset === 'mandi' ? 2 : roomPreset === 'dapur' ? 3 : roomPreset === 'tamu' ? 3 : roomPreset === 'garasi' ? 6 : parseFloat(roomCustomW) || 3);
                    let depth = depthBase;
                    // Putar 90° menukar sisi tempel (sharedLen) dan sisi dalam (depth),
                    // mis. Garasi 6×3 bisa menempel dengan sisi 3 m ke dinding pendek.
                    if (roomRotated) {
                      const t = sharedLen; sharedLen = depth; depth = t;
                    }
                    const EPS = 0.01;
                    const offset = parseFloat(roomOffset) || 0;
                    // Samakan toleransi (EPS): bila lebar ruangan hanya sedikit melebihi panjang
                    // dinding (dalam EPS), clamp ke panjang dinding alih-alih menolak â€” mis.
                    // ruangan 8أ—5 pas di dinding 8 m yang karena pembulatan terbaca 7.999 m.
                    if (sharedLen > wlen && sharedLen <= wlen + EPS) {
                      console.log('[tambahRuangan] clamp sharedLen ke wlen', { wall: w.name, from: sharedLen, to: wlen });
                      sharedLen = wlen;
                    }
                    const lebarTxt = sharedLen.toFixed(2);
                    const dindingTxt = wlen.toFixed(2);
                    // Penolakan: ruangan melewati ujung dinding atau offset geser terlalu negatif (toleransi EPS).
                    if (offset < -EPS || offset + sharedLen > wlen + EPS) {
                      console.log('[tambahRuangan] DITOLAK: melewati ujung dinding', { wall: w.name, wlen, sharedLen, offset, EPS });
                      peringatan('Posisi tidak valid', `Ruangan (${lebarTxt} m) melewati ujung dinding ${w.name} (${dindingTxt} m). Coba Putar 90° atau pilih dinding lebih panjang.`);
                      return;
                    }
                    // Offset geser negatif kecil (dalam EPS): clamp ke 0 alih-alih menolak.
                    if (offset < 0) {
                      console.log('[tambahRuangan] clamp offset ke 0', { wall: w.name, offset });
                      setRoomOffset('0');
                      peringatan('Posisi tidak valid', `Offset geser tidak boleh negatif. Diatur ke 0 untuk dinding ${w.name}.`);
                      return;
                    }
                    const dx = w.p2.x - w.p1.x;
                    const dy = w.p2.y - w.p1.y;
                    const ux = dx / wlen, uy = dy / wlen;
                    const pA = { x: w.p1.x + ux * offset, y: w.p1.y + uy * offset };
                    const pB = { x: pA.x + ux * sharedLen, y: pA.y + uy * sharedLen };
                    const nx = -uy, ny = ux;
                    const perp = roomSide === 'luar' ? { x: nx, y: ny } : { x: -nx, y: -ny };
                    const pC = { x: pB.x + perp.x * depth, y: pB.y + perp.y * depth };
                    const pD = { x: pA.x + perp.x * depth, y: pA.y + perp.y * depth };
                    const newWalls = [
                      { ...w, id: `w-${Date.now()}-s`, name: 'W-NEW', p1: pB, p2: pC, length_meters: depth, height_meters: w.height_meters, brick_type: w.brick_type, mortar_ratio: w.mortar_ratio, openings: [] },
                      { ...w, id: `w-${Date.now()}-b`, name: 'W-NEW', p1: pC, p2: pD, length_meters: sharedLen, height_meters: w.height_meters, brick_type: w.brick_type, mortar_ratio: w.mortar_ratio, openings: [] },
                      { ...w, id: `w-${Date.now()}-d`, name: 'W-NEW', p1: pD, p2: pA, length_meters: depth, height_meters: w.height_meters, brick_type: w.brick_type, mortar_ratio: w.mortar_ratio, openings: [] },
                    ];
                    const existingPoints: Point[] = [];
                    for (const ww of walls) { existingPoints.push(ww.p1, ww.p2); }
                    const snap = (pt: Point) => {
                      for (const ep of existingPoints) {
                        if (Math.hypot(pt.x - ep.x, pt.y - ep.y) < 0.001) return ep;
                      }
                      return pt;
                    };
                    const sA = snap(pA); const sB = snap(pB); const sC = snap(pC); const sD = snap(pD);
                    newWalls[0].p1 = sB; newWalls[0].p2 = sC; newWalls[0].length_meters = Math.hypot(sC.x - sB.x, sC.y - sB.y);
                    newWalls[1].p1 = sC; newWalls[1].p2 = sD; newWalls[1].length_meters = Math.hypot(sD.x - sC.x, sD.y - sC.y);
                    newWalls[2].p1 = sD; newWalls[2].p2 = sA; newWalls[2].length_meters = Math.hypot(sA.x - sD.x, sA.y - sD.y);
                    newWalls.forEach((nw) => { nw.id = `w-${Date.now()}-${Math.random().toString(36).slice(2)}`; });
                    const maxNum = Math.max(...walls.map((w) => { const m = w.name.match(/W-(\d+)/); return m ? parseInt(m[1], 10) : 0; }), 0);
                    newWalls.forEach((nw, i) => { nw.name = `W-${String(maxNum + 1 + i).padStart(2, '0')}`; });
                    loadWalls([...walls, ...newWalls]);
                    if (roomDoor) {
                      const doorOk = s.addOpening(w.id, 'pintu');
                      if (!doorOk) console.log('[tambahRuangan] pintu di dinding bersama gagal dibuat', { wall: w.name, id: w.id });
                    }
                    const roomName = roomPreset === 'kamar' ? 'Kamar Tidur' : roomPreset === 'mandi' ? 'Kamar Mandi' : roomPreset === 'dapur' ? 'Dapur' : roomPreset === 'tamu' ? 'Ruang Tamu' : roomPreset === 'garasi' ? 'Garasi' : 'Ruangan';
                    const seed = { x: (sA.x + sB.x + sC.x + sD.x) / 4, y: (sA.y + sB.y + sC.y + sD.y) / 4 };
                    s.setRooms([...s.rooms, { id: `r-${Date.now()}`, name: roomName, seed }]);
                    setFitTrigger((v) => v + 1);
                    setRoomModal(false);
                  }} style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Tambahkan</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

        <TemplateModal visible={templateModal} onSelect={handleTemplateSelect} onBatal={() => setTemplateModal(false)} />

        <NamaProyekModal
          visible={modalVisible}
          defaultName={defaultNama}
          onSimpan={(nama: string) => {
            setModalVisible(false);
            try {
              saveCurrentAs(nama);
              peringatan('Proyek tersimpan', `"${nama}" disimpan.`);
            } catch (e: any) {
              const code = e?.code || e?.message || e;
              console.log('[Firestore error]', code);
              peringatan('Gagal menyimpan', String(code || 'Terjadi kesalahan saat menyimpan proyek.'));
            }
          }}
          onBatal={() => setModalVisible(false)}
        />

    </View>
  );
}

