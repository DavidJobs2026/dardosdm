#!/bin/bash

PNPM="/Users/davidjimenezrodriguez/Library/pnpm/bin/pnpm"
DIR="$HOME/tournament-app"

echo ""
echo "╔════════════════════════════════╗"
echo "║     🏆  TournamentHub          ║"
echo "╚════════════════════════════════╝"
echo ""

# 1. PostgreSQL
echo "▶ Arrancando base de datos..."
/opt/homebrew/bin/brew services start postgresql@16 > /dev/null 2>&1
sleep 2
echo "  ✅ Base de datos lista"

# 2. Servidor API
echo "▶ Arrancando servidor API (puerto 4000)..."
lsof -ti :4000 | xargs kill -9 2>/dev/null
cd "$DIR/server"
$PNPM dev > /tmp/tournament-server.log 2>&1 &
sleep 3
echo "  ✅ Servidor API listo → http://localhost:4000"

# 3. Web
echo "▶ Arrancando web (puerto 3000)..."
lsof -ti :3000 | xargs kill -9 2>/dev/null
cd "$DIR/apps/web"
$PNPM dev > /tmp/tournament-web.log 2>&1 &
sleep 4

echo ""
echo "╔════════════════════════════════╗"
echo "║  ✅ Todo listo!                ║"
echo "║                                ║"
echo "║  🌐 Web:  http://localhost:3000 ║"
echo "║  ⚙️  API:  http://localhost:4000 ║"
echo "╚════════════════════════════════╝"
echo ""
echo "  👤 organizer@tournament.com / password123"
echo "  👤 alice@tournament.com     / password123"
echo ""
echo "  Para parar todo: bash ~/tournament-app/stop.sh"
echo ""

open http://localhost:3000
