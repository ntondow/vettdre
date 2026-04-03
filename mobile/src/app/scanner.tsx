// ── Document Scanner ─────────────────────────────────────────
// Camera-based document capture for leases, contracts, and
// building documents. Takes a photo, shows preview, allows
// retake or confirm. Saves to file system and can be attached
// to a client onboarding or deal submission.

import { useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as MediaLibrary from "expo-media-library";
import { useRouter, useLocalSearchParams } from "expo-router";
import { COLORS, FONT, RADIUS, SPACING, SHADOW } from "@/lib/theme";
import {
  Camera,
  Image as ImageIcon,
  RotateCcw,
  Check,
  Download,
  X,
  Scan,
} from "lucide-react-native";

const SCAN_DIR = `${FileSystem.documentDirectory}scans/`;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(SCAN_DIR);
  if (!info.exists)
    await FileSystem.makeDirectoryAsync(SCAN_DIR, { intermediates: true });
}

export default function ScannerScreen() {
  const router = useRouter();
  const { returnTo, entityId, entityType } = useLocalSearchParams<{
    returnTo?: string;
    entityId?: string;
    entityType?: string;
  }>();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Request permission screen
  if (!permission?.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Scan size={48} color={COLORS.textMuted} />
        <Text style={styles.permTitle}>Camera Access Needed</Text>
        <Text style={styles.permSubtext}>
          We need camera access to scan documents
        </Text>
        <Pressable onPress={requestPermission} style={styles.permBtn}>
          <Text style={styles.permBtnText}>Grant Access</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.permSkip}>
          <Text style={styles.permSkipText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // Take photo
  async function capture() {
    if (!cameraRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
      });

      if (photo?.uri) {
        setCapturedUri(photo.uri);
      }
    } catch {
      Alert.alert("Error", "Failed to take photo. Please try again.");
    }
  }

  // Pick from gallery
  async function pickFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets?.length > 0 && result.assets[0].uri) {
      setCapturedUri(result.assets[0].uri);
    }
  }

  // Save the scan
  async function saveScan() {
    if (!capturedUri) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await ensureDir();
      const id = Date.now().toString();
      const dest = `${SCAN_DIR}${id}.jpg`;
      await FileSystem.copyAsync({ from: capturedUri, to: dest });

      // Also save to camera roll
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === "granted") {
        await MediaLibrary.saveToLibraryAsync(capturedUri);
      }

      Alert.alert("Saved", "Document saved to your scans folder.", [
        {
          text: "OK",
          onPress: () => {
            if (returnTo) {
              // Navigate back to the calling screen with scanned file
              router.replace({
                pathname: returnTo,
                params: {
                  scannedUri: dest,
                  ...(entityId ? { entityId } : {}),
                  ...(entityType ? { entityType } : {}),
                },
              } as any);
            } else {
              router.back();
            }
          },
        },
      ]);
    } catch (err) {
      Alert.alert("Error", "Failed to save document.");
    } finally {
      setSaving(false);
    }
  }

  // Preview mode (photo taken)
  if (capturedUri) {
    return (
      <View style={styles.container}>
        <Image
          source={{ uri: capturedUri }}
          style={styles.preview}
          resizeMode="contain"
        />

        {/* Document frame overlay */}
        <View style={styles.frameOverlay}>
          <View style={styles.frameCornerTL} />
          <View style={styles.frameCornerTR} />
          <View style={styles.frameCornerBL} />
          <View style={styles.frameCornerBR} />
        </View>

        {/* Action bar */}
        <View style={styles.previewActions}>
          <Pressable
            onPress={() => setCapturedUri(null)}
            style={styles.previewBtn}
          >
            <RotateCcw size={22} color={COLORS.white} />
            <Text style={styles.previewBtnLabel}>Retake</Text>
          </Pressable>

          <Pressable
            onPress={saveScan}
            disabled={saving}
            style={[styles.previewBtn, styles.confirmBtn]}
          >
            {saving ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Check size={22} color={COLORS.white} />
            )}
            <Text style={styles.previewBtnLabel}>
              {saving ? "Saving..." : "Save"}
            </Text>
          </Pressable>
        </View>

        {/* Close */}
        <Pressable
          onPress={() => {
            setCapturedUri(null);
            router.back();
          }}
          style={styles.closeBtn}
        >
          <X size={20} color={COLORS.white} />
        </Pressable>
      </View>
    );
  }

  // Camera mode
  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
      >
        {/* Document guide overlay */}
        <View style={styles.guideOverlay}>
          <View style={styles.guideBox}>
            <View style={styles.guideCornerTL} />
            <View style={styles.guideCornerTR} />
            <View style={styles.guideCornerBL} />
            <View style={styles.guideCornerBR} />
          </View>
          <Text style={styles.guideText}>
            Align document within the frame
          </Text>
        </View>

        {/* Bottom controls */}
        <View style={styles.cameraControls}>
          <Pressable onPress={pickFromGallery} style={styles.sideBtn}>
            <ImageIcon size={24} color={COLORS.white} />
          </Pressable>

          <Pressable onPress={capture} style={styles.shutterBtn}>
            <View style={styles.shutterInner} />
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            style={styles.sideBtn}
          >
            <X size={24} color={COLORS.white} />
          </Pressable>
        </View>
      </CameraView>
    </View>
  );
}

const CORNER_SIZE = 24;
const CORNER_WIDTH = 3;

const cornerBase = {
  position: "absolute" as const,
  width: CORNER_SIZE,
  height: CORNER_SIZE,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  preview: { flex: 1 },

  // Permission screen
  permissionContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  permTitle: {
    fontSize: FONT.size.title,
    fontWeight: FONT.weight.bold,
    color: COLORS.text,
    marginTop: 16,
  },
  permSubtext: {
    fontSize: FONT.size.base,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 16,
  },
  permBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
  },
  permBtnText: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.semibold,
    color: COLORS.white,
  },
  permSkip: { marginTop: 12 },
  permSkipText: {
    fontSize: FONT.size.base,
    color: COLORS.textSecondary,
  },

  // Document guide overlay (camera mode)
  guideOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  guideBox: {
    width: "85%",
    aspectRatio: 0.77, // roughly letter-size proportion
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 8,
  },
  guideText: {
    marginTop: 16,
    fontSize: FONT.size.base,
    color: "rgba(255,255,255,0.7)",
    fontWeight: FONT.weight.medium,
  },
  guideCornerTL: {
    ...cornerBase,
    top: -1,
    left: -1,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: COLORS.white,
    borderTopLeftRadius: 8,
  },
  guideCornerTR: {
    ...cornerBase,
    top: -1,
    right: -1,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: COLORS.white,
    borderTopRightRadius: 8,
  },
  guideCornerBL: {
    ...cornerBase,
    bottom: -1,
    left: -1,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: COLORS.white,
    borderBottomLeftRadius: 8,
  },
  guideCornerBR: {
    ...cornerBase,
    bottom: -1,
    right: -1,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: COLORS.white,
    borderBottomRightRadius: 8,
  },

  // Camera controls
  cameraControls: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingBottom: 50,
    paddingHorizontal: 40,
  },
  shutterBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.white,
  },
  sideBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },

  // Preview frame overlay
  frameOverlay: {
    ...StyleSheet.absoluteFillObject,
    margin: 20,
  },
  frameCornerTL: {
    ...cornerBase,
    top: 0,
    left: 0,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: COLORS.success,
    borderTopLeftRadius: 4,
  },
  frameCornerTR: {
    ...cornerBase,
    top: 0,
    right: 0,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: COLORS.success,
    borderTopRightRadius: 4,
  },
  frameCornerBL: {
    ...cornerBase,
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: COLORS.success,
    borderBottomLeftRadius: 4,
  },
  frameCornerBR: {
    ...cornerBase,
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: COLORS.success,
    borderBottomRightRadius: 4,
  },

  // Preview action bar
  previewActions: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
  },
  previewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  confirmBtn: {
    backgroundColor: COLORS.success,
  },
  previewBtnLabel: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.semibold,
    color: COLORS.white,
  },

  // Close button
  closeBtn: {
    position: "absolute",
    top: 54,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
});
