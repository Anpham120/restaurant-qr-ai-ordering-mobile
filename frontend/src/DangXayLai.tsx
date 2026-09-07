/**
 * Chỗ giữ tạm cho ba ứng dụng web trong lúc giao diện được dựng lại theo nghiệp vụ quán.
 *
 * <p>Giao diện cũ đã gỡ hết cùng đợt chuyển đổi: nó dựng theo mô hình nhà hàng có giao tận nhà,
 * gọi những endpoint nay không còn. Giữ lại một màn hình rỗng là để đường build và ba workspace
 * vite còn nguyên — dựng lại từ số không tốn hơn nhiều so với việc thay nội dung tệp này.
 * Xem docs/pm/CHOT_NGHIEP_VU_QUAN_P0.md.
 */
export function DangXayLai({ ten }: { ten: string }) {
	return (
		<main style={{
			minHeight: "100dvh", display: "grid", placeContent: "center", gap: "0.5rem",
			padding: "2rem", textAlign: "center", background: "#faf8f4", color: "#244b3b",
			fontFamily: "system-ui, sans-serif",
		}}>
			<h1 style={{ margin: 0, fontSize: "1.25rem" }}>{ten}</h1>
			<p style={{ margin: 0, opacity: 0.7 }}>Giao diện đang được dựng lại theo nghiệp vụ quán.</p>
		</main>
	);
}
