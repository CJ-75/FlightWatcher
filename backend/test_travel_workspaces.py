from types import SimpleNamespace

from datetime import datetime, timedelta, timezone

from routes.planner import (
    _best_booking,
    _dest_compatible,
    _heal_orphan_drafts_to_trips,
    _parse_wall_dt,
    _planner_draft_payload,
    _stay_starts_at,
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


def test_workspace_phase_past_when_start_datetime_elapsed():
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    future = datetime.now(timezone.utc) + timedelta(days=3)
    assert (
        _workspace_phase(
            ret_date=future.date().isoformat(),
            out_date=past.date().isoformat(),
            accepted={"id": "proposal"},
            draft={"id": "draft", "payload": {}},
            booking={"status": "confirmed"},
            starts_at=past,
        )
        == "past"
    )
    assert (
        _workspace_phase(
            ret_date=future.date().isoformat(),
            out_date=future.date().isoformat(),
            accepted={"id": "proposal"},
            draft={"id": "draft", "payload": {}},
            booking={"status": "confirmed"},
            starts_at=future,
        )
        == "booked"
    )
    # Incomplete séjour whose start elapsed is also retired from "en cours".
    assert (
        _workspace_phase(
            ret_date="2099-01-02",
            accepted=None,
            draft=None,
            booking=None,
            starts_at=past,
        )
        == "past"
    )


def test_stay_starts_at_prefers_outbound_flight_local_time():
    starts = _stay_starts_at(
        accepted={
            "trip_data": {
                "aller": {"departureTime": "2027-05-07T08:10:00"},
                "retour": {"departureTime": "2027-05-10T19:40:00"},
            }
        }
    )
    assert starts is not None
    assert starts.hour == 8 and starts.minute == 10
    assert _parse_wall_dt("2027-05-07T08:10:00") is not None


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


def test_dest_compatible_matches_lisbon_iata_and_city():
    trip = {
        "id": "trip-lis",
        "name": "Weekend Lisbonne",
        "arrival_airport": "LIS",
        "dates_depart": [{"date": "2027-05-07"}],
        "dates_retour": [{"date": "2027-05-10"}],
    }
    accepted = {
        "id": "prop-1",
        "trip_data": _proposal(),
    }
    draft = {
        "id": "draft-1",
        "city_name": "Lisbonne",
        "dest_iata": "LIS",
        "out_date": "2027-05-07",
        "ret_date": "2027-05-10",
        "payload": {"city": "Lisbonne", "destination": "LIS"},
    }
    assert _dest_compatible(trip, accepted, draft) is True
    assert (
        _dest_compatible(
            trip,
            accepted,
            {
                **draft,
                "dest_iata": "BCN",
                "city_name": "Barcelone",
                "payload": {"city": "Barcelone", "destination": "BCN"},
            },
        )
        is False
    )


def test_heal_links_orphan_lisbon_booking_draft_to_planner_trip():
    class _HealSupabase:
        def __init__(self):
            self.updates = []

        def table(self, name):
            assert name == "my_trip_drafts"
            parent = self

            class _Update:
                def update(self, patch):
                    self.patch = patch
                    return self

                def eq(self, field, value):
                    parent.updates.append((field, value, self.patch))
                    return self

                def execute(self):
                    return SimpleNamespace(data=[])

            return _Update()

    trip = {
        "id": "trip-lis",
        "name": "Weekend Lisbonne",
        "arrival_airport": "LIS",
        "dates_depart": [{"date": "2027-05-07"}],
        "dates_retour": [{"date": "2027-05-10"}],
    }
    accepted = {"id": "prop-1", "trip_data": _proposal()}
    orphan = {
        "id": "draft-orphan",
        "draft_token": "tok-lis",
        "city_name": "Lisbonne",
        "dest_iata": "LIS",
        "out_date": "2027-05-07",
        "ret_date": "2027-05-10",
        "updated_at": "2027-04-01",
        "payload": {"city": "Lisbonne", "destination": "LIS"},
    }
    drafts_by_trip = {}
    bookings_by_draft_id = {
        "draft-orphan": [
            {
                "id": "booking-1",
                "status": "confirmed",
                "updated_at": "2027-04-02",
            }
        ]
    }
    supabase = _HealSupabase()
    _heal_orphan_drafts_to_trips(
        supabase,
        trips_by_id={"trip-lis": trip},
        accepted_by_trip={"trip-lis": accepted},
        drafts=[orphan],
        drafts_by_trip=drafts_by_trip,
        bookings_by_draft_id=bookings_by_draft_id,
        bookings_by_token={},
    )
    assert drafts_by_trip["trip-lis"]["id"] == "draft-orphan"
    assert orphan["source_planned_trip_id"] == "trip-lis"
    assert orphan["source_kind"] == "planner"
    assert supabase.updates
    assert supabase.updates[0][2]["source_planned_trip_id"] == "trip-lis"
