# start.sh

# Auto-allocate ports from Conductor's assigned range (CONDUCTOR_PORT gives first of 10)
if [ -n "$CONDUCTOR_PORT" ]; then
  export BACKEND_PORT=$((CONDUCTOR_PORT))
  export FRONTEND_PORT=$((CONDUCTOR_PORT + 1))
  export REDIS_PORT=$((CONDUCTOR_PORT + 2))
  export CORS_ORIGIN="http://localhost:${FRONTEND_PORT}"
  export GOOGLE_REDIRECT_URI="http://localhost:${BACKEND_PORT}/api/auth/google/callback"
  echo "Using Conductor ports: backend=$BACKEND_PORT, frontend=$FRONTEND_PORT, redis=$REDIS_PORT"
fi

docker compose down
docker compose build --no-cache
docker compose up -d
docker compose logs -f
