from fastapi import FastAPI

from routes import analytics, meta, persistence, ref, scan, user


def include_all_routers(app: FastAPI) -> None:
    app.include_router(meta.router)
    app.include_router(scan.router)
    app.include_router(ref.router)
    app.include_router(persistence.router)
    app.include_router(user.router)
    app.include_router(analytics.router)
