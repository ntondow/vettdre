// ── Scout: Camera Screen ──────────────────────────────────────
// Full-screen camera to photograph a building.
// Extracts GPS from EXIF on-device, sends photo to backend for
// Claude Vision address extraction if GPS unavailable.

import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system";

export default function CameraScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [flashMode, setFlashMode] = useState<"off" | "on">("off");

  // Request camera permission on mount
  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const capturePhoto = async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Take photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        exif: true,
      });

      if (!photo) {
        Alert.alert("Error", "Failed to capture photo");
        setIsCapturing(false);
        return;
      }

      // Try to extract GPS from EXIF first (instant, no API call needed)
      let lat: number | null = null;
      let lng: number | null = null;

      if (photo.exif?.GPSLatitude && photo.exif?.GPSLongitude) {
        lat = photo.exif.GPSLatitude;
        lng = photo.exif.GPSLongitude;
      }

      // Fallback: get current device location
      if (!lat || !lng) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
            lat = loc.coords.latitude;
            lng = loc.coords.longitude;
          }
        } catch {
          // Location unavailable — will use Claude Vision on backend
        }
      }

      // Navigate to resolving screen with the data
      router.push({
        pathname: "/scout/resolving",
        params: {
          mode: "camera",
          imageBase64: photo.base64 || "",
          lat: lat?.toString() || "",
          lng: lng?.toString() || "",
        },
      });
    } catch (err) {
      console.error("[camera] Capture error:", err);
      Alert.alert("Error", "Failed to capture photo. Please try again.");
    } finally {
      setIsCapturing(false);
    }
  };

  // Permission states
  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Checking camera access...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permTitle}>Camera Access</Text>
        <Text style={styles.permText}>
          VettdRE needs camera access to photograph buildings and identify them
          instantly.
        </Text>
        <Pressable
          onPress={requestPermission}
          style={({ pressed }) => [styles.permBtn, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.permBtnText}>Grant Access</Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.permBtnSecondary,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={styles.permBtnSecText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flashMode}
      />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          hitSlop={12}
          style={styles.topBtn}
        >
          <Text style={styles.topBtnText}>✕</Text>
        </Pressable>

        <Text style={styles.topTitle}>Point at a Building</Text>

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setFlashMode((m) => (m === "off" ? "on" : "off"));
          }}
          style={styles.topBtn}
        >
          <Text style={styles.topBtnText}>
            {flashMode === "on" ? "⚡" : "⚡️"}
          </Text>
        </Pressable>
      </View>

      {/* Viewfinder guide */}
      <View style={styles.viewfinder}>
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />
      </View>

      {/* Bottom controls */}
      <View style={styles.bottomBar}>
        <Text style={styles.hint}>
          Capture the building facade or street sign
        </Text>
        <Pressable
          onPress={capturePhoto}
          disabled={isCapturing}
          style={({ pressed }) => [
            styles.captureBtn,
            pressed && { transform: [{ scale: 0.95 }] },
            isCapturing && { opacity: 0.5 },
          ]}
        >
          <View style={styles.captureBtnInner} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  permTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 12,
  },
  permText: {
    fontSize: 15,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  permBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginBottom: 12,
  },
  permBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  permBtnSecondary: { padding: 14 },
  permBtnSecText: { color: "#64748B", fontWeight: "600", fontSize: 15 },

  // Top bar
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    zIndex: 10,
  },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  topBtnText: { fontSize: 18, color: "#fff" },
  topTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Viewfinder
  viewfinder: {
    position: "absolute",
    top: "25%",
    left: "10%",
    right: "10%",
    bottom: "30%",
    zIndex: 5,
  },
  corner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderColor: "#fff",
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },

  // Bottom
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingBottom: 50,
    paddingTop: 20,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  hint: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    marginBottom: 20,
    fontWeight: "500",
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    padding: 4,
  },
  captureBtnInner: {
    flex: 1,
    borderRadius: 30,
    backgroundColor: "#fff",
  },
});
