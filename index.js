const fs = require('fs');
const path = require('path');

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const REPO = 'Discord-Datamining/Discord-Datamining';
const CACHE_FILE = path.join(__dirname, 'last_commit_date.txt');

async function main() {
  if (!DISCORD_WEBHOOK_URL) {
    console.error("エラー: DISCORD_WEBHOOK_URL が設定されていません。");
    process.exit(1);
  }

  // キャッシュから前回チェック時の最新コミット日時を読み込み
  let since = "";
  if (fs.existsSync(CACHE_FILE)) {
    since = fs.readFileSync(CACHE_FILE, 'utf8').trim();
  }

  // GitHub APIのURLを構築 (sinceパラメータでそれ以降のコミットのみ取得)
  let url = `https://api.github.com/repos/${REPO}/commits?sha=master`;
  if (since) {
    url += `&since=${since}`;
  }

  console.log(`APIリクエスト送信中... (${since ? '以降のコミット' : '最新のコミットを取得'})`);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Github-Actions-Discord-Bot' }
    });

    if (!response.ok) {
      throw new Error(`GitHub API エラー: ${response.statusText}`);
    }

    const commits = await response.json();
    if (!Array.isArray(commits) || commits.length === 0) {
      console.log("新しいコミットはありませんでした。");
      return;
    }

    // APIは新しい順(降順)で返すため、古い順(昇順)に並び替えて処理する
    const sortedCommits = commits.reverse();
    let latestCommitDate = since;

    for (const item of sortedCommits) {
      const commitMessage = item.commit.message;
      const commitUrl = item.html_url;
      const commitDate = item.commit.committer.date;

      // 前回の最新コミットと全く同じ日時のものはスキップ
      if (commitDate === since) continue;

      // 【判定条件】メッセージに改行(\n)が含まれている＝2行目以降（コメント）がある
      if (commitMessage.includes('\n')) {
        console.log(`条件一致コミットを発見: ${item.sha.substring(0, 7)}`);
        
        // Discordへの送信メッセージ作成
        const payload = {
          content: `【Discord-Datamining 新着ログ】\n${commitMessage}\n\nURL: ${commitUrl}`
        };

        // Discordへ送信
        await fetch(DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        // 大量送信によるDiscordのレートリミット（一時規制）を防ぐため1秒待つ
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 最後に処理したコミットの日時を記録
      latestCommitDate = commitDate;
    }

    // 次回のために最新のコミット日時をファイルに保存
    if (latestCommitDate) {
      fs.writeFileSync(CACHE_FILE, latestCommitDate, 'utf8');
      console.log(`キャッシュを更新しました: ${latestCommitDate}`);
    }

  } catch (error) {
    console.error("エラーが発生しました:", error);
    process.exit(1);
  }
}

main();
