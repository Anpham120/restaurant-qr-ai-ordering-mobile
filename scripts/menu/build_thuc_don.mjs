#!/usr/bin/env node
/**
 * Sinh `docs/THUC_DON_QUAN.md` từ các migration thực đơn.
 *
 *   node scripts/menu/build_thuc_don.mjs           # ghi tệp
 *   node scripts/menu/build_thuc_don.mjs --check   # chỉ kiểm, đỏ nếu tệp đã commit lệch
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dungMarkdown } from "./thuc_don.mjs";

const GOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DICH = path.join(GOC, "docs/THUC_DON_QUAN.md");

const moi = dungMarkdown(GOC);

if (process.argv.includes("--check")) {
	const cu = fs.existsSync(DICH) ? fs.readFileSync(DICH, "utf8") : "";
	if (cu !== moi) {
		console.error("TỆP ĐÃ COMMIT KHÁC KẾT QUẢ SINH LẠI:\n  docs/THUC_DON_QUAN.md");
		console.error("Chạy: node scripts/menu/build_thuc_don.mjs");
		process.exit(1);
	}
	console.log("--check: tệp đã commit khớp kết quả sinh lại.");
} else {
	fs.writeFileSync(DICH, moi, "utf8");
	console.log("Đã ghi docs/THUC_DON_QUAN.md");
}
