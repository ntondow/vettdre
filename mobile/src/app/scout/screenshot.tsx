// ── Scout: Screenshot Screen ──────────────────────────────────
// Pick a screenshot from the photo library (e.g., a StreetEasy listing)
// and send it to Claude Vision for address extraction.

import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system";
import { HeaderBar } from "@/components/ui";

export default function ScreenshotScreen() {
  const router = useRouter();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const pickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Please allow photo library access to upload screenshots."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);

      // If base64 wasn't returned, read the file
      let base64 = result.assets[0].base64;
      if (!base64) {
        try {
          const fileData = await FileSystem.readAsStringAsync(
            result.assets[0].uri,
            { encoding: FileSystem.EncodingType.Base64 }
          );
          base64 = fileData;
        } catch {
          Alert.alert("Error", "Could not read the image file.");
          return;
        }
      }

      // Navigate to resolving screen
      router.push({
        pathname: "/scout/resolving",
        params: {
          mode: "screenshot",
          imageBase64: base64,
        },
      });
    }
  };

  return (
    <View style={styles.container}>
      <HeaderBar title="Screenshot a Listing" onBack={() => router.back()} />

      <View style={styles.content}>
        <View style={styles.illustrationBox}>
          <Text style={styles.illustrationEmoji}>📱</Text>
          <Text style={styles.illustrationTitle}>
            Upload a Listing Screenshot
          </Text>
          <Text style={styles.illustrationDesc}>
            Take a screenshot from StreetEasy, Zillow, Apartments.com, or any
            listing — we'll extract the address and pull the full building
            profile.
          </Text>
        </View>

        <Pressable
          onPress={pickImage}
          disabled={isLoading}
          style={({ pressed }) => [
            styles.pickBtn,
            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={styles.pickBtnText}>Choose from Photos</Text>
        </Pressable>

        <View style={styles.supportedSites}>
          <Text style={styles.supportedLabel}>SUPPORTED SOURCES</Text>
          {["StreetEasy", "Zillow", "Apartments.com", "Realtor.com", "Any listing site"].map(
            (site) => (
              <View key={site} style={styles.siteRow}>
                <Text style={styles.siteCheck}>✓</Text>
                <Text style={styles.siteName}>{site}</Text>
              </View>
            )
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 20 },
  illustrationBox: {
    alignItems: "center",
    padding: 32,
    backgroundColor: "#FFF7ED",
    borderRadius: 20,
    marginBottom: 24,
  },
  illustrationEmoji: { fontSize: 48, marginBottom: 16 },
  illustrationTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
    textAlign: "center",
  },
  illustrationDesc: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 21,
  },
  pickBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 28,
  },
  pickBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  supportedSites: { paddingLeft: 4 },
  supportedLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  siteRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  siteCheck: { fontSize: 14, color: "#10B981", fontWeight: "700" },
  siteName: { fontSize: 14, color: "#475569", fontWeight: "500" },
});
