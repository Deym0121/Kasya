import { Linking, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors, fonts } from '../theme';
import { PRIVACY_URL, TERMS_URL } from '../config/siteUrl';

/** "By continuing, you agree to Kasya's Terms of Use and Privacy Policy." with tappable links. */
export function LegalNote({
  lead = 'By continuing, you agree to Kasya’s',
  privacy = true,
  style,
}: {
  lead?: string;
  /** also link the Privacy Policy */
  privacy?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const base: TextStyle = { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.muted };
  const link: TextStyle = { color: colors.accentInk, fontFamily: fonts.semibold };
  return (
    <Text style={[base, style]}>
      {lead}{' '}
      <Text style={link} accessibilityRole="link" onPress={() => Linking.openURL(TERMS_URL)}>
        Terms of Use
      </Text>
      {privacy ? (
        <>
          {' and '}
          <Text style={link} accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_URL)}>
            Privacy Policy
          </Text>
        </>
      ) : null}
      .
    </Text>
  );
}
