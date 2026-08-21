import 'package:flutter/material.dart';

import '../core/auth/auth_api.dart';
import '../core/auth/auth_session.dart';
import '../core/loyalty/loyalty.dart';
import '../core/loyalty/loyalty_api.dart';

/// Điểm thưởng và ưu đãi đủ điều kiện của chính khách (§9.10 M1 mục 3).
class LoyaltyScreen extends StatefulWidget {
  const LoyaltyScreen({super.key, required this.api, required this.dangNhap});

  final LoyaltyApi api;
  final AuthSession dangNhap;

  @override
  State<LoyaltyScreen> createState() => _LoyaltyScreenState();
}

class _LoyaltyScreenState extends State<LoyaltyScreen> {
  final _so = TextEditingController();
  MyLoyalty? _diem;
  String? _loi;
  bool _dangGui = false;

  @override
  void initState() {
    super.initState();
    _tai();
  }

  @override
  void dispose() {
    _so.dispose();
    super.dispose();
  }

  Future<void> _tai() async {
    setState(() => _loi = null);
    try {
      final kq = await widget.api.cuaToi(widget.dangNhap.accessToken);
      if (!mounted) return;
      setState(() => _diem = kq);
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _loi = e.message);
    }
  }

  Future<void> _noiSo() async {
    if (_dangGui) return;
    setState(() {
      _dangGui = true;
      _loi = null;
    });
    try {
      final kq = await widget.api.noiSo(widget.dangNhap.accessToken, _so.text);
      if (!mounted) return;
      setState(() => _diem = kq);
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _loi = e.message);
    } finally {
      if (mounted) setState(() => _dangGui = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Điểm thưởng')),
      body: RefreshIndicator(onRefresh: _tai, child: _than(context)),
    );
  }

  Widget _than(BuildContext context) {
    final diem = _diem;
    if (diem == null && _loi == null) {
      return const Center(child: CircularProgressIndicator());
    }
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        if (_loi != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(_loi!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ),
        if (diem != null)
          ...(diem.linked ? _daNoi(context, diem) : _chuaNoi(context)),
      ],
    );
  }

  List<Widget> _daNoi(BuildContext context, MyLoyalty diem) => [
        Card(
          child: ListTile(
            title: Text('${diem.points} điểm',
                style: Theme.of(context).textTheme.headlineSmall),
            subtitle: Text('Số đã liên kết: ${diem.phoneNumber}'),
          ),
        ),
        const SizedBox(height: 20),
        Text('Ưu đãi đổi được ngay',
            style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (diem.availableRewards.isEmpty)
          // Nói rõ đây là "chưa đủ điểm", không phải "quán không có ưu đãi nào".
          const Text('Chưa đủ điểm cho ưu đãi nào. Tiếp tục tích điểm nhé.')
        else
          ...diem.availableRewards.map((r) => ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(r.name),
                subtitle: r.description == null ? null : Text(r.description!),
                trailing: Text('${r.pointsRequired} điểm'),
              )),
      ];

  List<Widget> _chuaNoi(BuildContext context) => [
        Text('Liên kết số điện thoại',
            style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        // Nói TRƯỚC giới hạn, thay vì để khách gõ số rồi mới nhận lỗi khó hiểu.
        const Text(
          'Điểm thưởng được tính theo số điện thoại bạn dùng khi thanh toán.\n'
          'Nếu số này đã từng tích điểm, nhờ nhân viên tại quầy nối hộ.',
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _so,
          keyboardType: TextInputType.phone,
          autocorrect: false,
          onSubmitted: (_) => _noiSo(),
          decoration: const InputDecoration(labelText: 'Số điện thoại'),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _dangGui ? null : _noiSo,
          child: Text(_dangGui ? 'Đang liên kết…' : 'Liên kết'),
        ),
      ];
}
