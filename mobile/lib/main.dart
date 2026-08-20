import 'package:flutter/material.dart';

import 'core/auth/auth_api.dart';
import 'core/auth/auth_repository.dart';
import 'core/auth/auth_session.dart';
import 'core/auth/token_store.dart';
import 'ui/login_screen.dart';

/// Địa chỉ backend Java. Truyền lúc build:
///
///     flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8080
///
/// `10.0.2.2` là địa chỉ máy chủ nhìn từ máy ảo Android — `localhost` trong máy ảo trỏ về chính
/// máy ảo, nên đây là lỗi tốn thời gian nhất khi chạy lần đầu.
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:8080',
);

void main() {
  final repository = AuthRepository(
    api: HttpAuthApi(baseUrl: apiBaseUrl),
    store: SecureTokenStore(),
  );
  runApp(RestaurantApp(repository: repository));
}

class RestaurantApp extends StatefulWidget {
  const RestaurantApp({super.key, required this.repository});

  final AuthRepository repository;

  @override
  State<RestaurantApp> createState() => _RestaurantAppState();
}

class _RestaurantAppState extends State<RestaurantApp> {
  AuthSession? _session;
  bool _dangKhoiPhuc = true;

  @override
  void initState() {
    super.initState();
    _khoiPhuc();
  }

  Future<void> _khoiPhuc() async {
    final session = await widget.repository.khoiPhuc();
    if (!mounted) return;
    setState(() {
      _session = session;
      _dangKhoiPhuc = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Gọi món',
      theme: ThemeData(colorSchemeSeed: Colors.deepOrange, useMaterial3: true),
      home: _dangKhoiPhuc
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : _session == null
              ? LoginScreen(
                  repository: widget.repository,
                  onDangNhapXong: (session) =>
                      setState(() => _session = session),
                )
              : _ManHinhTam(
                  session: _session!,
                  onDangXuat: () async {
                    await widget.repository.dangXuat();
                    if (mounted) setState(() => _session = null);
                  },
                ),
    );
  }
}

/// Màn hình tạm sau khi đăng nhập.
///
/// #25 chỉ làm đăng nhập và lưu token. Menu, phiên bàn, đơn hàng nằm ở #26–#28 — để trống chỗ
/// này thay vì dựng sẵn khung màn hình chưa ai dùng.
class _ManHinhTam extends StatelessWidget {
  const _ManHinhTam({required this.session, required this.onDangXuat});

  final AuthSession session;
  final Future<void> Function() onDangXuat;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Gọi món')),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Xin chào ${session.user.fullName}'),
            const SizedBox(height: 8),
            Text(session.user.email,
                style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 24),
            OutlinedButton(
                onPressed: onDangXuat, child: const Text('Đăng xuất')),
          ],
        ),
      ),
    );
  }
}
