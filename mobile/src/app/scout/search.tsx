// ── Scout: Address Search Screen ──────────────────────────────
// Type an address to scout a building. Uses PLUTO autocomplete.

import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { HeaderBar } from "@/components/ui";

// Debounce helper
function useDebounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): T {
  const timer = useRef<NodeJS.Timeout | null>(null);
  return useCallback(
    ((...args: any[]) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(...args), delay);
    }) as T,
    [fn, delay]
  );
}

interface AddressSuggestion {
  address: string;
  borough: string;
  boroCode: string;
  block: string;
  lot: string;
  unitsRes: number;
  yearBuilt: number;
  ownerName: string;
}

const NYC = "https://data.cityofnewyork.us/resource";
const PLUTO = "64uk-42ks";

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const searchPluto = useDebounce(async (text: string) => {
    const trimmed = text.trim().toUpperCase();
    if (trimmed.length < 3) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const parts = trimmed.split(/\s+/);
      const houseNum = parts[0];
      const streetPart = parts.slice(1).join(" ");

      let searchCondition: string;
      if (/^\d+$/.test(houseNum) && streetPart.length > 0) {
        searchCondition = `upper(address) like '${houseNum} ${streetPart}%'`;
      } else {
        searchCondition = `upper(address) like '%${trimmed}%'`;
      }

      const url = new URL(`${NYC}/${PLUTO}.json`);
      url.searchParams.set("$where", searchCondition);
      url.searchParams.set(
        "$select",
        "address,ownername,unitsres,yearbuilt,borocode,block,lot"
      );
      url.searchParams.set("$limit", "10");
      url.searchParams.set("$order", "unitsres DESC");

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        const boroughs = [
          "",
          "Manhattan",
          "Bronx",
          "Brooklyn",
          "Queens",
          "Staten Island",
        ];
        setResults(
          data.map((p: any) => ({
            address: p.address || "",
            borough: boroughs[parseInt(p.borocode)] || "",
            boroCode: p.borocode || "",
            block: p.block || "",
            lot: p.lot || "",
            unitsRes: parseInt(p.unitsres || "0"),
            yearBuilt: parseInt(p.yearbuilt || "0"),
            ownerName: p.ownername || "",
          }))
        );
      }
    } catch (err) {
      console.error("[search] Error:", err);
    }
    setIsSearching(false);
  }, 350);

  const selectAddress = (item: AddressSuggestion) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Keyboard.dismiss();

    const bbl = `${item.boroCode}${item.block.padStart(5, "0")}${item.lot.padStart(4, "0")}`;

    router.push({
      pathname: "/scout/resolving",
      params: {
        mode: "bbl",
        bbl,
        address: `${item.address}, ${item.borough}`,
      },
    });
  };

  return (
    <View style={styles.container}>
      <HeaderBar title="Search by Address" onBack={() => router.back()} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="350 Park Avenue..."
            placeholderTextColor="#94A3B8"
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              searchPluto(text);
            }}
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>

        {isSearching && (
          <Text style={styles.searchingText}>Searching...</Text>
        )}

        <FlatList
          data={results}
          keyExtractor={(item, i) =>
            `${item.boroCode}-${item.block}-${item.lot}-${i}`
          }
          contentContainerStyle={{ padding: 20, paddingTop: 0 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => selectAddress(item)}
              style={({ pressed }) => [
                styles.resultCard,
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Text style={styles.resultAddress}>{item.address}</Text>
              <Text style={styles.resultMeta}>
                {item.borough}
                {item.unitsRes > 0 ? ` · ${item.unitsRes} units` : ""}
                {item.yearBuilt > 0 ? ` · Built ${item.yearBuilt}` : ""}
              </Text>
              {item.ownerName ? (
                <Text style={styles.resultOwner}>{item.ownerName}</Text>
              ) : null}
            </Pressable>
          )}
          ListEmptyComponent={
            query.length >= 3 && !isSearching ? (
              <Text style={styles.emptyText}>No results found</Text>
            ) : null
          }
        />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  searchRow: { paddingHorizontal: 20, marginBottom: 12 },
  searchInput: {
    borderWidth: 1.5,
    borderColor: "#2563EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  searchingText: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
    marginBottom: 8,
  },
  resultCard: {
    padding: 16,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 10,
  },
  resultAddress: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  resultMeta: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 3,
  },
  resultOwner: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 40,
  },
});
