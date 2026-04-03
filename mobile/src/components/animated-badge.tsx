// ── Animated Tab Badge ───────────────────────────────────────
// Bounces in when count changes, then settles. Used in the
// tab bar to show unread notifications / pipeline counts.

import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { COLORS, FONT } from "@/lib/theme";

interface AnimatedBadgeProps {
  count: number;
  /** Background color — defaults to red */
  color?: string;
}

export function AnimatedBadge({
  count,
  color = COLORS.danger,
}: AnimatedBadgeProps) {
  const scale = useRef(new Animated.Value(count > 0 ? 1 : 0)).current;
  const prevCount = useRef(count);

  useEffect(() => {
    // Stop any running animation before starting a new one
    scale.stopAnimation();

    if (count > 0) {
      // Bounce in (whether new appearance or count change)
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.3,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 4,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Shrink out
      Animated.timing(scale, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }

    prevCount.current = count;

    return () => {
      scale.stopAnimation();
    };
  }, [count]);

  if (count === 0) return null;

  const label = count > 99 ? "99+" : String(count);

  return (
    <Animated.View
      style={[
        styles.badge,
        { backgroundColor: color, transform: [{ scale }] },
      ]}
    >
      <Text style={styles.text}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -4,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  text: {
    fontSize: 10,
    fontWeight: FONT.weight.bold,
    color: COLORS.white,
    textAlign: "center",
  },
});
