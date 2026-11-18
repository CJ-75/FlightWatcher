import ryanair_routes


def test_mixed_provider_origins_do_not_reject_valid_route(monkeypatch):
    routes = {
        "CDG": set(),
        "ORY": set(),
        "XCR": {"OPO"},
    }
    monkeypatch.setattr(
        ryanair_routes,
        "fetch_served_codes",
        lambda departure: routes[departure],
    )

    assert (
        ryanair_routes.invalid_arrival_codes(
            "CDG,ORY,XCR",
            "LTN,STN,LHR,LCY,SEN,LGW",
        )
        == []
    )


def test_known_ryanair_origin_can_still_flag_missing_routes(monkeypatch):
    monkeypatch.setattr(
        ryanair_routes,
        "fetch_served_codes",
        lambda _departure: {"STN", "DUB"},
    )

    assert ryanair_routes.invalid_arrival_codes("BVA", "STN,LHR") == ["LHR"]


def test_any_served_link_true_when_one_dest_matched(monkeypatch):
    monkeypatch.setattr(
        ryanair_routes,
        "fetch_served_codes",
        lambda _departure: {"STN", "DUB"},
    )
    linked, origins, dests = ryanair_routes.any_served_link("BVA", "STN,LHR")
    assert linked is True
    assert origins == ["BVA"]
    assert dests == ["STN"]


def test_any_served_link_false_when_no_overlap(monkeypatch):
    monkeypatch.setattr(
        ryanair_routes,
        "fetch_served_codes",
        lambda _departure: {"DUB"},
    )
    linked, origins, dests = ryanair_routes.any_served_link("BVA", "NCE")
    assert linked is False
    assert origins == []
    assert dests == []


def test_any_served_link_uses_origin_with_data(monkeypatch):
    routes = {
        "CDG": set(),
        "ORY": set(),
        "BVA": {"NCE", "STN"},
    }
    monkeypatch.setattr(
        ryanair_routes,
        "fetch_served_codes",
        lambda departure: routes[departure],
    )
    linked, origins, dests = ryanair_routes.any_served_link(
        "CDG,ORY,BVA", "NCE"
    )
    assert linked is True
    assert origins == ["BVA"]
    assert dests == ["NCE"]


def test_any_served_link_false_when_all_origins_empty(monkeypatch):
    monkeypatch.setattr(
        ryanair_routes,
        "fetch_served_codes",
        lambda _departure: set(),
    )
    linked, origins, dests = ryanair_routes.any_served_link("CDG,ORY", "NCE")
    assert linked is False
    assert origins == []
    assert dests == []
