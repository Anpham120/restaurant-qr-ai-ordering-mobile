import { useCallback, useEffect, useState } from "react";
import type {
  LoyaltyMember,
  LoyaltyMemberRequest,
  LoyaltyReward,
  LoyaltyRewardRequest,
} from "@cmc/shared-types";
import { api } from "../../services/apiClient";
import { Star, X } from "lucide-react";
import "../../components/operations/operations.css";
import { useOpsConfirm } from "../../components/operations/OpsConfirmProvider";

const EMPTY_MEMBER: LoyaltyMemberRequest = { phoneNumber: "", fullName: "", points: 0 };
const EMPTY_REWARD: LoyaltyRewardRequest = { name: "", description: "", pointsRequired: 10, isActive: true };

function formatVnd(value: number): string {
  return `${value.toLocaleString("vi-VN")}đ`;
}

export function AdminLoyaltyPage() {
  const confirm = useOpsConfirm();
  const [members, setMembers] = useState<LoyaltyMember[]>([]);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const [showMemberForm, setShowMemberForm] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState<LoyaltyMemberRequest>(EMPTY_MEMBER);

  const [showRewardForm, setShowRewardForm] = useState(false);
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [rewardForm, setRewardForm] = useState<LoyaltyRewardRequest>(EMPTY_REWARD);

  const load = useCallback(async () => {
    try {
      const [memberList, rewardList] = await Promise.all([
        api.loyalty.listMembers(),
        api.loyalty.listRewards(),
      ]);
      setMembers(memberList);
      setRewards(rewardList);
    } catch {
      setNotice("Không tải được dữ liệu tích điểm.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveMember() {
    if (!memberForm.phoneNumber.trim()) {
      setNotice("Số điện thoại không được trống.");
      return;
    }
    try {
      const payload: LoyaltyMemberRequest = {
        phoneNumber: memberForm.phoneNumber.trim(),
        fullName: memberForm.fullName?.trim() || null,
        points: Number(memberForm.points),
      };
      if (editingMemberId) {
        await api.loyalty.updateMember(editingMemberId, payload);
      } else {
        await api.loyalty.createMember(payload);
      }
      setShowMemberForm(false);
      setNotice("Đã lưu thành viên.");
      await load();
    } catch {
      setNotice("Lưu thành viên thất bại (SĐT có thể đã tồn tại).");
    }
  }

  async function deleteMember(id: string) {
    if (!(await confirm({
      title: "Xoá thành viên này?",
      message: "Điểm tích luỹ của khách sẽ mất và không khôi phục được.",
      confirmLabel: "Xoá thành viên",
      danger: true,
    }))) return;
    try {
      await api.loyalty.deleteMember(id);
      await load();
    } catch {
      setNotice("Xóa thất bại.");
    }
  }

  async function saveReward() {
    if (!rewardForm.name.trim()) {
      setNotice("Tên phần thưởng không được trống.");
      return;
    }
    if (rewardForm.pointsRequired <= 0) {
      setNotice("Điểm yêu cầu phải lớn hơn 0.");
      return;
    }
    try {
      const payload: LoyaltyRewardRequest = {
        name: rewardForm.name.trim(),
        description: rewardForm.description?.trim() || null,
        pointsRequired: Number(rewardForm.pointsRequired),
        isActive: rewardForm.isActive,
      };
      if (editingRewardId) {
        await api.loyalty.updateReward(editingRewardId, payload);
      } else {
        await api.loyalty.createReward(payload);
      }
      setShowRewardForm(false);
      setNotice("Đã lưu phần thưởng.");
      await load();
    } catch {
      setNotice("Lưu phần thưởng thất bại.");
    }
  }

  async function deleteReward(id: string) {
    if (!(await confirm({
      title: "Xoá phần thưởng này?",
      message: "Khách sẽ không đổi điểm lấy phần thưởng này được nữa.",
      confirmLabel: "Xoá phần thưởng",
      danger: true,
    }))) return;
    try {
      await api.loyalty.deleteReward(id);
      await load();
    } catch {
      setNotice("Xóa thất bại.");
    }
  }

  if (isLoading) {
    return <div className="ops-empty"><div className="ops-empty-icon"><Star aria-hidden="true" /></div>Đang tải...</div>;
  }

  return (
    <div>
      <div className="ops-page-header">
        <h1>Tích điểm khách hàng</h1>
        <p>Quản lý thành viên và phần thưởng đổi điểm</p>
      </div>

      {notice ? <div className="ops-notice ops-notice--info">{notice}</div> : null}

      <div className="ops-toolbar">
        <button
          className="ops-btn ops-btn--primary"
          type="button"
          onClick={() => { setEditingMemberId(null); setMemberForm(EMPTY_MEMBER); setNotice(""); setShowMemberForm(true); }}
        >
          + Thêm thành viên
        </button>
      </div>

      <table className="ops-table">
        <thead>
          <tr>
            <th>Số điện thoại</th>
            <th>Họ tên</th>
            <th>Điểm</th>
            <th>Tổng chi tiêu</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.memberId}>
              <td><strong>{member.phoneNumber}</strong></td>
              <td>{member.fullName ?? "-"}</td>
              <td>{member.points}</td>
              <td>{formatVnd(member.lifetimeSpend)}</td>
              <td>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    className="ops-btn ops-btn--ghost ops-btn--sm"
                    type="button"
                    onClick={() => {
                      setEditingMemberId(member.memberId);
                      setMemberForm({ phoneNumber: member.phoneNumber, fullName: member.fullName ?? "", points: member.points });
                      setNotice("");
                      setShowMemberForm(true);
                    }}
                  >
                    Sửa
                  </button>
                  <button className="ops-btn ops-btn--danger ops-btn--sm" type="button" onClick={() => deleteMember(member.memberId)}>Xóa</button>
                </div>
              </td>
            </tr>
          ))}
          {members.length === 0 ? (
            <tr><td colSpan={5}><div className="ops-empty">Chưa có thành viên</div></td></tr>
          ) : null}
        </tbody>
      </table>

      <div className="ops-page-header" style={{ marginTop: 32 }}>
        <h2>Phần thưởng</h2>
        <p>Danh sách phần thưởng khách có thể đổi bằng điểm</p>
      </div>

      <div className="ops-toolbar">
        <button
          className="ops-btn ops-btn--primary"
          type="button"
          onClick={() => { setEditingRewardId(null); setRewardForm(EMPTY_REWARD); setNotice(""); setShowRewardForm(true); }}
        >
          + Thêm phần thưởng
        </button>
      </div>

      <table className="ops-table">
        <thead>
          <tr>
            <th>Tên</th>
            <th>Mô tả</th>
            <th>Điểm yêu cầu</th>
            <th>Trạng thái</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rewards.map((reward) => (
            <tr key={reward.rewardId}>
              <td><strong>{reward.name}</strong></td>
              <td>{reward.description ?? "-"}</td>
              <td>{reward.pointsRequired}</td>
              <td>
                <span className={`ops-badge ${reward.isActive ? "ops-badge--ready" : "ops-badge--cancelled"}`}>
                  {reward.isActive ? "Hoạt động" : "Tắt"}
                </span>
              </td>
              <td>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    className="ops-btn ops-btn--ghost ops-btn--sm"
                    type="button"
                    onClick={() => {
                      setEditingRewardId(reward.rewardId);
                      setRewardForm({ name: reward.name, description: reward.description ?? "", pointsRequired: reward.pointsRequired, isActive: reward.isActive });
                      setNotice("");
                      setShowRewardForm(true);
                    }}
                  >
                    Sửa
                  </button>
                  <button className="ops-btn ops-btn--danger ops-btn--sm" type="button" onClick={() => deleteReward(reward.rewardId)}>Xóa</button>
                </div>
              </td>
            </tr>
          ))}
          {rewards.length === 0 ? (
            <tr><td colSpan={5}><div className="ops-empty">Chưa có phần thưởng</div></td></tr>
          ) : null}
        </tbody>
      </table>

      {showMemberForm ? (
        <div className="ops-modal-overlay" onClick={() => setShowMemberForm(false)}>
          <div className="ops-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ops-modal-header">
              <h2>{editingMemberId ? "Sửa thành viên" : "Thêm thành viên"}</h2>
              <button aria-label="Đóng" className="ops-modal-close" type="button" onClick={() => setShowMemberForm(false)}><X aria-hidden="true" size={18} /></button>
            </div>
            <div className="ops-modal-body">
              <div className="ops-form-group">
                <label className="ops-form-label">Số điện thoại *</label>
                <input className="ops-form-input" value={memberForm.phoneNumber} onChange={(e) => setMemberForm({ ...memberForm, phoneNumber: e.target.value })} />
              </div>
              <div className="ops-form-group">
                <label className="ops-form-label">Họ tên</label>
                <input className="ops-form-input" value={memberForm.fullName ?? ""} onChange={(e) => setMemberForm({ ...memberForm, fullName: e.target.value })} />
              </div>
              <div className="ops-form-group">
                <label className="ops-form-label">Điểm</label>
                <input className="ops-form-input" type="number" value={memberForm.points} onChange={(e) => setMemberForm({ ...memberForm, points: Number(e.target.value) })} />
              </div>
            </div>
            <div className="ops-modal-footer">
              <button className="ops-btn ops-btn--ghost" type="button" onClick={() => setShowMemberForm(false)}>Hủy</button>
              <button className="ops-btn ops-btn--primary" type="button" onClick={saveMember}>{editingMemberId ? "Cập nhật" : "Tạo mới"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {showRewardForm ? (
        <div className="ops-modal-overlay" onClick={() => setShowRewardForm(false)}>
          <div className="ops-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ops-modal-header">
              <h2>{editingRewardId ? "Sửa phần thưởng" : "Thêm phần thưởng"}</h2>
              <button aria-label="Đóng" className="ops-modal-close" type="button" onClick={() => setShowRewardForm(false)}><X aria-hidden="true" size={18} /></button>
            </div>
            <div className="ops-modal-body">
              <div className="ops-form-group">
                <label className="ops-form-label">Tên *</label>
                <input className="ops-form-input" value={rewardForm.name} onChange={(e) => setRewardForm({ ...rewardForm, name: e.target.value })} />
              </div>
              <div className="ops-form-group">
                <label className="ops-form-label">Mô tả</label>
                <input className="ops-form-input" value={rewardForm.description ?? ""} onChange={(e) => setRewardForm({ ...rewardForm, description: e.target.value })} />
              </div>
              <div className="ops-form-group">
                <label className="ops-form-label">Điểm yêu cầu *</label>
                <input className="ops-form-input" type="number" value={rewardForm.pointsRequired} onChange={(e) => setRewardForm({ ...rewardForm, pointsRequired: Number(e.target.value) })} />
              </div>
              <div className="ops-form-group">
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={rewardForm.isActive} onChange={(e) => setRewardForm({ ...rewardForm, isActive: e.target.checked })} />
                  <span className="ops-form-label" style={{ margin: 0 }}>Đang hoạt động</span>
                </label>
              </div>
            </div>
            <div className="ops-modal-footer">
              <button className="ops-btn ops-btn--ghost" type="button" onClick={() => setShowRewardForm(false)}>Hủy</button>
              <button className="ops-btn ops-btn--primary" type="button" onClick={saveReward}>{editingRewardId ? "Cập nhật" : "Tạo mới"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
