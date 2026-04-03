// ── Contact Owner Bottom Sheet ────────────────────────────────
// Modal sheet showing owner contacts with call/SMS/email actions.

import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Linking,
  Dimensions,
} from "react-native";
import { Phone, Mail, MessageSquare, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, RADIUS, FONT, SPACING } from "@/lib/theme";

interface Contact {
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  source?: string;
}

interface ContactSheetProps {
  visible: boolean;
  onClose: () => void;
  ownerName: string;
  address: string;
  contacts: Contact[];
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export function ContactSheet({
  visible,
  onClose,
  ownerName,
  address,
  contacts,
}: ContactSheetProps) {
  const handleAction = (
    type: "call" | "sms" | "email",
    value: string
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();

    switch (type) {
      case "call":
        Linking.openURL(`tel:${value}`);
        break;
      case "sms":
        Linking.openURL(`sms:${value}`);
        break;
      case "email":
        Linking.openURL(
          `mailto:${value}?subject=${encodeURIComponent(
            `Inquiry: ${address}`
          )}&body=${encodeURIComponent(
            `Hi,\n\nI'm reaching out regarding the property at ${address}.\n\n`
          )}`
        );
        break;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Contact Owner</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <X size={20} color={COLORS.textMuted} />
          </Pressable>
        </View>

        <Text style={styles.ownerName}>{ownerName}</Text>
        <Text style={styles.propertyLabel}>{address}</Text>

        {contacts.slice(0, 4).map((c, i) => (
          <View key={i} style={styles.contactCard}>
            <View style={styles.contactInfo}>
              <View style={styles.contactAvatar}>
                <Text style={styles.contactAvatarText}>
                  {(c.name || "?")[0]}
                </Text>
              </View>
              <View>
                <Text style={styles.contactName}>{c.name}</Text>
                <Text style={styles.contactRole}>
                  {c.role || "Contact"}
                  {c.source ? ` · ${c.source}` : ""}
                </Text>
              </View>
            </View>

            <View style={styles.actions}>
              {c.phone && (
                <>
                  <Pressable
                    onPress={() => handleAction("call", c.phone!)}
                    style={[styles.actionBtn, { backgroundColor: COLORS.successBg }]}
                  >
                    <Phone size={16} color={COLORS.successDark} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleAction("sms", c.phone!)}
                    style={[styles.actionBtn, { backgroundColor: COLORS.primaryLight }]}
                  >
                    <MessageSquare size={16} color={COLORS.primary} />
                  </Pressable>
                </>
              )}
              {c.email && (
                <Pressable
                  onPress={() => handleAction("email", c.email!)}
                  style={[styles.actionBtn, { backgroundColor: "#FFF7ED" }]}
                >
                  <Mail size={16} color="#EA580C" />
                </Pressable>
              )}
            </View>
          </View>
        ))}

        {contacts.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              No contact info available. Use the web app to enrich this owner.
            </Text>
          </View>
        )}

        <View style={{ height: 20 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.overlayLight,
  },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: RADIUS.xxl + 4,
    borderTopRightRadius: RADIUS.xxl + 4,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: 40,
    maxHeight: SCREEN_HEIGHT * 0.65,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: SPACING.lg,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  sheetTitle: {
    fontSize: FONT.size.xxl,
    fontWeight: FONT.weight.bold,
    color: COLORS.text,
  },
  ownerName: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.semibold,
    color: COLORS.text,
    marginTop: SPACING.xs,
  },
  propertyLabel: {
    fontSize: FONT.size.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },

  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: SPACING.sm,
  },
  contactInfo: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  contactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  contactAvatarText: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textSecondary,
  },
  contactName: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.semibold,
    color: COLORS.text,
  },
  contactRole: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },

  actions: { flexDirection: "row", gap: SPACING.sm },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    justifyContent: "center",
    alignItems: "center",
  },

  emptyState: { padding: SPACING.xl, alignItems: "center" },
  emptyText: {
    fontSize: FONT.size.base,
    color: COLORS.textMuted,
    textAlign: "center",
  },
});
