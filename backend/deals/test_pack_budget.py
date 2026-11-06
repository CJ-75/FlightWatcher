from deals.pack_budget import (
    estimate_pack_pp,
    is_over_pack_budget,
    pack_budget_pp,
)


def test_estimate_pack_pp_flight_plus_hotel():
    row = {
        "flight_snapshot": {"price_pp_eur": 120},
        "hotel_top3": [{"public_hotel_price": 200}],  # 100 €/pers for 2
    }
    assert estimate_pack_pp(row, adults=2) == 220.0


def test_over_pack_budget_madrid_example():
    # 447 €/pers weekend → over default 350
    assert is_over_pack_budget(447.0, cap=350.0) is True
    assert is_over_pack_budget(349.0, cap=350.0) is False


def test_flight_alone_over_cap():
    row = {
        "flight_snapshot": {"price_pp_eur": 400},
        "hotel_top3": [],
    }
    assert estimate_pack_pp(row) == 400.0
    assert is_over_pack_budget(estimate_pack_pp(row), cap=350.0) is True


def test_pack_budget_pp_positive():
    assert pack_budget_pp() > 0
