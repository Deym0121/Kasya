import { View, Text, Image, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, radius, fonts } from '../theme';
import type { Shoe } from '../data/shoes';
import { SHOE_IMAGES } from './shoeImages';

// A soft palette so each shoe tile reads a little differently.
const TINTS = ['#378ADD', '#1D9E75', '#D85A30', '#7F77DD', '#BA7517', '#D4537E'];
function tintFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

// A simple side-view sneaker silhouette (used as a faint watermark on the tile).
const SHOE_PATH =
  'M6,42 Q4,50 14,50 L86,50 Q95,50 93,42 L91,38 Q70,29 58,29 L46,29 Q41,20 30,20 Q17,20 15,31 L9,35 Q5,38 6,42 Z';

/** First letter/number of the brand, for the glyph tile. */
function brandInitial(brand: string): string {
  const m = brand.match(/[A-Za-z0-9]/);
  return (m ? m[0] : '?').toUpperCase();
}

/**
 * Shoe thumbnail. Preference order: a bundled real product photo (shoeImages.ts),
 * then a self-hosted photo URL, otherwise an HONEST brand-initial glyph (never a
 * random/generated photo — that was the bug). The live listing always has the
 * authentic photo one tap away.
 */
export function ShoeThumb({ shoe, size = 56 }: { shoe: Shoe; size?: number }) {
  const bundled = SHOE_IMAGES[shoe.id];
  if (bundled) {
    return (
      <Image
        source={bundled}
        style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: '#fff' }}
        resizeMode="contain"
        accessibilityLabel={`${shoe.brand} ${shoe.model}`}
      />
    );
  }
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
    <View
      style={[styles.tile, { width: size, height: size, backgroundColor: tint }]}
      accessibilityLabel={`${shoe.brand} ${shoe.model}`}
    >
      <Svg width={size * 0.9} height={size * 0.9} viewBox="0 0 100 60" style={StyleSheet.absoluteFill as any}>
        <Path d={SHOE_PATH} fill="#fff" opacity={0.14} transform="translate(2 6)" />
      </Svg>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{brandInitial(shoe.brand)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: { fontFamily: fonts.extra, color: '#fff', letterSpacing: -0.5 },
});
