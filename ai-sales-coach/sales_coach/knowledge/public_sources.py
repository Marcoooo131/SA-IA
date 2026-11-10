"""Import respectueux de connaissances publiques.

- OpenAlex (API ouverte de métadonnées scientifiques) : titre, auteurs, année, revue, DOI et résumé.
  On n'importe que les métadonnées et le résumé fournis par l'API, jamais le texte intégral.
- Page web unique ou README GitHub : uniquement si robots.txt l'autorise, une requête à la fois,
  avec délai minimal entre deux requêtes vers le même hôte. Pas d'exploration de liens (pas de crawl).

Le respect des conditions d'utilisation de chaque site reste de la responsabilité de l'utilisateur :
l'outil n'importe que des URL saisies explicitement.
"""
from __future__ import annotations

import html
import re
import time
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib import robotparser
from urllib.parse import urlparse

import requests

OPENALEX_URL = "https://api.openalex.org/works"
_last_request: dict[str, float] = {}
MIN_DELAY_S = 2.0


@dataclass
class PublicDocument:
    title: str
    text: str
    source: str
    url: str
    doc_date: str
    reliability: str
    category: str = ""


def _polite_get(url: str, user_agent: str, timeout: int = 20, **kwargs) -> requests.Response:
    host = urlparse(url).netloc
    wait = MIN_DELAY_S - (time.monotonic() - _last_request.get(host, 0.0))
    if wait > 0:
        time.sleep(wait)
    _last_request[host] = time.monotonic()
    r = requests.get(url, headers={"User-Agent": user_agent}, timeout=timeout, **kwargs)
    r.raise_for_status()
    return r


def reconstruct_abstract(inv: dict | None) -> str:
    if not inv:
        return ""
    positions = [(pos, word) for word, poss in inv.items() for pos in poss]
    return " ".join(w for _, w in sorted(positions))


def search_openalex(query: str, per_page: int = 5, mailto: str = "", user_agent: str = "AI-Sales-Coach/1.0") -> list[PublicDocument]:
    params = {"search": query, "per_page": max(1, min(per_page, 25)), "filter": "has_abstract:true"}
    if mailto:
        params["mailto"] = mailto  # « polite pool » recommandé par OpenAlex
    r = _polite_get(OPENALEX_URL, user_agent, params=params)
    docs = []
    for w in r.json().get("results", []):
        abstract = reconstruct_abstract(w.get("abstract_inverted_index"))
        if not abstract:
            continue
        authors = ", ".join(a["author"]["display_name"] for a in (w.get("authorships") or [])[:4] if a.get("author"))
        venue = ((w.get("primary_location") or {}).get("source") or {}).get("display_name") or ""
        wtype = w.get("type") or ""
        reliability = "Publication scientifique (résumé OpenAlex)" if wtype in {"article", "review"} else f"Publication de type « {wtype} » (résumé OpenAlex)"
        title = w.get("display_name") or w.get("title") or "Sans titre"
        text = f"{title}\nAuteurs : {authors}\nSource : {venue} ({w.get('publication_year')})\nCitations : {w.get('cited_by_count')}\n\nRésumé : {abstract}"
        docs.append(PublicDocument(title=title, text=text, source=f"OpenAlex — {venue}".strip(" —"), url=w.get("doi") or w.get("id") or "",
                                   doc_date=str(w.get("publication_date") or w.get("publication_year") or ""), reliability=reliability, category="publication"))
    return docs


class _TextExtractor(HTMLParser):
    SKIP = {"script", "style", "nav", "footer", "header", "noscript", "svg", "form"}

    def __init__(self):
        super().__init__()
        self.parts, self.title, self._skip, self._in_title = [], "", 0, False

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self._skip += 1
        if tag == "title":
            self._in_title = True
        if tag in {"p", "br", "li", "h1", "h2", "h3", "h4", "tr", "div", "section"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self._skip:
            self._skip -= 1
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skip:
            self.parts.append(data)


def robots_allows(url: str, user_agent: str) -> bool:
    p = urlparse(url)
    rp = robotparser.RobotFileParser()
    try:
        r = _polite_get(f"{p.scheme}://{p.netloc}/robots.txt", user_agent, timeout=10)
        rp.parse(r.text.splitlines())
    except requests.HTTPError as exc:
        if exc.response is not None and exc.response.status_code in (401, 403):
            return False
        return True  # pas de robots.txt : autorisé par convention
    except requests.RequestException:
        return False  # incertain : on s'abstient
    return rp.can_fetch(user_agent, url)


def github_readme_url(url: str) -> str | None:
    m = re.match(r"https?://github\.com/([^/]+)/([^/#?]+)/?$", url.strip())
    if not m:
        return None
    return f"https://raw.githubusercontent.com/{m.group(1)}/{m.group(2)}/HEAD/README.md"


def fetch_url(url: str, user_agent: str = "AI-Sales-Coach/1.0", reliability: str = "Source web non vérifiée") -> PublicDocument:
    if not url.startswith(("http://", "https://")):
        raise ValueError("URL invalide.")
    target = github_readme_url(url) or url
    if not robots_allows(target, user_agent):
        raise PermissionError(f"robots.txt n'autorise pas la récupération de {target} : import abandonné.")
    r = _polite_get(target, user_agent)
    ctype = r.headers.get("content-type", "")
    today = time.strftime("%Y-%m-%d")
    if "pdf" in ctype:
        from sales_coach.knowledge.loaders import extract_text

        text, title = extract_text("doc.pdf", r.content), url.rsplit("/", 1)[-1]
    elif "html" in ctype:
        ex = _TextExtractor()
        ex.feed(r.text)
        text = html.unescape(re.sub(r"\n\s*\n+", "\n\n", "".join(ex.parts))).strip()
        title = ex.title.strip() or url
    else:
        text, title = r.text, url.rsplit("/", 2)[-2] if target != url else url
    if len(text.split()) < 30:
        raise ValueError("Contenu trop court ou non textuel.")
    return PublicDocument(title=title[:300], text=text, source=urlparse(url).netloc, url=url,
                          doc_date=f"consulté le {today}", reliability=reliability, category="web")
