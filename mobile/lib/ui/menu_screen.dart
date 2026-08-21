import 'package:flutter/material.dart';

import '../core/auth/auth_api.dart';
import '../core/menu/menu.dart';
import '../core/menu/menu_api.dart';
import '../core/tien.dart';

/// Thực đơn — xem được KHÔNG cần đang ở bàn (§9.10 M1 mục 4).
///
/// Đây là khác biệt thật giữa app và web QR: web chỉ mở thực đơn sau khi quét mã bàn, app cho xem
/// trước ở nhà.
class MenuScreen extends StatefulWidget {
  const MenuScreen({super.key, required this.api, required this.imageBaseUrl});

  final MenuApi api;

  /// Base URL của ẢNH — khác base của API. Ảnh do container web phục vụ, không phải backend.
  final String imageBaseUrl;

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  List<NhomMon>? _nhom;
  String? _loi;

  @override
  void initState() {
    super.initState();
    _tai();
  }

  Future<void> _tai() async {
    setState(() => _loi = null);
    try {
      final data = await widget.api.thucDon();
      if (!mounted) return;
      setState(() => _nhom = nhomTheoDanhMuc(data.categories, data.items));
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _loi = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Thực đơn')),
      body: RefreshIndicator(onRefresh: _tai, child: _than(context)),
    );
  }

  Widget _than(BuildContext context) {
    if (_loi != null) {
      return ListView(children: [
        Padding(
          padding: const EdgeInsets.all(24),
          child: Column(children: [
            Text(_loi!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _tai, child: const Text('Thử lại')),
          ]),
        )
      ]);
    }
    final nhom = _nhom;
    if (nhom == null) return const Center(child: CircularProgressIndicator());
    if (nhom.isEmpty) {
      return ListView(children: const [
        Padding(
            padding: EdgeInsets.all(32),
            child: Text('Thực đơn đang trống.', textAlign: TextAlign.center))
      ]);
    }

    return ListView.builder(
      itemCount: nhom.length,
      itemBuilder: (_, i) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
            child: Text(nhom[i].tenDanhMuc,
                style: Theme.of(context).textTheme.titleMedium),
          ),
          ...nhom[i].mon.map((m) => _dongMon(context, m)),
        ],
      ),
    );
  }

  Widget _dongMon(BuildContext context, MenuItem m) {
    final anh = urlAnh(m.imageUrl, widget.imageBaseUrl);
    return ListTile(
      leading: anh == null
          ? const SizedBox(width: 56, height: 56)
          : ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.network(
                anh,
                width: 56,
                height: 56,
                fit: BoxFit.cover,
                // Ảnh hỏng KHÔNG được làm sập dòng món. Tên và giá mới là thứ khách cần.
                errorBuilder: (_, __, ___) =>
                    const SizedBox(width: 56, height: 56),
              ),
            ),
      title: Text(m.name),
      subtitle: m.description == null
          ? null
          : Text(m.description!, maxLines: 2, overflow: TextOverflow.ellipsis),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(tienVnd(m.price)),
          // Món hết vẫn hiện, chỉ đánh dấu. Lọc đi thì khách tưởng quán không bán món đó.
          if (!m.isAvailable)
            Text('Hết hàng',
                style: TextStyle(
                    fontSize: 11, color: Theme.of(context).colorScheme.error)),
        ],
      ),
    );
  }
}
