from api_models import DateAvecHoraire
from routes.planner import _flight_slot_key, _trip_flight_slots


def test_flight_slot_key_from_model():
    d = DateAvecHoraire(date="2027-05-07", heure_min="08:10", heure_max="08:10")
    assert _flight_slot_key(d) == ("2027-05-07", "08:10", "08:10")


def test_trip_flight_slots_match_exact_times():
    trip = {
        "dates_depart": [{"date": "2027-05-07", "heure_min": "08:10", "heure_max": "08:10"}],
        "dates_retour": [{"date": "2027-05-10", "heure_min": "19:40", "heure_max": "19:40"}],
    }
    assert _trip_flight_slots(trip) == (
        ("2027-05-07", "08:10", "08:10"),
        ("2027-05-10", "19:40", "19:40"),
    )


def test_different_times_are_different_slots():
    a = {
        "dates_depart": [{"date": "2027-05-07", "heure_min": "08:10", "heure_max": "08:10"}],
        "dates_retour": [{"date": "2027-05-10", "heure_min": "19:40", "heure_max": "19:40"}],
    }
    b = {
        "dates_depart": [{"date": "2027-05-07", "heure_min": "09:10", "heure_max": "09:10"}],
        "dates_retour": [{"date": "2027-05-10", "heure_min": "19:40", "heure_max": "19:40"}],
    }
    assert _trip_flight_slots(a) != _trip_flight_slots(b)
