"""CSV / Excel import: mapping, validation, duplicates (scenario 12)."""

from __future__ import annotations

import io
from datetime import date, time, timedelta

import pytest
from conftest import PARIS_NOW, jobs_of

from sms_reminders import importer
from sms_reminders.db import session_scope
from sms_reminders.models import Appointment, ImportBatch, SmsJob
from sms_reminders.policy import load_policy

CSV = (
    "Numéro client;Nom et prénom;Téléphone;Date;Heure;Service;Confirmé\n"
    "CLI-1;DUPONT Marie;06 00 00 00 01;17/10/2026;14:00;Movers;non\n"
    "CLI-2;MARTIN Paul;0600000002;18/10/2026;9h30;takeovers;oui\n"
    "CLI-1;DUPONT Marie;06 00 00 00 01;24/10/2026;10:00;Takeovers;\n"
    "CLI-1;DUPONT Marie;06 00 00 00 01;17/10/2026;14:00;Movers;non\n"
    "CLI-4;PETIT Julie;01 99 00 00 01;19/10/2026;10:00;Movers;\n"
    "CLI-5;ROUX Thomas;06 00 00 00 05;19/10/2026;10:00;;\n"
    "CLI-6;BLANC Léa;06 00 00 00 06;19/10/2026;25:00;Movers;\n"
    "CLI-7;NOIR Luc;06 00 00 00 07;01/10/2026;10:00;Movers;\n"
)


def upload(content: bytes, name="rdv.csv"):
    with session_scope() as s:
        b = importer.create_batch(s, filename=name, content=content, actor="sam", max_rows=100)
        return b.id


def commit(batch_id):
    with session_scope() as s:
        return importer.commit_batch(s, s.get(ImportBatch, batch_id), actor="sam", policy=load_policy(s), now=PARIS_NOW)


def test_guess_mapping_french_headers():
    m = importer.guess_mapping(["Numéro client", "Nom et prénom", "Téléphone", "Date", "Heure", "Service", "Confirmé"])
    assert m["customer_ref"] == "Numéro client" and m["full_name"] == "Nom et prénom" and m["phone"] == "Téléphone"
    assert m["date"] == "Date" and m["time"] == "Heure" and m["service"] == "Service" and m["confirmed"] == "Confirmé"
    m2 = importer.guess_mapping(["N° client", "Nom", "Prénom", "Mobile", "Date et heure", "Activité"])
    assert m2["customer_ref"] == "N° client" and m2["first_name"] == "Prénom" and m2["last_name"] == "Nom"
    assert m2["full_name"] is None and m2["datetime"] == "Date et heure"


def test_mapping_errors():
    assert importer.mapping_errors({}) != []
    errs = importer.mapping_errors({"customer_ref": "A", "phone": "A", "full_name": "B", "date": "C", "time": "D"})
    assert any("différentes" in e for e in errs)


def test_validation_preview_and_commit(container):
    batch_id = upload(CSV.encode("utf-8"))
    with session_scope() as s:
        b = s.get(ImportBatch, batch_id)
        results = importer.validate_rows(s, b.headers, b.rows, b.mapping, PARIS_NOW)
    by_line = {r.line: r for r in results}
    assert by_line[2].status == "new" and by_line[2].data.first_name == "Marie" and by_line[2].data.last_name == "DUPONT"
    assert by_line[3].data.confirmed is True and by_line[3].data.appointment_time == time(9, 30)
    assert by_line[4].status == "new"  # same customer, other appointment: legitimate
    assert by_line[5].status == "duplicate_file"
    assert by_line[6].status == "error" and "mobile" in by_line[6].errors[0]
    assert by_line[7].status == "new" and any("service" in w for w in by_line[7].warnings)
    assert by_line[8].status == "error"
    assert by_line[9].status == "error" and "passé" in by_line[9].errors[0]
    summary = commit(batch_id)
    assert summary["created"] == 4 and summary["duplicate_file"] == 1 and summary["error"] == 3
    with session_scope() as s:
        assert s.get(ImportBatch, batch_id).rows is None  # raw data purged
        appts = s.query(Appointment).all()
        assert len(appts) == 4
        no_service = s.query(Appointment).filter_by(customer_ref="CLI-5").one()
        confirmed = s.query(Appointment).filter_by(customer_ref="CLI-2").one()
    assert jobs_of(no_service.id) == {} and jobs_of(confirmed.id) == {}
    assert confirmed.confirmation_source == "import"


# 12
def test_duplicate_import_creates_no_new_reminders(container):
    commit(upload(CSV.encode("utf-8")))
    with session_scope() as s:
        jobs_before = s.query(SmsJob).count()
        appts_before = s.query(Appointment).count()
    summary = commit(upload(CSV.encode("utf-8"), name="rdv-bis.csv"))
    assert summary["created"] == 0 and summary["duplicate_existing"] == 4
    with session_scope() as s:
        assert s.query(SmsJob).count() == jobs_before
        assert s.query(Appointment).count() == appts_before


def test_external_ref_is_the_business_identity(container):
    csv1 = "N° client;Nom;Prénom;Téléphone;Date;Heure;Service;Identifiant rendez-vous\nCLI-1;Dupont;Marie;0600000001;17/10/2026;14:00;Movers;RDV-1\n"
    csv2 = "N° client;Nom;Prénom;Téléphone;Date;Heure;Service;Identifiant rendez-vous\nCLI-1;Dupont;Marie;0600000001;17/10/2026;15:00;Movers;RDV-1\n"
    assert commit(upload(csv1.encode()))["created"] == 1
    assert commit(upload(csv2.encode()))["duplicate_existing"] == 1


def test_cannot_commit_twice(container):
    batch_id = upload(CSV.encode("utf-8"))
    commit(batch_id)
    with pytest.raises(importer.ImportFileError):
        commit(batch_id)


def test_xlsx_import_with_native_cells(container):
    from datetime import datetime

    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(["Numéro client", "Nom", "Prénom", "Téléphone", "Date", "Heure", "Service"])
    ws.append(["CLI-1", "Dupont", "Marie", 600000001, datetime(2026, 10, 17), time(14, 0), "Movers"])
    ws.append([12345, "Martin", "Paul", "+33600000002", date(2026, 10, 18), "08:15", "Takeovers"])
    buf = io.BytesIO()
    wb.save(buf)
    batch_id = upload(buf.getvalue(), name="rdv.xlsx")
    with session_scope() as s:
        b = s.get(ImportBatch, batch_id)
        assert b.origin == "xlsx"
        results = importer.validate_rows(s, b.headers, b.rows, b.mapping, PARIS_NOW)
    assert [r.status for r in results] == ["new", "new"]
    assert results[0].data.phone == "0600000001"  # leading zero restored
    assert results[0].data.appointment_date == date(2026, 10, 17) and results[0].data.appointment_time == time(14, 0)
    assert results[1].data.customer_ref == "12345"


def test_cp1252_and_comma_csv(container):
    text = "Numero client,Nom,Prénom,Tel,Date,Heure,Service\nCLI-1,Dupont,Hélène,0600000001,2026-10-17,14:00,Movers\n"
    batch_id = upload(text.encode("cp1252"))
    with session_scope() as s:
        b = s.get(ImportBatch, batch_id)
        r = importer.validate_rows(s, b.headers, b.rows, b.mapping, PARIS_NOW)
    assert r[0].status == "new" and r[0].data.first_name == "Hélène"


def test_file_errors():
    for content, name in ((b"", "x.csv"), (b"a;b\n", "x.csv"), (b"data", "x.pdf")):
        with pytest.raises(importer.ImportFileError):
            importer.parse_file(name, content, 100)
    with pytest.raises(importer.ImportFileError):
        importer.parse_file("x.csv", ("a;b\n" + "1;2\n" * 11).encode(), 10)


@pytest.mark.parametrize("raw,expected", [("14:00", time(14)), ("9h30", time(9, 30)), ("14h", time(14)),
                                          ("08:15:00", time(8, 15)), ("0.5", time(12))])
def test_parse_time(raw, expected):
    assert importer.parse_time(raw) == expected


@pytest.mark.parametrize("raw,expected", [("17/10/2026", date(2026, 10, 17)), ("17/10/26", date(2026, 10, 17)),
                                          ("2026-10-17", date(2026, 10, 17)), ("2026-10-17 00:00", date(2026, 10, 17)),
                                          ("17.10.2026", date(2026, 10, 17))])
def test_parse_date(raw, expected):
    assert importer.parse_date(raw) == expected


def test_parse_service_and_names():
    assert importer.parse_service("MOVERS") == "movers"
    assert importer.parse_service("Take over") == "takeovers"
    assert importer.parse_service("") is None
    with pytest.raises(ValueError):
        importer.parse_service("Installation")
    assert importer.split_full_name("DUPONT Marie") == ("Marie", "DUPONT")
    assert importer.split_full_name("Jean-Pierre DE LA TOUR") == ("Jean-Pierre", "DE LA TOUR")
    assert importer.split_full_name("Marie Dupont") == ("Marie", "Dupont")


def test_customer_ref_looking_like_phone_warns(container):
    text = "Numéro client;Nom;Prénom;Téléphone;Date;Heure;Service\n0600000001;Dupont;Marie;0600000001;17/10/2026;14:00;Movers\n"
    batch_id = upload(text.encode())
    with session_scope() as s:
        b = s.get(ImportBatch, batch_id)
        r = importer.validate_rows(s, b.headers, b.rows, b.mapping, PARIS_NOW)
    assert any("ressemble au numéro de téléphone" in w for w in r[0].warnings)


def test_late_import_warning(container):
    soon = (PARIS_NOW + timedelta(hours=30)).astimezone(__import__("zoneinfo").ZoneInfo("Europe/Paris"))
    text = f"Numéro client;Nom;Prénom;Téléphone;Date;Heure;Service\nCLI-1;Dupont;Marie;0600000001;{soon:%d/%m/%Y};{soon:%H:%M};Movers\n"
    batch_id = upload(text.encode())
    with session_scope() as s:
        b = s.get(ImportBatch, batch_id)
        r = importer.validate_rows(s, b.headers, b.rows, b.mapping, PARIS_NOW)
    assert any("moins de 48 h" in w for w in r[0].warnings)
