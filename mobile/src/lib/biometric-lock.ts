// ── Biometric Lock ───────────────────────────────────────────
// Face ID / Touch ID / fingerprint gate that protects the app
// when returning from background. Uses expo-local-authentication
// and SecureStore to remember the user's preference.

import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const PREF_KEY = "biometric_enabled";

/** Check if the device has Face ID, Touch ID, or fingerprint enrolled. */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch {
    return false;
  }
}

/** Return a human-readable label: "Face ID", "Touch ID", or "Fingerprint". */
export async function biometricLabel(): Promise<string> {
  try {
    const types =
      await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (
      types.includes(
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
      )
    )
      return Platform.OS === "ios" ? "Face ID" : "Face Unlock";
    if (
      types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
    )
      return Platform.OS === "ios" ? "Touch ID" : "Fingerprint";
    return "Biometrics";
  } catch {
    return "Biometrics";
  }
}

/** Read the user's biometric-lock preference from secure storage. */
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const val = await SecureStore.getItemAsync(PREF_KEY);
    return val === "1";
  } catch {
    return false;
  }
}

/** Toggle biometric lock on or off. */
export async function setBiometricEnabled(on: boolean): Promise<void> {
  await SecureStore.setItemAsync(PREF_KEY, on ? "1" : "0");
}

/**
 * Prompt the user for biometric auth.
 * Returns true if authenticated, false if cancelled/failed.
 */
export async function authenticateBiometric(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock VettdRE",
      cancelLabel: "Cancel",
      disableDeviceFallback: false, // allow passcode fallback on iOS
      fallbackLabel: "Use Passcode",
    });
    return result.success;
  } catch {
    return false;
  }
}
