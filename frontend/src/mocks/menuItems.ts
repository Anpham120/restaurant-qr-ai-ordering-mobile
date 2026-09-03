import banhXeoUrl from "./images-hd/banh-xeo-mien-tay.webp";
import boLucLacUrl from "./images-hd/bo-luc-lac.webp";
import caPheSuaDaUrl from "./images-hd/ca-phe-sua-da.webp";
import chaCaLaVongUrl from "./images-hd/cha-ca-la-vong.webp";
import cheKhucBachUrl from "./images-hd/che-khuc-bach.webp";
import goiCuonUrl from "./images-hd/goi-cuon-tom-thit.webp";
import goiXoaiUrl from "./images-hd/goi-xoai-tom-su.webp";
import lauThaiUrl from "./images-hd/lau-thai-hai-san.webp";
import nemRanUrl from "./images-hd/nem-ran-ha-noi.webp";
import phoBoUrl from "./images-hd/pho-bo-dac-biet.webp";
import tomRangMuoiUrl from "./images-hd/tom-rang-muoi.webp";
import traDaoUrl from "./images-hd/tra-dao-cam-sa.webp";
import type { MenuItem } from "../types";

export const menuItems: MenuItem[] = [
  {
    id: "mi-001",
    name: "Gỏi cuốn tôm thịt",
    description: "Cuốn tươi tôm thịt, rau sống, bún mềm, chấm tương đậu phộng.",
    price: 65000,
    categoryName: "Khai vị",
    imageUrl: goiCuonUrl,
    isAvailable: true,
    tags: ["fresh", "light", "signature"],
    prepMinutes: null,
  },
  {
    id: "mi-002",
    name: "Gỏi xoài tôm sú",
    description: "Xoài xanh thái sợi, tôm sú, rau thơm và đậu phộng rang.",
    price: 125000,
    categoryName: "Khai vị",
    imageUrl: goiXoaiUrl,
    isAvailable: true,
    tags: ["fresh", "seafood"],
    prepMinutes: null,
  },
  {
    id: "mi-003",
    name: "Nem rán Hà Nội",
    description: "Nem giòn nhân tôm thịt, ăn kèm rau sống và nước mắm chua ngọt.",
    price: 75000,
    categoryName: "Khai vị",
    imageUrl: nemRanUrl,
    isAvailable: true,
    tags: ["crispy", "classic"],
    prepMinutes: null,
  },
  {
    id: "mi-004",
    name: "Bánh xèo miền Tây",
    description: "Bánh xèo giòn nhân tôm thịt, giá đỗ, rau sống tươi.",
    price: 85000,
    categoryName: "Khai vị",
    imageUrl: banhXeoUrl,
    isAvailable: false,
    tags: ["crispy", "popular"],
    prepMinutes: null,
  },
  {
    id: "mi-005",
    name: "Phở bò đặc biệt",
    description: "Nước dùng bò hầm lâu, thịt bò mềm, hành ngò và bánh phở dai.",
    price: 95000,
    categoryName: "Phở & Bún",
    imageUrl: phoBoUrl,
    isAvailable: true,
    tags: ["signature", "beef"],
    prepMinutes: null,
  },
  {
    id: "mi-006",
    name: "Bò lúc lắc",
    description: "Bò áp chảo cùng ớt chuông, hành tây, khoai tây chiên.",
    price: 245000,
    categoryName: "Món chính",
    imageUrl: boLucLacUrl,
    isAvailable: true,
    tags: ["beef", "premium"],
    prepMinutes: null,
  },
  {
    id: "mi-007",
    name: "Chả cá Lã Vọng",
    description: "Cá ướp nghệ, thì là, hành lá, ăn cùng bún và mắm tôm.",
    price: 285000,
    categoryName: "Món chính",
    imageUrl: chaCaLaVongUrl,
    isAvailable: true,
    tags: ["signature", "fish"],
    prepMinutes: null,
  },
  {
    id: "mi-008",
    name: "Tôm rang muối",
    description: "Tôm tươi rang muối giòn thơm, vị đậm đà dễ chia sẻ.",
    price: 185000,
    categoryName: "Hải sản",
    imageUrl: tomRangMuoiUrl,
    isAvailable: true,
    tags: ["seafood", "share"],
    prepMinutes: null,
  },
  {
    id: "mi-009",
    name: "Lẩu Thái hải sản",
    description: "Nước lẩu chua cay, tôm mực tươi, rau và nấm cho 2-3 người.",
    price: 345000,
    categoryName: "Lẩu",
    imageUrl: lauThaiUrl,
    isAvailable: true,
    tags: ["spicy", "seafood", "share"],
    prepMinutes: null,
  },
  {
    id: "mi-010",
    name: "Chè khúc bạch",
    description: "Khúc bạch mềm, vải, hạnh nhân, nước đường thanh mát.",
    price: 55000,
    categoryName: "Tráng miệng",
    imageUrl: cheKhucBachUrl,
    isAvailable: true,
    tags: ["sweet", "cool"],
    prepMinutes: null,
  },
  {
    id: "mi-011",
    name: "Trà đào cam sả",
    description: "Trà đào thơm, cam tươi, sả nhẹ, vị mát dễ uống.",
    price: 55000,
    categoryName: "Đồ uống",
    imageUrl: traDaoUrl,
    isAvailable: true,
    tags: ["drink", "fresh"],
    prepMinutes: null,
  },
  {
    id: "mi-012",
    name: "Cà phê sữa đá",
    description: "Cà phê phin đậm vị, sữa đặc, đá viên mát lạnh.",
    price: 45000,
    categoryName: "Đồ uống",
    imageUrl: caPheSuaDaUrl,
    isAvailable: false,
    tags: ["drink", "coffee"],
    prepMinutes: null,
  },
];

export const menuCategories = [
  "Tất cả",
  ...Array.from(new Set(menuItems.map((item) => item.categoryName))),
];
