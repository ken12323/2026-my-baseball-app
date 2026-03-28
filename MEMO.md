母校別プロ野球成績アナリティクス：構築備忘録
1. 全体像（システムの仕組み）

このサイトは、3つのクラウドサービスが連携して動いています。

    GitHub: プログラムの保管場所 ＆ 「タイマー（実行役）」。

    Vercel: サイトの公開場所 ＆ 「計算機（API実行）」。

    Supabase: データの保管場所 「倉庫（データベース）」。

2. 開発の流れ（やったことリスト）
① ローカル開発 (VS Code)

    npx create-next-app でサイトの土台を作成。

    axios と cheerio を使って、スポナビから成績を抜き出すプログラム（route.ts）を作成。

    .env.local にSupabaseへの接続キーを隠して保存。

② データベース準備 (Supabase)

    players テーブル（選手名、母校名、所属チーム）を作成。

    daily_performance テーブル（日付ごとの安打数、本塁打数など）を作成。

③ サイト公開 (Vercel)

    GitHubにプログラムを push。

    VercelでGitHubリポジトリをインポート。

    重要: VercelのSettingsで「環境変数（Environment Variables）」にSupabaseのURLとキー、そして合言葉（playball）を登録。

④ 自動更新の設定 (GitHub Actions)

    .github/workflows/daily_scrape.yml を作成。

    毎日 17:00（デーゲーム用） と 22:00（ナイター用） に動くように設定。

    GitHubの「Secrets」に、Vercelの実行URLを登録。

3. セキュリティの要：合言葉（Security Key）

誰にでもスクレイピングAPIを実行されないよう、**「合言葉を知っている人だけが更新できる」**仕組みにしました。

    合言葉: playball

    実行URLの形: https://[サイト名].vercel.app/api/scrape?key=playball

    もし合言葉が一致しない場合、プログラムは「Unauthorized（拒否）」を返します。

4. 1年後の自分が「修正・更新」したくなったら
Q. 選手の移籍や新入団があったら？

Supabaseの players テーブルを直接編集するか、新しいCSVをインポートすればOKです。
Q. 自動更新が止まっていたら？

    GitHubのリポジトリの 「Actions」 タブを見る。

    エラーログを確認。大抵は「スポナビのURL形式が変わった」か「VercelのURLが変わった（Secretsの修正漏れ）」が原因。

Q. 手動で今すぐ更新したいときは？

    GitHubの Actions から Run workflow を押す。

    もしくは、ブラウザで直接 ?key=playball 付きのURLにアクセスする。

💡 今回学んだ「エンジニアの鉄則」

    .env は絶対に公開しない: だから .gitignore に書いた。

    自動化はSecretsを使う: 実行用URLなどの大事な情報はGitHubの「Secrets」に隠した。

    こまめな git push: 自分のPCが壊れても、GitHubにさえあればいつでも復活できる。