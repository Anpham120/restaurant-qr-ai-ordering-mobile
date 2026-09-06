import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import type { ShopApi } from './client';
import { apiUrl, errorMessage } from './logic';
import type { Session, ShopConfig } from './types';
import { Button, Field, Message, color, s } from './ui';

export function AccountScreen({
  api,
  session,
  config,
  onSession,
  onLogout,
  onSettings,
  onCourier,
}: {
  api: ShopApi;
  session: Session | null;
  config: ShopConfig | null;
  onSession: (session: Session) => Promise<void>;
  onLogout: () => Promise<void>;
  onSettings: () => void;
  onCourier: () => void;
}) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const login = async () => {
    setSubmitted(true);
    setError('');
    if (!identifier.trim() || !password) return;
    setBusy(true);
    try {
      await onSession(await api.login(identifier.trim(), password));
      setPassword('');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const logout = () => {
    const perform = () => {
      setBusy(true);
      void onLogout()
        .catch((cause) => setError(errorMessage(cause)))
        .finally(() => setBusy(false));
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Đăng xuất và xoá lịch sử đơn được lưu trên thiết bị này?')) perform();
    } else
      Alert.alert(
        'Đăng xuất khỏi Mây?',
        'Lịch sử đơn trên thiết bị này sẽ được xoá để bảo vệ thông tin người nhận.',
        [
          { text: 'Ở lại', style: 'cancel' },
          { text: 'Đăng xuất', style: 'destructive', onPress: perform },
        ],
      );
  };
  return (
    <KeyboardAvoidingView style={s.grow} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>GÓC CỦA BẠN</Text>
        <Text style={s.title}>
          {session ? `Chào ${session.user.fullName}.` : 'Rất vui được\ngặp bạn.'}
        </Text>
        <View style={[s.card, { backgroundColor: color.pistachio, borderWidth: 0 }]}>
          <Text style={s.heading}>
            {session ? session.user.fullName : 'Đặt món không cần tài khoản'}
          </Text>
          <Text style={s.body}>
            {session
              ? session.user.role === 'Courier'
                ? 'Nhân viên giao hàng nội bộ của Mây.'
                : 'Bạn đã đăng nhập vào Mây.'
              : 'Bạn có thể chọn món, thanh toán và theo dõi đơn ngay trên thiết bị này.'}
          </Text>
          {session?.user.email ? <Text style={s.small}>{session.user.email}</Text> : null}
        </View>
        {session ? (
          <>
            {session.user.role === 'Courier' ? (
              <Button onPress={onCourier}>Mở công việc giao hàng</Button>
            ) : null}
            <Button tone="quiet" busy={busy} onPress={logout}>
              Đăng xuất
            </Button>
          </>
        ) : (
          <View style={s.card}>
            <Text style={s.heading}>Đăng nhập</Text>
            <Text style={s.small}>
              Khách hàng dùng số điện thoại; nhân viên giao hàng dùng tài khoản được quán cấp.
            </Text>
            <Field
              label="Số điện thoại hoặc email"
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              error={submitted && !identifier.trim() ? 'Nhập số điện thoại hoặc email.' : undefined}
            />
            <Field
              label="Mật khẩu"
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              secureTextEntry={!showPassword}
              error={submitted && !password ? 'Nhập mật khẩu.' : undefined}
              onSubmitEditing={() => void login()}
            />
            <Button tone="quiet" onPress={() => setShowPassword((value) => !value)}>
              {showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            </Button>
            <Button busy={busy} onPress={() => void login()}>
              Đăng nhập vào Mây
            </Button>
          </View>
        )}
        {error ? <Message error>{error}</Message> : null}
        <View style={s.card}>
          <Text style={s.heading}>Ghé quầy Mây</Text>
          <Text style={s.body}>{config?.address || 'Địa chỉ quán đang được cập nhật.'}</Text>
          {config?.phone ? (
            <Text selectable style={s.body}>
              {config.phone}
            </Text>
          ) : null}
          <Text style={s.small}>
            Món làm theo lựa chọn của bạn. Vui lòng báo quầy về dị ứng trước khi đặt.
          </Text>
        </View>
        <Button tone="quiet" onPress={onSettings}>
          Kết nối máy chủ
        </Button>
        <Text style={s.small}>
          Mây · Nước, kem & chè{'\n'}Thông tin đơn được lưu trên thiết bị để bạn theo dõi.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function SettingsScreen({
  origin,
  onSave,
  onBack,
}: {
  origin: string;
  onSave: (value: string) => Promise<void>;
  onBack?: () => void;
}) {
  const [value, setValue] = useState(origin);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setError('');
    setBusy(true);
    try {
      await onSave(apiUrl(value));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView style={s.grow} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.brand}>Mây</Text>
        <Text style={s.label}>NƯỚC · KEM · CHÈ</Text>
        <Text style={s.title}>Kết nối{'\n'}với quầy Mây.</Text>
        <Text style={s.body}>
          Nhập địa chỉ máy chủ do quán cung cấp để tải thực đơn và đặt món.
        </Text>
        <Field
          label="Địa chỉ máy chủ"
          placeholder="https://api.quan.vn"
          value={value}
          onChangeText={setValue}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          hint="Chỉ nhập địa chỉ gốc, không thêm /api. Khi đổi máy chủ, app sẽ dùng phiên đăng nhập và giỏ hàng riêng của máy chủ đó."
          error={error || undefined}
        />
        <Button busy={busy} onPress={() => void save()}>
          Lưu kết nối
        </Button>
        {onBack ? (
          <Button tone="quiet" disabled={busy} onPress={onBack}>
            Quay lại
          </Button>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
