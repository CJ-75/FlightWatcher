from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from deals.stay_time import deal_start_still_upcoming, paris_today_iso


def test_paris_today_iso_format():
    assert len(paris_today_iso()) == 10


def test_deal_without_time_keeps_today_and_future():
    today = paris_today_iso()
    assert deal_start_still_upcoming({"out_date": today})
    assert deal_start_still_upcoming({"dates": {"outbound": today}})
    assert not deal_start_still_upcoming({"out_date": "2020-01-01"})


def test_deal_with_past_flight_time_excluded():
    paris = ZoneInfo("Europe/Paris")
    past = (datetime.now(paris) - timedelta(hours=1)).replace(tzinfo=None)
    raw = past.strftime("%Y-%m-%dT%H:%M:00")
    assert not deal_start_still_upcoming(
        {
            "out_date": past.date().isoformat(),
            "flight": {"outbound_local": raw},
        }
    )


def test_deal_with_future_flight_time_kept():
    paris = ZoneInfo("Europe/Paris")
    future = (datetime.now(paris) + timedelta(hours=3)).replace(tzinfo=None)
    raw = future.strftime("%Y-%m-%dT%H:%M:00")
    assert deal_start_still_upcoming(
        {
            "out_date": future.date().isoformat(),
            "flight_snapshot": {"out_dep_local": raw},
        }
    )
