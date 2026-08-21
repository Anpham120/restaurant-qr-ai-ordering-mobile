import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../core/cau_hinh/cau_hinh.dart';

/// Nhập địa chỉ máy chủ (§9.10 — kiểm thử trên thiết bị thật).
///
/// Vì sao màn hình này tồn tại: `--dart-define` là compile-time, nên một APK dựng ở CI mang sẵn
/// `10.0.2.2` — địa chỉ chỉ có nghĩa **bên trong máy ảo Android**. Cắm APK đó vào điện thoại thật
/// thì mọi lời gọi đi vào hư không, và không có cách nào sửa mà không dựng lại APK.
class ServerSettingsScreen extends StatefulWidget {
  const ServerSettingsScreen({
    super.key,
    required this.hienTai,
    required this.onLuu,
    this.batBuoc = false,
    http.Client? client,
  }) : clientKiemTra = client;

  final CauHinhMayChu hienTai;
  final Future<void> Function(CauHinhMayChu moi) onLuu;

  /// `true` khi app chưa có cấu hình nào — không cho thoát ra màn hình trống.
  final bool batBuoc;

  /// Tiêm được để kiểm; mặc định dùng client thật.
  final http.Client? clientKiemTra;

  @override
  State<ServerSettingsScreen> createState() => _ServerSettingsScreenState();
}

class _ServerSettingsScreenState extends State<ServerSettingsScreen> {
  late final TextEditingController _api =
      TextEditingController(text: widget.hienTai.apiBaseUrl);
  late final TextEditingController _anh =
      TextEditingController(text: widget.hienTai.imageBaseUrl);

  /// Người dùng đã tự sửa ô ảnh chưa. Chưa sửa thì ô ảnh đi theo ô API.
  bool _tuSuaAnh = false;
  String? _ketQua;
  bool _dangKiemTra = false;

  @override
  void initState() {
    super.initState();
    _api.addListener(_theoDoiApi);
  }

  @override
  void dispose() {
    _api.removeListener(_theoDoiApi);
    _api.dispose();
    _anh.dispose();
    super.dispose();
  }

  /// Ô ảnh tự đi theo ô API cho tới khi người dùng tự gõ vào nó.
  ///
  /// Bắt gõ hai địa chỉ gần giống hệt nhau trên bàn phím điện thoại là cách chắc chắn để có một
  /// cái đúng và một cái sai — và cái sai sẽ biểu hiện thành "thực đơn không có ảnh", triệu chứng
  /// không dẫn về nguyên nhân.
  void _theoDoiApi() {
    if (_tuSuaAnh) return;
    final chuan = chuanHoaDiaChi(_api.text, congMacDinh: 8081);
    if (chuan == null) return;
    final goiY = suyRaDiaChiAnh(chuan);
    if (_anh.text != goiY) _anh.text = goiY;
  }

  Future<void> _kiemTra() async {
    final api = chuanHoaDiaChi(_api.text, congMacDinh: 8081);
    if (api == null) {
      setState(() => _ketQua = 'Địa chỉ không hợp lệ.');
      return;
    }
    setState(() {
      _dangKiemTra = true;
      _ketQua = null;
    });
    final client = widget.clientKiemTra ?? http.Client();
    try {
      final res = await client
          .get(Uri.parse('$api/api/health'))
          .timeout(const Duration(seconds: 5));
      if (!mounted) return;
      setState(() => _ketQua = res.statusCode == 200
          ? 'Kết nối được. Máy chủ trả lời.'
          : 'Máy chủ trả mã ${res.statusCode}. Kiểm tra lại cổng.');
    } catch (_) {
      if (!mounted) return;
      // Câu này phải kể ra ba nguyên nhân thật, vì cả ba đều hay xảy ra và khách không tự đoán
      // được cái nào: sai IP, khác wifi, hoặc backend chưa chạy.
      setState(() => _ketQua =
          'Không gọi được. Kiểm tra: điện thoại và máy chủ có cùng wifi '
              'không, IP có đúng không, backend có đang chạy không.');
    } finally {
      if (mounted) setState(() => _dangKiemTra = false);
    }
  }

  Future<void> _luu() async {
    final api = chuanHoaDiaChi(_api.text, congMacDinh: 8081);
    final anh = chuanHoaDiaChi(_anh.text, congMacDinh: 8080);
    if (api == null || anh == null) {
      setState(() => _ketQua = 'Địa chỉ không hợp lệ.');
      return;
    }
    await widget.onLuu(CauHinhMayChu(apiBaseUrl: api, imageBaseUrl: anh));
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      // Chưa có cấu hình thì không cho thoát: thoát ra sẽ là một màn hình không gọi được gì.
      canPop: !widget.batBuoc,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Máy chủ'),
          automaticallyImplyLeading: !widget.batBuoc,
        ),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text(
              'Nhập địa chỉ máy chạy backend. Điện thoại và máy đó phải cùng một wifi.\n\n'
              'Máy ảo Android dùng 10.0.2.2. Điện thoại thật dùng IP LAN của máy '
              '(Windows: ipconfig, macOS/Linux: ifconfig).',
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _api,
              keyboardType: TextInputType.url,
              autocorrect: false,
              decoration: const InputDecoration(
                labelText: 'Địa chỉ API',
                hintText: '192.168.1.5',
                helperText: 'Thiếu cổng thì tự thêm :8081',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _anh,
              keyboardType: TextInputType.url,
              autocorrect: false,
              onChanged: (_) => _tuSuaAnh = true,
              decoration: const InputDecoration(
                labelText: 'Địa chỉ ảnh món',
                helperText:
                    'Tự đi theo ô trên. Ảnh do web phục vụ ở cổng 8080, không phải API.',
              ),
            ),
            const SizedBox(height: 20),
            if (_ketQua != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(_ketQua!),
              ),
            OutlinedButton(
              onPressed: _dangKiemTra ? null : _kiemTra,
              child: Text(_dangKiemTra ? 'Đang gọi…' : 'Kiểm tra kết nối'),
            ),
            const SizedBox(height: 8),
            FilledButton(onPressed: _luu, child: const Text('Lưu')),
            const SizedBox(height: 24),
            Text(
              'Đổi máy chủ sẽ thoát phiên bàn và đăng nhập hiện tại: token của máy chủ cũ '
              'không dùng được ở máy chủ mới.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
