// ── Network Status Banner ────────────────────────────────────
// Shows a sliding banner when the device goes offline or reconnects.
// Auto-hides the "Back online" banner after 3 seconds.

import { useState, useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet, Platform } from "react-native";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { Wifi, WifiOff } from "lucide-react-native";

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setIsConnected(state.isConnected ?? true);
    });
    return () => unsubscribe();
  }, []);

  return isConnected;
}

export function NetworkBanner() {
  const isConnected = useNetworkStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasDisconnected, setWasDisconnected] = useState(false);
  const translateY = useRef(new Animated.Value(-60)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isConnected) {
      // Going offline
      setWasDisconnected(true);
      setShowReconnected(false);
      Animated.spring(translateY, {
        toValue: 0,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }).start();
    } else if (wasDisconnected) {
      // Coming back online
      setShowReconnected(true);
      Animated.spring(translateY, {
        toValue: 0,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }).start();

      // Hide after 3s
      timerRef.current = setTimeout(() => {
        Animated.timing(translateY, {
          toValue: -60,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setShowReconnected(false);
          setWasDisconnected(false);
        });
      }, 3000);
    } else {
      // Initial state, connected, hide
      Animated.timing(translateY, {
        toValue: -60,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isConnected]);

  // Don't render anything if we've never been disconnected
  if (isConnected && !showReconnected && !wasDisconnected) return null;

  const isOffline = !isConnected;
  const backgroundColor = isOffline ? "#EF4444" : "#10B981";

  return (
    <Animated.View
      style={[
        styles.banner,
        { backgroundColor, transform: [{ translateY }] },
      ]}
    >
      {isOffline ? (
        <>
          <WifiOff size={14} color="#fff" />
          <Text style={styles.text}>No internet connection</Text>
        </>
      ) : (
        <>
          <Wifi size={14} color="#fff" />
          <Text style={styles.text}>Back online</Text>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingTop: Platform.OS === "ios" ? 54 : 36,
    paddingBottom: 10,
  },
  text: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
});
