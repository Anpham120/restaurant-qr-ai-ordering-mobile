import 'package:flutter/material.dart';

import '../core/auth/auth_api.dart';
import '../core/promotions/promotion.dart';
import '../core/promotions/promotion_api.dart';

/// Danh sách khuyến mãi đang chạy (§9.10 M1 mục 3).
///
/// Màn hình này CỐ Ý chưa có phần điểm thưởng. Xem `mobile/README.md` mục "Điểm thưởng: vì sao
/// chưa có" — tóm tắt: `/api/loyalty/lookup` chỉ dành cho nhân viên theo thiết kế, và chưa có
/// đường nối nào giữa tài khoản app với hồ sơ tích điểm (khoá theo số điện thoại). Dựng một mục
/// "0 điểm" trong lúc chưa nối được là nói với khách một con số sai.
class PromotionsScreen extends StatefulWidget {
  const PromotionsScreen({super.key, required this.api});

  final PromotionApi api;

  @override
  State<PromotionsScreen> createState() => _PromotionsScreenState();
}

class _PromotionsScreenState extends State<PromotionsScreen> {
  List<Promotion>? _dsKhuyenMai;
  String? _loi;

  @override
  void initState() {
    super.initState();
    _tai();
  }

  Future<void> _tai() async {
    setState(() => _loi = null);
    try {
      final ds = await widget.api.dangChay();
      if (!mounted) return;
      setState(() => _dsKhuyenMai = ds);
    } on AuthException catch (error) {
      if (!mounted) return;
      setState(() => _loi = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Khuyến mãi')),
      body: RefreshIndicator(
        onRefresh: _tai,
        child: _than(context),
      ),
    );
  }

  Widget _than(BuildContext context) {
    if (_loi != null) {
      // Lỗi phải nằm trong danh sách cuộn được, nếu không RefreshIndicator không kéo được và
      // khách kẹt ở màn hình lỗi cho tới khi thoát app.
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                Text(_loi!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error)),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: _tai, child: const Text('Thử lại')),
              ],
            ),
          ),
        ],
      );
    }
    if (_dsKhuyenMai == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_dsKhuyenMai!.isEmpty) {
      return ListView(
        children: const [
          Padding(
            padding: EdgeInsets.all(32),
            child: Text('Hiện chưa có khuyến mãi nào đang chạy.',
                textAlign: TextAlign.center),
          ),
        ],
      );
    }
    return ListView.separated(
      itemCount: _dsKhuyenMai!.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (_, i) => _dong(context, _dsKhuyenMai![i]),
    );
  }

  Widget _dong(BuildContext context, Promotion p) {
    final dieuKien = moTaDieuKien(p);
    return ListTile(
      title: Row(
        children: [
          Expanded(child: Text(p.name)),
          if (p.isFlashSale)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.errorContainer,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Text('FLASH', style: TextStyle(fontSize: 11)),
            ),
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(moTaMucGiam(p)),
          if (dieuKien != null)
            Text(dieuKien, style: Theme.of(context).textTheme.bodySmall),
          if (p.description != null && p.description!.isNotEmpty)
            Text(p.description!, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
      trailing: Text(p.code, style: Theme.of(context).textTheme.titleSmall),
    );
  }
}
