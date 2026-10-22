"""Dataverse Web API gateway against a scripted transport: requests sent, answers parsed, errors mapped."""

from __future__ import annotations

import pytest

from movers_dispatch.config import Source
from movers_dispatch.dataverse import (LOOKUP_ENTITY, LOOKUP_NAME, ConcurrentModification, CrmError,
                                       DataverseGateway, Response, SessionExpired, UncertainWrite)
from movers_dispatch.fake import demo_config, gid
from movers_dispatch.models import QueueItem

QI, EM, ACC, U = gid("qi"), gid("em"), gid("acc"), gid("u/kader")


class Scripted:
    def __init__(self, routes):
        self.routes = routes        # list of (method, path prefix, Response or exception)
        self.calls = []

    def request(self, method, path, *, params=None, json=None, headers=None):
        self.calls.append((method, path, params, json, headers))
        for m, prefix, resp in self.routes:
            if m == method and path.startswith(prefix):
                if isinstance(resp, Exception):
                    raise resp
                return resp
        return Response(404, {"error": {"message": "not found"}}, {})

    def close(self):
        pass


def lk(attr, id_, entity, name):
    return {f"_{attr}_value": id_.upper(), f"_{attr}_value{LOOKUP_ENTITY}": entity, f"_{attr}_value{LOOKUP_NAME}": name}


def gw(routes, **src):
    cfg = demo_config()
    if src:
        from dataclasses import replace
        cfg = replace(cfg, source=Source(**src))
    t = Scripted(routes)
    return DataverseGateway(cfg, t), t


def test_reads_queue_by_name_then_items_of_that_queue_only():
    g, t = gw([
        ("GET", "queues", Response(200, {"value": [{"queueid": gid("q").upper(), "name": "Movers Emails"}]}, {})),
        ("GET", "queueitems", Response(200, {"value": [{"queueitemid": QI, "title": "Mail", "@odata.etag": 'W/"7"',
                                                         **lk("objectid", EM, "email", "Mail")}]}, {})),
    ], queue_name="Movers Emails")
    items = g.list_queue_items()
    assert items[0].id == QI and items[0].object.entity == "email" and items[0].worker is None
    _, path, params, _, headers = t.calls[1]
    assert f"_queueid_value eq {gid('q')}" in params["$filter"] and "objecttypecode eq 4202" in params["$filter"]
    assert "lookuplogicalname" not in params["$filter"] and 'include-annotations="*"' in headers["Prefer"]


def test_queue_name_must_match_exactly_one_queue():
    g, _ = gw([("GET", "queues", Response(200, {"value": []}, {}))], queue_name="Inconnue")
    with pytest.raises(CrmError, match="0 résultat"):
        g.list_queue_items()


def test_two_views_by_name_are_merged_without_duplicates():
    v1, v2 = gid("v1"), gid("v2")
    g, t = gw([
        ("GET", "savedqueries", Response(200, {"value": [{"savedqueryid": v1, "name": "x"}]}, {})),
        ("GET", "queueitems", Response(200, {"value": [
            {"queueitemid": QI, "title": "Mail", **lk("objectid", EM, "email", "Mail")},
            {"queueitemid": gid("qi2"), "title": "Tâche", **lk("objectid", gid("tk"), "task", "Tâche")},
            {"queueitemid": gid("qi3"), "title": "RDV", **lk("objectid", gid("ap"), "appointment", "RDV")}]}, {})),
    ], view_names=("Queue Item - Movers - Emails", "Queue Item - Movers tasks"))
    items = g.list_queue_items()
    assert [i.object.entity for i in items] == ["email", "task"]          # deduplicated, appointment ignored
    lookups = [c for c in t.calls if c[1] == "savedqueries"]
    assert "name eq 'Queue Item - Movers - Emails'" in lookups[0][2]["$filter"]
    assert "name eq 'Queue Item - Movers tasks'" in lookups[1][2]["$filter"]


def test_unknown_view_name_is_an_error():
    g, _ = gw([("GET", "savedqueries", Response(200, {"value": []}, {})),
               ("GET", "userqueries", Response(200, {"value": []}, {}))], view_names=("Inconnue",))
    with pytest.raises(CrmError, match="Inconnue"):
        g.list_queue_items()


def test_task_is_read_from_the_tasks_set():
    g, t = gw([("GET", "tasks(", Response(200, {"activityid": gid("tk"), "subject": "Rappel",
                                                **lk("regardingobjectid", ACC, "account", "Client")}, {}))])
    act = g.get_activity("task", gid("tk"))
    assert act.kind == "task" and act.regarding.entity == "account" and t.calls[0][1].startswith("tasks(")


def test_saved_view_is_used_as_is():
    vid = gid("view")
    g, t = gw([("GET", "queueitems", Response(200, {"value": []}, {}))], saved_view_id=vid)
    g.list_queue_items()
    assert t.calls[0][2] == {"savedQuery": vid}


def test_email_regarding_cases_and_user_are_parsed():
    g, t = gw([
        ("GET", "emails(", Response(200, {"activityid": EM, "subject": "Déménagement", **lk("regardingobjectid", ACC, "account", "Client")}, {})),
        ("GET", "incidents", Response(200, {"value": [{"incidentid": gid("c"), "ticketnumber": "CAS-1", "title": "t",
                                                       "statecode": 0, "statuscode": 1, "createdon": "2026-10-01",
                                                       **lk("ownerid", U, "systemuser", "Kader E.")}]}, {})),
        ("GET", "systemusers(", Response(200, {"systemuserid": U, "firstname": "Kader", "fullname": "Kader E.", "isdisabled": False}, {})),
    ])
    email = g.get_email(EM)
    assert email.regarding.entity == "account" and email.regarding.id == ACC
    cases = g.list_cases(ACC, ())
    assert cases[0].owner.id == U and cases[0].owner.entity == "systemuser" and cases[0].number == "CAS-1"
    assert f"_customerid_value eq {ACC}" in t.calls[1][2]["$filter"]
    assert g.get_user(U).first_name == "Kader"


def test_regarding_case_is_read_with_its_customer():
    g, t = gw([("GET", "incidents(", Response(200, {"incidentid": gid("c"), "ticketnumber": "CAS-2", "title": "MOVERS",
                                                    "statecode": 2, **lk("ownerid", U, "systemuser", "Kader E."),
                                                    **lk("customerid", ACC, "account", "Client")}, {}))])
    case = g.get_case(gid("c"), ("title",))
    assert case.state == 2 and case.owner.id == U and case.customer.id == ACC and case.title == "MOVERS"
    assert "_customerid_value" in t.calls[0][2]["$select"] and t.calls[0][2]["$select"].count("title") == 1


def test_api_version_probe():
    from dataclasses import replace

    g, t = gw([("GET", "https://crm.example/Org/api/data/v8.2/WhoAmI", Response(200, {}, {}))])
    g.cfg = replace(g.cfg, connection=replace(g.cfg.connection, environment_url="https://crm.example/Org/"))
    assert g.api_versions() == ["v8.2"] and len(t.calls) == 6


def test_single_write_binds_worked_by_with_etag():
    g, t = gw([("PATCH", "queueitems(", Response(204, None, {}))])
    g.set_worked_by(QueueItem(QI, "t", None, None, 'W/"7"'), U)
    method, path, _, body, headers = t.calls[0]
    assert method == "PATCH" and path == f"queueitems({QI})"
    assert body == {"workerid_systemuser@odata.bind": f"/systemusers({U})"}
    assert headers["If-Match"] == 'W/"7"'


def test_write_without_etag_is_refused_locally():
    g, t = gw([])
    with pytest.raises(CrmError, match="ETag"):
        g.set_worked_by(QueueItem(QI, "t", None, None, ""), U)
    assert t.calls == []


@pytest.mark.parametrize("resp,exc", [
    (Response(401, None, {}), SessionExpired),
    (Response(412, None, {}), ConcurrentModification),
    (Response(403, {"error": {"message": "privilège"}}, {}), CrmError),
    (TimeoutError("lent"), UncertainWrite),
])
def test_write_errors_are_mapped(resp, exc):
    g, _ = gw([("PATCH", "queueitems(", resp)])
    with pytest.raises(exc):
        g.set_worked_by(QueueItem(QI, "t", None, None, 'W/"1"'), U)


def test_invalid_ids_are_never_sent():
    g, t = gw([])
    with pytest.raises(CrmError):
        g.get_email("1) or (1 eq 1")
    assert t.calls == []


def test_preflight_checks_worked_by_metadata():
    ok_rel = {"value": [{"ReferencingAttribute": "workerid", "ReferencedEntity": "systemuser",
                         "ReferencingEntityNavigationPropertyName": "workerid_systemuser"}]}
    routes = [
        ("GET", "WhoAmI", Response(200, {"UserId": U}, {})),
        ("GET", "EntityDefinitions(LogicalName='queueitem')/Attributes", Response(200, {
            "IsValidForUpdate": True, "DisplayName": {"UserLocalizedLabel": {"Label": "Worked By"}}}, {})),
        ("GET", "EntityDefinitions(LogicalName='queueitem')/ManyToOneRelationships", Response(200, ok_rel, {})),
        ("GET", "EntityDefinitions(LogicalName='incident')/Attributes(LogicalName='title')", Response(200, {}, {})),
        ("GET", "queues", Response(200, {"value": [{"queueid": gid("q"), "name": "Movers"}]}, {})),
        ("GET", "savedqueries", Response(200, {"value": [{"savedqueryid": gid("v"), "name": "v"}]}, {})),
    ]
    g, _ = gw(routes)
    assert g.preflight() == []
    routes[1] = ("GET", "EntityDefinitions(LogicalName='queueitem')/Attributes", Response(200, {"IsValidForUpdate": False}, {}))
    routes[2] = ("GET", "EntityDefinitions(LogicalName='queueitem')/ManyToOneRelationships", Response(200, {"value": []}, {}))
    g, _ = gw(routes)
    problems = g.preflight()
    assert len(problems) == 2 and "modifiable" in problems[0] and "navigation" in problems[1]


def test_preflight_reports_expired_session():
    g, _ = gw([("GET", "WhoAmI", Response(401, None, {}))])
    with pytest.raises(SessionExpired):
        g.preflight()


def test_activity_text_and_sender_are_read():
    g, t = gw([("GET", "emails(", Response(200, {"activityid": EM, "subject": "Résiliation", "sender": " a@example.com ",
                                                 "description": "<p>Numéro de client&nbsp;: 10008705</p>",
                                                 "@odata.etag": 'W/"3"'}, {}))])
    act = g.get_activity("email", EM)
    assert act.sender == "a@example.com" and "10008705" in act.text and act.etag == 'W/"3"' and act.regarding is None
    assert "description" in t.calls[0][2]["$select"] and "sender" in t.calls[0][2]["$select"]


def test_account_search_is_exact_active_and_escaped():
    g, t = gw([("GET", "accounts", Response(200, {"value": [{"accountid": ACC.upper(), "name": "Client", "accountnumber": "1001"}]}, {}))])
    hits = g.find_accounts(("emailaddress1", "emailaddress2"), ["o'neil@example.com"])
    assert hits[0].id == ACC and hits[0].name == "Client (1001)"
    flt = t.calls[0][2]["$filter"]
    assert flt.startswith("statecode eq 0 and (") and "emailaddress2 eq 'o''neil@example.com'" in flt
    assert g.find_accounts((), ["x"]) == [] and len(t.calls) == 1


def test_regarding_write_binds_the_account_with_etag():
    from movers_dispatch.models import Email as Act
    g, t = gw([("PATCH", "tasks(", Response(204, None, {}))])
    g.set_regarding(Act(gid("tk"), "s", None, "task", etag='W/"9"'), ACC)
    method, path, _, body, headers = t.calls[0]
    assert path == f"tasks({gid('tk')})" and body == {"regardingobjectid_account_task@odata.bind": f"/accounts({ACC})"}
    assert headers["If-Match"] == 'W/"9"'
    with pytest.raises(CrmError, match="ETag"):
        g.set_regarding(Act(gid("tk"), "s", None, "task"), ACC)


def test_client_preflight_reports_missing_columns_and_relations():
    ok_rel = {"value": [{"ReferencingAttribute": "regardingobjectid", "ReferencedEntity": "account",
                         "ReferencingEntityNavigationPropertyName": "regardingobjectid_account_email"}]}
    g, _ = gw([("GET", "EntityDefinitions(LogicalName='account')/Attributes(LogicalName='telephone3')", Response(404, None, {})),
               ("GET", "EntityDefinitions(LogicalName='account')/Attributes", Response(200, {}, {})),
               ("GET", "EntityDefinitions(LogicalName='email')/ManyToOneRelationships", Response(200, ok_rel, {})),
               ("GET", "EntityDefinitions(LogicalName='task')/ManyToOneRelationships", Response(200, {"value": []}, {}))])
    problems = g.client_preflight()
    assert any("telephone3" in p for p in problems) and any("Regarding de task" in p for p in problems)
    assert not any("Regarding de email" in p for p in problems)
