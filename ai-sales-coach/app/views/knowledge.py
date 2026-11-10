"""Page « Base de connaissances » (RAG) : import, sources publiques, recherche avec source."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from app import state
from sales_coach.config import get_settings
from sales_coach.knowledge.loaders import SUPPORTED
from sales_coach.knowledge.store import RELIABILITY, SCOPES
from sales_coach.security.auth import audit
from sales_coach.services import get_kb


def render() -> None:
    st.title("Base de connaissances")
    kb = get_kb()
    st.caption(f"Recherche documentaire : {kb.backend_name} · stockage : {kb.vector_store}. "
               "Seul le périmètre « Entreprise » peut fonder une affirmation sur les offres, tarifs, conditions ou procédures.")
    if kb.backend_name.startswith("hashing"):
        st.info("Mode de recherche lexical (sans modèle) : il retrouve les passages qui partagent les mots de la question, pas les synonymes. "
                "Pour une recherche sémantique, installez `requirements-ml.txt` (sentence-transformers).")

    tabs = ["🔎 Rechercher", "📚 Documents"]
    can_manage = state.allowed("manage_kb")
    if can_manage:
        tabs += ["⬆️ Importer des documents", "🌐 Sources publiques"]
    t = st.tabs(tabs)

    with t[0]:
        q = st.text_input("Question", placeholder="ex. procédure de transfert lors d'un déménagement")
        scope = st.radio("Périmètre", ["tous"] + list(SCOPES), horizontal=True, format_func=lambda s: "Tous" if s == "tous" else SCOPES[s])
        if q:
            hits = kb.search(q, None if scope == "tous" else scope, k=6)
            if not hits:
                st.warning("Aucun résultat.")
            for h in hits:
                with st.expander(f"[{SCOPES[h.scope]}] {h.title} — pertinence {h.score:.2f}"):
                    st.markdown(h.text)
                    st.caption(f"Source : {h.citation()}")

    with t[1]:
        docs = kb.list_documents()
        if docs:
            df = pd.DataFrame(docs)
            df["scope"] = df["scope"].map(SCOPES)
            df["imported_at"] = pd.to_datetime(df["imported_at"]).dt.strftime("%d/%m/%Y")
            st.dataframe(df[["id", "scope", "title", "category", "source", "url", "date", "reliability", "chunks", "imported_at"]], hide_index=True,
                         use_container_width=True, column_config={"scope": "Périmètre", "title": "Titre", "category": "Catégorie", "source": "Source",
                                                                  "url": st.column_config.LinkColumn("URL"), "date": "Date", "reliability": "Fiabilité",
                                                                  "chunks": "Passages", "imported_at": "Importé le"})
            if can_manage:
                c1, c2 = st.columns([1, 3])
                with c1:
                    did = st.selectbox("Supprimer le document n°", [d["id"] for d in docs])
                with c2:
                    st.write("")
                    if st.button("Supprimer"):
                        kb.delete_document(did)
                        audit(state.user()["username"], "suppression document KB", target=f"doc #{did}")
                        st.rerun()
        else:
            st.info("Base vide.")

    if not can_manage:
        return

    with t[2]:
        st.markdown("Formats : " + ", ".join(sorted(SUPPORTED)) + " — guides commerciaux, procédures internes, scripts, exemples de bons / mauvais appels.")
        files = st.file_uploader("Fichiers", type=[e.strip(".") for e in SUPPORTED], accept_multiple_files=True)
        c1, c2, c3 = st.columns(3)
        with c1:
            scope = st.selectbox("Périmètre", list(SCOPES), index=1, format_func=lambda s: SCOPES[s])
        with c2:
            category = st.selectbox("Catégorie", ["Procédure interne", "Guide commercial", "Script commercial", "Offres et conditions", "Exemple de bon appel",
                                                  "Exemple de mauvais appel", "Transcription d'appel", "Formation", "Autre"])
        with c3:
            reliability = st.selectbox("Fiabilité", RELIABILITY)
        c4, c5 = st.columns(2)
        with c4:
            source = st.text_input("Source (auteur, service, éditeur)")
        with c5:
            doc_date = st.text_input("Date du document (ex. 2026-09)")
        url = st.text_input("URL (facultatif)")
        if st.button("Importer", type="primary", disabled=not files):
            for f in files:
                try:
                    did = kb.add_file(f.name, f.getvalue(), scope, title=f.name.rsplit(".", 1)[0], category=category, source=source, url=url,
                                      doc_date=doc_date, reliability=reliability, imported_by=state.user()["username"])
                    audit(state.user()["username"], "import document KB", target=f.name, detail=f"scope={scope}")
                    st.success(f"{f.name} importé (document #{did}).")
                except Exception as exc:
                    st.error(f"{f.name} : {exc}")
        st.caption("Un modèle à compléter pour la procédure déménagement est fourni : data/samples/MODELE_procedure_demenagement_entreprise.md")

    with t[3]:
        cfg = get_settings()
        st.markdown("**OpenAlex** — base ouverte de publications scientifiques (métadonnées et résumés uniquement).")
        q = st.text_input("Recherche OpenAlex", value="customer retention churn telecommunications")
        n = st.slider("Nombre de publications", 1, 10, 5)
        if st.button("Rechercher sur OpenAlex"):
            from sales_coach.knowledge.public_sources import search_openalex

            try:
                st.session_state["oa_results"] = search_openalex(q, n, cfg.openalex_mailto, cfg.http_user_agent)
            except Exception as exc:
                st.error(f"OpenAlex indisponible : {exc}")
        for i, d in enumerate(st.session_state.get("oa_results", [])):
            with st.expander(f"{d.title} ({d.doc_date})"):
                st.markdown(d.text[:1500])
                st.caption(f"{d.source} · {d.url} · {d.reliability}")
                if st.button("Ajouter aux connaissances générales", key=f"oa_add_{i}"):
                    kb.add_text(d.title, d.text, "general", category="Publication scientifique", source=d.source, url=d.url, doc_date=d.doc_date,
                                reliability=d.reliability, imported_by=state.user()["username"])
                    audit(state.user()["username"], "import OpenAlex", target=d.title[:150])
                    st.success("Ajouté.")
        st.divider()
        st.markdown("**Page web ou dépôt GitHub** — une URL à la fois, uniquement si robots.txt l'autorise. Vérifiez les conditions d'utilisation du site.")
        url = st.text_input("URL (page publique ou https://github.com/owner/repo)")
        rel = st.selectbox("Fiabilité de cette source", RELIABILITY, index=RELIABILITY.index("Source web non vérifiée"))
        if st.button("Importer l'URL") and url:
            from sales_coach.knowledge.public_sources import fetch_url

            try:
                d = fetch_url(url, cfg.http_user_agent, rel)
                kb.add_text(d.title, d.text, "general", category="Ressource web", source=d.source, url=d.url, doc_date=d.doc_date,
                            reliability=d.reliability, imported_by=state.user()["username"])
                audit(state.user()["username"], "import URL", target=url)
                st.success(f"Importé : {d.title}")
            except Exception as exc:
                st.error(str(exc))
