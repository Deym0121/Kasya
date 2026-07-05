import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../theme';
import { marketplaceLinks, ShopQuery } from '../shoes/shopLinks';

/**
 * "Find it → Shopee · TikTok Shop · Lazada · Google" — taps open a LIVE search on
 * the real marketplace, where the authentic photo and current price live. This is
 * how we guarantee an accurate product image without hosting one ourselves.
 */
export function ShopLinksRow({ shoe, query }: { shoe: { brand: string; model: string }; query?: ShopQuery }) {
  const links = marketplaceLinks(shoe, query);
  const open = (url: string) => {
    Linking.openURL(url).catch(() => {
      /* no-op: a blocked/failed deep link shouldn't crash the screen */
    });
  };
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Feather name="shopping-bag" size={13} color={colors.muted} />
        <Text style={styles.label}>Find it on</Text>
      </View>
      <View style={styles.row}>
        {links.map((l) => (
          <Pressable
            key={l.key}
            onPress={() => open(l.url)}
            accessibilityRole="link"
            accessibilityLabel={`Search ${shoe.brand} ${shoe.model} on ${l.label}`}
            style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.chipText}>{l.label}</Text>
            <Feather name="external-link" size={12} color={colors.accentInk} style={{ marginLeft: 5 }} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  label: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accentInk },
});
