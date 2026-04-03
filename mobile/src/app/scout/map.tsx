// ── Interactive Map Scout ─────────────────────────────────────
// Full-screen map centered on NYC. Tap a location to scout the
// building at that address using reverse geocoding → scout API.
// Pins saved buildings + shows current location.

import { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
} from "react-native";
import MapView, {
  Marker,
  PROVIDER_DEFAULT,
  type Region,
  type MapPressEvent,
} from "react-native-maps";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { Crosshair, Navigation, Bookmark, X } from "lucide-react-native";
import { COLORS, FONT, RADIUS, SPACING, SHADOW } from "@/lib/theme";
import { scoutByCoords, scoutByAddress } from "@/lib/api";
import { getAllSavedBuildings } from "@/lib/offline-cache";
import type { BuildingProfile } from "@/types";

const { width: SCREEN_W } = Dimensions.get("window");

// Default: Manhattan center
const NYC_CENTER: Region = {
  latitude: 40.7580,
  longitude: -73.9855,
  latitudeDelta: 0.025,
  longitudeDelta: 0.025,
};

interface PinnedBuilding {
  bbl: string;
  address: string;
  lat: number;
  lng: number;
  profile: BuildingProfile;
}

export default function MapScoutScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);

  const [region, setRegion] = useState<Region>(NYC_CENTER);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [savedPins, setSavedPins] = useState<PinnedBuilding[]>([]);
  const [tappedCoord, setTappedCoord] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewBuilding, setPreviewBuilding] =
    useState<BuildingProfile | null>(null);

  // Get user location on mount
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        // Map still works — just won't auto-center on user location
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      };
      setUserLocation(coords);
      mapRef.current?.animateToRegion(
        {
          latitude: coords.lat,
          longitude: coords.lng,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        },
        600
      );
    })();
  }, []);

  // Load saved buildings as pins
  useFocusEffect(
    useCallback(() => {
      getAllSavedBuildings()
        .then((buildings) => {
          const pins: PinnedBuilding[] = buildings
            .filter(
              (b) =>
                b.profile.pluto?.latitude && b.profile.pluto?.longitude
            )
            .map((b) => ({
              bbl: b.bbl,
              address: b.address,
              lat: parseFloat(b.profile.pluto?.latitude ?? "0"),
              lng: parseFloat(b.profile.pluto?.longitude ?? "0"),
              profile: b.profile,
            }));
          setSavedPins(pins);
        })
        .catch(() => {});
    }, [])
  );

  // Tap anywhere on map → scout that location
  async function handleMapPress(e: MapPressEvent) {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTappedCoord({ lat: latitude, lng: longitude });
    setPreviewBuilding(null);
    setLoading(true);

    try {
      const profile = await scoutByCoords(latitude, longitude);
      setPreviewBuilding(profile);
    } catch (err: any) {
      Alert.alert(
        "No building found",
        "We couldn't identify a building at that location. Try tapping closer to a building."
      );
      setTappedCoord(null);
    } finally {
      setLoading(false);
    }
  }

  // Navigate to full building profile
  function openProfile(profile: BuildingProfile) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/scout/profile",
      params: { profileData: JSON.stringify({ pluto: profile, ...profile }) },
    });
  }

  // Re-center on user location
  function recenter() {
    if (!userLocation) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mapRef.current?.animateToRegion(
      {
        latitude: userLocation.lat,
        longitude: userLocation.lng,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      400
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={NYC_CENTER}
        onRegionChangeComplete={setRegion}
        onPress={handleMapPress}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        mapType="mutedStandard"
      >
        {/* Saved building pins */}
        {savedPins.map((pin) => (
          <Marker
            key={pin.bbl}
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            pinColor={COLORS.primary}
            title={pin.address}
            onCalloutPress={() => openProfile(pin.profile)}
          />
        ))}

        {/* Tapped location pin */}
        {tappedCoord && (
          <Marker
            coordinate={{
              latitude: tappedCoord.lat,
              longitude: tappedCoord.lng,
            }}
            pinColor={COLORS.danger}
          />
        )}
      </MapView>

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <X size={20} color={COLORS.text} />
        </Pressable>
        <Text style={styles.topTitle}>Map Scout</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Recenter button */}
      <Pressable onPress={recenter} style={styles.recenterBtn}>
        <Navigation size={20} color={COLORS.primary} />
      </Pressable>

      {/* Building preview card */}
      {(loading || previewBuilding) && (
        <View style={styles.previewCard}>
          {loading ? (
            <View style={styles.previewLoading}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.previewLoadingText}>
                Identifying building...
              </Text>
            </View>
          ) : previewBuilding ? (
            <Pressable
              onPress={() => openProfile(previewBuilding)}
              style={({ pressed }) => [pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.previewAddress} numberOfLines={1}>
                {previewBuilding.address}
              </Text>
              <View style={styles.previewMeta}>
                <Text style={styles.previewMetaText}>
                  {previewBuilding.unitsTotal} units
                </Text>
                <Text style={styles.previewDot}>·</Text>
                <Text style={styles.previewMetaText}>
                  {previewBuilding.numFloors} floors
                </Text>
                <Text style={styles.previewDot}>·</Text>
                <Text style={styles.previewMetaText}>
                  Built {previewBuilding.yearBuilt || "?"}
                </Text>
              </View>
              <View style={styles.previewFooter}>
                <Text style={styles.previewOwner} numberOfLines={1}>
                  {previewBuilding.ownerName}
                </Text>
                <View style={styles.previewCta}>
                  <Text style={styles.previewCtaText}>Full Profile →</Text>
                </View>
              </View>
            </Pressable>
          ) : null}

          {/* Dismiss */}
          {previewBuilding && (
            <Pressable
              onPress={() => {
                setPreviewBuilding(null);
                setTappedCoord(null);
              }}
              style={styles.previewClose}
            >
              <X size={16} color={COLORS.textSecondary} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  // Top bar
  topBar: {
    position: "absolute",
    top: 50,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bg,
    justifyContent: "center",
    alignItems: "center",
    ...SHADOW.md,
  },
  topTitle: {
    fontSize: FONT.size.xl,
    fontWeight: FONT.weight.semibold,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    overflow: "hidden",
    ...SHADOW.md,
  },

  // Recenter
  recenterBtn: {
    position: "absolute",
    right: 16,
    bottom: 200,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bg,
    justifyContent: "center",
    alignItems: "center",
    ...SHADOW.lg,
  },

  // Preview card
  previewCard: {
    position: "absolute",
    bottom: 40,
    left: 16,
    right: 16,
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOW.lg,
  },
  previewLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 8,
  },
  previewLoadingText: {
    fontSize: FONT.size.base,
    color: COLORS.textSecondary,
  },
  previewAddress: {
    fontSize: FONT.size.xxl,
    fontWeight: FONT.weight.bold,
    color: COLORS.text,
    marginBottom: 4,
    paddingRight: 24,
  },
  previewMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  previewMetaText: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
  },
  previewDot: {
    fontSize: FONT.size.sm,
    color: COLORS.textMuted,
  },
  previewFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previewOwner: {
    fontSize: FONT.size.md,
    color: COLORS.textSecondary,
    flex: 1,
  },
  previewCta: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
  },
  previewCtaText: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.semibold,
    color: COLORS.primary,
  },
  previewClose: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.bgTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
});
