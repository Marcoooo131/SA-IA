import io

import pytest
from docx import Document
from openpyxl import Workbook

from sales_coach.knowledge import public_sources
from sales_coach.knowledge.loaders import chunk_text, extract_text
from sales_coach.knowledge.store import KnowledgeBase
from sales_coach.services import get_kb


def test_seed_is_loaded_with_sources():
    kb = get_kb()
    docs = kb.list_documents("general")
    assert len(docs) >= 15
    assert all(d["source"] and d["reliability"] for d in docs)
    hits = kb.search("traiter une objection : accueillir, explorer, reformuler", "general", k=3)
    assert any("objections" in h.title.lower() for h in hits)
    assert hits[0].citation()


def test_scopes_are_separated():
    kb = get_kb()
    kb.add_text("Procédure déménagement (test)", "En cas de déménagement, le conseiller vérifie la continuité du service à la nouvelle adresse "
                "et transmet la demande de transfert au service technique sous 48 heures.", "entreprise", source="Service qualité", reliability="Document interne officiel")
    ent = kb.search("transfert déménagement nouvelle adresse", "entreprise", k=5)
    assert ent and all(h.scope == "entreprise" for h in ent)
    assert ent[0].title == "Procédure déménagement (test)"
    with pytest.raises(ValueError):
        kb.add_text("x", "texte assez long pour être découpé en un passage valide", "inconnu")


def test_duplicate_import_is_ignored():
    kb = KnowledgeBase(backend="hashing")
    a = kb.add_text("A", "un texte de test suffisamment long pour un passage", "ia")
    b = kb.add_text("B", "un texte de test suffisamment long pour un passage", "ia")
    assert a == b


def test_company_docs_are_cited_in_report():
    from conftest import load_sample

    from sales_coach.services import run_analysis

    kb = get_kb()
    kb.add_text("Procédure transfert", "Déménagement dans une autre région : vérifier la couverture de la zone, puis proposer le transfert de "
                "l'installation à la nouvelle adresse selon la procédure de transfert.", "entreprise", source="Service qualité")
    res = run_analysis(load_sample("appel_02_autre_region_excellent.txt"))
    assert any(s.title == "Procédure transfert" for s in res.report.company_sources)


def test_loaders():
    doc = Document()
    doc.add_paragraph("Procédure de reprise par un repreneur.")
    b = io.BytesIO(); doc.save(b)
    assert "repreneur" in extract_text("a.docx", b.getvalue())
    wb = Workbook(); ws = wb.active; ws.append(["Situation", "Action"]); ws.append(["Budget", "Vérifier la grille"])
    b = io.BytesIO(); wb.save(b)
    assert "Situation: Budget" in extract_text("a.xlsx", b.getvalue())
    assert "Action: Transfert" in extract_text("a.csv", "Situation;Action\nRégion;Transfert\n".encode())
    with pytest.raises(ValueError):
        extract_text("a.exe", b"")
    chunks = chunk_text(" ".join(f"mot{i}" for i in range(600)))
    assert len(chunks) >= 3


def test_openalex_abstract_and_robots(monkeypatch):
    assert public_sources.reconstruct_abstract({"Hello": [0], "world": [1]}) == "Hello world"

    class R:
        def __init__(self, text="", js=None, ctype="text/html"):
            self.text, self._js, self.headers, self.content = text, js, {"content-type": ctype}, text.encode()

        def json(self):
            return self._js

    calls = []

    def fake_get(url, ua, timeout=20, **kw):
        calls.append(url)
        if url.endswith("robots.txt"):
            return R("User-agent: *\nDisallow: /prive/")
        if "openalex" in url:
            return R(js={"results": [{"display_name": "Churn study", "abstract_inverted_index": {"Retention": [0], "matters": [1]},
                                      "publication_year": 2020, "publication_date": "2020-01-01", "type": "article", "doi": "https://doi.org/10/x",
                                      "authorships": [], "primary_location": {"source": {"display_name": "J. Test"}}, "cited_by_count": 3}]})
        return R("<html><title>Guide</title><body><p>" + "mot " * 50 + "</p><script>x</script></body></html>")

    monkeypatch.setattr(public_sources, "_polite_get", fake_get)
    docs = public_sources.search_openalex("churn")
    assert docs[0].title == "Churn study" and "Retention matters" in docs[0].text and docs[0].reliability.startswith("Publication scientifique")
    with pytest.raises(PermissionError):
        public_sources.fetch_url("https://exemple.org/prive/page")
    d = public_sources.fetch_url("https://exemple.org/public/page")
    assert d.title == "Guide" and "x" not in d.text.split()
    assert public_sources.github_readme_url("https://github.com/a/b") == "https://raw.githubusercontent.com/a/b/HEAD/README.md"
