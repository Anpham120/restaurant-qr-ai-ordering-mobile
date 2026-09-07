/**
 * Đọc thực đơn quán từ chính các migration, và dựng bản Markdown cho người đọc.
 *
 * Vì sao SINH RA chứ không viết tay: thực đơn đã có một nguồn sự thật là các migration Flyway.
 * Một bảng chép tay bên cạnh sẽ đúng đúng một ngày — tới lần đổi giá đầu tiên là hai bên nói hai
 * kiểu, và người đọc không có cách nào biết bên nào mới. Kho này đã dính đúng lỗi đó bốn lần
 * (xem docs/THIET_KE_NGHIEP_VU.md §22), nên bảng thực đơn đi cùng một cổng kiểm.
 */
import fs from "node:fs";
import path from "node:path";

/** Các migration có chạm tới danh mục hoặc món của quán, theo đúng thứ tự Flyway áp. */
const MIGRATIONS = ["V30__shop_catalog_and_delivery.sql", "V33__shop_demo_menu.sql"];

function nguon(goc) {
	const thuMuc = path.join(goc, "backend-java/src/main/resources/db/migration");
	return MIGRATIONS.map((f) => fs.readFileSync(path.join(thuMuc, f), "utf8")).join("\n");
}

export function docThucDon(goc) {
	const src = nguon(goc);

	const danhMuc = [];
	for (const m of src.matchAll(/\('(shop_[a-z_]+)','([^']+)',(\d+),true,now/g)) {
		danhMuc.push({ id: m[1], ten: m[2], thuTu: Number(m[3]) });
	}
	danhMuc.sort((a, b) => a.thuTu - b.thuTu);

	const mon = [];
	for (const m of src.matchAll(
		/\('(shop_[a-z_]+)','(shop_[a-z_]+)','([^']+)','([^']*)',(\d+),'([^']*)',true,ARRAY\[([^\]]*)\],(\d+)/g,
	)) {
		mon.push({
			id: m[1], danhMuc: m[2], ten: m[3], moTa: m[4],
			gia: Number(m[5]), anh: m[6],
			nhan: [...m[7].matchAll(/'([^']+)'/g)].map((t) => t[1]),
			phutLam: Number(m[8]),
		});
	}

	// Nhóm tuỳ chọn: mỗi câu UPDATE gán một khối JSON cho một tập mã món.
	const nhomCua = new Map();
	for (const m of src.matchAll(/option_groups_json = '(\[[\s\S]*?\])'[^;]*?WHERE ([^;]+);/g)) {
		const ten = JSON.parse(m[1]).map((g) => g.name);
		for (const id of m[2].matchAll(/'(shop_[a-z_]+)'/g)) {
			nhomCua.set(id[1], ten);
		}
		for (const c of m[2].matchAll(/category_id (?:IN \(|= )([^)]*)/g)) {
			for (const cid of c[1].matchAll(/'(shop_[a-z_]+)'/g)) {
				for (const x of mon.filter((v) => v.danhMuc === cid[1])) {
					if (!nhomCua.has(x.id)) nhomCua.set(x.id, ten);
				}
			}
		}
	}
	for (const m of mon) m.nhomTuyChon = nhomCua.get(m.id) ?? [];

	return { danhMuc, mon };
}

/** Tên tệp ảnh riêng của một món, suy máy móc từ mã — không đặt tay, để nối được tự động. */
export function tenAnh(maMon) {
	return maMon.replace(/^shop_/, "").replaceAll("_", "-") + ".png";
}

const vnd = (n) => n.toLocaleString("vi-VN") + "đ";

export function dungMarkdown(goc) {
	const { danhMuc, mon } = docThucDon(goc);
	const coSan = new Set(
		fs.readdirSync(path.join(goc, "frontend/public/shop-assets")).filter((f) => f.endsWith(".png")),
	);
	const canLam = mon.filter((m) => !coSan.has(tenAnh(m.id)));

	const d = [];
	d.push("# Thực đơn quán Mây");
	d.push("");
	d.push(`**${mon.length} món** trong **${danhMuc.length} danh mục**. Trang này **được SINH RA** bởi`);
	d.push("`scripts/menu/build_thuc_don.mjs` từ chính các migration đã seed thực đơn");
	d.push(`(${MIGRATIONS.join(", ")}) — nên nó không thể lệch giá hay lệch tên với cơ sở dữ liệu.`);
	d.push("");
	d.push("Đổi thực đơn: viết một migration MỚI rồi chạy `node scripts/menu/build_thuc_don.mjs`.");
	d.push("Không sửa migration đã chạy — Flyway lưu checksum từng tệp.");
	d.push("");
	d.push("> Giá dưới đây là **số demo**, chưa phải giá bán.");
	d.push("");

	for (const c of danhMuc) {
		const ds = mon.filter((m) => m.danhMuc === c.id);
		d.push(`## ${c.ten}`);
		d.push("");
		d.push("| Món | Giá | Làm | Tuỳ chọn | Mô tả |");
		d.push("|---|---|---|---|---|");
		for (const m of ds) {
			const tc = m.nhomTuyChon.length ? m.nhomTuyChon.join(" · ") : "—";
			d.push(`| ${m.ten} | ${vnd(m.gia)} | ${m.phutLam}′ | ${tc} | ${m.moTa} |`);
		}
		d.push("");
	}

	d.push("## Ảnh món");
	d.push("");
	d.push("Ảnh hiện tại là **tranh minh hoạ theo danh mục**, nên nhiều món dùng chung một tệp.");
	d.push(`Còn **${canLam.length}/${mon.length} món** chưa có ảnh riêng.`);
	d.push("");
	d.push("Quy cách: **768 × 768** PNG, 40–70 KB. Chép vào **cả hai** thư mục, cùng tên tệp —");
	d.push("`frontend/public/shop-assets/` (web đọc) và");
	d.push("`backend-java/src/main/resources/static/shop-assets/` (app di động và endpoint tĩnh đọc).");
	d.push("Thiếu một bên thì ảnh mất ở đúng một nền tảng.");
	d.push("");
	d.push("| Món | Ảnh đang dùng | Tệp ảnh riêng cần làm |");
	d.push("|---|---|---|");
	for (const c of danhMuc) {
		for (const m of mon.filter((x) => x.danhMuc === c.id)) {
			const t = tenAnh(m.id);
			d.push(`| ${m.ten} | \`${m.anh}\` | ${coSan.has(t) ? "— *(đã có)*" : "`" + t + "`"} |`);
		}
	}
	d.push("");

	return d.join("\n") + "\n";
}
