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
