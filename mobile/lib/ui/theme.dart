import 'package:flutter/material.dart';

/// Bảng màu lấy NGUYÊN VĂN từ web, không tự chọn lại.
///
/// App di động và web đặt món là hai cửa vào cùng một quán. Khách quét QR ở bàn rồi mở app phải
/// thấy cùng một nơi, không phải hai sản phẩm khác nhau — nên màu ở đây chép đúng biến CSS của
/// `frontend/src/components/customer/customer-menu.css` (chủ đề "Vị An"):
///
///     --brand-chestnut       #6f3d2c   nâu hạt dẻ, màu chính
///     --brand-chestnut-dark  #4c291f
///     --brand-brass          #a47834   đồng thau, màu nhấn
///     --brand-ivory          #fffaf5   nền
///     --brand-ink            #2f1d16   chữ
///     --brand-muted          #80685e   chữ phụ
///     --brand-clay-line      #ead8cd   viền
///     --brand-success        #2f7251
///     --brand-danger         #b13c32
///     --vian-card-bg         #f1dfd3
///
/// Bản trước dùng `colorSchemeSeed: Colors.deepOrange`, cho ra một dải cam Material tự sinh —
/// gần đúng tông ấm nhưng không phải màu của quán, và đó là chỗ "không đồng bộ" nhìn thấy ngay.
class MauQuan {
  const MauQuan._();

  static const chestnut = Color(0xFF6F3D2C);
  static const chestnutDark = Color(0xFF4C291F);
  static const brass = Color(0xFFA47834);
  static const ivory = Color(0xFFFFFAF5);
  static const ink = Color(0xFF2F1D16);
  static const muted = Color(0xFF80685E);
  static const clayLine = Color(0xFFEAD8CD);
  static const success = Color(0xFF2F7251);
  static const danger = Color(0xFFB13C32);
  static const cardBg = Color(0xFFF1DFD3);
  static const beige = Color(0xFFF8EEE5);
}

/// Bo góc lấy từ `--radius-*` của web: thẻ món web dùng 20px.
class BoGoc {
  const BoGoc._();

  static const nho = 8.0;
  static const vua = 12.0;
  static const lon = 16.0;
  static const the = 20.0;
}

ThemeData chuDeQuan() {
  const scheme = ColorScheme(
    brightness: Brightness.light,
    primary: MauQuan.chestnut,
    onPrimary: Colors.white,
    primaryContainer: MauQuan.beige,
    onPrimaryContainer: MauQuan.chestnutDark,
    secondary: MauQuan.brass,
    onSecondary: Colors.white,
    secondaryContainer: MauQuan.cardBg,
    onSecondaryContainer: MauQuan.chestnutDark,
    error: MauQuan.danger,
    onError: Colors.white,
    surface: MauQuan.ivory,
    onSurface: MauQuan.ink,
    surfaceContainerHighest: MauQuan.beige,
    onSurfaceVariant: MauQuan.muted,
    outline: MauQuan.clayLine,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: MauQuan.ivory,
    // KHÔNG kèm tệp font. "Be Vietnam Pro" của web sẽ làm APK nặng thêm vài trăm KB cho mỗi độ
    // đậm, và font hệ thống của Android hiển thị tiếng Việt có dấu đầy đủ. Ghi ra đây để đây là
    // một lựa chọn, không phải một thiếu sót.
    appBarTheme: const AppBarTheme(
      backgroundColor: MauQuan.ivory,
      foregroundColor: MauQuan.ink,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(BoGoc.the),
        side: const BorderSide(color: MauQuan.clayLine),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: MauQuan.chestnut,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(BoGoc.vua)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: MauQuan.chestnut,
        side: const BorderSide(color: MauQuan.clayLine),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(BoGoc.vua)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: MauQuan.chestnut),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(BoGoc.vua),
        borderSide: const BorderSide(color: MauQuan.clayLine),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(BoGoc.vua),
        borderSide: const BorderSide(color: MauQuan.clayLine),
      ),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: MauQuan.beige,
      elevation: 3,
      labelTextStyle: WidgetStatePropertyAll(
        TextStyle(
            fontSize: 11, color: MauQuan.ink, fontWeight: FontWeight.w500),
      ),
    ),
    dividerTheme: const DividerThemeData(color: MauQuan.clayLine, thickness: 1),
    chipTheme: ChipThemeData(
      backgroundColor: MauQuan.beige,
      side: const BorderSide(color: MauQuan.clayLine),
      labelStyle: const TextStyle(fontSize: 11, color: MauQuan.muted),
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BoGoc.nho)),
    ),
  );
}
