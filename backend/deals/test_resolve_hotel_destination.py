"""Unit tests: arrival IATA → served city → hotel destination."""
import unittest
from unittest.mock import MagicMock

from deals.city_mapping import resolve_hotel_destination


def _table_chain(data):
    m = MagicMock()
    m.select.return_value = m
    m.eq.return_value = m
    m.ilike.return_value = m
    m.limit.return_value = m
    m.execute.return_value = MagicMock(data=data)
    return m


class TestResolveHotelDestination(unittest.TestCase):
    def test_fco_maps_to_rome_via_served_city(self):
        """FCO shares Rome with CIA catalogue destination."""
        sb = MagicMock()

        def table(name: str):
            if name == "airport_city_mapping":
                return _table_chain(
                    [
                        {
                            "iata": "FCO",
                            "verified": True,
                            "served_city_id": "city-rome",
                            "served_cities": {
                                "id": "city-rome",
                                "city_name": "Rome",
                                "slug": "rome",
                                "primary_iata": "CIA",
                                "country_code": "IT",
                                "verified": True,
                                "timezone": "Europe/Rome",
                            },
                        }
                    ]
                )
            if name == "deal_destinations":
                # First call: by served_city_id
                return _table_chain(
                    [
                        {
                            "id": "dest-rome",
                            "slug": "rome",
                            "city_name": "Rome",
                            "iata_arrival": "CIA",
                            "served_city_id": "city-rome",
                            "active": True,
                            "pool_radius_m": 2200,
                            "timezone": "Europe/Rome",
                        }
                    ]
                )
            return _table_chain([])

        sb.table.side_effect = table
        resolved = resolve_hotel_destination(sb, iata="FCO")
        self.assertIsNotNone(resolved)
        assert resolved is not None
        self.assertEqual(resolved["city_name"], "Rome")
        self.assertEqual(resolved["primary_iata"], "CIA")
        self.assertEqual(resolved["destination_id"], "dest-rome")
        self.assertEqual(resolved["served_city_id"], "city-rome")

    def test_unknown_iata_returns_none(self):
        sb = MagicMock()
        sb.table.side_effect = lambda _n: _table_chain([])
        self.assertIsNone(resolve_hotel_destination(sb, iata="XXX"))


if __name__ == "__main__":
    unittest.main()
