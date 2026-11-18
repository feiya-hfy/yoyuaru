// i18n.js — 言語切替（日本語 / English / 中文 / Tiếng Việt）
// ・キーは「日本語の原文」。日本語のときはキーをそのまま返す。
// ・{m} {n} のような {名前} は t(キー, {名前: 値}) で差し込む。
// ・言語を変えると保存して再読み込みする（動的に作る文言も含めて確実に切り替わるため）。
(function () {
    const STORE_KEY = "yoyu_aru_lang";
    const LANGS = [
        { code: "ja", label: "日本語", htmlLang: "ja" },
        { code: "en", label: "English", htmlLang: "en" },
        { code: "zh", label: "中文（简体）", htmlLang: "zh-Hans" },
        { code: "zh-TW", label: "繁體中文", htmlLang: "zh-Hant" },
        { code: "vi", label: "Tiếng Việt", htmlLang: "vi" }
    ];
    // [en, zh（簡体字）, vi, zh-TW（繁體字）]
    const D = {
        "余裕、ある？": ["Can I afford it?", "还有余裕吗？", "Còn dư dả không?", "還有餘裕嗎？"],
        "ペットと一緒に続ける家計簿アプリ": ["A budget app you keep up with your pet", "和宠物一起坚持的记账应用", "Ứng dụng quản lý chi tiêu cùng thú cưng", "和寵物一起堅持的記賬應用"],
        "保存する": ["Save", "保存", "Lưu", "儲存"],
        "あとで": ["Later", "稍后", "Để sau", "稍後"],
        "今月へ": ["This month", "回本月", "Tháng này", "回本月"],
        "予算が未設定です": ["No budget set", "尚未设置预算", "Chưa đặt ngân sách", "尚未設定預算"],
        "円": ["yen", "日元", "yên", "日元"],
        "保存": ["Save", "保存", "Lưu", "儲存"],
        "内訳": ["Breakdown", "明细", "Chi tiết", "明細"],
        "支出の記録": ["Expenses", "支出记录", "Lịch sử chi tiêu", "支出記錄"],
        "記録する": ["Add", "记一笔", "Ghi lại", "記一筆"],
        "詳細": ["Details", "详情", "Chi tiết", "詳情"],
        "閉じる": ["Close", "关闭", "Đóng", "關閉"],
        "グラフ": ["Charts", "图表", "Biểu đồ", "圖表"],
        "日別の支出": ["Daily spending", "每日支出", "Chi tiêu theo ngày", "每日支出"],
        "前月との比較": ["Vs. last month", "与上月对比", "So với tháng trước", "與上月對比"],
        "メニュー": ["Menu", "菜单", "Menu", "選單"],
        "ガチャ": ["Gacha", "扭蛋", "Quay gacha", "扭蛋"],
        "ショップ": ["Shop", "商店", "Cửa hàng", "商店"],
        "データ管理": ["Data", "数据管理", "Quản lý dữ liệu", "資料管理"],
        "カテゴリ設定": ["Categories", "分类设置", "Danh mục", "分類設定"],
        "pt 所持": ["pt owned", "pt 持有", "pt đang có", "pt 持有"],
        "ひく": ["Pull", "抽取", "Quay", "抽取"],
        "コレクション": ["Collection", "收藏", "Bộ sưu tập", "收藏"],
        "ログインや記録でためたポイントで、あたらしい仲間やお部屋が手に入ります。": ["Use the points you earn from logging in and recording to get new friends and rooms.", "用登录和记账攒下的积分，可以获得新伙伴和新房间。", "Dùng điểm tích lũy từ đăng nhập và ghi chép để nhận bạn mới và phòng mới.", "用登入和記賬攢下的積分，可以獲得新夥伴和新房間。"],
        "ガチャをひく": ["Pull gacha", "抽扭蛋", "Quay gacha", "抽扭蛋"],
        "まだ持っていないものだけが出ます（ダブりなし）。1回": ["Only items you don't own yet appear (no duplicates). Cost per pull:", "只会出现还没有的物品（不会重复）。每次", "Chỉ ra món bạn chưa có (không trùng). Mỗi lần", "只會出現還沒有的物品（不會重複）。每次"],
        "pt です。": ["pt.", "pt。", "pt.", "pt。"],
        "持っているものをタップすると切りかえられます。": ["Tap an item you own to switch to it.", "点击已拥有的物品即可切换。", "Chạm vào món bạn có để đổi.", "點選已擁有的物品即可切換。"],
        "ペット": ["Pets", "宠物", "Thú cưng", "寵物"],
        "部屋（マップ）": ["Rooms (maps)", "房间（地图）", "Phòng (bản đồ)", "房間（地圖）"],
        "すべてのアイテムを購入しました！": ["You've bought every item!", "已购买全部物品！", "Bạn đã mua hết mọi món!", "已購買全部物品！"],
        "支出を記録": ["Add expense", "记录支出", "Ghi chi tiêu", "記錄支出"],
        "金額 (円)": ["Amount (yen)", "金额（日元）", "Số tiền (yên)", "金額（日元）"],
        "カテゴリ": ["Category", "分类", "Danh mục", "分類"],
        "メモ（任意）": ["Note (optional)", "备注（可选）", "Ghi chú (tùy chọn)", "備註（可選）"],
        "日時": ["Date & time", "日期时间", "Ngày giờ", "日期時間"],
        "貯金プランナー": ["Savings planner", "储蓄规划", "Kế hoạch tiết kiệm", "儲蓄規劃"],
        "月収とほしいものの金額を入れると、あと何日で買えるかを計算します。支出は実際の記録から自動で見積もります。": ["Enter your monthly income and the price of what you want, and we'll calculate how long until you can buy it. Spending is estimated from your records.", "输入月收入和心愿物品的金额，就能算出还要多久才能买到。支出会根据实际记录自动估算。", "Nhập thu nhập hàng tháng và giá món bạn muốn, ứng dụng sẽ tính bao lâu nữa mua được. Chi tiêu được ước tính từ ghi chép thực tế.", "輸入月收入和心願物品的金額，就能算出還要多久才能買到。支出會根據實際記錄自動估算。"],
        "月収（手取り）": ["Monthly income (take-home)", "月收入（税后）", "Thu nhập tháng (thực nhận)", "月收入（稅後）"],
        "ほしいものの金額": ["Price of what you want", "心愿物品的金额", "Giá món bạn muốn", "心願物品的金額"],
        "月の支出": ["Monthly spending", "每月支出", "Chi tiêu hàng tháng", "每月支出"],
        "難易度を選ぶ": ["Choose difficulty", "选择难度", "Chọn độ khó", "選擇難度"],
        "かんたん": ["Easy", "简单", "Dễ", "簡單"],
        "ゆるく節約して貯める": ["Save gently", "轻松节约来攒钱", "Tiết kiệm nhẹ nhàng", "輕鬆節約來攢錢"],
        "ふつう": ["Normal", "普通", "Vừa", "普通"],
        "バランスよく節約する": ["Save in balance", "均衡地节约", "Tiết kiệm cân bằng", "均衡地節約"],
        "むずかしい": ["Hard", "困难", "Khó", "困難"],
        "しっかり節約して貯める": ["Save seriously", "认真节约来攒钱", "Tiết kiệm nghiêm túc", "認真節約來攢錢"],
        "シミュレーションする": ["Simulate", "开始模拟", "Mô phỏng", "開始模擬"],
        "新しいカテゴリを追加": ["Add a new category", "添加新分类", "Thêm danh mục mới", "新增新分類"],
        "カテゴリ名": ["Category name", "分类名称", "Tên danh mục", "分類名稱"],
        "キャンセル": ["Cancel", "取消", "Hủy", "取消"],
        "追加する": ["Add", "添加", "Thêm", "新增"],
        "更新する": ["Update", "更新", "Cập nhật", "更新"],
        "設定": ["Settings", "设置", "Cài đặt", "設定"],
        "効果音": ["Sound effects", "音效", "Âm thanh", "音效"],
        "振動（対応する端末のみ）": ["Vibration (supported devices only)", "振动（仅支持的设备）", "Rung (chỉ thiết bị hỗ trợ)", "振動（僅支援的裝置）"],
        "使い方をもう一度見る": ["View the guide again", "再看一遍使用方法", "Xem lại hướng dẫn", "再看一遍使用方法"],
        "バックアップ（CSV）": ["Backup (CSV)", "备份（CSV）", "Sao lưu (CSV)", "備份（CSV）"],
        "支出・予算・カテゴリ・貯金プラン・マイルーム（ポイント、ペット、家具、ガチャ）まで、すべてを1つのCSVにまとめて書き出します。読み込みでは、このCSVのほか、銀行・カード明細のCSVも自動で判別します。（レシートの写真とAPIキーは含まれません）": ["Exports everything — expenses, budgets, categories, savings plan and My Room (points, pets, furniture, gacha) — into one CSV. When importing, bank and card statement CSVs are detected automatically too. (Receipt photos and API keys are not included.)", "将支出、预算、分类、储蓄计划和我的房间（积分、宠物、家具、扭蛋）全部导出为一个CSV。导入时也会自动识别银行和信用卡账单的CSV。（不包含小票照片和API密钥）", "Xuất toàn bộ chi tiêu, ngân sách, danh mục, kế hoạch tiết kiệm và phòng của bạn (điểm, thú cưng, đồ nội thất, gacha) thành một CSV. Khi nhập, CSV sao kê ngân hàng/thẻ cũng được tự nhận diện. (Không gồm ảnh hóa đơn và khóa API)", "將支出、預算、分類、儲蓄計劃和我的房間（積分、寵物、傢俱、扭蛋）全部匯出為一個CSV。匯入時也會自動識別銀行和信用卡賬單的CSV。（不包含小票照片和API金鑰）"],
        "CSVを書き出す": ["Export CSV", "导出CSV", "Xuất CSV", "匯出CSV"],
        "CSVを読み込む": ["Import CSV", "导入CSV", "Nhập CSV", "匯入CSV"],
        "リセット": ["Reset", "重置", "Đặt lại", "重置"],
        "今月分の支出と予算だけを消すか、すべてのデータを消して初期状態に戻せます。元に戻せないのでご注意ください。": ["Delete only this month's spending and budget, or erase everything and start over. This cannot be undone.", "可以只删除本月的支出和预算，也可以清除全部数据恢复初始状态。此操作无法撤销，请谨慎。", "Chỉ xóa chi tiêu và ngân sách tháng này, hoặc xóa tất cả để bắt đầu lại. Không thể hoàn tác.", "可以只刪除本月的支出和預算，也可以清除全部資料恢復初始狀態。此操作無法撤銷，請謹慎。"],
        "今月のデータをリセット": ["Reset this month", "重置本月数据", "Đặt lại tháng này", "重置本月資料"],
        "全データをリセット": ["Reset all data", "重置全部数据", "Đặt lại toàn bộ", "重置全部資料"],
        "お迎えするペットを選んでね": ["Choose your pet", "选择要迎接的宠物", "Chọn thú cưng của bạn", "選擇要迎接的寵物"],
        "一緒に貯金をがんばる相棒を選ぼう。": ["Pick a buddy to save money with.", "选一位一起努力存钱的伙伴吧。", "Chọn một người bạn cùng tiết kiệm nhé.", "選一位一起努力存錢的夥伴吧。"],
        "ねこ": ["Cat", "猫咪", "Mèo", "貓咪"],
        "うさぎ": ["Rabbit", "兔子", "Thỏ", "兔子"],
        "ペットを選ぶと名前をつけられるよ": ["Choose a pet to give it a name", "选好宠物就能给它起名字", "Chọn thú cưng để đặt tên", "選好寵物就能給它起名字"],
        "ねこに名前をつけよう": ["Name your cat", "给猫咪起个名字", "Đặt tên cho mèo", "給貓咪起個名字"],
        "これから毎日、家計管理を応援してくれるよ。": ["It will cheer you on with your budget every day.", "它会每天为你的记账加油。", "Bé sẽ cổ vũ bạn quản lý chi tiêu mỗi ngày.", "它會每天為你的記賬加油。"],
        "名前": ["Name", "名字", "Tên", "名字"],
        "この名前にする": ["Use this name", "就叫这个名字", "Dùng tên này", "就叫這個名字"],
        "ログインボーナス！": ["Login bonus!", "登录奖励！", "Thưởng đăng nhập!", "登入獎勵！"],
        "今日も余裕、ある？": ["Still comfortable today?", "今天也还有余裕吗？", "Hôm nay còn dư dả không?", "今天也還有餘裕嗎？"],
        "ログインポイントを受け取ろう": ["Claim your login points", "领取登录积分", "Nhận điểm đăng nhập", "領取登入積分"],
        "受け取る": ["Claim", "领取", "Nhận", "領取"],
        "マイルーム編集": ["Edit My Room", "编辑我的房间", "Sửa phòng", "編輯我的房間"],
        "横にスワイプして部屋全体を確認。ドラッグで移動。": ["Swipe sideways to see the whole room. Drag to move.", "左右滑动查看整个房间，拖动可移动。", "Vuốt ngang để xem cả phòng. Kéo để di chuyển.", "左右滑動檢視整個房間，拖動可移動。"],
        "前へ": ["Forward", "移前", "Lên trước", "移前"],
        "後ろへ": ["Back", "移后", "Ra sau", "移後"],
        "持ち物へ": ["To items", "放回物品", "Cất vào túi", "放回物品"],
        "確定": ["Done", "确定", "Xong", "確定"],
        "持ち物": ["Items", "物品", "Đồ của bạn", "物品"],
        "所持ポイント": ["Points owned", "持有积分", "Điểm đang có", "持有積分"],
        "部屋を編集": ["Edit room", "编辑房间", "Sửa phòng", "編輯房間"],
        "前の月": ["Previous month", "上个月", "Tháng trước", "上個月"],
        "次の月": ["Next month", "下个月", "Tháng sau", "下個月"],
        "予算を編集": ["Edit budget", "编辑预算", "Sửa ngân sách", "編輯預算"],
        "支出を記録する": ["Record expenses", "记录支出", "Ghi chi tiêu", "記錄支出"],
        "例：週末のまとめ買い": ["e.g. weekend grocery run", "例：周末大采购", "VD: mua sắm cuối tuần", "例：週末大采購"],
        "例：交際費": ["e.g. Socializing", "例：社交费", "VD: Giao tiếp", "例：社交費"],
        "例：もち": ["e.g. Mochi", "例：麻糬", "VD: Mochi", "例：麻糬"],
        "品目（例：牛乳）": ["Item (e.g. milk)", "品名（例：牛奶）", "Món (VD: sữa)", "品名（例：牛奶）"],
        "{m}の予算": ["Budget for {m}", "{m}预算", "Ngân sách {m}", "{m}預算"],
        "{m}の内訳": ["Breakdown for {m}", "{m}明细", "Chi tiết {m}", "{m}明細"],
        "{m}のグラフ": ["Charts for {m}", "{m}图表", "Biểu đồ {m}", "{m}圖表"],
        "予算を決めよう": ["Set a budget", "先定个预算吧", "Hãy đặt ngân sách", "先定個預算吧"],
        "予算なし": ["No budget", "无预算", "Không có ngân sách", "無預算"],
        "残り": ["Left", "剩余", "Còn lại", "剩餘"],
        "超過": ["over", "超支", "vượt", "超支"],
        "今月の支出はまだ記録されていません": ["No expenses recorded this month yet", "本月还没有支出记录", "Tháng này chưa có chi tiêu nào", "本月還沒有支出記錄"],
        "{m}の支出は記録されていません": ["No expenses recorded for {m}", "{m}没有支出记录", "Không có chi tiêu nào trong {m}", "{m}沒有支出記錄"],
        "今月の支出はまだありません": ["No spending this month yet", "本月还没有支出", "Tháng này chưa có chi tiêu", "本月還沒有支出"],
        "{m}の支出はありません": ["No spending in {m}", "{m}没有支出", "Không có chi tiêu trong {m}", "{m}沒有支出"],
        "編集": ["Edit", "编辑", "Sửa", "編輯"],
        "削除": ["Delete", "删除", "Xóa", "刪除"],
        "不明": ["Unknown", "未知", "Không rõ", "未知"],
        "（名称なし）": ["(no name)", "（无名称）", "(không tên)", "（無名稱）"],
        "先に今月の予算を設定してね！": ["Set this month's budget first!", "先设置本月预算哦！", "Hãy đặt ngân sách tháng này trước nhé!", "先設定本月預算哦！"],
        "1円以上の予算を設定してね！": ["Set a budget of at least 1 yen!", "请设置至少1日元的预算！", "Hãy đặt ngân sách từ 1 yên trở lên!", "請設定至少1日元的預算！"],
        "{m}の予算を {v}円 にしたよ": ["Set the budget for {m} to ¥{v}", "已将{m}的预算设为 ¥{v}", "Đã đặt ngân sách {m} là ¥{v}", "已將{m}的預算設為 ¥{v}"],
        "{m}の予算を {a}円 から {b}円 に変更しますか？": ["Change the budget for {m} from ¥{a} to ¥{b}?", "要把{m}的预算从 ¥{a} 改为 ¥{b} 吗？", "Đổi ngân sách {m} từ ¥{a} thành ¥{b}?", "要把{m}的預算從 ¥{a} 改為 ¥{b} 嗎？"],
        "入力中の内容は保存されません。閉じますか？": ["What you've entered won't be saved. Close?", "输入的内容不会被保存。要关闭吗？", "Nội dung đang nhập sẽ không được lưu. Đóng?", "輸入的內容不會被儲存。要關閉嗎？"],
        "来月以降の日付は記録できません。日時を確認してください。": ["Dates in the future can't be recorded. Please check the date and time.", "不能记录未来的日期，请确认日期时间。", "Không thể ghi ngày trong tương lai. Hãy kiểm tra lại ngày giờ.", "不能記錄未來的日期，請確認日期時間。"],
        "更新した！": ["Updated!", "已更新！", "Đã cập nhật!", "已更新！"],
        "記録できた！100ptゲット。えらい": ["Recorded! +100pt. Well done!", "记好了！获得100pt。真棒！", "Đã ghi! +100pt. Giỏi lắm!", "記好了！獲得100pt。真棒！"],
        "カテゴリ名を入力してください。": ["Please enter a category name.", "请输入分类名称。", "Hãy nhập tên danh mục.", "請輸入分類名稱。"],
        "同じ名前のカテゴリが既にあります。": ["A category with that name already exists.", "已有同名分类。", "Đã có danh mục cùng tên.", "已有同名分類。"],
        "カテゴリは最低1つ必要です。": ["At least one category is required.", "至少需要保留一个分类。", "Cần ít nhất một danh mục.", "至少需要保留一個分類。"],
        "支出を編集": ["Edit expense", "编辑支出", "Sửa chi tiêu", "編輯支出"],
        "元に戻す": ["Undo", "撤销", "Hoàn tác", "撤銷"],
        "支出を削除しました": ["Expense deleted", "支出已删除", "Đã xóa chi tiêu", "支出已刪除"],
        "品目 {k}点・合計 {s}": ["{k} items · total {s}", "{k}项 · 合计 {s}", "{k} món · tổng {s}", "{k}項 · 合計 {s}"],
        "合計 {n}": ["Total {n}", "合计 {n}", "Tổng {n}", "合計 {n}"],
        "この月の支出はまだありません": ["No spending this month yet", "这个月还没有支出", "Tháng này chưa có chi tiêu", "這個月還沒有支出"],
        "この月のデータがありません": ["No data for this month", "这个月没有数据", "Không có dữ liệu tháng này", "這個月沒有資料"],
        "前月と比べられるデータがありません": ["Nothing to compare with last month", "没有可与上月对比的数据", "Không có dữ liệu để so với tháng trước", "沒有可與上月對比的資料"],
        "新規": ["New", "新增", "Mới", "新增"],
        "空欄なら、直近3か月の記録から {n} を使います。": ["If left blank, we'll use {n} based on your last 3 months.", "留空则按最近3个月的记录使用 {n}。", "Nếu để trống sẽ dùng {n} dựa trên 3 tháng gần nhất.", "留空則按最近3個月的記錄使用 {n}。"],
        "※月ごとに大体の支出で良いです。": ["* A rough monthly amount is fine.", "※大致的每月支出即可。", "* Chỉ cần số chi tiêu hàng tháng ước chừng.", "※大致的每月支出即可。"],
        "節約できるところ": ["Where you can save", "可以节约的地方", "Có thể tiết kiệm ở đâu", "可以節約的地方"],
        "いまの支出の{p}%。1割減らすと {d} 日 早まります。": ["{p}% of your spending. Cutting 10% gets you there {d} days sooner.", "占目前支出的{p}%。减少一成可提前 {d} 天。", "Chiếm {p}% chi tiêu. Giảm 10% sẽ sớm hơn {d} ngày.", "佔目前支出的{p}%。減少一成可提前 {d} 天。"],
        "シミュレーション結果": ["Simulation result", "模拟结果", "Kết quả mô phỏng", "模擬結果"],
        "目標金額 {n} を貯めるには…": ["To save {n}…", "要攒够 {n}…", "Để tiết kiệm {n}…", "要攢夠 {n}…"],
        "約 {p}": ["About {p}", "约 {p}", "Khoảng {p}", "約 {p}"],
        "で達成できます！": ["to reach your goal!", "即可达成！", "là đạt mục tiêu!", "即可達成！"],
        "毎月の貯金額": ["Monthly savings", "每月储蓄额", "Tiết kiệm mỗi tháng", "每月儲蓄額"],
        "自由に使えるお金": ["Spendable money", "可自由支配的钱", "Tiền được tiêu tự do", "可自由支配的錢"],
        "達成予定日": ["Target date", "预计达成日", "Ngày dự kiến", "預計達成日"],
        "アドバイス": ["Advice", "建议", "Lời khuyên", "建議"],
        "貯金プラン": ["Savings plan", "储蓄计划", "Kế hoạch tiết kiệm", "儲蓄計劃"],
        "解除": ["Clear", "解除", "Hủy", "解除"],
        "目標達成！おめでとう！": ["Goal reached! Congratulations!", "目标达成！恭喜！", "Đạt mục tiêu! Chúc mừng!", "目標達成！恭喜！"],
        "あと {n}（{p}%）・予定日 {d}": ["{n} to go ({p}%) · target {d}", "还差 {n}（{p}%）· 预计 {d}", "Còn {n} ({p}%) · dự kiến {d}", "還差 {n}（{p}%）· 預計 {d}"],
        "月収（手取り）を入力してください。": ["Please enter your monthly income.", "请输入月收入（税后）。", "Hãy nhập thu nhập hàng tháng.", "請輸入月收入（稅後）。"],
        "ほしいものの金額を入力してください。": ["Please enter the price of what you want.", "请输入心愿物品的金额。", "Hãy nhập giá món bạn muốn.", "請輸入心願物品的金額。"],
        "月の支出が収入を上回っています。まず支出を減らす必要があります。": ["Your monthly spending exceeds your income. You need to cut spending first.", "每月支出超过了收入，需要先减少支出。", "Chi tiêu hàng tháng vượt thu nhập. Cần giảm chi tiêu trước.", "每月支出超過了收入，需要先減少支出。"],
        "収入の {p}% を貯金に回す計算です。かなり厳しいので、期間を長めに考えましょう。": ["This means saving {p}% of your income. That's tough — consider a longer timeline.", "相当于把收入的 {p}% 用来储蓄，相当吃力，建议把期限放长一些。", "Nghĩa là dành {p}% thu nhập để tiết kiệm. Khá khó, hãy cân nhắc kéo dài thời gian.", "相當於把收入的 {p}% 用來儲蓄，相當吃力，建議把期限放長一些。"],
        "{a}か月{b}日": ["{a} mo {b} d", "{a}个月{b}天", "{a} tháng {b} ngày", "{a}個月{b}天"],
        "{a}か月": ["{a} months", "{a}个月", "{a} tháng", "{a}個月"],
        "{a}日": ["{a} days", "{a}天", "{a} ngày", "{a}天"],
        "{y}年{m}月{d}日": ["{m}/{d}/{y}", "{y}年{m}月{d}日", "{d}/{m}/{y}", "{y}年{m}月{d}日"],
        "まずは「今月の内訳」で一番大きいカテゴリを確認してみましょう。": ["Start by checking the biggest category in this month's breakdown.", "先看看本月明细里占比最大的分类吧。", "Hãy xem danh mục lớn nhất trong chi tiết tháng này.", "先看看本月明細裡佔比最大的分類吧。"],
        "このペースだと、約 {p} で「{d}」に買えます。": ["At this pace you can buy it in about {p}, on {d}.", "按这个节奏，约 {p} 后（{d}）就能买到。", "Với tốc độ này, khoảng {p} nữa ({d}) bạn mua được.", "按這個節奏，約 {p} 後（{d}）就能買到。"],
        "1か月以内に手が届きます。もう少しだけ踏ん張ってみましょう。": ["It's within reach in a month. Hang in there a little longer.", "一个月内就能实现，再坚持一下吧。", "Chỉ trong một tháng là tới. Cố thêm chút nữa!", "一個月內就能實現，再堅持一下吧。"],
        "1年以上かかる計算です。目標金額を分けて、小さな目標から達成するのもおすすめです。": ["This would take over a year. Try splitting the goal into smaller ones.", "预计需要一年以上。建议把目标拆成几个小目标逐个达成。", "Sẽ mất hơn một năm. Hãy chia mục tiêu thành các mục tiêu nhỏ.", "預計需要一年以上。建議把目標拆成幾個小目標逐個達成。"],
        "「{c}」を1割（約 {n}/月）減らすと、{d} 日早まります。": ["Cutting “{c}” by 10% (about {n}/mo) gets you there {d} days sooner.", "把“{c}”减少一成（约 {n}/月），可提前 {d} 天。", "Giảm “{c}” 10% (khoảng {n}/tháng) sẽ sớm hơn {d} ngày.", "把“{c}”減少一成（約 {n}/月），可提前 {d} 天。"],
        "まだ支出の記録が少ないので、支出額は手入力の値を使っています。記録が増えると精度が上がります。": ["There are few records yet, so your typed-in spending is used. Accuracy improves as you record more.", "支出记录还不多，因此使用了手动输入的支出额。记录越多越准确。", "Chưa có nhiều ghi chép nên dùng số chi tiêu bạn nhập. Ghi càng nhiều càng chính xác.", "支出記錄還不多，因此使用了手動輸入的支出額。記錄越多越準確。"],
        "ポイントが足りません": ["Not enough points", "积分不足", "Không đủ điểm", "積分不足"],
        "すべて集めました！": ["You've collected everything!", "已全部集齐！", "Bạn đã sưu tập đủ!", "已全部集齊！"],
        "コンプリート！ すべてのペットと部屋を集めました。": ["Complete! You've collected every pet and room.", "全部集齐！已获得所有宠物和房间。", "Hoàn tất! Bạn đã có mọi thú cưng và phòng.", "全部集齊！已獲得所有寵物和房間。"],
        "まだ出会っていないもの：あと {r} / {t} 種": ["Not met yet: {r} / {t} left", "还没遇见的：还剩 {r} / {t} 种", "Chưa gặp: còn {r} / {t} loại", "還沒遇見的：還剩 {r} / {t} 種"],
        "コンプリート済み": ["Completed", "已集齐", "Đã hoàn tất", "已集齊"],
        "あと {n}pt でひけます。ログインや記録でためよう！": ["{n}pt more to pull. Earn points by logging in and recording!", "再差 {n}pt 就能抽了。登录和记账可以攒积分！", "Còn {n}pt nữa để quay. Đăng nhập và ghi chép để tích điểm!", "再差 {n}pt 就能抽了。登入和記賬可以攢積分！"],
        "ガチャをひく（{n}pt）": ["Pull gacha ({n}pt)", "抽扭蛋（{n}pt）", "Quay gacha ({n}pt)", "抽扭蛋（{n}pt）"],
        "つかっている": ["In use", "使用中", "Đang dùng", "使用中"],
        "ガチャで手に入るよ": ["Get it from the gacha!", "可以通过扭蛋获得哦", "Có thể nhận từ gacha!", "可以透過扭蛋獲得哦"],
        "ガチャッ…": ["Click…", "咔嗒…", "Tách…", "咔嗒…"],
        "名前をつけよう": ["Give it a name", "给它起个名字", "Hãy đặt tên", "給它起個名字"],
        "この子といっしょにくらす": ["Live with this one", "和它一起生活", "Sống cùng bé này", "和它一起生活"],
        "この部屋にお引っこし": ["Move into this room", "搬进这个房间", "Chuyển vào phòng này", "搬進這個房間"],
        "あとで（コレクションに入れる）": ["Later (add to collection)", "稍后（放入收藏）", "Để sau (thêm vào bộ sưu tập)", "稍後（放入收藏）"],
        "ノーマル": ["Normal", "普通", "Thường", "普通"],
        "レア": ["Rare", "稀有", "Hiếm", "稀有"],
        "スーパーレア": ["Super rare", "超稀有", "Siêu hiếm", "超稀有"],
        "購入": ["Buy", "购买", "Mua", "購買"],
        "ショップで家具を購入すると、ここに表示されます": ["Furniture you buy in the shop will show up here", "在商店购买的家具会显示在这里", "Đồ nội thất mua ở cửa hàng sẽ hiện ở đây", "在商店購買的傢俱會顯示在這裡"],
        "使い方": ["How to use", "使用方法", "Cách dùng", "使用方法"],
        "はじめる": ["Start", "开始", "Bắt đầu", "開始"],
        "予算を入れる": ["Set a budget", "设置预算", "Đặt ngân sách", "設定預算"],
        "支出を記録する": ["Record expenses", "记录支出", "Ghi chi tiêu", "記錄支出"],
        "記録でポイント → ペットの部屋へ": ["Earn points → pet's room", "记账得积分 → 去宠物房间", "Ghi chép lấy điểm → phòng thú cưng", "記賬得積分 → 去寵物房間"],
        "メニューからCSVで保存": ["Save as CSV from the menu", "在菜单里导出CSV保存", "Lưu CSV từ menu", "在選單裡匯出CSV儲存"],
        "これ以上前に出せません": ["Can't bring it further forward", "已经不能再往前了", "Không thể đưa lên nữa", "已經不能再往前了"],
        "これ以上後ろに下げられません": ["Can't send it further back", "已经不能再往后了", "Không thể đưa xuống nữa", "已經不能再往後了"],
        "スペシャル": ["Special", "特别", "Đặc biệt", "特別"],
        "スペシャルペットが仲間に！": ["A special pet joins you!", "特别宠物成为伙伴啦！", "Thú cưng đặc biệt đã gia nhập!", "特別寵物成為夥伴啦！"],
        "好感度が100になりました": ["Affection reached 100", "好感度达到了100", "Độ yêu thích đã đạt 100", "好感度達到了100"],
        "ガチャ → コレクションから、いつでも切りかえられます": ["Switch to it anytime from Gacha → Collection", "可以随时在 扭蛋 → 收藏 中切换", "Bạn có thể đổi bất cứ lúc nào ở Gacha → Bộ sưu tập", "可以隨時在 扭蛋 → 收藏 中切換"],
        "記録でポイント → ガチャ・ショップへ": ["Earn points → gacha & shop", "记账得积分 → 去扭蛋和商店", "Ghi chép lấy điểm → gacha & cửa hàng", "記賬得積分 → 去扭蛋和商店"],
        "肉球ボタンでマイルームを隠す／表示": ["Paw button hides / shows My Room", "用肉球按钮隐藏／显示我的房间", "Nút chân mèo ẩn / hiện phòng của bạn", "用肉球按鈕隱藏／顯示我的房間"],
        "1つの記録＝1ポイント。100まで貯めるといいことが起きるよ！": ["1 record = 1 point. Reach 100 and something good happens!", "1条记录＝1点。攒到100会有好事发生哦！", "1 ghi chép = 1 điểm. Đạt 100 sẽ có điều tốt đẹp!", "1條記錄＝1點。攢到100會有好事發生哦！"],
        "すべてリセットしますか？": ["Reset everything?", "要全部重置吗？", "Đặt lại toàn bộ?", "要全部重置嗎？"],
        "予算・記録・マイルームのデータがすべて消えます": ["Your budget, records and My Room data will all be erased", "预算、记录和我的房间的数据将全部清除", "Toàn bộ ngân sách, ghi chép và dữ liệu phòng sẽ bị xóa", "預算、記錄和我的房間的資料將全部清除"],
        "元に戻せません": ["This can't be undone", "无法恢复", "Không thể hoàn tác", "無法恢復"],
        "リセットする": ["Reset", "重置", "Đặt lại", "重置"],
        "マイルームを隠す／表示": ["Hide / show My Room", "隐藏／显示我的房间", "Ẩn / hiện phòng của bạn", "隱藏／顯示我的房間"],
        "レシートから自動入力": ["Fill in from a receipt", "从小票自动填写", "Tự điền từ hóa đơn", "從小票自動填寫"],
        "APIキーなしで1日1回まで無料。画像は読み取りだけに使い、保存しません。": ["Free once a day, no API key needed. The photo is used only for reading and isn't stored.", "无需API密钥，每天可免费使用1次。照片只用于识别，不会被保存。", "Miễn phí 1 lần mỗi ngày, không cần khóa API. Ảnh chỉ dùng để đọc và không được lưu.", "無需API金鑰，每天可免費使用1次。照片只用於識別，不會被儲存。"],
        "無料の読み取りは、いま準備中です。手入力をお使いください。": ["Free scanning isn't available yet. Please enter it manually.", "免费识别功能正在准备中，请先手动输入。", "Tính năng đọc miễn phí đang được chuẩn bị. Hãy nhập tay.", "免費識別功能正在準備中，請先手動輸入。"],
        "今日の無料読み取りは使い切りました。明日また使えます。": ["You've used today's free scan. Try again tomorrow.", "今天的免费识别次数已用完，明天可以再用。", "Bạn đã dùng hết lượt đọc miễn phí hôm nay. Mai dùng lại nhé.", "今天的免費識別次數已用完，明天可以再用。"],
        "読み取りがタイムアウトしました。通信環境を確認して、もう一度試してください。": ["The scan timed out. Check your connection and try again.", "识别超时了，请检查网络后再试一次。", "Đọc bị quá thời gian. Hãy kiểm tra kết nối và thử lại.", "識別超時了，請檢查網路後再試一次。"],
        "通信できませんでした。オフラインか、接続が制限されている可能性があります。": ["Couldn't connect. You may be offline or the connection is restricted.", "无法连接。可能处于离线状态，或网络受限。", "Không kết nối được. Có thể bạn đang offline hoặc kết nối bị hạn chế.", "無法連線。可能處於離線狀態，或網路受限。"],
        "応答を解釈できませんでした。": ["Couldn't understand the response.", "无法解析返回结果。", "Không hiểu được phản hồi.", "無法解析返回結果。"],
        "画像を準備しています…": ["Preparing the image…", "正在处理图片…", "Đang chuẩn bị ảnh…", "正在處理圖片…"],
        "レシートを読み取っています…": ["Reading the receipt…", "正在识别小票…", "Đang đọc hóa đơn…", "正在識別小票…"],
        "（手入力はそのまま使えます）": [" (Manual entry still works.)", "（仍可手动输入）", " (Vẫn có thể nhập tay.)", "（仍可手動輸入）"],
        "読み取り結果を反映しました。内容を確認してください。": ["Filled in from the receipt. Please check the details.", "已填入识别结果，请确认内容。", "Đã điền từ hóa đơn. Hãy kiểm tra lại.", "已填入識別結果，請確認內容。"],
        "読み取りに失敗しました。": ["The scan failed.", "识别失败了。", "Đọc không thành công.", "識別失敗了。"],
        "品目（明細・任意）": ["Items (optional)", "品项（明细・可选）", "Món hàng (không bắt buộc)", "品項（明細・選填）"],
        "品目を追加": ["Add item", "添加品项", "Thêm món", "新增品項"],
        "合計を金額に入れる": ["Use total as amount", "把合计填入金额", "Dùng tổng làm số tiền", "把合計填入金額"],
        "日付": ["Date", "日期", "Ngày", "日期"],
        "この支出を削除": ["Delete this expense", "删除这笔支出", "Xóa khoản chi này", "刪除這筆支出"],
        "この支出を削除しますか？": ["Delete this expense?", "要删除这笔支出吗？", "Xóa khoản chi này?", "要刪除這筆支出嗎？"],
        "この支出を履歴から削除します。": ["This removes the expense from your history.", "这笔支出将从记录中删除。", "Khoản chi này sẽ bị xóa khỏi lịch sử.", "這筆支出將從記錄中刪除。"],
        "削除した直後は、画面下の「元に戻す」で取り消せます。": ["Right after deleting, you can undo it with “Undo” at the bottom of the screen.", "删除后马上可以用屏幕下方的“撤销”恢复。", "Ngay sau khi xóa, bạn có thể hoàn tác bằng “Hoàn tác” ở cuối màn hình.", "刪除後馬上可以用畫面下方的「復原」取消。"],
        "削除する": ["Delete", "删除", "Xóa", "刪除"],
        "支出を更新しました": ["Expense updated", "已更新支出", "Đã cập nhật khoản chi", "已更新支出"],
        "+{p}pt 獲得": ["+{p} pt earned", "获得 +{p} 点", "Nhận +{p} điểm", "獲得 +{p} 點"],
        "好感度 +{a}": ["Affection +{a}", "好感度 +{a}", "Thân thiết +{a}", "好感度 +{a}"],
        "ドラッグで並び替え": ["Drag to reorder", "拖动排序", "Kéo để sắp xếp", "拖曳排序"],
        "明細と合計が一致していません。確認チェックを入れてから保存してください。": ["Items and total don't match. Tick the confirmation box before saving.", "明细与合计不一致。请先勾选确认再保存。", "Món hàng và tổng không khớp. Hãy đánh dấu xác nhận rồi lưu.", "明細與合計不一致。請先勾選確認再儲存。"],
        "来月以降の日付は記録できません。日付を確認してください。": ["Dates in future months can't be recorded. Please check the date.", "不能记录下个月以后的日期。请确认日期。", "Không thể ghi ngày của tháng sau. Hãy kiểm tra lại ngày.", "不能記錄下個月以後的日期。請確認日期。"],
        "（今日はあと{n}回）": [" ({n} left today)", "（今天还剩 {n} 次）", " (Hôm nay còn {n} lần)", "（今天還剩 {n} 次）"],
        "APIキーが設定されていません。": ["No API key is set.", "尚未设置 API 密钥。", "Chưa đặt khóa API.", "尚未設定 API 金鑰。"],
        "黄色で示した行の金額を確認してください。": ["Please check the amounts in the highlighted rows.", "请确认黄色标出的行的金额。", "Hãy kiểm tra số tiền ở các dòng được tô vàng.", "請確認黃色標示的列的金額。"],
        "明細と合計が一致しないことを確認しました": ["I've checked that the items and total don't match", "我已确认明细与合计不一致", "Tôi đã xác nhận món hàng và tổng không khớp", "我已確認明細與合計不一致"],
        "品目の合計とレシートの合計が一致しました": ["Item total matches the receipt total", "品项合计与小票合计一致", "Tổng món hàng khớp với tổng hóa đơn", "品項合計與收據合計一致"],
        "この行を削除": ["Remove this row", "删除这一行", "Xóa dòng này", "刪除這一列"],
        "APIキーは不要です。1日に読み取れる回数には上限があります。読み取った画像は、この端末の中にだけ保存されます。": ["No API key needed. There's a daily limit on scans. Scanned images are saved only on this device.", "无需 API 密钥。每天可识别的次数有上限。识别过的图片只保存在本设备中。", "Không cần khóa API. Mỗi ngày có giới hạn số lần đọc. Ảnh đã đọc chỉ được lưu trên thiết bị này.", "無需 API 金鑰。每天可辨識的次數有上限。辨識過的圖片只儲存在本裝置中。"],
        "今日は読み取りの利用が多く、いったん受付を終了しました。明日また試すか、手入力してください。": ["Scanning is very busy today and has closed for now. Try again tomorrow or enter it manually.", "今天识别使用量很大，已暂停受理。请明天再试，或手动输入。", "Hôm nay lượng đọc rất đông nên đã tạm ngừng. Hãy thử lại ngày mai hoặc nhập tay.", "今天辨識使用量很大，已暫停受理。請明天再試，或手動輸入。"],
        "今日の読み取り回数の上限に達しました。明日また使えます。": ["You've reached today's scan limit. You can scan again tomorrow.", "已达到今天的识别次数上限。明天可再用。", "Bạn đã dùng hết số lần đọc hôm nay. Ngày mai dùng lại được.", "已達今天的辨識次數上限。明天可再用。"],
        "読み取りサービスに接続できませんでした。時間をおいて試してください。": ["Couldn't reach the scanning service. Please try again later.", "无法连接识别服务。请稍后再试。", "Không kết nối được dịch vụ đọc. Hãy thử lại sau.", "無法連線辨識服務。請稍後再試。"],
        "品目の合計（{a}円）とレシートの合計（{b}円）が {d}円 違います。読み取り漏れの可能性があります。": ["Item total (¥{a}) differs from the receipt total (¥{b}) by ¥{d}. Something may have been missed.", "品项合计（{a}日元）与小票合计（{b}日元）相差 {d} 日元，可能有漏读。", "Tổng món hàng ({a} yên) khác tổng hóa đơn ({b} yên) {d} yên. Có thể đã đọc sót.", "品項合計（{a}日圓）與收據合計（{b}日圓）相差 {d} 日圓，可能有漏讀。"],
        "合計金額が読み取れていません。金額を確認してください。": ["The total couldn't be read. Please check the amount.", "未能识别合计金额。请确认金额。", "Không đọc được tổng tiền. Hãy kiểm tra số tiền.", "未能辨識合計金額。請確認金額。"],
        "品目が読み取れていません。合計金額だけが記録されます。": ["No items could be read. Only the total will be recorded.", "未能识别品项。只会记录合计金额。", "Không đọc được món hàng. Chỉ ghi lại tổng tiền.", "未能辨識品項。只會記錄合計金額。"],
        "軽減税率（8%）と10%が混在しています。品目の税率を確認してください。": ["Reduced-rate (8%) and 10% items are mixed. Please check each item's tax rate.", "同时有减税税率（8%）和 10%。请确认各品项的税率。", "Có cả thuế suất giảm (8%) và 10%. Hãy kiểm tra thuế suất từng món.", "同時有減稅稅率（8%）與 10%。請確認各品項的稅率。"]
    };
    const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const IDX = { en: 0, zh: 1, vi: 2, "zh-TW": 3 };

    let lang = "ja";
    try { lang = localStorage.getItem(STORE_KEY) || ""; } catch (e) {}
    if (!LANGS.some(l => l.code === lang)) {
        // 初回は端末の言語に合わせる（対応外は日本語）
        const nav = String(navigator.language || "ja").toLowerCase();
        lang = nav.startsWith("en") ? "en"
            : /^zh-(tw|hk|mo|hant)/.test(nav) ? "zh-TW"
            : nav.startsWith("zh") ? "zh"
            : nav.startsWith("vi") ? "vi" : "ja";
    }
    const meta = LANGS.find(l => l.code === lang);
    document.documentElement.lang = meta.htmlLang;

    function fill(str, params) {
        if (!params) return str;
        return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
    }
    function t(key, params) {
        const row = D[key];
        const out = (lang === "ja" || !row) ? key : (row[IDX[lang]] || key);
        return fill(out, params);
    }
    function monthLabel(y, m) {
        if (lang === "en") return `${MONTHS_EN[m - 1]} ${y}`;
        if (lang === "vi") return `tháng ${m}/${y}`;
        return `${y}年${m}月`;
    }
    function fmtYen(n) {
        const v = Number(n || 0).toLocaleString();
        return lang === "ja" ? `${v} 円` : `¥${v}`;
    }
    function fmtYenCompact(n) {
        const v = Number(n || 0).toLocaleString();
        return lang === "ja" ? `${v}円` : `¥${v}`;
    }
    function fmtYenPerMonth(n) {
        const v = Number(n || 0).toLocaleString();
        return lang === "ja" ? `${v} 円/月` : lang === "en" ? `¥${v}/mo` : (lang === "zh" || lang === "zh-TW") ? `¥${v}/月` : `¥${v}/tháng`;
    }

    // 静的な HTML（テキスト・placeholder・title など）を一括で置き換える
    function applyStatic(root) {
        if (lang === "ja") return;
        const scope = root || document.body;
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(node => {
            const raw = node.nodeValue;
            const key = raw.replace(/\s+/g, " ").trim();
            if (key && D[key]) node.nodeValue = raw.replace(raw.trim(), t(key));
        });
        scope.querySelectorAll("[title],[placeholder],[aria-label],[alt]").forEach(el => {
            ["title", "placeholder", "aria-label", "alt"].forEach(a => {
                const v = el.getAttribute(a);
                if (v && D[v]) el.setAttribute(a, t(v));
            });
        });
        document.title = t(document.title);
    }

    function setLang(code) {
        if (!LANGS.some(l => l.code === code) || code === lang) return;
        try { localStorage.setItem(STORE_KEY, code); } catch (e) {}
        location.reload();
    }

    window.I18N = { t, lang, langs: LANGS, setLang, applyStatic, monthLabel, fmtYen, fmtYenCompact, fmtYenPerMonth };
    window.t = t;
    window.fmtYen = fmtYen;
    window.fmtYenCompact = fmtYenCompact;
    window.fmtYenPerMonth = fmtYenPerMonth;

    // HTML は読み込み済み（このスクリプトは </body> 直前）。app.js が描画する前に静的部分を訳しておく。
    applyStatic(document.body);
})();
