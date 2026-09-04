import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const frontendRoot = new URL("../../", import.meta.url);
const dockerfilePath = fileURLToPath(new URL("Dockerfile", frontendRoot));
const aiDockerfilePath = fileURLToPath(new URL("../ai/Dockerfile", frontendRoot));
const aiRequirementsPath = fileURLToPath(new URL("../ai/requirements.txt", frontendRoot));
const healthCheckPath = fileURLToPath(
  new URL("../deploy/scripts/health-check.sh", frontendRoot),
);

describe("frontend Dockerfile workspace manifests", () => {
  it("copies only package manifests that exist in the build context", () => {
    const dockerfile = readFileSync(dockerfilePath, "utf8");
    const manifestPaths = [...dockerfile.matchAll(/^COPY frontend\/(\S*package\.json)\s/mg)]
      .map((match) => match[1]!);

    expect(manifestPaths.length).toBeGreaterThan(0);
    for (const manifestPath of manifestPaths) {
      expect(existsSync(fileURLToPath(new URL(manifestPath, frontendRoot))), manifestPath).toBe(true);
    }
  });
});

describe("AI Docker production dependencies", () => {
  // LỊCH SỬ CỦA HÀNG RÀO NÀY — nó đã đảo chiều HAI lần, và cả hai lần đều theo một phép ĐO.
  //
  // Lần 1: test đòi ảnh Docker cài `torch==2.13.0+cpu`. Bước dựng lại BỎ torch và
  //   sentence-transformers khỏi ảnh sau khi đo rằng truy hồi tri thức lúc đó là TRA KHÓA trên 24
  //   chủ đề `verbatim` — chính xác tuyệt đối, 0ms, không xếp hạng. Test được ĐẢO CHIỀU thành "giữ
  //   thư viện nặng NGOÀI ảnh", kèm điều kiện để đảo lại: *khi đường `synthesize` được dựng*.
  //
  // Lần 2 (đây): điều kiện đó ĐÃ XẢY RA. Kho nay có 84 chủ đề `synthesize` và **74 trong số đó
  //   không có cụm từ vựng nào**, nên truy hồi là đường DUY NHẤT tới chúng. Embedding thắng ở cả
  //   hai bài toán và cả hai tập niêm phong, nên nó vào `ai/requirements.txt`.
  //
  // Vì sao vẫn giữ test thay vì xóa: rủi ro chỉ ĐỔI CHỖ, không mất. Trước đây rủi ro là "ai đó
  // lặng lẽ thêm 3GB vào ảnh". Nay rủi ro là **mất dòng ghim bản CPU**, và nó đắt hơn nhiều:
  //
  //     có `--extra-index-url .../whl/cpu`   ảnh 2,74GB
  //     thiếu nó                             ảnh 9,29GB  (pip lấy torch bản CUDA + gói NVIDIA)
  //
  // 6,55GB cho một dịch vụ chạy CPU và không có GPU nào. Và nó IM LẶNG: build vẫn thành công, dịch
  // vụ vẫn chạy đúng, chỉ ảnh to gấp 3,4 lần. Đúng loại lỗi chỉ người deploy phát hiện.
  //
  // Chỉ quét DÒNG LỆNH, bỏ dòng chú thích. Bản đầu của test này quét cả tệp và đỏ ngay — vì
  // `ai/Dockerfile` có chữ "torch" trong một CHÚ THÍCH nói rằng torch đã được bỏ.
  //
  // Đây là lớp lỗi thứ tư cùng loại trong dự án: phép quét chuỗi khớp vào chính lời giải thích của
  // nó. Ba lần trước là phép kiểm điểm vào Dockerfile đọc `uvicorn` từ một comment, phép kiểm
  // schema khớp tên trường bên trong `description`, và phép kiểm "không dùng random.shuffle" khớp
  // đúng câu chú thích giải thích vì sao không dùng.
  const instructionLines = (text: string): string =>
    text
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");

;

describe("production health check retries", () => {
  it("retries transient TLS errors while nginx certificates reload", () => {
    const healthCheck = readFileSync(healthCheckPath, "utf8");

    expect(healthCheck).toContain("--retry-all-errors");
  });
});
