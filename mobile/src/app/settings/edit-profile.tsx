// ── Edit Profile ──────────────────────────────────────────────
// Screen for agents to update their name, phone, title, and license.

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Save } from "lucide-react-native";
import { fetchAgentProfile, updateAgentProfile } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from "@/lib/theme";
import * as Haptics from "expo-haptics";

export default function EditProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: qk.agent.profile,
    queryFn: fetchAgentProfile,
  });

  // Form state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      const p = profile as unknown as Record<string, unknown>;
      // Agent profile has user nested; standalone user is flat
      const user = (p.user as Record<string, unknown>) || p;
      setFullName((user.fullName as string) || "");
      setPhone((user.phone as string) || (p.phone as string) || "");
      setTitle((user.title as string) || "");
      setLicenseNumber((p.licenseNumber as string) || "");
    }
  }, [profile]);

  const mutation = useMutation({
    mutationFn: updateAgentProfile,
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: qk.agent.profile });
      Alert.alert("Profile Updated", "Your changes have been saved.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    },
    onError: (error: Error) => {
      Alert.alert("Update Failed", error.message || "Please try again.");
    },
  });

  const handleSave = () => {
    if (!fullName.trim()) {
      Alert.alert("Name Required", "Please enter your full name.");
      return;
    }
    mutation.mutate({
      fullName: fullName.trim(),
      phone: phone.trim() || null,
      title: title.trim() || null,
      licenseNumber: licenseNumber.trim() || null,
    });
  };

  const hasChanges = (() => {
    if (!profile) return false;
    const p = profile as unknown as Record<string, unknown>;
    const user = (p.user as Record<string, unknown>) || p;
    return (
      fullName.trim() !== ((user.fullName as string) || "") ||
      phone.trim() !== ((user.phone as string) || (p.phone as string) || "") ||
      title.trim() !== ((user.title as string) || "") ||
      licenseNumber.trim() !== ((p.licenseNumber as string) || "")
    );
  })();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ChevronLeft size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <Pressable
          onPress={handleSave}
          disabled={!hasChanges || mutation.isPending}
          hitSlop={12}
        >
          {mutation.isPending ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Save
              size={22}
              color={hasChanges ? COLORS.primary : COLORS.textMuted}
            />
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Full Name */}
        <View style={styles.field}>
          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="e.g. John Doe"
            placeholderTextColor={COLORS.textPlaceholder}
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>

        {/* Phone */}
        <View style={styles.field}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="(212) 555-0100"
            placeholderTextColor={COLORS.textPlaceholder}
            keyboardType="phone-pad"
            returnKeyType="next"
          />
        </View>

        {/* Title */}
        <View style={styles.field}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Licensed Real Estate Salesperson"
            placeholderTextColor={COLORS.textPlaceholder}
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>

        {/* License Number */}
        <View style={styles.field}>
          <Text style={styles.label}>License Number</Text>
          <TextInput
            style={styles.input}
            value={licenseNumber}
            onChangeText={setLicenseNumber}
            placeholder="e.g. 10401234567"
            placeholderTextColor={COLORS.textPlaceholder}
            keyboardType="number-pad"
            returnKeyType="done"
          />
        </View>

        {/* Save Button */}
        <Pressable
          style={[
            styles.saveButton,
            (!hasChanges || mutation.isPending) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!hasChanges || mutation.isPending}
        >
          {mutation.isPending ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgSecondary },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingTop: 60,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.bg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: FONT.size.xl,
    fontWeight: FONT.weight.semibold,
    color: COLORS.text,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 40,
  },
  field: {
    marginBottom: SPACING.xl,
  },
  label: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    fontSize: FONT.size.base,
    color: COLORS.text,
    ...SHADOW.sm,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: SPACING.lg,
    ...SHADOW.md,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: COLORS.white,
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.semibold,
  },
});
