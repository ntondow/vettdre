// ── Scout: URL Paste Screen ───────────────────────────────────
// Paste any listing URL and we'll scrape + extract the building.

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { HeaderBar } from "@/components/ui";

export default function UrlScreen() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isPasting, setIsPasting] = useState(false);

  const isValidUrl = (text: string) => {
    try {
      new URL(text);
      return true;
    } catch {
      return false;
    }
  };

  const pasteFromClipboard = async () => {
    setIsPasting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const text = await Clipboard.getStringAsync();
      if (text && isValidUrl(text.trim())) {
        setUrl(text.trim());
      } else if (text) {
        setUrl(text.trim());
      }
    } catch {
      Alert.alert("Error", "Could not access clipboard.");
    }
    setIsPasting(false);
  };

  const submit = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      Alert.alert("Enter a URL", "Please paste or type a listing URL.");
      return;
    }

    if (!isValidUrl(trimmed)) {
      Alert.alert(
        "Invalid URL",
        "Please enter a full URL starting with http:// or https://"
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Keyboard.dismiss();

    router.push({
      pathname: "/scout/resolving",
      params: {
        mode: "url",
        url: trimmed,
      },
    });
  };

  return (
    <View style={styles.container}>
      <HeaderBar title="Paste a Listing URL" onBack={() => router.back()} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content}>
          <View style={styles.illustrationBox}>
            <Text style={styles.illustrationEmoji}>🔗</Text>
            <Text style={styles.illustrationTitle}>Drop a Listing Link</Text>
            <Text style={styles.illustrationDesc}>
              Paste a URL from any listing site. We'll scrape it, extract the
              address, and pull the full building intelligence profile.
            </Text>
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="https://streeteasy.com/building/..."
              placeholderTextColor="#94A3B8"
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={submit}
              selectTextOnFocus
            />
            <Pressable
              onPress={pasteFromClipboard}
              style={({ pressed }) => [
                styles.pasteBtn,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={styles.pasteBtnText}>Paste</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={submit}
            disabled={!url.trim()}
            style={({ pressed }) => [
              styles.submitBtn,
              !url.trim() && styles.submitBtnDisabled,
              pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
            ]}
          >
            <Text
              style={[
                styles.submitBtnText,
                !url.trim() && styles.submitBtnTextDisabled,
              ]}
            >
              Scout This Building
            </Text>
          </Pressable>

          <View style={styles.examples}>
            <Text style={styles.examplesLabel}>TRY THESE</Text>
            {[
              "streeteasy.com",
              "zillow.com",
              "apartments.com",
              "realtor.com",
            ].map((domain) => (
              <View key={domain} style={styles.exampleRow}>
                <Text style={styles.exampleDot}>•</Text>
                <Text style={styles.exampleText}>{domain}</Text>
              </View>
            ))}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 20 },
  illustrationBox: {
    alignItems: "center",
    padding: 32,
    backgroundColor: "#F0FDF4",
    borderRadius: 20,
    marginBottom: 24,
  },
  illustrationEmoji: { fontSize: 48, marginBottom: 16 },
  illustrationTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
  },
  illustrationDesc: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 21,
  },
  inputRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  pasteBtn: {
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  pasteBtnText: { fontSize: 14, fontWeight: "600", color: "#2563EB" },
  submitBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 28,
  },
  submitBtnDisabled: { backgroundColor: "#E2E8F0" },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  submitBtnTextDisabled: { color: "#94A3B8" },
  examples: { paddingLeft: 4 },
  examplesLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  exampleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  exampleDot: { fontSize: 12, color: "#94A3B8" },
  exampleText: { fontSize: 14, color: "#475569", fontWeight: "500" },
});
