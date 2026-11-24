"""Découverte et vérification sur des métadonnées fictives : lecture seule, rapport utile."""
from pathlib import Path

from assistant_movers import config as cfgmod
from assistant_movers.crm import DataverseGateway
from assistant_movers.decouverte import Decouverte, Verification
from assistant_movers.transport import Response

EX = Path(__file__).parents[1] / "config" / "assistant.example.toml"
L = lambda s: {"UserLocalizedLabel": {"Label": s}}  # noqa: E731
TABLES = [
    {"LogicalName": "incident", "EntitySetName": "incidents", "DisplayName": L("Case")},
    {"LogicalName": "new_workorder", "EntitySetName": "new_workorders", "DisplayName": L("Work Order"), "IsActivity": True},
    {"LogicalName": "new_workorderproduct", "EntitySetName": "new_workorderproducts", "DisplayName": L("Work Order Product")},
    {"LogicalName": "new_sms", "EntitySetName": "new_smses", "DisplayName": L("SMS"), "IsActivity": True},
    {"LogicalName": "new_installation", "EntitySetName": "new_installations", "DisplayName": L("Installation"), "PrimaryNameAttribute": "new_name"},
]
ATTRS = {
    "incident": [("new_movingoutorin", "Picklist", "Moving Out Or Moving In ?"), ("new_completedmoveout", "Boolean", "Completed Move Out Info"),
                 ("new_street1", "String", "Street 1 (New Address Moving Out)"), ("title", "String", "Title")],
    "new_workorder": [("new_activitynumber", "String", "Activity Number"), ("description", "Memo", "Description")],
    "new_sms": [("new_text", "Memo", "Text"), ("new_mobile", "String", "Mobile")],
    "new_installation": [("new_accountid", "Lookup", "Account")],
}
RELS = {
    "incident": [{"ReferencingAttribute": "new_installationid", "ReferencedEntity": "new_installation", "ReferencingEntityNavigationPropertyName": "new_InstallationId"}],
    "new_workorder": [{"ReferencingAttribute": "new_caseid", "ReferencedEntity": "incident", "ReferencingEntityNavigationPropertyName": "new_CaseId"}],
    "new_workorderproduct": [{"ReferencingAttribute": "new_workorderid", "ReferencedEntity": "new_workorder", "ReferencingEntityNavigationPropertyName": "new_WorkOrderId"}],
    "new_sms": [{"ReferencingAttribute": "regardingobjectid", "ReferencedEntity": "incident", "ReferencingEntityNavigationPropertyName": "regardingobjectid_incident_new_sms"}],
    "new_installation": [{"ReferencingAttribute": "new_accountid", "ReferencedEntity": "account", "ReferencingEntityNavigationPropertyName": "new_AccountId"}],
}


class Meta:
    def request(self, method, path, *, params=None, json=None, headers=None):
        assert method == "GET"
        if path == "EntityDefinitions":
            return Response(200, {"value": TABLES}, {})
        if path.startswith("EntityDefinitions(LogicalName='"):
            ent = path.split("'")[1]
            if path.endswith("/Attributes"):
                return Response(200, {"value": [{"LogicalName": a, "AttributeType": t, "DisplayName": L(d)} for a, t, d in ATTRS.get(ent, [])]}, {})
            if path.endswith("/ManyToOneRelationships"):
                return Response(200, {"value": RELS.get(ent, [])}, {})
            if "PicklistAttributeMetadata" in path:
                return Response(200, {"OptionSet": {"Options": [{"Value": 100000000, "Label": L("In")}, {"Value": 100000001, "Label": L("Out")}]}}, {})
            if "BooleanAttributeMetadata" in path:
                return Response(200, {"OptionSet": {"TrueOption": {"Value": 1, "Label": L("Yes")}, "FalseOption": {"Value": 0, "Label": L("No")}}}, {})
        if path == "RetrieveVersion()":
            return Response(200, {"Version": "8.2.2.0"}, {})
        if path in ("templates", "queues"):
            return Response(200, {"value": [{}]}, {})
        return Response(200, {"value": []}, {})


def test_decouverte_trouve_les_noms():
    txt = "\n".join(Decouverte(DataverseGateway(cfgmod.load(EX), Meta())).lancer())
    assert "new_movingoutorin" in txt and "100000001=Out" in txt and "1=Yes" in txt
    assert "entity_set = new_workorders" in txt and "new_activitynumber" in txt
    assert "nav = new_InstallationId" in txt and "compte_attr = new_accountid" in txt
    assert "regardingobjectid_incident_new_sms" in txt and "nav = new_WorkOrderId" in txt
    assert "title" not in txt.split("[Case (incident) — champs Movers]")[1].split("[")[0]


def test_verification_signale_les_trous_puis_valide():
    cfg = cfgmod.load(EX)
    v = Verification(DataverseGateway(cfg, Meta()))
    v.lancer()
    assert v.erreurs > 5
    cfg.case.champs["moving_out_or_in"] = "new_movingoutorin"
    cfg.case.champs["new_city"] = "faux_champ"
    v = Verification(DataverseGateway(cfg, Meta()))
    txt = "\n".join(v.lancer())
    assert "[OK  ] case.champs.moving_out_or_in = new_movingoutorin" in txt
    assert "faux_champ — champ inexistant" in txt
