#!/bin/bash

echo "========================================"
echo "  FlightWatcher - Démarrage"
echo "========================================"
echo ""

echo "[1/2] Démarrage du backend..."
cd backend
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

sleep 2

echo "[2/2] Démarrage du frontend..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "========================================"
echo "  Services démarrés !"
echo "========================================"
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo ""
echo "  PID Backend:  $BACKEND_PID"
echo "  PID Frontend: $FRONTEND_PID"
echo ""
echo "  Appuyez sur Ctrl+C pour arrêter"
echo ""

wait

