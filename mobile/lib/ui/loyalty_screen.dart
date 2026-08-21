import 'package:flutter/material.dart';

import '../core/auth/auth_api.dart';
import '../core/auth/auth_session.dart';
import '../core/loyalty/loyalty.dart';
import '../core/loyalty/loyalty_api.dart';
import '../core/orders/khoa_dat_don.dart';

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
  final _khoa = KhoaDatDon();
  String? _dangDoi;
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

  /// Đổi điểm lấy ưu đãi (#34).
  ///
  /// HỎI XÁC NHẬN trước, và hộp thoại nói RÕ số điểm sẽ trừ. Đây là lần duy nhất trong app khách
  /// tiêu thứ họ đã tích cả tháng; một nút bấm thẳng ở màn hình có nhiều dòng giống nhau là chỗ
  /// dễ bấm nhầm nhất.
  Future<void> _doi(Reward uu) async {
    if (_dangDoi != null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Đổi ưu đãi?'),
        content: Text('${uu.name}\n\nSẽ trừ ${uu.pointsRequired} điểm. '
            'Việc này không hoàn tác được.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Không')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Đổi')),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() {
      _dangDoi = uu.rewardId;
      _loi = null;
    });
    try {
      final kq = await widget.api.doiDiem(
        widget.dangNhap.accessToken,
        uu.rewardId,
        // Khoá gắn với ƯU ĐÃI: gửi lại cùng ưu đãi là cùng một yêu cầu. Đổi ưu đãi khác là yêu
        // cầu khác và phải có khoá khác.
        _khoa.khoaCho(uu.rewardId),
      );
      // Quên khoá sau khi xong: khách đổi lại đúng ưu đãi đó lần nữa phải là một lần đổi MỚI.
      _khoa.quen();
      if (!mounted) return;
      // Dùng số dư backend trả kèm, không gọi lại: gọi lại tạo khoảng thời gian hiện số dư cũ.
      setState(() => _diem = kq.soDuMoi);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Đã đổi ${kq.rewardName} · -${kq.pointsSpent} điểm'),
      ));
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _loi = e.message);
      // Không đủ điểm có thể vì vừa thua tranh chấp — đọc lại để hiện con số thật.
      if (e.code == 'LOYALTY_NOT_ENOUGH_POINTS') await _tai();
    } finally {
      if (mounted) setState(() => _dangDoi = null);
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
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('${r.pointsRequired} điểm'),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed: _dangDoi != null ? null : () => _doi(r),
                      child: Text(_dangDoi == r.rewardId ? 'Đang đổi…' : 'Đổi'),
                    ),
                  ],
                ),
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
