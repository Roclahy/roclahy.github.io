#!/usr/bin/env python3
import json, re, html as htmlmod
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.request import Request, urlopen

UA="Mozilla/5.0 (compatible; RoclahyPortfolioFeed/1.0; +https://roclahy.me)"

def fetch(url):
    req=Request(url,headers={"User-Agent":UA,"Accept-Language":"es,en;q=0.8"})
    with urlopen(req,timeout=25) as r:
        return r.read().decode("utf-8","replace")

class TelegramParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.posts=[]
        self.current=None
        self.capture=False
        self.capture_depth=0
        self.parts=[]

    def finish_current(self):
        if self.current:
            if self.parts and not self.current.get("text"):
                self.current["text"]=" ".join(" ".join(self.parts).split())
            self.posts.append(self.current)
        self.current=None
        self.parts=[]
        self.capture=False
        self.capture_depth=0

    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        post=a.get("data-post","")
        if post.startswith("fundadora/"):
            self.finish_current()
            try: pid=int(post.rsplit("/",1)[1])
            except: pid=0
            self.current={"id":pid,"url":"https://t.me/"+post,"text":"","date":""}

        if not self.current:
            return

        classes=a.get("class","")
        if tag=="time" and a.get("datetime") and not self.current.get("date"):
            self.current["date"]=a["datetime"]

        if tag=="div" and ("tgme_widget_message_text" in classes or "tgme_widget_message_caption" in classes):
            self.capture=True
            self.capture_depth=1
            self.parts=[]
        elif self.capture and tag=="div":
            self.capture_depth += 1

        if self.capture and tag in ("br","p"):
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if self.capture and tag=="div":
            self.capture_depth -= 1
            if self.capture_depth<=0:
                text=" ".join(" ".join(self.parts).split())
                if text:
                    self.current["text"]=text
                self.capture=False
                self.capture_depth=0
                self.parts=[]

    def handle_data(self, data):
        if self.capture:
            self.parts.append(data)

    def close(self):
        super().close()
        self.finish_current()

def telegram_latest():
    raw=fetch("https://t.me/s/fundadora")
    parser=TelegramParser()
    parser.feed(raw)
    parser.close()
    posts=[p for p in parser.posts if p.get("id")]
    if not posts:
        raise RuntimeError("No Telegram posts parsed")
    post=max(posts,key=lambda x:x["id"])
    text=" ".join((post.get("text") or "").split())
    if len(text)>180:
        text=text[:177].rstrip()+"…"
    if not text:
        text="Nueva publicación en Telegram"
    date=post.get("date","")
    if date:
        try:
            dt=datetime.fromisoformat(date.replace("Z","+00:00"))
            date=dt.strftime("%d/%m/%Y")
        except:
            date="@fundadora"
    else:
        date="@fundadora"
    return {"url":post["url"],"text":text,"date":date,"id":post["id"]}

def latest_articles():
    raw=fetch("https://roclahy.com/data/posts.json")
    posts=json.loads(raw)
    out=[]
    for post in posts[:2]:
        title=(post.get("title") or "").strip()
        path=post.get("path") or ""
        url=path if path.startswith("http") else "https://roclahy.com"+path
        labels=post.get("labels") or []
        out.append({
            "title":title,
            "url":url,
            "category":" · ".join(labels[:2]) or "Roclahy.com"
        })
    if len(out)<2:
        raise RuntimeError("Not enough Roclahy articles found")
    return out

def main():
    result={
        "updated_at":datetime.now(timezone.utc).isoformat(),
        "telegram":telegram_latest(),
        "articles":latest_articles()
    }
    with open("portfolio-feed.json","w",encoding="utf-8") as f:
        json.dump(result,f,ensure_ascii=False,indent=2)
        f.write("\n")

if __name__=="__main__":
    main()
