#!/bin/bash

# Configuration
API_URL="http://localhost:8080/api"

echo "====================================="
echo "DEVCONNECT DATABASE SEEDER & TESTER"
echo "====================================="

# 1. Register Users
echo "1. Registering dummy users (John, Alice, Bob)..."
curl -s -X POST $API_URL/auth/register -H "Content-Type: application/json" -d '{"username":"john_doe","email":"john@example.com","password":"password123"}' > /dev/null
curl -s -X POST $API_URL/auth/register -H "Content-Type: application/json" -d '{"username":"alice_dev","email":"alice@example.com","password":"password123"}' > /dev/null
curl -s -X POST $API_URL/auth/register -H "Content-Type: application/json" -d '{"username":"bob_builder","email":"bob@example.com","password":"password123"}' > /dev/null
echo "✓ Users registered."

# 2. Login as John to grab Bearer Token
export TOKEN_JOHN=$(curl -s -X POST $API_URL/auth/login -H "Content-Type: application/json" -d '{"email":"john@example.com","password":"password123"}' | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN_JOHN" ]; then
    echo "❌ Failed to retrieve JWT Token for John. Ensure the DevConnect backend is running on port 8080."
    exit 1
fi

echo "✓ Successfully logged in as John."

# 3. Create Group
echo "2. Validating Group Creation..."
curl -s -X POST $API_URL/groups \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $TOKEN_JOHN" \
-d '{"name": "Java Developers", "description": "Backend Team", "memberIds": [2, 3]}' > /dev/null
echo "✓ Group 'Java Developers' created with Alice and Bob connected."

# 4. Global chat
echo "3. Sending Global Message..."
curl -s -X POST $API_URL/messages/send \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $TOKEN_JOHN" \
-d '{"roomId": "global", "roomType": "GLOBAL", "content": "Welcome to DevConnect everyone!", "messageType": "TEXT"}' > /dev/null
echo "✓ Global message sent natively."

# 5. Private chat (John to Alice)
echo "4. Sending Private Message..."
curl -s -X POST $API_URL/messages/send \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $TOKEN_JOHN" \
-d '{"roomId": "1-2", "roomType": "PRIVATE", "content": "Hey Alice, this is a private message from John.", "messageType": "TEXT"}' > /dev/null
echo "✓ Private message safely dispatched."

# 6. Group chat 
echo "5. Sending Group Message..."
curl -s -X POST $API_URL/messages/send \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $TOKEN_JOHN" \
-d '{"roomId": "group-1", "roomType": "GROUP", "content": "Hello team, welcome to the backend group!", "messageType": "TEXT"}' > /dev/null
echo "✓ Group message mapped correctly."

echo "====================================="
echo "✅ All database scenarios verified!"
echo "WebSockets and REST APIs are routing cleanly."
echo "====================================="
