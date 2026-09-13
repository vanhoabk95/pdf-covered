/**
 * Labelled evaluation set for the Vietnamese detector.
 *   vi        → must be auto-masked (≥ 0.85)
 *   not       → must not be flagged (< 0.60)
 *   uncertain → must land in the uncertain band [0.60, 0.85)
 *   notAuto   → may be uncertain but never auto-masked (< 0.85)
 */
export type ExpectedTier = "vi" | "not" | "uncertain" | "notAuto";

export const LABELLED_LINES: [string, ExpectedTier][] = [
  // Spec §2 example page
  ["Project Overview", "not"],
  ["Mục tiêu của dự án là cải thiện hệ thống.", "vi"],
  ["Target luminance: 500 nit", "not"],
  ["Người phụ trách: Nguyễn Văn A", "vi"],

  // Spec §9 / §12 / §34: sentences and mixed technical lines
  ["Mục tiêu dự án", "vi"],
  ["Người phụ trách", "vi"],
  ["Panel kiểm tra", "vi"],
  ["Kế hoạch thực hiện", "vi"],
  ["Check panel trước khi chạy test", "vi"],
  ["Panel bị lỗi mura", "vi"],
  ["Kiểm tra gamma value", "vi"],
  ["Upload file lên server", "vi"],
  ["Tổng quan dự án", "vi"],
  ["Tổng Quan Dự Án", "vi"],
  ["Thông số kỹ thuật", "vi"],
  ["Độ sáng phải lớn hơn 500 nit.", "vi"],
  ["Đo sau khi làm nóng máy.", "vi"],
  ["Các bước kiểm tra phải được hoàn thành trước khi bàn giao.", "vi"],
  ["Trang này được xoay chín mươi độ.", "vi"],
  ["Nhãn dọc tiếng Việt", "vi"],
  ["Nội dung của phần 3 được viết bằng tiếng Việt.", "vi"],
  ["Lỗi", "vi"],
  ["Ghi chú: đo lại sau 30 phút", "vi"],
  ["Nhiệt độ môi trường 25°C", "vi"],
  ["Báo cáo tuần 12 - Line 3", "vi"],
  ["Xác nhận bởi QA team", "vi"],
  ["Thời gian: 08:00 - 17:00", "vi"],
  ["1. Chuẩn bị mẫu thử", "vi"],
  ["Đã fix bug ở module login", "vi"],
  ["TỔNG KẾT", "vi"],

  // English
  ["The goal of this project is to improve the inspection system.", "not"],
  ["Owner: Quality Engineering", "not"],
  ["Schedule and milestones are listed below.", "not"],
  ["Brightness must exceed 500 nit.", "not"],
  ["Measure after warm-up.", "not"],
  ["Specification", "not"],
  ["Inspection Notes", "not"],
  ["Gamma 2.2, white point D65", "not"],
  ["Result 1: PASS", "not"],
  ["Appendix 3: raw measurement data", "not"],
  ["Section 2", "not"],
  ["Rotated Page Title", "not"],
  ["Diagonal note", "not"],
  ["Cover page with a text layer", "not"],
  ["Contact Nguyễn Văn A for details.", "not"],
  ["Prepared by Trần Thị Mai on 2024-05-01", "not"],
  ["Meeting in Hà Nội next week", "not"],
  ["Table 4. Mura inspection results", "not"],
  ["OK", "not"],
  ["v1.2.3", "not"],
  ["", "not"],
  ["12345", "not"],

  // Names and places (spec §33)
  ["Nguyen Van A", "not"],
  ["LG Display Vietnam", "not"],
  ["Hai Phong", "not"],
  ["Samsung Vietnam", "not"],
  ["Nguyễn Văn A", "uncertain"],
  ["Hải Phòng", "uncertain"],
  ["Trần Thị Mai", "uncertain"],

  // Other languages with accents
  ["Résumé du système à vérifier", "not"],
  ["Café com leite e pão", "not"],
  ["Größe und Länge prüfen", "not"],
  ["El año próximo", "not"],
  ["패널 검사 결과", "not"],
  ["検査結果", "not"],

  // Vietnamese without diacritics: honest uncertainty at most
  ["Kiem tra he thong truoc khi giao hang", "uncertain"],
  ["Nguoi phu trach khong duoc thay doi", "uncertain"],
  ["muc tieu", "notAuto"],
];

/**
 * Held-out lines written after the weights were tuned on LABELLED_LINES (40/40 at the time).
 * Keep as a regression set; don't tune weights against it.
 */
export const HOLDOUT_LINES: [string, "vi" | "not"][] = [
  ["Yêu cầu: nhiệt độ phòng sạch không vượt quá 23 độ", "vi"],
  ["Quy trình thay thế linh kiện bị hỏng", "vi"],
  ["Sau khi kiểm tra, kết quả đạt yêu cầu.", "vi"],
  ["Điện áp đầu vào 220V", "vi"],
  ["Ngày bắt đầu", "vi"],
  ["Trạng thái: Hoàn thành", "vi"],
  ["Mô tả lỗi", "vi"],
  ["Nguyên nhân gốc rễ", "vi"],
  ["Biện pháp khắc phục tạm thời", "vi"],
  ["Số lượng mẫu: 32 pcs", "vi"],
  ["Tần suất: mỗi ca", "vi"],
  ["Cập nhật firmware version mới", "vi"],
  ["Chú ý an toàn khi vận hành máy", "vi"],
  ["Bảng 2. Kết quả đo độ đồng đều", "vi"],
  ["Phê duyệt", "vi"],
  ["Hình 5: Sơ đồ bố trí thiết bị", "vi"],
  ["Tài liệu tham khảo", "vi"],
  ["Người kiểm tra ký tên", "vi"],
  ["Deadline là thứ Sáu", "vi"],
  ["Log file được lưu trong thư mục backup", "vi"],
  ["Input voltage 220V", "not"],
  ["Root cause analysis", "not"],
  ["Corrective action plan", "not"],
  ["Sample size: 32 pcs", "not"],
  ["Approved by", "not"],
  ["Figure 5: Equipment layout", "not"],
  ["References", "not"],
  ["Firmware update procedure", "not"],
  ["Safety precautions when operating the machine", "not"],
  ["Status: Completed", "not"],
  ["Temperature must not exceed 23 degrees", "not"],
  ["Uniformity measurement results", "not"],
  ["Shift A / Shift B", "not"],
  ["Doc No. QA-2024-017 Rev. 3", "not"],
  ["Page 3 of 12", "not"],
  ["Hanoi, Vietnam", "not"],
  ["Mr. Le Minh Tuan, Production Manager", "not"],
  ["Pham Thi Lan (QA)", "not"],
  ["Bac Ninh plant", "not"],
  ["Ho Chi Minh City office", "not"],
];
