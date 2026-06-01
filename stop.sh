#!/bin/bash

echo ""
echo "⏹  Parando TournamentHub..."

lsof -ti :4000 | xargs kill -9 2>/dev/null && echo "  ✅ Servidor API parado"
lsof -ti :3000 | xargs kill -9 2>/dev/null && echo "  ✅ Web parada"

echo "  ✅ Todo parado."
echo ""
