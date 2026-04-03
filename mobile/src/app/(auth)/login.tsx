// ── Login Screen ──────────────────────────────────────────────
// Email + password auth via Supabase (same as web app).

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import * as Haptics from "expo-haptics";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError("Please enter your email and password");
      return;
    }

    setError("");
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await signIn(email, password);
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err?.message ?? "Login failed. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.inner}>
          {/* Logo */}
          <View style={styles.logoContainer} accessible accessibilityRole="header">
            <Text style={styles.logoText}>VettdRE</Text>
            <Text style={styles.tagline}>NYC Building Intelligence</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Email address"
              textContentType="emailAddress"
              autoComplete="email"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              accessibilityLabel="Password"
              textContentType="password"
              autoComplete="password"
            />

            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}

            <Pressable
              onPress={handleLogin}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={loading ? "Signing in" : "Sign in"}
              accessibilityState={{ disabled: loading, busy: loading }}
              style={({ pressed }) => [
                styles.loginButton,
                pressed && { opacity: 0.9 },
                loading && { opacity: 0.7 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginText}>Sign In</Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.footer}>
            Use your VettdRE web account credentials
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  inner: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  logoContainer: { alignItems: "center", marginBottom: 48 },
  logoText: {
    fontSize: 36,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -1,
  },
  tagline: { fontSize: 15, color: "#94A3B8", marginTop: 4 },

  form: { gap: 12 },
  input: {
    padding: 16,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    fontSize: 16,
    color: "#0F172A",
  },
  error: {
    fontSize: 14,
    color: "#EF4444",
    textAlign: "center",
    marginTop: 4,
  },
  loginButton: {
    padding: 16,
    backgroundColor: "#2563EB",
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  loginText: { fontSize: 16, fontWeight: "600", color: "#fff" },

  footer: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 24,
  },
});
