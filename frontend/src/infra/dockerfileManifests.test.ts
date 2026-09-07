import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const frontendRoot = new URL("../../", import.meta.url);
const dockerfilePath = fileURLToPath(new URL("Dockerfile", frontendRoot));
const healthCheckPath = fileURLToPath(
  new URL("../deploy/scripts/health-check.sh", frontendRoot),
);

function duongDanTrongDockerfile(): string[] {
  const dockerfile = readFileSync(dockerfilePath, "utf8");
  return [...dockerfile.matchAll(/^COPY frontend\/(\S*package\.json)\s/mg)].map((m) => m[1]!);
}

/** Mọi workspace có trên đĩa, theo đúng hai glob `apps/*` và `packages/*` của package.json gốc. */
function workspaceTrenDia(): string[] {
  return ["apps", "packages"].flatMap((thuMuc) =>
    readdirSync(fileURLToPath(new URL(thuMuc, frontendRoot)), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `${thuMuc}/${e.name}/package.json`)
      .filter((p) => existsSync(fileURLToPath(new URL(p, frontendRoot)))));
}

describe("frontend Dockerfile workspace manifests", () => {
  it("copies only package manifests that exist in the build context", () => {
    const manifestPaths = duongDanTrongDockerfile();
    expect(manifestPaths.length).toBeGreaterThan(0);
    for (const manifestPath of manifestPaths) {
      expect(existsSync(fileURLToPath(new URL(manifestPath, frontendRoot))), manifestPath).toBe(true);
    }
  });

  /**
   * Chiều ngược lại, và là chiều đắt hơn: thiếu một manifest thì `npm ci` dựng cây workspace
   * không khớp package-lock.json và ảnh Docker hỏng — nhưng chỉ hỏng lúc build ảnh, tức là muộn.
   *
   * <p>Bỏ sót từng xảy ra thật: `@cmc/i18n` là phụ thuộc của customer-web mà không có dòng COPY
   * nào, và phép kiểm một chiều cũ không thấy được vì nó chỉ soi những dòng đã có.
   */
  it("copies every workspace manifest on disk", () => {
    const daCopy = new Set(duongDanTrongDockerfile());
    for (const workspace of workspaceTrenDia()) {
      expect(daCopy.has(workspace), `thiếu dòng COPY cho ${workspace}`).toBe(true);
    }
  });
});

describe("production health check retries", () => {
  it("retries transient TLS errors while nginx certificates reload", () => {
    const healthCheck = readFileSync(healthCheckPath, "utf8");

    expect(healthCheck).toContain("--retry-all-errors");
  });
});
