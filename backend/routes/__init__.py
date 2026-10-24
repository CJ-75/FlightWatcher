from fastapi import FastAPI

from routes import (
    analytics,
    auth_password,
    deals,
    hotel_bookings,
    hotel_upsell,
    meta,
    persistence,
    planner,
    ref,
    scan,
    user,
)


def include_all_routers(app: FastAPI) -> None:
    app.include_router(meta.router)
    app.include_router(scan.router)
    app.include_router(ref.router)
    app.include_router(persistence.router)
    app.include_router(user.router)
    app.include_router(analytics.router)
    app.include_router(deals.router)
    app.include_router(hotel_bookings.router)
    app.include_router(hotel_upsell.router)
    app.include_router(planner.router)
    app.include_router(auth_password.router)
