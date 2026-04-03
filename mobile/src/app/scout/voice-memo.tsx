// ── Voice Memo Recorder ──────────────────────────────────────
// Record audio notes about a building while scouting. Saves
// to local file system with metadata (address, timestamp).
// Playback + delete from the saved list.

import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
  Animated,
} from "react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { HeaderBar } from "@/components/ui";
import { COLORS, FONT, RADIUS, SPACING, SHADOW } from "@/lib/theme";
import { timeAgo } from "@/lib/format";
import { Mic, Square, Play, Pause, Trash2, Building2 } from "lucide-react-native";

const MEMO_DIR = `${FileSystem.documentDirectory}voice-memos/`;

interface VoiceMemo {
  id: string;
  uri: string;
  address: string;
  bbl: string;
  duration: number; // seconds
  createdAt: string;
}

const MEMO_INDEX = `${MEMO_DIR}index.json`;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(MEMO_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(MEMO_DIR, { intermediates: true });
}

async function loadMemos(): Promise<VoiceMemo[]> {
  await ensureDir();
  const info = await FileSystem.getInfoAsync(MEMO_INDEX);
  if (!info.exists) return [];
  const raw = await FileSystem.readAsStringAsync(MEMO_INDEX);
  return JSON.parse(raw);
}

async function saveMemos(memos: VoiceMemo[]) {
  await ensureDir();
  await FileSystem.writeAsStringAsync(MEMO_INDEX, JSON.stringify(memos));
}

export default function VoiceMemoScreen() {
  const router = useRouter();
  const { address = "", bbl = "" } = useLocalSearchParams<{
    address?: string;
    bbl?: string;
  }>();

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [memos, setMemos] = useState<VoiceMemo[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadMemos().then(setMemos);
    return () => {
      soundRef.current?.unloadAsync();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Pulsing ring animation while recording
  useEffect(() => {
    if (isRecording) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  async function startRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Microphone Access Required",
          "VettdRE needs microphone access to record voice memos. Enable it in Settings."
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
      setDuration(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      Alert.alert("Error", "Could not start recording. Check microphone permissions.");
    }
  }

  async function stopRecording() {
    if (!recording) return;
    if (timerRef.current) clearInterval(timerRef.current);

    setIsRecording(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    let uri: string | null = null;
    try {
      await recording.stopAndUnloadAsync();
      uri = recording.getURI();
    } catch {
      // Recording may already be unloaded
    }
    setRecording(null);

    if (!uri) return;

    // Move to our memo directory
    await ensureDir();
    const id = Date.now().toString();
    const dest = `${MEMO_DIR}${id}.m4a`;
    await FileSystem.moveAsync({ from: uri, to: dest });

    const memo: VoiceMemo = {
      id,
      uri: dest,
      address: address || "Unknown address",
      bbl: bbl || "",
      duration,
      createdAt: new Date().toISOString(),
    };

    const updated = [memo, ...memos];
    setMemos(updated);
    await saveMemos(updated);
  }

  async function playMemo(memo: VoiceMemo) {
    // Stop current if playing
    if (soundRef.current) {
      try { await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }

    if (playingId === memo.id) {
      setPlayingId(null);
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: memo.uri },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setPlayingId(memo.id);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingId(null);
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
        }
      });
    } catch {
      Alert.alert("Error", "Could not play this memo.");
      setPlayingId(null);
    }
  }

  async function deleteMemo(memo: VoiceMemo) {
    Alert.alert("Delete Memo", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await FileSystem.deleteAsync(memo.uri, { idempotent: true });
          const updated = memos.filter((m) => m.id !== memo.id);
          setMemos(updated);
          await saveMemos(updated);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      },
    ]);
  }

  function fmtDuration(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  // Filter: show memos for this building first, then others
  const thisBuildingMemos = bbl
    ? memos.filter((m) => m.bbl === bbl)
    : [];
  const otherMemos = bbl
    ? memos.filter((m) => m.bbl !== bbl)
    : memos;

  return (
    <View style={styles.container}>
      <HeaderBar title="Voice Memos" onBack={() => router.back()} />

      {/* Context banner */}
      {address ? (
        <View style={styles.contextBanner}>
          <Building2 size={16} color={COLORS.primary} />
          <Text style={styles.contextText} numberOfLines={1}>
            {address}
          </Text>
        </View>
      ) : null}

      {/* Record button */}
      <View style={styles.recordSection}>
        <Animated.View
          style={[
            styles.pulseRing,
            isRecording && {
              transform: [{ scale: pulseAnim }],
              opacity: 0.3,
            },
          ]}
        />
        <Pressable
          onPress={isRecording ? stopRecording : startRecording}
          style={[
            styles.recordBtn,
            isRecording && styles.recordBtnActive,
          ]}
        >
          {isRecording ? (
            <Square size={28} color={COLORS.white} />
          ) : (
            <Mic size={28} color={COLORS.white} />
          )}
        </Pressable>
        <Text style={styles.recordLabel}>
          {isRecording
            ? fmtDuration(duration)
            : "Tap to record"}
        </Text>
      </View>

      {/* Memo list */}
      <FlatList
        data={[...thisBuildingMemos, ...otherMemos]}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Mic size={32} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No memos yet</Text>
            <Text style={styles.emptySubtext}>
              Record notes while scouting buildings
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isPlaying = playingId === item.id;
          const isThisBuilding = bbl && item.bbl === bbl;
          return (
            <View
              style={[
                styles.memoCard,
                isThisBuilding && styles.memoCardHighlight,
              ]}
            >
              <Pressable
                onPress={() => playMemo(item)}
                style={styles.playBtn}
              >
                {isPlaying ? (
                  <Pause size={18} color={COLORS.primary} />
                ) : (
                  <Play size={18} color={COLORS.primary} />
                )}
              </Pressable>
              <View style={styles.memoInfo}>
                <Text style={styles.memoAddress} numberOfLines={1}>
                  {item.address}
                </Text>
                <Text style={styles.memoMeta}>
                  {fmtDuration(item.duration)} · {timeAgo(item.createdAt)}
                </Text>
              </View>
              <Pressable
                onPress={() => deleteMemo(item)}
                hitSlop={10}
              >
                <Trash2 size={16} color={COLORS.textMuted} />
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  contextBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.sm,
  },
  contextText: {
    fontSize: FONT.size.md,
    fontWeight: FONT.weight.medium,
    color: COLORS.primary,
    flex: 1,
  },

  // Record section
  recordSection: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  pulseRing: {
    position: "absolute",
    top: 24,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.danger,
    opacity: 0,
  },
  recordBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    ...SHADOW.lg,
  },
  recordBtnActive: {
    backgroundColor: COLORS.danger,
  },
  recordLabel: {
    fontSize: FONT.size.base,
    color: COLORS.textSecondary,
    fontWeight: FONT.weight.medium,
  },

  // List
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  memoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    marginBottom: 8,
  },
  memoCardHighlight: {
    borderColor: COLORS.primaryBorder,
    backgroundColor: COLORS.primaryLight,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bg,
    justifyContent: "center",
    alignItems: "center",
    ...SHADOW.sm,
  },
  memoInfo: { flex: 1 },
  memoAddress: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.semibold,
    color: COLORS.text,
  },
  memoMeta: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // Empty
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyText: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textSecondary,
  },
  emptySubtext: {
    fontSize: FONT.size.md,
    color: COLORS.textMuted,
  },
});
