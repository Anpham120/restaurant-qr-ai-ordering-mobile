import 'package:flutter/material.dart';

import '../core/auth/auth_api.dart';
import '../core/auth/auth_repository.dart';
import '../core/auth/auth_session.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen(
      {super.key, required this.repository, required this.onDangNhapXong});

  final AuthRepository repository;
  final void Function(AuthSession session) onDangNhapXong;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _matKhau = TextEditingController();
  String? _loi;
  bool _dangGui = false;

  @override
  void dispose() {
    _email.dispose();
    _matKhau.dispose();
    super.dispose();
  }

  Future<void> _gui() async {
    if (_dangGui) return;
    setState(() {
      _dangGui = true;
      _loi = null;
    });
    try {
      final session =
          await widget.repository.dangNhap(_email.text, _matKhau.text);
      if (!mounted) return;
      widget.onDangNhapXong(session);
    } on AuthException catch (error) {
      if (!mounted) return;
      setState(() => _loi = error.message);
    } finally {
      if (mounted) setState(() => _dangGui = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Đăng nhập')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _matKhau,
              obscureText: true,
              // Bàn phím di động lưu lại từ đã gõ để gợi ý. Không tắt thì mật khẩu nằm trong từ
              // điển cá nhân của bàn phím và bật lên ở ô nhập của app khác.
              enableSuggestions: false,
              autocorrect: false,
              onSubmitted: (_) => _gui(),
              decoration: const InputDecoration(labelText: 'Mật khẩu'),
            ),
            const SizedBox(height: 20),
            if (_loi != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(_loi!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            FilledButton(
              onPressed: _dangGui ? null : _gui,
              child: Text(_dangGui ? 'Đang đăng nhập…' : 'Đăng nhập'),
            ),
          ],
        ),
      ),
    );
  }
}
