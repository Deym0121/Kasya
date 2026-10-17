import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Switch, TextInput } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Button, Card, Label, TextField } from '../components';
import { Notice } from '../groups/ui';
import { countryName, flagEmoji, guessCountry } from '../clubs/countries';
import {
  CLUB_LIMITS,
  DEFAULT_EMBLEM,
  EMBLEM_COLORS,
  EMBLEM_ICONS,
  cleanClubName,
  cleanClubText,
  cleanGoalKm,
  emblemKey,
  localMonthKey,
  parseEmblem,
  type Emblem,
} from '../clubs/rules';
import { createClub, loadClubProfile, removeClubPhoto, updateClub, uploadClubPhoto } from '../clubs/api';
import { canPickPhoto, pickClubPhoto, type PickedPhoto } from '../clubs/photo';
import { ClubAvatar, CountryPicker } from '../clubs/ui';

type Props = RootScreenProps<'ClubEdit'>;

function deviceCountry(): string {
  try {
    const o = Intl.DateTimeFormat().resolvedOptions();
    return guessCountry(o.timeZone, o.locale);
  } catch {
    return guessCountry(null, null);
  }
}

/** Start a running club, or edit one you own (photo / emblem, name, place, about, goal, open). */
export default function ClubEditScreen({ navigation, route }: Props) {
  const clubId = route.params?.clubId;
  const editing = !!clubId;
  const [loading, setLoading] = useState(editing);
  const [name, setName] = useState('');
  const [country, setCountry] = useState(deviceCountry);
  const [city, setCity] = useState('');
  const [about, setAbout] = useState('');
  const [goal, setGoal] = useState('');
  const [open, setOpen] = useState(true);
  const [emblem, setEmblem] = useState<Emblem>(DEFAULT_EMBLEM);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedPhoto | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [picker, setPicker] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; city?: string; about?: string }>({});
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const photoOk = canPickPhoto();

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const loadClub = useCallback(async () => {
    if (!clubId) return;
    const res = await loadClubProfile(clubId, localMonthKey(new Date()));
    if (!alive.current) return;
    setLoading(false);
    if (res.status !== 'ready') return setNotice({ ok: false, text: res.message });
    const c = res.club;
    if (!c.isOwner) return setNotice({ ok: false, text: 'Only the club owner can edit the club.' });
    setName(c.name);
    if (c.country) setCountry(c.country);
    setCity(c.city ?? '');
    setAbout(c.about ?? '');
    setGoal(c.goalKm ? String(c.goalKm) : '');
    setOpen(c.open);
    setEmblem(parseEmblem(c.emblem) ?? DEFAULT_EMBLEM);
    setPhotoUrl(c.photoUrl);
  }, [clubId]);

  useEffect(() => {
    loadClub();
  }, [loadClub]);

  async function onPickPhoto() {
    const p = await pickClubPhoto().catch(() => null);
    if (p && alive.current) {
      setPicked(p);
      setRemovePhoto(false);
    }
  }

  async function onSave() {
    if (busy) return;
    setNotice(null);
    const n = cleanClubName(name);
    const c = cleanClubText(city, CLUB_LIMITS.cityMax, 'city');
    const a = cleanClubText(about, CLUB_LIMITS.aboutMax, 'description');
    const next = {
      name: n.ok ? undefined : n.message,
      city: c.ok ? undefined : c.message,
      about: a.ok ? undefined : a.message,
    };
    setErrors(next);
    if (!n.ok || !c.ok || !a.ok) return;
    const fields = {
      name: n.value,
      country,
      city: c.value,
      about: a.value,
      emblem: emblemKey(emblem),
      open,
      goalKm: cleanGoalKm(goal),
    };
    setBusy(true);
    let id = clubId;
    if (id) {
      const res = await updateClub(id, fields);
      if (!res.ok) {
        setBusy(false);
        return setNotice({ ok: false, text: res.message });
      }
    } else {
      const res = await createClub(fields);
      if (!res.ok) {
        setBusy(false);
        return setNotice({ ok: false, text: res.message });
      }
      id = res.clubId;
    }
    // Photo after the club exists (the upload URL is owner-only).
    let photoNote: string | null = null;
    if (picked) {
      const up = await uploadClubPhoto(id, picked);
      if (!up.ok) photoNote = `The club is saved, but the photo didn’t upload: ${up.message}`;
    } else if (removePhoto && photoUrl) {
      await removeClubPhoto(id);
    }
    if (!alive.current) return;
    setBusy(false);
    if (photoNote) return setNotice({ ok: false, text: photoNote });
    if (editing) navigation.goBack();
    else navigation.replace('Club', { clubId: id, name: fields.name, created: true });
  }

  const showPhoto = picked?.uri ?? (removePhoto ? null : photoUrl);

  if (loading) {
    return (
      <ScreenContainer title="Edit club" onBack={() => navigation.goBack()}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      title={editing ? 'Edit club' : 'Start a club'}
      onBack={() => navigation.goBack()}
      keyboardAware
      footer={
        <Button
          label={editing ? 'Save changes' : 'Create club'}
          variant="accent"
          icon={editing ? 'check' : 'flag'}
          onPress={onSave}
          loading={busy}
        />
      }
    >
      {notice ? <Notice ok={notice.ok} text={notice.text} /> : null}

      <View style={styles.avatarWrap}>
        <ClubAvatar photoUrl={showPhoto} emblem={emblemKey(emblem)} size={104} />
        {photoOk ? (
          <View style={styles.photoBtns}>
            <Pressable onPress={onPickPhoto} accessibilityRole="button" accessibilityLabel="Choose a club photo" style={styles.photoBtn}>
              <Feather name="image" size={16} color={colors.ink} />
              <Text style={styles.photoBtnText}>{showPhoto ? 'Change photo' : 'Add photo'}</Text>
            </Pressable>
            {showPhoto ? (
              <Pressable
                onPress={() => {
                  setPicked(null);
                  setRemovePhoto(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Remove the club photo"
                style={styles.photoBtn}
              >
                <Feather name="x" size={16} color={colors.muted} />
                <Text style={[styles.photoBtnText, { color: colors.muted }]}>Use emblem</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Text style={[T.small, styles.photoHint]}>
            Club photos arrive with the next Kasya update — pick an emblem for now.
          </Text>
        )}
      </View>

      {!showPhoto ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Label>Emblem</Label>
          <View style={styles.iconGrid}>
            {EMBLEM_ICONS.map((icon) => {
              const on = emblem.icon === icon;
              return (
                <Pressable
                  key={icon}
                  onPress={() => setEmblem({ ...emblem, icon })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Emblem ${icon.replace(/-/g, ' ')}`}
                  style={[styles.iconCell, on && { borderColor: emblem.color, backgroundColor: colors.surfaceAlt }]}
                >
                  <MaterialCommunityIcons name={icon} size={24} color={on ? emblem.color : colors.inkSoft} />
                </Pressable>
              );
            })}
          </View>
          <View style={styles.colorRow}>
            {EMBLEM_COLORS.map((color) => {
              const on = emblem.color === color;
              return (
                <Pressable
                  key={color}
                  onPress={() => setEmblem({ ...emblem, color })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Emblem color ${color}`}
                  style={[styles.colorDot, { backgroundColor: color }, on && styles.colorOn]}
                >
                  {on ? <Feather name="check" size={14} color={colors.bg} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Card>
      ) : null}

      <View style={{ marginTop: spacing.xl }}>
        <TextField
          label="Club name"
          value={name}
          onChangeText={(t) => {
            setName(t);
            setErrors((e) => ({ ...e, name: undefined }));
          }}
          placeholder="e.g. BGC Run Club"
          autoCapitalize="words"
          icon="flag"
          maxLength={CLUB_LIMITS.nameMax}
          error={errors.name}
        />

        <Text style={styles.fieldLabel}>Country</Text>
        <Pressable
          onPress={() => setPicker(true)}
          accessibilityRole="button"
          accessibilityLabel={`Country: ${countryName(country)}. Change`}
          style={styles.select}
        >
          <Text style={styles.flag}>{flagEmoji(country)}</Text>
          <Text style={styles.selectText}>{countryName(country)}</Text>
          <Feather name="chevron-down" size={18} color={colors.muted} />
        </Pressable>
        <Text style={styles.fieldHint}>Your club competes in this country’s rankings and worldwide.</Text>

        <TextField
          label="City (optional)"
          value={city}
          onChangeText={(t) => {
            setCity(t);
            setErrors((e) => ({ ...e, city: undefined }));
          }}
          placeholder="e.g. Taguig"
          autoCapitalize="words"
          icon="map-pin"
          maxLength={CLUB_LIMITS.cityMax}
          error={errors.city}
        />

        <Text style={styles.fieldLabel}>About (optional)</Text>
        <TextInput
          value={about}
          onChangeText={(t) => {
            setAbout(t);
            setErrors((e) => ({ ...e, about: undefined }));
          }}
          placeholder="Sunday long runs at 5am, all paces welcome."
          placeholderTextColor={colors.muted}
          multiline
          maxLength={CLUB_LIMITS.aboutMax}
          style={[styles.textArea, errors.about ? { borderColor: colors.danger } : null]}
          accessibilityLabel="About the club"
        />
        <Text style={[styles.fieldHint, errors.about ? { color: colors.danger } : null]}>
          {errors.about ?? `${about.length}/${CLUB_LIMITS.aboutMax}`}
        </Text>

        <TextField
          label="Monthly goal, km (optional)"
          value={goal}
          onChangeText={(t) => setGoal(t.replace(/[^0-9]/g, '').slice(0, 6))}
          placeholder="e.g. 1000"
          keyboardType="number-pad"
          icon="target"
          hint="Everyone’s runs add up toward it; the bar resets each month."
        />

        <Card>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <Text style={T.title}>Open club</Text>
              <Text style={[T.small, { marginTop: 2 }]}>
                {open
                  ? 'Anyone can join from the club page. Turn off to let people in by code only.'
                  : 'Invite-only: runners need the club code to join.'}
              </Text>
            </View>
            <Switch
              value={open}
              onValueChange={setOpen}
              trackColor={{ true: colors.accent, false: colors.lineStrong }}
              thumbColor={colors.onDark}
              accessibilityLabel="Open club"
            />
          </View>
        </Card>

        <Text style={[T.small, { marginTop: spacing.lg }]}>
          Club name, photo and description are public on the rankings. Keep them friendly — clubs that get reported
          are hidden while we review them.
        </Text>
      </View>

      <CountryPicker
        visible={picker}
        value={country}
        title="Club country"
        onClose={() => setPicker(false)}
        onPick={(c) => {
          setCountry(c);
          setPicker(false);
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  avatarWrap: { alignItems: 'center', marginTop: spacing.sm },
  photoBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  photoBtnText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  photoHint: { marginTop: spacing.md, textAlign: 'center' },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  iconCell: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  colorDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  colorOn: { borderWidth: 2, borderColor: colors.ink },
  fieldLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink, marginBottom: spacing.sm },
  fieldHint: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 6, marginBottom: spacing.lg },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  flag: { fontSize: 20 },
  selectText: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.ink },
  textArea: {
    minHeight: 88,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
});
