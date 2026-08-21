import 'package:flutter/material.dart';

import 'core/auth/auth_api.dart';
import 'core/auth/auth_repository.dart';
import 'core/auth/auth_session.dart';
import 'core/auth/token_store.dart';
import 'core/tables/secure_table_session_store.dart';
import 'core/tables/table_session.dart';
import 'core/tables/table_session_api.dart';
import 'core/tables/table_session_repository.dart';
import 'ui/login_screen.dart';
import 'ui/open_table_screen.dart';

/// Địa chỉ backend Java. Truyền lúc build:
///
///     flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8081
///
/// `10.0.2.2` là địa chỉ máy chủ nhìn từ máy ảo Android — `localhost` trong máy ảo trỏ về chính
/// máy ảo, nên đây là lỗi tốn thời gian nhất khi chạy lần đầu.
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:8081',
);

void main() {
  final auth = AuthRepository(
    api: HttpAuthApi(baseUrl: apiBaseUrl),
    store: SecureTokenStore(),
  );
  runApp(RestaurantApp(
    auth: auth,
    ban: TableSessionRepository(
      api: HttpTableSessionApi(baseUrl: apiBaseUrl),
      store: SecureTableSessionStore(),
      auth: auth,
    ),
  ));
}

class RestaurantApp extends StatefulWidget {
  const RestaurantApp({super.key, required this.auth, required this.ban});

  final AuthRepository auth;
  final TableSessionRepository ban;

  @override
  State<RestaurantApp> createState() => _RestaurantAppState();
}

class _RestaurantAppState extends State<RestaurantApp> {
  AuthSession? _dangNhap;
  TableSession? _phienBan;
  bool _dangKhoiPhuc = true;

  @override
  void initState() {
    super.initState();
    _khoiPhuc();
  }

  Future<void> _khoiPhuc() async {
    // Khôi phục SONG SONG: hai phiên độc lập nhau. Khách có thể đang ngồi ở bàn mà token đăng
    // nhập đã hết hạn, hoặc ngược lại — nối tiếp chỉ làm màn hình chờ lâu gấp đôi.
    final ketQua =
        await Future.wait([widget.auth.khoiPhuc(), widget.ban.khoiPhuc()]);
    if (!mounted) return;
    setState(() {
      _dangNhap = ketQua[0] as AuthSession?;
      _phienBan = ketQua[1] as TableSession?;
      _dangKhoiPhuc = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Gọi món',
      theme: ThemeData(colorSchemeSeed: Colors.deepOrange, useMaterial3: true),
      home: _manHinh(),
    );
  }

  Widget _manHinh() {
    if (_dangKhoiPhuc) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    // KHÔNG bắt đăng nhập trước khi vào bàn. Khách vãng lai phải dùng được app đúng như web;
    // đăng nhập chỉ đổi lấy việc đơn được gắn tài khoản (§9.4).
    if (_phienBan == null) {
      return OpenTableScreen(
        repository: widget.ban,
        dangNhapVoi: _dangNhap,
        onMoPhienXong: (session) => setState(() => _phienBan = session),
      );
    }
    return _ManHinhTam(
      phienBan: _phienBan!,
      dangNhap: _dangNhap,
      onRoiBan: () async {
        await widget.ban.roiBan();
        if (mounted) setState(() => _phienBan = null);
      },
      onDangNhap: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => LoginScreen(
          repository: widget.auth,
          onDangNhapXong: (session) {
            setState(() => _dangNhap = session);
            Navigator.of(context).pop();
          },
        ),
      )),
      onDangXuat: () async {
        await widget.auth.dangXuat();
        if (mounted) setState(() => _dangNhap = null);
      },
    );
  }
}

/// Màn hình tạm sau khi đã vào bàn.
///
/// Menu, giỏ hàng và đơn nằm ở #28–#29 — để trống chỗ này thay vì dựng sẵn khung chưa ai dùng.
class _ManHinhTam extends StatelessWidget {
  const _ManHinhTam({
    required this.phienBan,
    required this.dangNhap,
    required this.onRoiBan,
    required this.onDangNhap,
    required this.onDangXuat,
  });

  final TableSession phienBan;
  final AuthSession? dangNhap;
  final Future<void> Function() onRoiBan;
  final VoidCallback onDangNhap;
  final Future<void> Function() onDangXuat;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Bàn ${phienBan.tableCode}')),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(phienBan.tableDisplayName,
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text('Trạng thái: ${phienBan.resumeState}',
                style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 24),
            if (dangNhap != null) ...[
              Text('Đơn được cộng vào ${dangNhap!.user.email}'),
              const SizedBox(height: 8),
              OutlinedButton(
                  onPressed: onDangXuat, child: const Text('Đăng xuất')),
            ] else ...[
              const Text('Khách vãng lai — đơn không được tích điểm'),
              const SizedBox(height: 8),
              // Nói rõ giới hạn: đăng nhập bây giờ KHÔNG gắn ngược phiên đã mở ẩn danh nếu bàn
              // đã có người khác gắn. Hứa hẹn mơ hồ ở đây sẽ thành khiếu nại ở quầy.
              OutlinedButton(
                  onPressed: onDangNhap, child: const Text('Đăng nhập')),
            ],
            const SizedBox(height: 24),
            TextButton(onPressed: onRoiBan, child: const Text('Rời bàn')),
          ],
        ),
      ),
    );
  }
}
