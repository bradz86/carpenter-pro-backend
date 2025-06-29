#!/bin/bash
# Test script to verify server starts correctly

echo "Testing Carpenter Pro Backend..."
echo "Starting server on port 3000..."

# Set test environment
export PORT=3000
export NODE_ENV=test

# Start server in background
node server.js &
SERVER_PID=$!

# Wait for server to start
sleep 5

# Test health endpoint
echo "Testing health endpoint..."
curl -f http://localhost:3000/health

# Check if curl was successful
if [ $? -eq 0 ]; then
    echo "✅ Health check passed!"
else
    echo "❌ Health check failed!"
fi

# Kill the server
kill $SERVER_PID

echo "Test complete."
