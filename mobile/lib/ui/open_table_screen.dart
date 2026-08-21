import 'package:flutter/material.dart';

import '../core/auth/auth_api.dart';
import '../core/auth/auth_session.dart';
import '../core/tables/table_session.dart';
import '../core/tables/table_session_repository.dart';

/// Mở phiên bàn từ mã QR.
///
/// Ở đây khách NHẬP mã QR bằng tay. Quét bằng camera cần thêm một plugin nền tảng mà CI không
/// dựng được (`flutter test` không có camera, và bước build APK không chứng minh camera chạy) —
/// nên nó là việc riêng, không nhét vào #26 vốn nói về việc gắn `MemberId`.
class OpenTableScreen extends StatefulWidget {
  const OpenTableScreen({
    super.key,
    required this.repository,
    required this.onMoPhienXong,
    this.dangNhapVoi,
  });

  final TableSessionRepository repository;
  final void Function(TableSession session) onMoPhienXong;

  /// Phiên đăng nhập hiện tại, chỉ dùng để nói cho khách biết đơn có được gắn tài khoản không.
  final AuthSession? dangNhapVoi;

  @override
  State<OpenTableScreen> createState() => _OpenTableScreenState();
}

class _OpenTableScreenState extends State<OpenTableScreen> {
  final _qr = TextEditingController();
  String? _loi;
  bool _dangGui = false;

  @override
  void dispose() {
    _qr.dispose();
    super.dispose();
  }

  Future<void> _mo() async {
    if (_dangGui) return;
    setState(() {
      _dangGui = true;
      _loi = null;
    });
    try {
      final session = await widget.repository.moPhien(_qr.text);
      if (!mounted) return;
      widget.onMoPhienXong(session);
    } on AuthException catch (error) {
      if (!mounted) return;
      setState(() => _loi = error.message);
    } finally {
      if (mounted) setState(() => _dangGui = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final daDangNhap = widget.dangNhapVoi != null;
    return Scaffold(
      appBar: AppBar(title: const Text('Vào bàn')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _qr,
              autocorrect: false,
              onSubmitted: (_) => _mo(),
              decoration: const InputDecoration(
                labelText: 'Mã QR của bàn',
                helperText: 'Mã in trên tem QR đặt tại bàn',
              ),
            ),
            const SizedBox(height: 20),
            // Nói THẲNG đơn có được gắn tài khoản hay không, ngay trước khi mở bàn.
            //
            // Đây là điểm duy nhất khách còn kịp quyết định. Biết sau khi đã gọi món thì không
            // sửa được nữa: phiên bàn dùng chung và người gắn trước giữ liên kết.
            Card(
              child: ListTile(
                leading: Icon(daDangNhap ? Icons.person : Icons.person_outline),
                title: Text(daDangNhap
                    ? 'Đơn của bàn này sẽ được cộng vào tài khoản của bạn'
                    : 'Đang vào với tư cách khách vãng lai'),
                subtitle: Text(daDangNhap
                    ? widget.dangNhapVoi!.user.email
                    : 'Đăng nhập trước khi vào bàn nếu muốn tích điểm'),
              ),
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
              onPressed: _dangGui ? null : _mo,
              child: Text(_dangGui ? 'Đang mở bàn…' : 'Vào bàn'),
            ),
          ],
        ),
      ),
    );
  }
}
