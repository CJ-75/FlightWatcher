from types import SimpleNamespace

from deals.my_trips import update_flight_booking_status


class _Query:
    def __init__(self, rows):
        self.rows = rows
        self.matches = list(rows)
        self.patch = None

    def select(self, *_args):
        return self

    def update(self, patch):
        self.patch = patch
        return self

    def eq(self, field, value):
        self.matches = [row for row in self.matches if row.get(field) == value]
        return self

    def limit(self, count):
        self.matches = self.matches[:count]
        return self

    def execute(self):
        if self.patch is not None:
            for row in self.matches:
                row.update(self.patch)
        return SimpleNamespace(data=list(self.matches))


class _Supabase:
    def __init__(self):
        self.rows = [
            {
                "id": "draft-id",
                "draft_token": "draft-token",
                "status": "active",
                "payload": {},
            }
        ]

    def table(self, _name):
        return _Query(self.rows)


def test_redirect_does_not_claim_payment_confirmation():
    row = update_flight_booking_status(
        _Supabase(),
        "draft-token",
        status="pending_partner",
        provider="travelpayouts",
    )

    assert row["flight_booking_status"] == "pending_partner"
    assert row.get("flight_booked_at") is None
    assert row["payload"].get("flight_booked") is not True


def test_partner_confirmation_marks_flight_booked():
    row = update_flight_booking_status(
        _Supabase(),
        "draft-token",
        status="partner_confirmed",
        provider="travelpayouts",
        reference="booking-123",
    )

    assert row["flight_booking_status"] == "partner_confirmed"
    assert row["flight_booking_reference"] == "booking-123"
    assert row["flight_booked_at"]
    assert row["payload"]["flight_booked"] is True
