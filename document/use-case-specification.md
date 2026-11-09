# Use-case specification — Student Web cho HCI User Study

| Thuộc tính | Giá trị |
| --- | --- |
| Phiên bản | 0.1 — Bản nháp phân tích yêu cầu |
| Ngày | 09/11/2026 |
| Nguồn | [requirement.md](requirement.md) |
| Sơ đồ | [use-case-diagram.md](use-case-diagram.md), [mã Mermaid](use-case-diagram.mmd) |
| Phạm vi | Website phục vụ nghiên cứu HCI qua hoạt động xem video của học sinh/người tham gia. |

## 1. Cơ sở đặc tả

### 1.1. Quy ước về mức độ xác định

Các chức năng chính được rút ra từ `requirement.md`. Luồng chi tiết, trạng thái, quy tắc lưu dữ liệu và tiêu chí nghiệm thu bên dưới là **đề xuất phân tích** để biến ghi chú thành một bản đặc tả có thể review. Chúng chưa phải những quyết định đã được chủ nghiên cứu phê duyệt.

- **YC**: yêu cầu được nêu trực tiếp trong tài liệu nguồn, đánh số để truy vết; các mã này không có sẵn trong bản gốc.
- **GĐ**: giả định dùng để viết bản nháp; có thể thay đổi sau khi chốt nghiệp vụ.
- **CĐ**: câu hỏi còn cần quyết định. Thông số chưa biết được ghi bằng tên cấu hình, không tự gán giá trị.

### 1.2. Thuật ngữ

| Thuật ngữ | Ý nghĩa trong tài liệu |
| --- | --- |
| Study | Một đợt nghiên cứu HCI với nội dung, tiêu chí tuyển mẫu và quy trình riêng. |
| Combination | Một tổ hợp điều kiện thí nghiệm cần được phân bổ đủ số người. Các yếu tố cấu thành chưa được mô tả trong nguồn. |
| Chỉ tiêu / quota | Số phiên hoàn tất hợp lệ cần thu được cho một combination hoặc nhóm tiêu chí. |
| pID | Mã người tham gia, có ánh xạ với email để mời, đối soát và trả thưởng. Đây là định danh giả danh, không phải dữ liệu vô danh tuyệt đối. |
| Session | Một phiên tham gia cụ thể, gắn với pID, study và combination. |
| Pre-study | Mô tả nghiên cứu và form trước phiên; câu trả lời phục vụ kiểm tra điều kiện và chọn combination. |
| Consent | Bản đồng thuận tham gia, có phiên bản và dấu vết xác nhận. Hình thức ký chưa được chốt. |
| Post-study | Form khảo sát sau khi hoàn thành phần xem video. |
| Telemetry | Các sự kiện và số đo phục vụ phân tích quá trình tham gia. |
| Lock / giữ suất | Quyền chiếm một suất của combination trong thời hạn nhất định; không phải khóa toàn bộ combination chỉ cho một người. |
| Lease / heartbeat | Thời hạn giữ suất và tín hiệu định kỳ cho biết phiên còn hoạt động. Đây là cơ chế đề xuất để thu hồi suất khi trình duyệt mất liên lạc. |

### 1.3. Giả định của bản nháp

| Mã | Giả định |
| --- | --- |
| GĐ-01 | Người tham gia truy cập qua lời mời gắn email. Cách xác minh quyền sở hữu email chưa chốt; không mặc định cần tài khoản và mật khẩu. Admin đã được xác thực và phân quyền. |
| GĐ-02 | Combination, quota, nội dung consent, form, quy tắc chọn, video và ngưỡng mạng được chuẩn bị trước. Màn hình CRUD cấu hình nghiên cứu nằm ngoài phạm vi bản nháp vì nguồn chưa yêu cầu. |
| GĐ-03 | Một pID chỉ có một phiên đang giữ suất trong cùng study; không tạo thêm pID chỉ vì người tham gia tải lại trang. |
| GĐ-04 | Người tham gia nhập ZIP đã được cung cấp để phát video trong phiên; ZIP phải đúng nội dung của combination được giao. Chưa xác định import diễn ra cục bộ hay upload máy chủ. |
| GĐ-05 | Người tham gia cung cấp QR sau khi hoàn tất; admin chuyển tiền bằng công cụ bên ngoài và ghi nhận kết quả trên web. Email cảm ơn có thể được gửi sau khi hoàn tất, không bắt buộc đợi trả thưởng. Chưa mặc định có API ngân hàng hoặc tự động gửi thư. |
| GĐ-06 | Suất được giữ từ khi phân bổ thành công đến khi hoàn tất post-study hoặc gián đoạn quá hạn; phiên chưa hoàn tất không tăng bộ đếm hoàn tất. |
| GĐ-07 | Mô tả nghiên cứu được đọc trước consent; chỉ thu câu trả lời nghiên cứu và telemetry tương ứng sau khi có consent hợp lệ. Dữ liệu vận hành tối thiểu để tiếp nhận lời mời được tách khỏi telemetry nghiên cứu. |
| GĐ-08 | “Không cho thoát” được diễn giải thành điều hướng có kiểm soát, cảnh báo khi phù hợp, ghi nhận gián đoạn và bảo vệ dữ liệu. Không đặt tiêu chí website phải ngăn tuyệt đối việc đóng trình duyệt. Cách dừng/rút khỏi nghiên cứu cần được chốt ở CĐ-08. |

## 2. Danh mục và truy vết yêu cầu

### 2.1. Danh mục use-case

| Mã | Tên | Tác nhân chính | Loại |
| --- | --- | --- | --- |
| UC-01 | Theo dõi chỉ tiêu combination | Admin | Mục tiêu người dùng |
| UC-02 | Mời tham gia qua email | Admin | Mục tiêu người dùng |
| UC-03 | Tiếp nhận lời mời và định danh | Người tham gia | Mục tiêu người dùng |
| UC-04 | Xem mô tả và khai pre-study | Người tham gia | Mục tiêu người dùng |
| UC-05 | Xác nhận đồng thuận | Người tham gia | Mục tiêu người dùng, được UC-04 include |
| UC-06 | Kiểm tra tốc độ tải | Người tham gia | Mục tiêu người dùng, được UC-08 include |
| UC-07 | Nhập gói video ZIP | Người tham gia | Mở rộng UC-08 |
| UC-08 | Tham gia phiên và xem video | Người tham gia | Mục tiêu người dùng |
| UC-09 | Phân bổ combination và giữ suất | Người tham gia, gián tiếp qua UC-08 | Chức năng dùng chung |
| UC-10 | Ghi và đồng bộ dữ liệu phiên | Người tham gia, gián tiếp qua UC-08/UC-12 | Chức năng dùng chung |
| UC-11 | Xử lý gián đoạn phiên | Người tham gia bị ảnh hưởng | Mở rộng UC-08/UC-12 |
| UC-12 | Khảo sát post-study và hoàn tất | Người tham gia | Mục tiêu người dùng |
| UC-13 | Cung cấp QR nhận thưởng | Người tham gia | Mục tiêu người dùng |
| UC-14 | Ghi nhận chuyển thưởng | Admin | Mục tiêu người dùng |
| UC-15 | Gửi email cảm ơn | Admin | Mục tiêu người dùng |

### 2.2. Ánh xạ với tài liệu nguồn

| Mã YC | Nội dung được chuẩn hóa từ nguồn | Use-case liên quan |
| --- | --- | --- |
| YC-01 | Web xem video dành cho học sinh tham gia HCI user study. | UC-08 |
| YC-02 | Biết mỗi combination/nhóm yêu cầu còn thiếu bao nhiêu người. | UC-01, UC-09 |
| YC-03 | Có mô tả pre-study; chọn combination theo thống kê và decision tree. | UC-04, UC-09 |
| YC-04 | Ký form đồng thuận tham gia. | UC-05 |
| YC-05 | Có form post-study và thu nhiều log/telemetry. | UC-10, UC-12 |
| YC-06 | Hạn chế thoát sau khi join session. | UC-08, UC-11; GĐ-08 |
| YC-07 | Đảm bảo lưu dữ liệu. | UC-03 đến UC-15 theo dữ liệu phát sinh; trọng tâm UC-10, UC-12 |
| YC-08 | Admin mời người tham gia qua email. | UC-02, UC-03 |
| YC-09 | Lưu ánh xạ pID ↔ email. | UC-03 |
| YC-10 | Kiểm soát đồng thời bằng lock; thoát giữa chừng thì nhả lock. | UC-09, UC-11, UC-12 |
| YC-11 | Có QR nhận tiền, chuyển thưởng và email cảm ơn. | UC-13, UC-14, UC-15 |
| YC-12 | Đo tốc độ download; mạng chậm thì đổi mạng; đủ tốc độ mới được vào. | UC-06, UC-08 |
| YC-13 | Import ZIP lên web để phát video. | UC-07, UC-08 |

## 3. Đặc tả chi tiết

### UC-01 — Theo dõi chỉ tiêu combination

| Thuộc tính | Đặc tả |
| --- | --- |
| Mục tiêu | Biết nhóm điều kiện nào còn thiếu người để hỗ trợ tuyển mẫu và phân bổ. |
| Tác nhân chính | Admin. |
| Kích hoạt | Admin mở bảng thống kê của một study. |
| Tiền điều kiện | Admin có quyền xem study; combination và chỉ tiêu đã được chuẩn bị. |
| Hậu điều kiện thành công | Hiển thị số liệu nhất quán tại một thời điểm xác định. |
| Bảo đảm khi thất bại | Không sửa quota hoặc dữ liệu phân bổ; không hiển thị số liệu lỗi như kết quả mới. |

**Luồng chính**

1. Admin chọn study cần theo dõi.
2. Hệ thống đọc chỉ tiêu, số phiên hoàn tất hợp lệ và số suất đang giữ còn hiệu lực của từng combination/nhóm tiêu chí.
3. Hệ thống tính số còn thiếu để đạt chỉ tiêu và số có thể nhận thêm ngay theo QĐ-01.
4. Hệ thống hiển thị kết quả, nhóm tiêu chí liên quan và thời điểm cập nhật.
5. Admin dùng số liệu để quyết định mời thêm người; UC-09 đọc lại số liệu tại thời điểm phân bổ.

**Luồng thay thế / ngoại lệ**

- A1 — Chưa có phiên: các bộ đếm bằng 0, vẫn hiển thị chỉ tiêu.
- E1 — Không đọc được dữ liệu: báo lỗi; nếu hiển thị bản cũ thì phải ghi rõ thời điểm và trạng thái chưa cập nhật.
- E2 — Không đủ quyền: từ chối truy cập study.

**Tiêu chí nghiệm thu:** Khi quota = 10, completed = 6 và active = 2 thì “còn thiếu để hoàn tất” = 4, “có thể nhận thêm” = 2. Gián đoạn hết hạn làm giảm active nhưng không làm tăng completed.

### UC-02 — Mời tham gia qua email

| Thuộc tính | Đặc tả |
| --- | --- |
| Mục tiêu | Gửi lời mời gắn với email để người nhận truy cập đúng study. |
| Tác nhân chính / phụ | Admin / Dịch vụ email. |
| Kích hoạt | Admin chọn gửi lời mời. |
| Tiền điều kiện | Admin có quyền mời; study có nội dung lời mời và đường dẫn tham gia. |
| Hậu điều kiện thành công | Lưu lời mời, người nhận và trạng thái được dịch vụ email chấp nhận gửi. |
| Bảo đảm khi thất bại | Không đánh dấu đã gửi nếu dịch vụ báo lỗi; lời mời không chiếm suất combination. |

**Luồng chính**

1. Admin nhập email người nhận và chọn study.
2. Hệ thống kiểm tra định dạng email, quyền gửi và lời mời hiện có.
3. Hệ thống tạo hoặc dùng lại lời mời hợp lệ, gắn email, study và thông tin truy cập được phép sử dụng.
4. Hệ thống gửi email qua dịch vụ email.
5. Hệ thống lưu trạng thái gửi, thời điểm và tham chiếu gửi nếu dịch vụ cung cấp.
6. Hệ thống thông báo kết quả cho admin.

**Luồng thay thế / ngoại lệ**

- A1 — Đã có lời mời: cho biết trạng thái; thao tác gửi lại dùng cùng hồ sơ người nhận, không tự tạo người tham gia mới.
- E1 — Email sai định dạng: yêu cầu sửa trước khi gửi.
- E2 — Dịch vụ từ chối hoặc timeout: lưu `failed` hoặc `unknown`; tra cứu/đối soát nếu có trước khi thử lại để hạn chế gửi trùng.

**Tiêu chí nghiệm thu:** Một yêu cầu gửi lặp lại với cùng mã thao tác không tạo hai bản ghi lời mời. Trạng thái “dịch vụ chấp nhận gửi” không được mô tả là người nhận đã đọc hoặc chắc chắn đã nhận thư.

### UC-03 — Tiếp nhận lời mời và định danh

| Thuộc tính | Đặc tả |
| --- | --- |
| Mục tiêu | Liên kết đúng người được mời với một pID ổn định. |
| Tác nhân chính | Người tham gia. |
| Kích hoạt | Người tham gia mở đường dẫn trong lời mời. |
| Tiền điều kiện | Có lời mời cho study; cơ chế xác minh được triển khai theo CĐ-01. |
| Hậu điều kiện thành công | Có ngữ cảnh truy cập hợp lệ và ánh xạ pID ↔ email được lưu. |
| Bảo đảm khi thất bại | Không cấp quyền vào phiên cho lời mời không hợp lệ; không tạo ánh xạ một phần hoặc pID trùng. |

**Luồng chính**

1. Người tham gia mở lời mời.
2. Hệ thống kiểm tra lời mời, study và bằng chứng truy cập gắn với email theo cơ chế đã chọn.
3. Hệ thống tìm hồ sơ tương ứng; tạo pID mới nếu chưa có hoặc dùng lại pID hiện hữu trong phạm vi định danh đã chốt.
4. Hệ thống lưu ánh xạ pID ↔ email và liên kết lời mời một cách nguyên tử.
5. Hệ thống đưa người tham gia đến bước hợp lệ tiếp theo dựa trên tiến trình đã lưu.

**Luồng thay thế / ngoại lệ**

- A1 — Mở lại hoặc tải lại: dùng cùng pID; không tạo phiên hoặc giữ suất ở bước này.
- E1 — Lời mời hết hiệu lực/không xác minh được: từ chối tham gia và hướng dẫn liên hệ admin.
- E2 — Hai yêu cầu tạo hồ sơ đồng thời: chỉ một ánh xạ được tạo; yêu cầu còn lại đọc lại bản ghi đó.
- E3 — Lưu thất bại: không báo định danh thành công; cho phép thử lại an toàn.

**Tiêu chí nghiệm thu:** Mở cùng lời mời nhiều lần không tạo nhiều pID. Người tham gia không truy cập được hồ sơ hoặc phiên của pID khác bằng cách sửa tham số URL.

### UC-04 — Xem mô tả và khai pre-study

| Thuộc tính | Đặc tả |
| --- | --- |
| Mục tiêu | Hiểu nghiên cứu và cung cấp thông tin cần cho kiểm tra điều kiện/chọn combination. |
| Tác nhân chính | Người tham gia. |
| Kích hoạt | Người tham gia vào bước pre-study sau UC-03. |
| Tiền điều kiện | Đã được định danh; có phiên bản mô tả, consent và form của study. |
| Hậu điều kiện thành công | Câu trả lời hợp lệ và phiên bản form được lưu; người tham gia sẵn sàng kiểm tra điều kiện vào phiên. |
| Bảo đảm khi thất bại | Không đánh dấu pre-study hoàn tất khi chưa lưu; không thu câu trả lời nghiên cứu khi chưa có consent hợp lệ. |

**Luồng chính**

1. Hệ thống hiển thị mô tả, hướng dẫn và các điều kiện tham gia được cung cấp cho study.
2. Người tham gia đọc nội dung và yêu cầu tiếp tục.
3. Hệ thống thực hiện UC-05 để có consent hợp lệ.
4. Hệ thống hiển thị form pre-study.
5. Người tham gia điền và nộp form.
6. Hệ thống kiểm tra các trường bắt buộc, lưu câu trả lời gắn pID, study và phiên bản form.
7. Hệ thống xác nhận đã lưu; dùng dữ liệu này làm đầu vào cho UC-09.

**Luồng thay thế / ngoại lệ**

- A1 — Đã có consent đúng phiên bản: UC-05 xác nhận lại trạng thái hợp lệ, không tạo bản ký trùng.
- A2 — Không đồng thuận: dừng luồng, không mở form nghiên cứu.
- E1 — Thiếu/sai dữ liệu: chỉ rõ trường cần sửa.
- E2 — Lưu thất bại: giữ nội dung đang nhập trong khả năng trình duyệt, hiển thị chưa lưu và cho phép gửi lại.

**Tiêu chí nghiệm thu:** Không thể nộp pre-study qua giao diện hoặc API khi thiếu consent. Bấm nộp nhiều lần chỉ tạo một phiên bản nộp hiện hành của cùng form theo chính sách sửa câu trả lời được chốt.

### UC-05 — Xác nhận đồng thuận

| Thuộc tính | Đặc tả |
| --- | --- |
| Mục tiêu | Ghi nhận người tham gia đồng ý với đúng nội dung đồng thuận. |
| Tác nhân chính | Người tham gia. |
| Kích hoạt | UC-04 yêu cầu kiểm tra/xác nhận consent. |
| Tiền điều kiện | Người tham gia đã định danh; có nội dung consent đang áp dụng. |
| Hậu điều kiện thành công | Có bản đồng thuận hợp lệ, gồm pID, study, phiên bản, thời điểm và bằng chứng xác nhận. |
| Bảo đảm khi thất bại | Không cho thực hiện phần nghiên cứu cần consent; không ghi nhận đồng ý thay người tham gia. |

**Luồng chính**

1. Hệ thống kiểm tra consent đã lưu có phù hợp study và phiên bản áp dụng hay không.
2. Nếu chưa có, hệ thống hiển thị đầy đủ nội dung và cách ký/xác nhận đã được nghiên cứu quy định.
3. Người tham gia chủ động xác nhận đồng ý và thực hiện thao tác ký nếu được yêu cầu.
4. Hệ thống kiểm tra dữ liệu xác nhận và lưu bản ghi consent.
5. Sau khi lưu thành công, hệ thống cho phép UC-04 tiếp tục.

**Luồng thay thế / ngoại lệ**

- A1 — Đã có consent hợp lệ: trả kết quả thành công bằng bản ghi đã có.
- A2 — Người tham gia từ chối: ghi trạng thái tối thiểu theo chính sách study và dừng; không giữ suất.
- E1 — Consent đổi phiên bản: yêu cầu xác nhận bản mới trước khi tiếp tục phần bị ảnh hưởng.
- E2 — Không lưu được bằng chứng: chưa cấp trạng thái đã đồng thuận.

**Tiêu chí nghiệm thu:** Bản ghi truy xuất được đúng phiên bản nội dung đã đồng ý. Chưa tự mặc định checkbox là đủ cho yêu cầu “ký”; hình thức này phải được quyết định tại CĐ-03.

### UC-06 — Kiểm tra tốc độ tải

| Thuộc tính | Đặc tả |
| --- | --- |
| Mục tiêu | Chỉ cho vào phiên khi tốc độ download đạt ngưỡng của study. |
| Tác nhân chính | Người tham gia. |
| Kích hoạt | Người tham gia kiểm tra mạng hoặc UC-08 bắt đầu kiểm tra điều kiện. |
| Tiền điều kiện | Đã hoàn tất pre-study và consent; có cấu hình đo, `minDownloadMbps` và thời hạn kết quả `speedResultTtl`. |
| Hậu điều kiện thành công | Kết quả đo gắn người tham gia, thời điểm và cấu hình; trạng thái đạt khi tốc độ ≥ ngưỡng. |
| Bảo đảm khi thất bại | Không giữ suất hoặc vào phiên khi kết quả thiếu, lỗi, hết hạn hoặc không đạt. |

**Luồng chính**

1. Hệ thống giải thích cần kiểm tra tốc độ trước khi vào phiên.
2. Người tham gia bắt đầu phép đo.
3. Hệ thống thực hiện tải kiểm tra theo phương pháp cấu hình, tránh dùng kết quả tải từ cache làm số đo mạng.
4. Hệ thống tính, lưu và hiển thị tốc độ cùng kết quả đạt/không đạt.
5. Khi đạt, UC-08 được phép tiếp tục; kết quả gần đây chỉ được dùng lại nếu còn hạn và vẫn phù hợp kết nối hiện tại theo chính sách study.

**Luồng thay thế / ngoại lệ**

- A1 — Tốc độ dưới ngưỡng: hướng dẫn chuyển mạng và đo lại; chưa phân bổ combination.
- A2 — Đổi mạng hoặc kết quả hết hạn trước khi vào phiên: yêu cầu đo lại theo cấu hình.
- E1 — Timeout/không tải được mẫu: ghi kết quả không xác định, không coi là đạt.

**Tiêu chí nghiệm thu:** Với ngưỡng cấu hình X Mbps, kết quả dưới X bị chặn, kết quả bằng X được chấp nhận. Có ZIP không được bỏ qua cổng kiểm tra tốc độ theo yêu cầu nguồn.

### UC-07 — Nhập gói video ZIP

| Thuộc tính | Đặc tả |
| --- | --- |
| Mục tiêu | Chuẩn bị nguồn video từ ZIP đúng với nội dung thí nghiệm được giao. |
| Tác nhân chính | Người tham gia, theo GĐ-04. |
| Kích hoạt | Người tham gia chọn nguồn ZIP tại điểm mở rộng “Chuẩn bị video” của UC-08. |
| Tiền điều kiện | Study hỗ trợ ZIP; đã đạt kiểm tra mạng; có combination và suất đang giữ hợp lệ. |
| Hậu điều kiện thành công | Video trong gói được kiểm tra, sẵn sàng phát và gắn với đúng phiên/combination. |
| Bảo đảm khi thất bại | Không phát nội dung chưa xác minh; không ghi đè tiến trình hoặc tự đổi combination. |

**Luồng chính**

1. Người tham gia chọn file ZIP được cung cấp.
2. Hệ thống kiểm tra định dạng và giới hạn dung lượng/số file/dung lượng sau giải nén theo cấu hình.
3. Hệ thống kiểm tra danh sách file, định danh/phiên bản nội dung và tính đầy đủ so với gói mà combination yêu cầu.
4. Hệ thống chuẩn bị video trong trình duyệt hoặc qua máy chủ theo phương án import được chốt.
5. Hệ thống kiểm tra khả năng phát và xác nhận nguồn ZIP sẵn sàng.
6. UC-08 tiếp tục bằng nguồn đã kiểm tra; telemetry ghi nhận nguồn là ZIP.

**Luồng thay thế / ngoại lệ**

- A1 — Hủy chọn file: quay lại chuẩn bị video, chưa đánh dấu đã xem.
- E1 — ZIP hỏng, thiếu/sai video hoặc vượt giới hạn: từ chối, nêu lỗi và cho chọn lại.
- E2 — Không hỗ trợ codec hoặc thiếu bộ nhớ/lưu trữ: chưa phát; cho dùng nguồn tải mạng nếu study cho phép.
- E3 — Giữ suất hết hạn trong khi nhập: chuyển UC-11; không bắt đầu phát bằng quyền giữ suất cũ.

**Tiêu chí nghiệm thu:** ZIP của combination khác bị từ chối. Nhập thành công không thay đổi yêu cầu đo mạng và không tự đánh dấu hoàn tất video. Hợp đồng cấu trúc gói còn chờ CĐ-06.

### UC-08 — Tham gia phiên và xem video

| Thuộc tính | Đặc tả |
| --- | --- |
| Mục tiêu | Thực hiện phần xem video đúng combination trong phiên được kiểm soát và có dữ liệu. |
| Tác nhân chính | Người tham gia. |
| Kích hoạt | Người tham gia chọn bắt đầu sau pre-study. |
| Tiền điều kiện | Lời mời/ngữ cảnh truy cập, consent và pre-study hợp lệ; study nhận người tham gia. |
| Hậu điều kiện thành công | Phần xem video đạt tiêu chí của study; tiến trình được lưu và chuyển đến UC-12. Suất vẫn được giữ đến khi hoàn tất hoặc gián đoạn quá hạn. |
| Bảo đảm khi thất bại | Không đánh dấu video/phiên hoàn tất sai; dữ liệu đã xác nhận lưu vẫn còn; suất được xử lý qua UC-11. |

**Luồng chính**

1. Hệ thống xác minh lại các điều kiện trước phiên ở phía máy chủ.
2. Hệ thống thực hiện UC-06; chỉ tiếp tục khi có kết quả tốc độ đạt và còn hiệu lực.
3. Hệ thống thực hiện UC-09 để nhận combination, session và quyền giữ suất hợp lệ.
4. Hệ thống bắt đầu UC-10 và cơ chế duy trì quyền giữ suất; chuẩn bị nguồn video đúng combination.
5. Tại điểm mở rộng “Chuẩn bị video”, nếu chọn ZIP thì thực hiện UC-07; nếu không thì dùng nguồn tải mạng được cấu hình.
6. Người tham gia xem video và thực hiện tương tác được quy trình nghiên cứu cho phép. Hệ thống chỉ mở các điều khiển mà study cho phép, không tự giả định được tua/đổi tốc độ.
7. Hệ thống ghi sự kiện, lưu mốc tiến trình và kiểm tra trạng thái giữ suất trong quá trình xem.
8. Khi đáp ứng tiêu chí hoàn thành phần video, hệ thống lưu kết quả và chuyển đến UC-12.

**Luồng thay thế / ngoại lệ**

- A1 — Người tham gia điều hướng khỏi quy trình: giao diện điều hướng có kiểm soát; cảnh báo dữ liệu chưa lưu nếu trình duyệt hỗ trợ; nếu vẫn rời đi thì thực hiện UC-11.
- A2 — Mở tab thứ hai: trả về trạng thái phiên đã tồn tại; không tạo suất hoặc quyền ghi chủ động thứ hai. Cơ chế chuyển quyền tab cần được quy định khi triển khai.
- E1 — Không còn combination phù hợp: không vào phần video, không giữ suất một phần.
- E2 — Video không phát hoặc buffering kéo dài: ghi lỗi, tạm dừng tiến trình; thử lại hoặc dùng ZIP nếu study cho phép.
- E3 — Mất mạng, hết hạn lock, đóng trang hoặc dừng phiên: thực hiện UC-11; không tiếp tục như một phiên hợp lệ bằng trạng thái cũ.

**Tiêu chí nghiệm thu:** Không phát phần thí nghiệm khi chưa có consent, kết quả mạng đạt và suất hợp lệ. Thay đổi bước bằng URL không vượt được kiểm tra phía máy chủ. Chưa hoàn tất video thì chưa được nộp post-study để hoàn tất phiên.

### UC-09 — Phân bổ combination và giữ suất

| Thuộc tính | Đặc tả |
| --- | --- |
| Mục tiêu | Chọn combination phù hợp mà không vượt chỉ tiêu khi nhiều người vào cùng lúc. |
| Tác nhân chính | Người tham gia, thông qua UC-08; bộ phân bổ là thành phần nội bộ. |
| Kích hoạt | UC-08 đã kiểm tra đủ điều kiện và yêu cầu phân bổ. |
| Tiền điều kiện | Có pre-study, decision tree, quota và kết quả mạng đạt; không có phiên chủ động khác của cùng pID trong study. |
| Hậu điều kiện thành công | Một session gắn một combination và một suất được giữ nguyên tử; lưu căn cứ phân bổ. |
| Bảo đảm khi thất bại | Không có suất mồ côi, không tăng active nếu session chưa được tạo thành công. |

**Luồng chính**

1. Hệ thống tìm phiên/suất còn hiệu lực của cùng pID để tránh cấp trùng.
2. Hệ thống đưa dữ liệu pre-study qua decision tree đã cấu hình để tìm các combination đủ điều kiện.
3. Hệ thống đọc số liệu hiện hành và chọn combination còn nhận thêm theo chính sách ưu tiên của study.
4. Trong thao tác nguyên tử, hệ thống kiểm tra lại còn suất, tạo session cùng quyền giữ suất và cập nhật số lượng active.
5. Hệ thống lưu combination, phiên bản quy tắc, thời hạn giữ suất và phiên bản quyền ghi `assignmentVersion`.
6. Hệ thống trả phiên cho UC-08 và bắt đầu duy trì lease khi trình duyệt còn hoạt động.

**Luồng thay thế / ngoại lệ**

- A1 — Đã có suất còn hiệu lực: trả lại phiên hiện hữu, không giữ thêm suất.
- A2 — Combination hết suất do yêu cầu đồng thời: đọc lại dữ liệu, chọn ứng viên hợp lệ khác theo cùng chính sách; không dùng số liệu dashboard đã cũ để vượt quota.
- E1 — Không đủ điều kiện hoặc mọi ứng viên đã đầy: thông báo lý do phù hợp, không phân bổ.
- E2 — Lỗi lưu/transaction: hoàn tác toàn bộ; thử lại với cùng mã thao tác không tạo phiên trùng.

**Tiêu chí nghiệm thu:** Khi còn đúng một suất và hai người yêu cầu cùng lúc, tối đa một người giữ được suất đó. Decision tree chưa cấu hình thì không tự chọn ngẫu nhiên để thay thế.

### UC-10 — Ghi và đồng bộ dữ liệu phiên

| Thuộc tính | Đặc tả |
| --- | --- |
| Mục tiêu | Lưu tiến trình, kết quả và telemetry với cơ chế xác nhận, gửi lại và chống trùng. |
| Tác nhân chính | Người tham gia, gián tiếp qua UC-08/UC-12; bộ ghi dữ liệu thuộc hệ thống. |
| Kích hoạt | Bắt đầu phiên, phát sinh sự kiện/mốc tiến trình hoặc chuẩn bị hoàn tất. |
| Tiền điều kiện | Có consent phù hợp, session/pID xác định và chính sách thu thập sự kiện của study. |
| Hậu điều kiện thành công | Máy chủ lưu bền vững và xác nhận các bản ghi được chấp nhận; tiến trình phản ánh dữ liệu đã lưu. |
| Bảo đảm khi thất bại | Không báo đã lưu đối với dữ liệu chưa được xác nhận; không xóa bản đã được máy chủ xác nhận. |

**Luồng chính**

1. Hệ thống phát sinh sự kiện với `eventId`, session, pID, combination, loại sự kiện, số thứ tự và thời điểm client.
2. Hệ thống đưa sự kiện vào hàng đợi gửi, cập nhật mốc tiến trình theo chính sách của study.
3. Client gửi dữ liệu theo đợt/mốc quan trọng; máy chủ xác thực quyền, định dạng và phiên bản phân bổ.
4. Máy chủ chống trùng theo định danh sự kiện, lưu dữ liệu và bổ sung thời điểm nhận ở máy chủ.
5. Máy chủ trả xác nhận cho những bản ghi đã lưu; client mới loại chúng khỏi hàng đợi chưa xác nhận.
6. Trước khi UC-12 hoàn tất, hệ thống đồng bộ các dữ liệu bắt buộc theo chính sách hoàn tất.

**Luồng thay thế / ngoại lệ**

- A1 — Mất mạng tạm thời: giữ hàng đợi trong phạm vi lưu trữ trình duyệt, hiển thị chưa đồng bộ; gửi lại khi có mạng/quyền hợp lệ.
- A2 — Gửi trùng hoặc sự kiện đến sai thứ tự: chống trùng và dùng sequence để phân tích, không cộng tiến trình hai lần.
- E1 — Dữ liệu sai/quá giới hạn: từ chối rõ bản ghi lỗi, không xác nhận cả đợt như đã lưu hết.
- E2 — Assignment đã hết hiệu lực: không cho ghi thay đổi tiến trình/completed bằng quyền cũ. Log muộn chỉ có thể được tiếp nhận như dữ liệu lịch sử gắn đúng phiên nếu chính sách cho phép.
- E3 — Hết dung lượng client hoặc máy chủ lỗi kéo dài: báo trạng thái chưa an toàn để tiếp tục; tạm dừng tại mốc phù hợp, không âm thầm bỏ dữ liệu bắt buộc.

**Tiêu chí nghiệm thu:** Một đợt gửi lại sau timeout không làm tăng số bản ghi logic. Máy chủ xác nhận dữ liệu chỉ sau khi lưu bền vững. Không cam kết khôi phục dữ liệu chỉ tồn tại trên client nếu trình duyệt bị đóng cưỡng bức hoặc xóa lưu trữ.

### UC-11 — Xử lý gián đoạn phiên

| Thuộc tính | Đặc tả |
| --- | --- |
| Mục tiêu | Bảo toàn tiến trình đã lưu, thu hồi suất không còn sử dụng và kiểm tra điều kiện nếu quay lại. |
| Tác nhân chính | Người tham gia bị ảnh hưởng; cơ chế timeout/thu hồi chạy bên trong hệ thống. |
| Kích hoạt | Điểm mở rộng “Gián đoạn” của UC-08/UC-12: mất kết nối, rời trang, hết lease hoặc chủ động dừng. |
| Tiền điều kiện | Có phiên đã giữ suất, đang chuẩn bị video, xem video hoặc làm post-study. |
| Hậu điều kiện thành công | Phiên tiếp tục hợp lệ trong thời gian cho phép, hoặc được ghi gián đoạn và nhả suất đúng một lần. |
| Bảo đảm khi thất bại | Không tự đánh dấu hoàn tất; dữ liệu đã lưu không bị xóa do nhả lock; không cho quyền cũ hoàn tất một suất đã cấp lại. |

**Luồng chính**

1. Khi phát hiện gián đoạn ở client, hệ thống cố lưu checkpoint/gửi dữ liệu còn lại và tạm dừng phần thí nghiệm nếu client còn chạy.
2. Nếu người tham gia dừng qua thao tác được study cho phép, máy chủ ghi gián đoạn và nhả suất ngay sau khi lưu trạng thái. Nếu mất liên lạc, máy chủ chờ hết `leaseTimeout` từ heartbeat hợp lệ cuối.
3. Khi quá hạn, máy chủ kiểm tra lại lease bằng dữ liệu hiện hành và chuyển phiên sang gián đoạn, vô hiệu quyền ghi chủ động, nhả suất một cách nguyên tử.
4. Hệ thống cập nhật thống kê; giữ dữ liệu lịch sử và dấu vết lý do gián đoạn.
5. Khi người tham gia quay lại, hệ thống đọc trạng thái máy chủ trước khi cho xem tiếp hoặc nộp form.
6. Nếu lease vẫn hợp lệ, xác minh quyền điều khiển tab rồi tiếp tục từ checkpoint được phép. Nếu đã nhả suất, chỉ tiếp tục khi chính sách nghiên cứu cho phép và đã giữ lại được suất phù hợp theo QĐ-04.

**Luồng thay thế / ngoại lệ**

- A1 — Chỉ chuyển tab/ẩn trang: lưu mốc khi có thể; không kết luận ngay là bỏ phiên chỉ từ sự kiện visibility.
- A2 — Đóng trình duyệt mà không gửi được thông báo: heartbeat hết hạn vẫn bảo đảm suất được thu hồi ở máy chủ.
- A3 — Quay lại sau khi suất đã cấp cho người khác: không tiếp tục bằng quyền cũ; nếu không còn suất hợp lệ thì chặn và hướng dẫn liên hệ admin.
- E1 — Tác vụ nhả suất chạy lặp hoặc đua với hoàn tất phiên: dùng trạng thái/phiên bản hiện hành để chỉ một chuyển trạng thái cuối có hiệu lực, không giảm active hai lần.

**Tiêu chí nghiệm thu:** Tắt trình duyệt không có callback vẫn nhả suất sau timeout cấu hình và chu kỳ xử lý `reclaimInterval`. Client hết hạn không thể nộp thành công để vượt quota. Dữ liệu đã lưu vẫn truy vết được sau thu hồi.

### UC-12 — Khảo sát post-study và hoàn tất

| Thuộc tính | Đặc tả |
| --- | --- |
| Mục tiêu | Thu khảo sát sau video và xác nhận một phiên hoàn tất hợp lệ. |
| Tác nhân chính | Người tham gia. |
| Kích hoạt | Phần video của UC-08 hoàn tất theo tiêu chí study. |
| Tiền điều kiện | Video đạt yêu cầu; session và quyền giữ suất còn hiệu lực; có form post-study. |
| Hậu điều kiện thành công | Khảo sát/dữ liệu bắt buộc đã lưu, session completed, suất được chuyển từ active sang completed và mở bước nhận thưởng theo chính sách. |
| Bảo đảm khi thất bại | Không tăng completed hoặc mở trạng thái hoàn tất khi dữ liệu bắt buộc chưa lưu; giữ trạng thái nộp có thể kiểm tra lại. |

**Luồng chính**

1. Hệ thống hiển thị form post-study đúng phiên bản; tiếp tục duy trì lease trong lúc trả lời.
2. Người tham gia điền và nộp khảo sát.
3. Hệ thống kiểm tra câu trả lời và lưu bản nộp gắn session.
4. Hệ thống thực hiện UC-10 để xác nhận các dữ liệu bắt buộc đã lưu theo `completionPolicy`.
5. Máy chủ kiểm tra lại tiêu chí video, bản nộp, trạng thái phiên, quyền giữ suất và dữ liệu bắt buộc.
6. Trong thao tác nguyên tử, hệ thống chuyển session sang completed, kết thúc giữ suất và cập nhật bộ đếm completed đúng một lần.
7. Hệ thống xác nhận hoàn tất; hiển thị bước UC-13 nếu phù hợp chính sách thưởng.

**Luồng thay thế / ngoại lệ**

- A1 — Khảo sát đã nộp nhưng dữ liệu bắt buộc chưa đủ: giữ trạng thái chờ đồng bộ, chưa tăng completed; không yêu cầu nhập lại câu trả lời đã lưu.
- A2 — Nhấn nộp lặp/mất phản hồi: đọc kết quả theo mã thao tác; trả lại kết quả hoàn tất trước đó nếu đã thành công.
- E1 — Câu trả lời chưa hợp lệ: chỉ rõ lỗi và cho sửa.
- E2 — Mất mạng hoặc lease hết hạn: UC-11 xử lý; dữ liệu form đã lưu được giữ nhưng không dùng để hoàn tất bằng quyền hết hạn.

**Tiêu chí nghiệm thu:** Gửi yêu cầu hoàn tất hai lần chỉ tăng completed một lần. Lỗi lưu khảo sát hoặc thiếu dữ liệu bắt buộc không tạo trạng thái completed. Lỗi trả thưởng/gửi cảm ơn sau đó không đảo ngược kết quả nghiên cứu đã hoàn tất.

### UC-13 — Cung cấp QR nhận thưởng

| Thuộc tính | Đặc tả |
| --- | --- |
| Mục tiêu | Cung cấp thông tin nhận tiền để admin đối soát và trả thưởng. |
| Tác nhân chính | Người tham gia. |
| Kích hoạt | Người tham gia mở bước nhận thưởng sau UC-12, theo GĐ-05. |
| Tiền điều kiện | Đã định danh; session completed và đủ điều kiện theo chính sách thưởng được chốt. |
| Hậu điều kiện thành công | QR/thông tin nhận thưởng được lưu đúng pID và hồ sơ thưởng, ở trạng thái chờ đối soát. |
| Bảo đảm khi thất bại | Không báo đã nhận QR khi chưa lưu; không tự xác nhận đã trả tiền chỉ vì có QR. |

**Luồng chính**

1. Hệ thống hiển thị hướng dẫn cung cấp QR cùng trạng thái thưởng.
2. Người tham gia nhập/tải QR theo hình thức được triển khai và kiểm tra bản xem trước.
3. Hệ thống kiểm tra định dạng, kích thước và các trường cần thiết theo cấu hình.
4. Người tham gia xác nhận thông tin.
5. Hệ thống lưu QR/thông tin đối soát, gắn pID và hồ sơ thưởng; thông báo đã tiếp nhận.

**Luồng thay thế / ngoại lệ**

- A1 — Sửa QR trước khi trả thưởng: lưu phiên bản mới và lịch sử để admin không dùng nhầm bản cũ.
- E1 — QR không đọc được hoặc thiếu thông tin: yêu cầu cung cấp lại; chưa chuyển trạng thái sang đã thanh toán.
- E2 — Hồ sơ đã trả thưởng: không tự sửa thông tin của giao dịch đã xác nhận; cách xử lý bổ sung cần admin đối soát.

**Tiêu chí nghiệm thu:** QR chỉ xuất hiện cho đúng người tham gia và admin có quyền. Tải QR không làm session mất trạng thái completed và không làm thưởng thành paid.

### UC-14 — Ghi nhận chuyển thưởng

| Thuộc tính | Đặc tả |
| --- | --- |
| Mục tiêu | Theo dõi trả thưởng đúng người và tránh ghi nhận/chuyển trùng. |
| Tác nhân chính | Admin. Việc chuyển tiền bên ngoài web theo GĐ-05. |
| Kích hoạt | Admin mở hồ sơ thưởng chờ xử lý. |
| Tiền điều kiện | Có quyền trả thưởng; hồ sơ đủ điều kiện, QR đã được đối soát và chưa có thanh toán thành công cho quyền lợi đó. |
| Hậu điều kiện thành công | Lưu kết quả trả thưởng, số tiền theo chính sách, thời điểm, admin thực hiện và tham chiếu/bằng chứng giao dịch. |
| Bảo đảm khi thất bại | Không đánh dấu paid nếu chưa xác nhận; kết quả không chắc chắn được giữ để đối soát, không tự chuyển lại. |

**Luồng chính**

1. Admin xem pID, điều kiện nhận thưởng, QR hiện hành và lịch sử xử lý.
2. Hệ thống cho một admin nhận xử lý hồ sơ, chặn xử lý song song theo QĐ-07.
3. Admin đối soát thông tin và chuyển tiền bằng công cụ thanh toán bên ngoài.
4. Admin nhập kết quả cùng tham chiếu/bằng chứng giao dịch.
5. Hệ thống lưu kết quả, đánh dấu paid khi có xác nhận thành công và ghi dấu vết thao tác.
6. Giao diện hiển thị kết quả cập nhật; email cảm ơn được thực hiện riêng ở UC-15.

**Luồng thay thế / ngoại lệ**

- A1 — QR sai/không hợp lệ: giữ chờ đối soát và yêu cầu cập nhật theo quy trình study.
- A2 — Giao dịch thất bại rõ ràng: lưu failed, cho xử lý lại sau khi kiểm tra.
- E1 — Đã chuyển tiền nhưng web chưa lưu được/không rõ kết quả: đánh dấu cần đối soát khi có thể; lần mở lại phải kiểm tra giao dịch cũ trước khi chuyển tiếp.
- E2 — Admin khác đã nhận xử lý hoặc đã trả: chặn thao tác trùng và hiển thị trạng thái hiện tại.

**Tiêu chí nghiệm thu:** Hai admin không đồng thời nhận quyền xử lý cùng hồ sơ. Web chống ghi nhận trùng; do chuyển tiền thủ công bên ngoài, việc tránh chuyển tiền thực tế hai lần còn cần bước đối soát, không thể cam kết chỉ bằng idempotency của web.

### UC-15 — Gửi email cảm ơn

| Thuộc tính | Đặc tả |
| --- | --- |
| Mục tiêu | Gửi lời cảm ơn đến người đã tham gia và lưu trạng thái gửi. |
| Tác nhân chính / phụ | Admin / Dịch vụ email. |
| Kích hoạt | Admin gửi cảm ơn cho hồ sơ đã hoàn tất; tự động hóa là lựa chọn chưa chốt. |
| Tiền điều kiện | Có session completed, email đối soát từ ánh xạ pID và mẫu thư đã chuẩn bị. |
| Hậu điều kiện thành công | Dịch vụ email chấp nhận gửi; lưu người nhận, mẫu thư, thời điểm và tham chiếu gửi. |
| Bảo đảm khi thất bại | Không thay đổi kết quả session hoặc thưởng; trạng thái gửi không được báo thành công sai. |

**Luồng chính**

1. Admin chọn gửi cảm ơn cho hồ sơ đủ điều kiện.
2. Hệ thống kiểm tra thư cảm ơn đã gửi/chờ gửi cho cùng study, pID và loại thư.
3. Hệ thống tạo nội dung từ mẫu và gửi qua dịch vụ email.
4. Hệ thống lưu trạng thái gửi và hiển thị kết quả.

**Luồng thay thế / ngoại lệ**

- A1 — Thư đã gửi: hiển thị trạng thái, không tự gửi thêm từ yêu cầu lặp.
- E1 — Dịch vụ lỗi/timeout: lưu failed hoặc unknown; xử lý đối soát trước khi gửi lại khi có thể.
- E2 — Không có email hợp lệ: báo admin đối soát hồ sơ, không gửi đến email suy đoán.

**Tiêu chí nghiệm thu:** Nộp hoàn tất/gửi cảm ơn lặp không tạo thư trùng từ cùng yêu cầu logic. Chỉ đưa thông tin “đã trả thưởng” vào thư khi hồ sơ thực sự paid.

## 4. Quy tắc nghiệp vụ và toàn vẹn dữ liệu đề xuất

### QĐ-01 — Quota và thống kê

Với mỗi combination c:

```text
missingToComplete(c) = max(target(c) - completed(c), 0)
availableToAssign(c) = max(target(c) - completed(c) - activeReservations(c), 0)
```

`completed` chỉ đếm phiên hoàn tất hợp lệ; `activeReservations` chỉ đếm suất chưa hoàn tất và còn hiệu lực, bao gồm thời gian chuẩn bị video và post-study theo GĐ-06. Mục tiêu của thao tác phân bổ là duy trì `completed + activeReservations <= target`. Không giảm quota xuống dưới số đã hoàn tất và đang giữ khi chưa có chính sách riêng.

Nếu một người đồng thời đáp ứng nhiều nhóm tiêu chí tuyển mẫu, các nhóm đó không mặc định là những suất độc lập có thể cộng dồn. Cần chốt cách combination tiêu thụ quota của từng nhóm ở CĐ-02; nếu có nhiều ràng buộc thì phải kiểm tra/cập nhật chúng trong cùng thao tác phân bổ.

### QĐ-02 — Chọn combination

Decision tree xác định tập ứng viên từ dữ liệu pre-study; chính sách phân bổ chọn trong tập này bằng thống kê hiện hành. Chưa quy định ưu tiên nhóm thiếu nhiều nhất, ngẫu nhiên hay thứ tự cố định. Phải lưu phiên bản quy tắc và kết quả chọn để truy vết. Lời mời không bảo đảm giữ sẵn một combination.

### QĐ-03 — Quyền giữ suất và ghi dữ liệu

Giữ suất, gia hạn, thu hồi và hoàn tất phải kiểm tra phiên bản/trạng thái hiện hành ở máy chủ. Chỉ một quyền điều khiển chủ động được phép cập nhật tiến trình của session. Hai tab không được tự dùng chung quyền để tiến triển đồng thời. Yêu cầu gửi lại phải có định danh để không lặp hiệu ứng.

Máy chủ xử lý hết hạn kể cả khi không nhận được thông báo đóng trang. `leaseTimeout`, `heartbeatInterval` và `reclaimInterval` cần được cấu hình, với thời hạn đủ chịu gián đoạn mạng ngắn; chưa có giá trị cụ thể trong nguồn.

### QĐ-04 — Quay lại sau gián đoạn

Trong lease hợp lệ, có thể tiếp tục theo checkpoint được quy trình study cho phép. Sau khi suất đã nhả, phải kiểm tra lại điều kiện mạng và giữ lại được suất trước khi tiếp tục. Khi người tham gia đã xem nội dung thí nghiệm, không tự đổi sang combination khác vì có thể ảnh hưởng dữ liệu nghiên cứu. Nếu không còn suất cùng combination hoặc study không cho resume thì dừng và chuyển đối soát. Mọi lần thử/khôi phục phải truy vết được bằng định danh phiên/quyền mới liên kết với lịch sử cũ.

### QĐ-05 — Hoàn tất

Chỉ completed khi đáp ứng tiêu chí video, có khảo sát hợp lệ và các dữ liệu bắt buộc được máy chủ xác nhận lưu. Điều kiện cụ thể nằm trong `completionPolicy`, cần chốt tại CĐ-07. Thay đổi completed và bộ đếm quota phải nguyên tử. QR, trả thưởng và gửi thư có trạng thái riêng; lỗi của chúng không làm mất kết quả nghiên cứu đã hoàn tất.

### QĐ-06 — Lưu dữ liệu và phạm vi telemetry

“Càng nhiều log càng tốt” được triển khai thành danh mục sự kiện được chọn cho study, phù hợp nội dung đồng thuận. Không mặc định thu mật khẩu, token, toàn bộ phím gõ, màn hình hoặc thông tin nhận tiền vào telemetry. Dữ liệu đã được máy chủ xác nhận phải được lưu bền vững; cơ chế backup/khôi phục và thời hạn lưu còn cần xác định. Hàng đợi trình duyệt là biện pháp hỗ trợ khi mất mạng, không phải bảo đảm dữ liệu tuyệt đối khi client bị xóa hoặc dừng cưỡng bức.

### QĐ-07 — Trả thưởng và gửi thư

Mỗi quyền lợi thưởng có định danh duy nhất, trạng thái và lịch sử đối soát. Nhận xử lý hồ sơ phải nguyên tử; hồ sơ đang xử lý nhưng chưa rõ kết quả không tự chuyển lại. Mỗi yêu cầu gửi thư có mã định danh; trạng thái dịch vụ chấp nhận gửi tách với giao thư/đã đọc. Điều kiện và mức thưởng chưa được ấn định.

### QĐ-08 — Giới hạn điều hướng của website

Website có thể kiểm tra quyền chuyển bước, cảnh báo dữ liệu chưa lưu và ghi nhận rời trang khi có tín hiệu. `beforeunload` dùng cho cảnh báo có giới hạn và không được phát tin cậy trong mọi tình huống, đặc biệt trên thiết bị di động. Vì vậy không lấy callback đóng trang làm điều kiện duy nhất để lưu dữ liệu hoặc nhả suất. Tham khảo: [MDN — beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event), [Chrome — Page Lifecycle API](https://developer.chrome.com/docs/web-platform/page-lifecycle-api).

## 5. Dữ liệu cần lưu ở mức nghiệp vụ

Đây là danh mục phân tích, chưa phải schema database hoặc quyết định công nghệ.

| Nhóm dữ liệu | Thuộc tính tối thiểu đề xuất | Use-case tạo/cập nhật |
| --- | --- | --- |
| Participant | pID, email, phạm vi định danh, thời điểm tạo. | UC-03 |
| Invitation | invitationId, studyId, email, trạng thái, thông tin xác minh dạng an toàn, thời hạn nếu có. | UC-02, UC-03 |
| Consent | pID, studyId, consentVersion, thời điểm, bằng chứng xác nhận/ký. | UC-05 |
| Pre-study response | pID, studyId, formVersion, câu trả lời, trạng thái nộp và thời điểm. | UC-04 |
| Combination/quota | combinationId, yếu tố điều kiện, tiêu chí, chỉ tiêu, phiên bản quy tắc. | Chuẩn bị trước; UC-01/UC-09 đọc và cập nhật số liệu liên quan |
| Speed check | pID, studyId, Mbps, thời điểm, cấu hình đo và kết quả đạt/không đạt/lỗi. | UC-06 |
| Session/reservation | sessionId, pID, studyId, combinationId, trạng thái, assignmentVersion, lease, heartbeat, checkpoint, lịch sử gián đoạn/khôi phục. | UC-08, UC-09, UC-11, UC-12 |
| Video source | sessionId, nguồn mạng/ZIP, định danh/phiên bản gói, kết quả kiểm tra; không mặc định lưu toàn bộ ZIP trên máy chủ. | UC-07, UC-08 |
| Telemetry | eventId, sessionId, pID, combinationId, sequence, eventType, clientTimestamp, serverReceivedAt, payload theo loại sự kiện. | UC-10 |
| Post-study response | sessionId, formVersion, câu trả lời, thời điểm và trạng thái nộp. | UC-12 |
| Reward | rewardId, pID, sessionId/studyId theo chính sách, QR/thông tin nhận tiền, trạng thái, người xử lý, số tiền và tham chiếu giao dịch. | UC-13, UC-14 |
| Email delivery | loại thư, người nhận, study/pID hoặc invitationId, mã thao tác, trạng thái, thời điểm, tham chiếu dịch vụ. | UC-02, UC-15 |

Ánh xạ email và thông tin nhận thưởng chỉ được xem bởi người tham gia tương ứng và admin có quyền. Telemetry dùng pID; việc xem dữ liệu theo pID không tự cấp quyền xem email/QR.

### Danh mục telemetry khởi điểm đề xuất

| Nhóm | Ví dụ sự kiện/số đo |
| --- | --- |
| Vòng đời phiên | session reserved/started, video phase completed, post-study submitted, session completed/interrupted/resumed. |
| Video | videoId, play/pause/ended, vị trí phát ở checkpoint, buffering, lỗi phát; seek/rate/volume chỉ khi có điều khiển tương ứng. |
| Điều kiện kỹ thuật | Kết quả đo tốc độ, nguồn mạng/ZIP, lỗi chuẩn bị nội dung, trạng thái online/offline. |
| Tương tác quy trình | Chuyển bước hợp lệ/bị chặn, trạng thái visible/hidden, nỗ lực điều hướng khi nhận biết được. |
| Chất lượng đồng bộ | Số đợt gửi lại, dữ liệu chưa xác nhận, lỗi gửi và thời điểm máy chủ tiếp nhận. |

Danh mục cuối, tần suất ghi và sự kiện nào bắt buộc cho completed cần được chốt; không coi tất cả ví dụ trên là dữ liệu bắt buộc đã được yêu cầu.

## 6. Trạng thái phiên đề xuất

| Trạng thái | Ý nghĩa | Có giữ suất? |
| --- | --- | --- |
| Chưa tạo session | Đang tiếp nhận lời mời, consent, pre-study hoặc đo tốc độ. | Không |
| reserved | Đã phân bổ; đang chuẩn bị nguồn video. | Có, khi lease còn hiệu lực |
| inProgress | Đang thực hiện phần xem video. | Có, khi lease còn hiệu lực |
| postStudy | Video đã đạt yêu cầu; đang khảo sát hoặc chờ đồng bộ dữ liệu bắt buộc. | Có, khi lease còn hiệu lực |
| interrupted | Đã dừng hoặc lease hết hạn và đã xử lý thu hồi. | Không |
| completed | Đã hoàn tất hợp lệ, đã chuyển active sang completed. | Không; đã tính vào chỉ tiêu hoàn tất |

Mất kết nối ngắn là tín hiệu vận hành, chưa lập tức chuyển `interrupted` nếu lease còn hiệu lực. Không cho chuyển trực tiếp từ `interrupted` sang `completed` bằng yêu cầu cũ. Việc khôi phục phải đi qua kiểm tra và quyền giữ suất mới theo QĐ-04.

## 7. Tình huống nghiệm thu xuyên suốt

| Mã | Tình huống | Kết quả mong đợi |
| --- | --- | --- |
| NT-01 | Luồng đầy đủ: mời → định danh → consent/pre-study → đo mạng → phân bổ → xem → post-study → QR → trả thưởng/cảm ơn. | Cùng pID xuyên suốt; phiên hoàn tất một lần; kết quả nghiên cứu, thưởng và email có trạng thái tách biệt. |
| NT-02 | Hai người tranh suất cuối. | Một người giữ được suất; người còn lại nhận kết quả hết suất/chọn ứng viên khác hợp lệ; không vượt quota. |
| NT-03 | Đóng trình duyệt khi đang xem hoặc làm post-study. | Suất được thu hồi sau timeout và chu kỳ xử lý; dữ liệu đã xác nhận vẫn còn. |
| NT-04 | Client cũ nộp sau khi suất đã thu hồi/cấp lại. | Không làm tăng completed bằng quyền cũ; chỉ lưu lịch sử nếu chính sách cho phép. |
| NT-05 | Mạng dưới ngưỡng, kể cả có ZIP. | Không được giữ suất/vào phiên; đổi mạng và đo lại. |
| NT-06 | Import ZIP sai combination hoặc hỏng. | Từ chối phát, không đổi combination và không đánh dấu hoàn tất. |
| NT-07 | Gửi trùng log/form/hoàn tất sau timeout. | Không tạo hiệu ứng trùng; trả lại kết quả đã lưu khi phù hợp. |
| NT-08 | Máy chủ lỗi khi lưu dữ liệu bắt buộc. | Giao diện chưa báo hoàn tất; dữ liệu đã xác nhận trước đó vẫn còn; cho kiểm tra/gửi lại. |
| NT-09 | Từ chối consent hoặc thử gọi thẳng API bỏ qua bước. | Không vào phần nghiên cứu cần consent, không giữ suất. |
| NT-10 | Hai tab hoặc hai admin cùng thao tác trên một tài nguyên. | Chỉ một quyền chủ động cho phiên; chỉ một người xử lý hồ sơ thưởng, không lặp hiệu ứng. |
| NT-11 | Email lỗi hoặc kết quả chuyển tiền chưa rõ. | Không báo thành công sai; đối soát trước khi thử lại; không ảnh hưởng completed. |

## 8. Các điểm cần chốt

| Mã | Nội dung cần quyết định | Ảnh hưởng |
| --- | --- | --- |
| CĐ-01 | Xác minh lời mời bằng link có token, OTP hay phương án khác? Lời mời có hết hạn không? pID duy nhất theo study hay toàn hệ thống? | UC-02, UC-03; chống tạo trùng và phạm vi định danh. |
| CĐ-02 | Combination gồm yếu tố nào? Chỉ tiêu theo combination hay nhiều nhóm chồng lấp? Decision tree và ưu tiên khi có nhiều ứng viên là gì? | UC-01, UC-09; công thức và tính nguyên tử của quota. |
| CĐ-03 | Nội dung consent, cách ký và quy trình cho học sinh cần hình thức xác nhận nào? Có thêm vai trò người giám hộ trong quy trình thực tế không? | UC-04, UC-05; chưa tự thêm actor người giám hộ khi nguồn chưa quy định. |
| CĐ-04 | Câu hỏi, kiểm tra hợp lệ, phiên bản và quyền sửa pre-study/post-study là gì? | UC-04, UC-12. |
| CĐ-05 | `minDownloadMbps`, cách đo, số lần đo, thời hạn kết quả và cách nhận biết thay đổi mạng là gì? | UC-06, UC-08; tiêu chí chặn vào phiên. |
| CĐ-06 | Ai nhập ZIP: người tham gia hay admin? Gói xử lý cục bộ hay upload? Cấu trúc, định danh/checksum, dung lượng và codec hỗ trợ? | UC-07; GĐ-04 có thể phải thay đổi. |
| CĐ-07 | Video nào, thứ tự nào, tương tác nào được phép và thế nào là xem đủ? Dữ liệu nào bắt buộc cho completed? Có được resume sau gián đoạn không? | UC-08, UC-10, UC-11, UC-12. |
| CĐ-08 | Mức hạn chế thoát mong muốn và quy trình dừng/rút khỏi study? `heartbeatInterval`, `leaseTimeout`, `reclaimInterval`? | UC-08, UC-11; cân bằng hạn chế điều hướng, gián đoạn thực tế và thu hồi suất. |
| CĐ-09 | Điều kiện/mức thưởng, quyền lợi cho phiên dừng giữa chừng, thời điểm lấy QR và cách đối soát? Chuyển tiền thủ công hay tích hợp? | UC-13, UC-14; chưa tự khẳng định chỉ completed mới có quyền lợi trong nghiệp vụ cuối. |
| CĐ-10 | Ai gửi thư cảm ơn, gửi lúc nào, tự động hay admin chủ động, có phụ thuộc trả thưởng không? | UC-15; mặc định bản nháp theo GĐ-05. |
| CĐ-11 | Danh mục/tần suất telemetry, quyền xem, thời hạn lưu, backup/khôi phục và mục tiêu mất dữ liệu/khôi phục chấp nhận được? | UC-10 và toàn bộ dữ liệu nghiên cứu. |

Những điểm CĐ không ngăn việc review cấu trúc use-case, nhưng cần được quyết định trước khi coi bản nháp là đặc tả triển khai cuối cùng.
