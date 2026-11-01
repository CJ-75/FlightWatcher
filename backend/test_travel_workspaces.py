from types import SimpleNamespace

from routes.planner import (
    _best_booking,
    _planner_draft_payload,
    _user_can_access,
    _workspace_phase,
)


class _Query:
    def __init__(self, rows):
        self.rows = rows

    def select(self, *_args):
        return self

    def eq(self, field, value):
        self.rows = [row for row in self.rows if row.get(field) == value]
        return self

    def limit(self, count):
        self.rows = self.rows[:count]
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows)


class _Supabase:
    def __init__(self):
        self.rows = {
            "planned_trips": [{"id": "trip-1", "organizer_id": "owner"}],
            "trip_members": [
                {"id": "member-1", "trip_id": "trip-1", "user_id": "member"}
            ],
        }

    def table(self, name):
        return _Query(list(self.rows[name]))


def _proposal():
    return {
        "prix_total": 84.4,
        "destination_code": "LIS",
        "provider": "ryanair",
        "airline": "Ryanair",
        "transfers": 0,
        "booking_url": "https://example.test/book",
        "aller": {
            "origin": "BVA",
            "destination": "LIS",
            "destinationFull": "Lisbonne, Portugal",
            "departureTime": "2027-05-07T08:10:00",
        },
        "retour": {
            "departureTime": "2027-05-10T19:40:00",
        },
    }


def test_planner_payload_preserves_selected_flight():
    payload = _planner_draft_payload(_proposal(), 3)
    assert payload["destination"] == "LIS"
    assert payload["city"] == "Lisbonne"
    assert payload["dates"] == {
        "outbound": "2027-05-07",
        "inbound": "2027-05-10",
    }
    assert payload["adults"] == 3
    assert payload["flight"]["price_pp"] == 84.4


def test_workspace_phase_distinguishes_choice_from_booking():
    assert (
        _workspace_phase(
            ret_date="2099-05-10",
            accepted={"id": "proposal"},
            draft=None,
            booking=None,
        )
        == "flight_selected"
    )
    assert (
        _workspace_phase(
            ret_date="2099-05-10",
            accepted={"id": "proposal"},
            draft={"id": "draft", "payload": {}},
            booking=None,
        )
        == "composing"
    )
    assert (
        _workspace_phase(
            ret_date="2099-05-10",
            accepted={"id": "proposal"},
            draft={"id": "draft", "payload": {}},
            booking={"status": "confirmed"},
        )
        == "booked"
    )


def test_best_booking_prefers_confirmed_over_newer_retry():
    best = _best_booking(
        [
            {"id": "confirmed", "status": "confirmed", "updated_at": "2027-01-01"},
            {"id": "retry", "status": "payment_pending", "updated_at": "2027-02-01"},
        ]
    )
    assert best["id"] == "confirmed"


def test_workspace_access_is_limited_to_organizer_and_members():
    supabase = _Supabase()
    assert _user_can_access(supabase, "trip-1", "owner") is not None
    assert _user_can_access(supabase, "trip-1", "member") is not None
    assert _user_can_access(supabase, "trip-1", "stranger") is None
