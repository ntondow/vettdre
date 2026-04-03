// ── Onboarding Walkthrough ───────────────────────────────────
// Shown once on first login. 4-screen carousel introducing the
// app's core features. Swipeable with dot indicators + skip.

import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  FlatList,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { Animated } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  Camera,
  Users,
  DollarSign,
  BarChart3,
} from "lucide-react-native";
import { COLORS, FONT, RADIUS, SPACING } from "@/lib/theme";

const ONBOARDING_KEY = "onboarding_complete";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Slide {
  id: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  title: string;
  description: string;
}

const SLIDES: Slide[] = [
  {
    id: "scout",
    icon: Camera,
    color: COLORS.primary,
    bg: COLORS.primaryLight,
    title: "Scout Buildings",
    description:
      "Point your camera at any NYC building to instantly pull ownership, violations, permits, and distress signals.",
  },
  {
    id: "clients",
    icon: Users,
    color: "#8B5CF6",
    bg: "#F5F3FF",
    title: "Manage Clients",
    description:
      "Send digital onboarding packages, track statuses, and keep all your client relationships in one place.",
  },
  {
    id: "deals",
    icon: DollarSign,
    color: COLORS.success,
    bg: COLORS.successBg,
    title: "Submit Deals",
    description:
      "Log deals on the go — even offline. They'll sync to your brokerage the moment you're back online.",
  },
  {
    id: "earnings",
    icon: BarChart3,
    color: COLORS.warning,
    bg: COLORS.warningBg,
    title: "Track Earnings",
    description:
      "Real-time commission tracking, payout history, and close-rate analytics so you always know where you stand.",
  },
];

interface OnboardingWalkthroughProps {
  onComplete: () => void;
}

export function OnboardingWalkthrough({
  onComplete,
}: OnboardingWalkthroughProps) {
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(idx);
  };

  async function finish() {
    await SecureStore.setItemAsync(ONBOARDING_KEY, "1");
    onComplete();
  }

  function goNext() {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: activeIndex + 1,
        animated: true,
      });
    } else {
      finish();
    }
  }

  const renderSlide = ({ item }: { item: Slide }) => {
    const Icon = item.icon;
    return (
      <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
        <View style={[styles.iconCircle, { backgroundColor: item.bg }]}>
          <Icon size={48} color={item.color} />
        </View>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.description}>{item.description}</Text>
      </View>
    );
  };

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      {/* Skip button */}
      <Pressable onPress={finish} style={styles.skipBtn}>
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        bounces={false}
      />

      {/* Bottom controls */}
      <View style={styles.bottomBar}>
        {/* Dot indicators */}
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View
              key={s.id}
              style={[
                styles.dot,
                i === activeIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>

        {/* Next / Get Started button */}
        <Pressable
          onPress={goNext}
          style={({ pressed }) => [
            styles.nextBtn,
            isLast && styles.nextBtnLast,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text
            style={[
              styles.nextText,
              isLast && styles.nextTextLast,
            ]}
          >
            {isLast ? "Get Started" : "Next"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Check if onboarding has been completed. */
export async function hasCompletedOnboarding(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(ONBOARDING_KEY);
  return val === "1";
}

/** Reset onboarding flag (for testing / settings). */
export async function resetOnboarding(): Promise<void> {
  await SecureStore.deleteItemAsync(ONBOARDING_KEY);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  skipBtn: {
    position: "absolute",
    top: 60,
    right: 24,
    zIndex: 10,
    padding: 8,
  },
  skipText: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.medium,
    color: COLORS.textSecondary,
  },
  slide: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: FONT.size.hero,
    fontWeight: FONT.weight.bold,
    color: COLORS.text,
    textAlign: "center",
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: FONT.size.lg,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 300,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: 50,
    gap: 24,
    alignItems: "center",
  },
  dots: {
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    width: 24,
    backgroundColor: COLORS.primary,
  },
  nextBtn: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgTertiary,
    alignItems: "center",
  },
  nextBtnLast: {
    backgroundColor: COLORS.primary,
  },
  nextText: {
    fontSize: FONT.size.xl,
    fontWeight: FONT.weight.semibold,
    color: COLORS.text,
  },
  nextTextLast: {
    color: COLORS.white,
  },
});
