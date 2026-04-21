import requests
from bs4 import BeautifulSoup

# 上村知輝選手（オイシックス）のURL
url = "https://baseball.yahoo.co.jp/npb/player/2103844/top"

print(f"🌍 {url} の裏側を調査します...\n")

res = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
soup = BeautifulSoup(res.content, "html.parser")

print("--- 🔍 パターンA: dl/dt/dd (定義リスト) を探しています ---")
for dt in soup.find_all("dt"):
    dd = dt.find_next_sibling("dd")
    if dd:
        print(f"項目: [{dt.text.strip()}] -> 値: [{dd.text.strip()}]")

print("\n--- 🔍 パターンB: tr/th/td (表組み) を探しています ---")
for tr in soup.find_all("tr"):
    th = tr.find("th")
    td = tr.find("td")
    if th and td:
        print(f"項目: [{th.text.strip()}] -> 値: [{td.text.strip()}]")

print("\n--- 🔍 パターンC: section/h1/div (その他の構造) ---")
# もしAもBも空っぽなら、全く別のタグで書かれている可能性があります
profile_section = soup.find("section", class_=lambda x: x and "profile" in x.lower())
if profile_section:
    print("プロフィールらしきセクションが見つかりました！中のテキスト:")
    print(profile_section.text[:200].replace('\n', ' '))