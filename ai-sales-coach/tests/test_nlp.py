import pytest

from sales_coach.analysis.nlp import OBJECTIONS, classify_question, detect_categories, extract_questions


@pytest.mark.parametrize("q,kind", [
    ("Comment se présente votre nouveau logement ?", "ouverte"),
    ("Qu'est-ce qui vous amène à partir ?", "ouverte"),
    ("Parlez-moi de votre projet.", "ouverte"),
    ("Qu'en pensez-vous ?", "ouverte"),
    ("Puis-je vous demander ce que devient votre logement ?", "ouverte"),
    ("Est-ce que vous déménagez bientôt ?", "fermée"),
    ("Vous avez des enfants ?", "fermée"),
    ("Vous ne souhaitez pas garder votre alarme ?", "fermée orientée négativement"),
    ("Vous voulez résilier ?", "fermée orientée négativement"),
    ("Si je comprends bien, vous partez à Lyon, c'est bien ça ?", "reformulation"),
    ("Quand déménagez-vous ?", "information"),
    ("Que puis-je faire pour vous ?", "accueil"),
])
def test_classify_question(q, kind):
    assert classify_question(q) == kind


def test_extract_multiple_questions():
    qs = extract_questions(0, "Je comprends. Vous partez où ? Et quand ?")
    assert len(qs) == 2


def test_objections():
    assert "budget" in detect_categories("C'est trop cher pour nous en ce moment", OBJECTIONS)
    assert "deja_equipe" in detect_categories("Il y a déjà une alarme dans la maison", OBJECTIONS)
    assert "deja_equipe" not in detect_categories("Il y a déjà des acheteurs", OBJECTIONS)
