import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import type { Product } from './types';

export const color = {
  cream: '#F8F7F2',
  forest: '#244B3B',
  pistachio: '#DDE9C8',
  coral: '#EF916E',
  ink: '#26332B',
  muted: '#5D685F',
  white: '#FFFFFF',
  border: '#D9DFD5',
  danger: '#9D302B',
  dangerSurface: '#FDEDE8',
  surface: '#EEEFE5',
};
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.cream },
  content: {
    padding: 24,
    paddingBottom: 32,
    gap: 24,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  title: { fontSize: 32, lineHeight: 39, fontWeight: '700', color: color.ink, letterSpacing: -1 },
  heading: {
    fontSize: 23,
    lineHeight: 30,
    fontWeight: '700',
    color: color.ink,
    letterSpacing: -0.4,
  },
  body: { color: color.ink, fontSize: 16, lineHeight: 24 },
  small: { color: color.muted, fontSize: 14, lineHeight: 21 },
  label: {
    color: color.forest,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 1.6,
    fontWeight: '700',
  },
  strong: { color: color.ink, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  card: {
    backgroundColor: color.white,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: color.border,
    gap: 16,
  },
  divider: { height: 1, backgroundColor: color.border },
  button: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: color.forest,
    paddingVertical: 14,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondary: { backgroundColor: color.pistachio },
  quiet: { backgroundColor: 'transparent', borderColor: color.border, borderWidth: 1 },
  dangerButton: { backgroundColor: color.dangerSurface, borderColor: color.danger, borderWidth: 1 },
  buttonText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    color: color.white,
    textAlign: 'center',
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.42 },
  field: { gap: 8 },
  input: {
    backgroundColor: color.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.border,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: color.ink,
    fontSize: 16,
    lineHeight: 24,
  },
  inputFocus: { borderColor: color.forest, borderWidth: 2 },
  inputError: { borderColor: color.danger },
  error: { color: color.danger, fontSize: 14, lineHeight: 21 },
  badge: {
    backgroundColor: color.pistachio,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  badgeText: { color: color.forest, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: color.white,
    borderTopWidth: 1,
    borderTopColor: color.border,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 8,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    gap: 4,
  },
  navLabel: {
    color: color.muted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
  tabSelected: { backgroundColor: color.pistachio },
  topBar: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  brand: {
    color: color.forest,
    fontSize: 34,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    lineHeight: 42,
    letterSpacing: -2,
  },
});
export function Button({
  children,
  onPress,
  tone = 'primary',
  busy = false,
  disabled = false,
  label,
}: {
  children: ReactNode;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'quiet' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      {...(label ? { accessibilityLabel: label } : {})}
      accessibilityState={{ disabled: busy || disabled, busy }}
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        tone === 'secondary' && s.secondary,
        tone === 'quiet' && s.quiet,
        tone === 'danger' && s.dangerButton,
        pressed && s.pressed,
        (busy || disabled) && s.disabled,
      ]}
    >
      {busy ? <ActivityIndicator color={tone === 'primary' ? color.white : color.forest} /> : null}
      <Text
        style={[
          s.buttonText,
          tone !== 'primary' && { color: tone === 'danger' ? color.danger : color.forest },
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  error,
  hint,
  ...props
}: TextInputProps & { label: string; error?: string | undefined; hint?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={s.field}>
      <Text style={s.strong}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor={color.muted}
        style={[
          s.input,
          props.multiline && { minHeight: 88, textAlignVertical: 'top' },
          focused && s.inputFocus,
          !!error && s.inputError,
        ]}
      />
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={s.small}>{hint}</Text>
      ) : null}
    </View>
  );
}
export function Chip({
  children,
  selected,
  onPress,
  disabled = false,
}: {
  children: ReactNode;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        {
          minHeight: 48,
          justifyContent: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: selected ? color.forest : color.border,
          backgroundColor: selected ? color.forest : color.white,
        },
        pressed && s.pressed,
        disabled && s.disabled,
      ]}
    >
      <Text style={[s.body, selected && { color: color.white, fontWeight: '600' }]}>
        {children}
      </Text>
    </Pressable>
  );
}
export function Message({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <View
      style={[
        s.card,
        { backgroundColor: error ? color.dangerSurface : color.pistachio, borderWidth: 0 },
      ]}
    >
      <Text
        accessibilityRole={error ? 'alert' : 'text'}
        accessibilityLiveRegion="polite"
        style={[s.body, error && { color: color.danger }]}
      >
        {children}
      </Text>
    </View>
  );
}
export function Empty({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={[s.card, { paddingVertical: 32 }]}>
      <Text style={s.heading}>{title}</Text>
      <Text style={s.body}>{text}</Text>
      {action && onAction ? <Button onPress={onAction}>{action}</Button> : null}
    </View>
  );
}
export function Quantity({
  quantity,
  onChange,
  label,
}: {
  quantity: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <View style={s.row}>
      <Button
        tone="quiet"
        label={`Giảm số lượng ${label}`}
        disabled={quantity <= 0}
        onPress={() => onChange(quantity - 1)}
      >
        −
      </Button>
      <Text
        accessibilityLabel={`${quantity} phần`}
        style={[s.strong, { minWidth: 24, textAlign: 'center' }]}
      >
        {quantity}
      </Text>
      <Button
        tone="quiet"
        label={`Tăng số lượng ${label}`}
        disabled={quantity >= 99}
        onPress={() => onChange(quantity + 1)}
      >
        +
      </Button>
    </View>
  );
}
export function ProductArt({
  product,
  origin,
  large = false,
}: {
  product: Product;
  origin: string;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  let uri: string | null = null;
  try {
    const url = product.imageUrl ? new URL(product.imageUrl, origin) : null;
    if (url && ['http:', 'https:'].includes(url.protocol)) uri = url.toString();
  } catch {
    /* Missing or malformed image: render the original code-native product illustration. */
  }
  return (
    <View
      style={{
        height: large ? 220 : 126,
        borderRadius: 20,
        backgroundColor: color.pistachio,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {uri && !failed ? (
        <Image
          accessibilityLabel={product.name}
          source={{ uri }}
          onError={() => setFailed(true)}
          resizeMode="cover"
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <View
          accessible={false}
          style={{ alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}
        >
          <View
            style={{
              position: 'absolute',
              width: large ? 170 : 96,
              height: large ? 170 : 96,
              borderRadius: 100,
              backgroundColor: color.cream,
            }}
          />
          <View
            style={{
              width: large ? 60 : 36,
              height: large ? 104 : 65,
              backgroundColor: color.forest,
              borderBottomLeftRadius: 18,
              borderBottomRightRadius: 18,
              transform: [{ rotate: '-8deg' }],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                position: 'absolute',
                height: 32,
                width: 5,
                top: -24,
                right: 8,
                backgroundColor: color.coral,
              }}
            />
            <Text
              style={{ color: color.pistachio, fontFamily: 'serif', fontSize: large ? 24 : 16 }}
            >
              m.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
export function NavMark({ kind }: { kind: 'menu' | 'cart' | 'orders' | 'account' }) {
  const stroke = { borderColor: color.forest, borderWidth: 1.7 };
  return (
    <View
      accessible={false}
      style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}
    >
      {kind === 'menu' ? (
        <View style={{ flexDirection: 'row', gap: 3, flexWrap: 'wrap', width: 23 }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ width: 9, height: 9, borderRadius: 3, ...stroke }} />
          ))}
        </View>
      ) : kind === 'cart' ? (
        <View style={{ width: 18, height: 17, borderRadius: 4, marginTop: 5, ...stroke }}>
          <View
            style={{
              position: 'absolute',
              width: 9,
              height: 7,
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              top: -7,
              left: 3,
              ...stroke,
            }}
          />
        </View>
      ) : kind === 'orders' ? (
        <View style={{ width: 21, height: 21, borderRadius: 12, ...stroke }}>
          <View
            style={{
              width: 2,
              height: 7,
              backgroundColor: color.forest,
              marginLeft: 8,
              marginTop: 3,
            }}
          />
          <View
            style={{
              width: 6,
              height: 2,
              backgroundColor: color.forest,
              marginLeft: 8,
              marginTop: -1,
            }}
          />
        </View>
      ) : (
        <>
          <View style={{ width: 9, height: 9, borderRadius: 9, ...stroke }} />
          <View
            style={{
              width: 18,
              height: 10,
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              marginTop: 3,
              ...stroke,
            }}
          />
        </>
      )}
    </View>
  );
}
