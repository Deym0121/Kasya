import { View, Image, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, radius } from '../theme';
import type { Shoe } from '../data/shoes';

// A soft palette so each shoe tile reads a little differently.
const TINTS = ['#378ADD', '#1D9E75', '#D85A30', '#7F77DD', '#BA7517', '#D4537E'];
function tintFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

// A simple side-view sneaker silhouette.
const SHOE_PATH =
  'M6,42 Q4,50 14,50 L86,50 Q95,50 93,42 L91,38 Q70,29 58,29 L46,29 Q41,20 30,20 Q17,20 15,31 L9,35 Q5,38 6,42 Z';

/**
 * Shoe thumbnail — the licensed product photo when a shoe has one, otherwise a
 * clean tinted sneaker glyph (no network, works everywhere). Swap in real photos
 * later by setting `shoe.image`.
 */
export function ShoeThumb({ shoe, size = 56 }: { shoe: Shoe; size?: number }) {
  if (shoe.image) {
    return (
      <Image
        source={{ uri: shoe.image }}
        style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}
        resizeMode="cover"
        accessibilityLabel={`${shoe.brand} ${shoe.model}`}
      />
    );
  }
  const tint = tintFor(shoe.id);
  return (
    <View style={[styles.tile, { width: size, height: size }]}>
      <Svg width={size * 0.78} height={size * 0.78} viewBox="0 0 100 60">
        <Path d={SHOE_PATH} fill={tint} opacity={0.9} />
        <Path d="M46,29 Q41,20 30,20 Q17,20 15,31" fill="none" stroke="#fff" strokeWidth={2} opacity={0.55} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
