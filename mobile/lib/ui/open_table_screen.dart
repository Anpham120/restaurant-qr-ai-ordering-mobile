import 'package:flutter/material.dart';

import '../core/tables/quet_qr.dart';
import 'qr_scan_screen.dart';

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

  /// Mở màn hình quét, rồi mở phiên bằng token đọc được.
  ///
  /// Điền token vào ô nhập tay trước khi gọi `_mo()`: nếu mở phiên hỏng (bàn đã đóng, QR của
  /// quán khác), khách thấy ngay thứ vừa quét được và sửa/thử lại được — thay vì một thông báo
  /// lỗi trên một ô trống.
  Future<void> _quet() async {
    final kq = await Navigator.of(context).push<MaQrBan>(
      MaterialPageRoute(builder: (_) => const QrScanScreen()),
    );
    if (kq == null || !mounted) return;
    _qr.text = kq.qrToken;
    await _mo();
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
            // QUÉT là lối vào chính — cả hệ thống tên là "gọi món qua QR". Nút to, đặt trên
            // cùng, trước cả ô nhập tay.
            FilledButton.icon(
              onPressed: _dangGui ? null : _quet,
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Quét mã QR trên bàn'),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 18),
              ),
            ),
            const SizedBox(height: 16),
            Row(children: [
              const Expanded(child: Divider()),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text('hoặc nhập tay',
                    style: Theme.of(context).textTheme.bodySmall),
              ),
              const Expanded(child: Divider()),
            ]),
            const SizedBox(height: 16),
            TextField(
              controller: _qr,
              autocorrect: false,
              onSubmitted: (_) => _mo(),
              decoration: const InputDecoration(
                labelText: 'Mã QR của bàn',
                helperText: 'Dùng khi tem QR bị mờ hoặc không bật được camera',
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
