import 'package:flutter/material.dart';

import '../core/auth/auth_api.dart';
import '../core/menu/menu.dart';
import '../core/menu/menu_api.dart';
import '../core/tien.dart';
import 'theme.dart';

/// Thực đơn — xem được KHÔNG cần đang ở bàn (§9.10 M1 mục 4).
///
/// Bố cục chép theo thẻ món của web (`.cmc-menu-card`): ảnh lớn phía trên, tên, mô tả, rồi hàng
/// cuối gồm giá và nút thêm. Bản trước dùng `ListTile` với ảnh 56px bên trái — gọn hơn nhưng
/// khác hẳn web, và ảnh nhỏ tới mức món ăn không còn là thứ đập vào mắt.
class MenuScreen extends StatefulWidget {
  const MenuScreen({
    super.key,
    required this.api,
    required this.imageBaseUrl,
    this.onThemVaoGio,
  });

  final MenuApi api;

  /// Base URL của ẢNH — khác base của API. Ảnh do container web phục vụ, không phải backend.
  final String imageBaseUrl;

  /// Thêm món vào giỏ. `null` thì thẻ không có nút thêm (dùng khi chỉ xem).
  final Future<void> Function(String menuItemId)? onThemVaoGio;

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  final _tim = TextEditingController();
  List<MenuCategory> _danhMuc = const [];
  List<MenuItem> _mon = const [];
  String? _loi;
  bool _daTai = false;
  String? _dangThem;

  @override
  void initState() {
    super.initState();
    _tai();
  }

  @override
  void dispose() {
    _tim.dispose();
    super.dispose();
  }

  Future<void> _tai() async {
    setState(() => _loi = null);
    try {
      final data = await widget.api.thucDon();
      if (!mounted) return;
      setState(() {
        _danhMuc = data.categories;
        _mon = data.items;
        _daTai = true;
      });
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() {
        _loi = e.message;
        _daTai = true;
      });
    }
  }

  /// Lọc theo từ khoá, bỏ dấu — bàn phím điện thoại thường không có bộ gõ tiếng Việt.
  List<NhomMon> get _nhom {
    final khoa = _tim.text.trim();
    final loc = khoa.isEmpty ? _mon : locMonTheoTen(_mon, khoa);
    return nhomTheoDanhMuc(_danhMuc, loc);
  }

  Future<void> _them(MenuItem m) async {
    final them = widget.onThemVaoGio;
    if (them == null || _dangThem != null) return;
    setState(() => _dangThem = m.id);
    try {
      await them(m.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text('Đã thêm ${m.name} vào giỏ'),
            duration: const Duration(seconds: 2)),
      );
    } on AuthException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _dangThem = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final nhom = _nhom;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Thực đơn'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(64),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              controller: _tim,
              onChanged: (_) => setState(() {}),
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Tìm món — gõ không dấu cũng được',
                prefixIcon: const Icon(Icons.search, size: 20),
                isDense: true,
                suffixIcon: _tim.text.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.close, size: 18),
                        onPressed: () => setState(() => _tim.clear()),
                      ),
              ),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(onRefresh: _tai, child: _than(context, nhom)),
    );
  }

  Widget _than(BuildContext context, List<NhomMon> nhom) {
    if (_loi != null) {
      return ListView(children: [
        Padding(
          padding: const EdgeInsets.all(24),
          child: Column(children: [
            Text(_loi!, style: const TextStyle(color: MauQuan.danger)),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _tai, child: const Text('Thử lại')),
          ]),
        )
      ]);
    }
    if (!_daTai) return const Center(child: CircularProgressIndicator());
    if (nhom.isEmpty) {
      return ListView(children: [
        Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            _tim.text.isEmpty
                ? 'Thực đơn đang trống.'
                : 'Không có món nào khớp "${_tim.text}".',
            textAlign: TextAlign.center,
            style: const TextStyle(color: MauQuan.muted),
          ),
        )
      ]);
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      itemCount: nhom.length,
      itemBuilder: (_, i) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.only(top: i == 0 ? 8 : 24, bottom: 12),
            child: Row(
              children: [
                Container(width: 3, height: 18, color: MauQuan.brass),
                const SizedBox(width: 8),
                Text(
                  nhom[i].tenDanhMuc,
                  style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      color: MauQuan.ink),
                ),
                const SizedBox(width: 8),
                Text('${nhom[i].mon.length} món',
                    style: const TextStyle(fontSize: 12, color: MauQuan.muted)),
              ],
            ),
          ),
          ...nhom[i].mon.map((m) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _theMon(context, m),
              )),
        ],
      ),
    );
  }

  /// Thẻ món — bố cục theo `.cmc-menu-card` của web.
  Widget _theMon(BuildContext context, MenuItem m) {
    final anh = urlAnh(m.imageUrl, widget.imageBaseUrl);
    final con = m.isAvailable;
    return Opacity(
      // Web dùng `opacity: .65` cho món hết. Giữ món trong danh sách, chỉ làm mờ: lọc đi thì
      // khách tưởng quán không bán món đó.
      opacity: con ? 1 : 0.65,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (anh != null)
              Stack(
                children: [
                  Image.network(
                    anh,
                    width: double.infinity,
                    height: 168,
                    fit: BoxFit.cover,
                    loadingBuilder: (_, child, tien) => tien == null
                        ? child
                        : Container(
                            height: 168,
                            color: MauQuan.beige,
                            child: const Center(
                              child: SizedBox(
                                width: 20,
                                height: 20,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              ),
                            ),
                          ),
                    // Ảnh hỏng KHÔNG được làm sập thẻ: tên và giá mới là thứ khách cần. Hiện một
                    // ô nền ấm kèm biểu tượng thay vì khoảng trắng vô nghĩa.
                    errorBuilder: (_, __, ___) => Container(
                      height: 168,
                      color: MauQuan.beige,
                      child: const Center(
                        child: Icon(Icons.restaurant,
                            color: MauQuan.clayLine, size: 36),
                      ),
                    ),
                  ),
                  if (!con)
                    Positioned(
                      top: 10,
                      left: 10,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: MauQuan.danger,
                          borderRadius: BorderRadius.circular(BoGoc.nho),
                        ),
                        child: const Text('Hết hàng',
                            style:
                                TextStyle(color: Colors.white, fontSize: 11)),
                      ),
                    ),
                ],
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(m.name,
                      style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: MauQuan.ink)),
                  if (m.description != null && m.description!.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      m.description!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 13, color: MauQuan.muted, height: 1.35),
                    ),
                  ],
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Text(
                        tienVnd(m.price),
                        style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: MauQuan.chestnut),
                      ),
                      const Spacer(),
                      if (widget.onThemVaoGio != null)
                        FilledButton(
                          onPressed:
                              !con || _dangThem != null ? null : () => _them(m),
                          style: FilledButton.styleFrom(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 18, vertical: 10),
                          ),
                          child:
                              Text(_dangThem == m.id ? 'Đang thêm…' : 'Thêm'),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
