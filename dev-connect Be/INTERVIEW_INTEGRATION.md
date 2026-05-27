# Mock Interview Rooms — Frontend Integration Guide

Complete, standalone module for hosting realistic mock interviews.
Anyone can interview anyone — covers DSA, system design, behavioral, HR,
frontend, backend, devops, ML, PM and more.

This doc gives the integrator everything they need:

- **Architecture & flow**
- **Tab-by-tab UI plan**
- **All REST cURLs**
- **All WebSocket destinations + payloads**
- **All event types they will receive**
- **Sample end-to-end flow**

---

## 1. Architecture

```
                ┌──────────────────────────────┐
   REST ───────►│  /api/interview/**           │  Lobby + types + Q-bank + history + feedback
                └──────────────────────────────┘
                              │
                              ▼
                ┌──────────────────────────────┐
   STOMP ─────► │  /app/interview/**           │  Live room actions
                │  /topic/interview/{roomId}   │  Broadcast to all participants
                │  /user/queue/interview       │  Private (state, errors, notes)
                └──────────────────────────────┘
```

- **Stateless REST** for lobby browse, room create, history, feedback.
- **WebSocket (STOMP over SockJS)** for everything live: code editor sync,
  whiteboard, timer, chat, question push, evaluation, recording state.
- **Reuses** existing `/ws` SockJS endpoint and `WebSocketAuthInterceptor`
  (Bearer token in CONNECT frame).
- **Reuses** existing `/api/signal/**` and signaling controller for WebRTC
  audio/video. Mock interview only manages app state.

---

## 2. Tabs (recommended UI)

| # | Tab            | What lives here |
|---|----------------|-----------------|
| 1 | **Lobby**       | Listing of public rooms, "Create Room" CTA, filter by type/level |
| 2 | **Create Room** | Form: title, type, level, duration, max participants, public/private + access code, recording on/off |
| 3 | **Room (live)** | Split layout: video tiles, code editor, whiteboard tab, question pane, timer, chat, role badge, leave/end controls |
| 4 | **Question Bank** | Browse + filter; each card shows title, level, tags, recommended time |
| 5 | **History**      | Past interviews you participated in — date, role, type, recording link |
| 6 | **Feedback**     | Feedback received about you (ratings + STAR notes) and feedback you gave |
| 7 | **Stats / Profile** | Aggregated: # given, # taken, avg rating, top tags |

---

## 3. Auth

All authenticated REST calls and the WS CONNECT frame need:

```
Authorization: Bearer <JWT>
```

Public endpoints (no auth needed):
- `GET /api/interview/types`
- `GET /api/interview/levels`
- `GET /api/interview/rooms`
- `GET /api/interview/rooms/{roomId}`
- `GET /api/interview/questions`
- `GET /api/interview/questions/{id}`
- `GET /api/interview/questions/random`

---

## 4. REST API — full cURL set

Set base URL once:
```bash
BASE=http://localhost:8080
TOKEN=eyJhbGciOi...   # JWT from /api/auth/login
```

### 4.1 List interview types

```bash
curl -s "$BASE/api/interview/types"
```

Response:
```json
{ "success": true, "message": "Interview types",
  "data": [
    {"type":"DSA","name":"DSA"},
    {"type":"SYSTEM_DESIGN","name":"SYSTEM DESIGN"},
    {"type":"BEHAVIORAL","name":"BEHAVIORAL"},
    {"type":"HR","name":"HR"},
    {"type":"FRONTEND","name":"FRONTEND"},
    {"type":"BACKEND","name":"BACKEND"},
    ...
  ]
}
```

### 4.2 List seniority levels

```bash
curl -s "$BASE/api/interview/levels"
```

### 4.3 List open rooms (lobby)

```bash
curl -s "$BASE/api/interview/rooms"
```

### 4.4 Create a room

```bash
curl -s -X POST "$BASE/api/interview/rooms" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Senior Backend Mock",
    "type": "BACKEND",
    "level": "SENIOR",
    "durationMinutes": 60,
    "maxParticipants": 4,
    "isPublic": true,
    "accessCode": null,
    "role": "INTERVIEWER",
    "recordingEnabled": false
  }'
```

Response includes `roomId` — use it for everything else.

### 4.5 Get room state snapshot

```bash
curl -s "$BASE/api/interview/rooms/$ROOM_ID"
```

Snapshot includes:
- `participants[]` (username, role, ready, video/audio state)
- `currentQuestion` (id, title, description, examples, hintCount, starterCode, language)
- `revealedHints[]`
- `code` (code, language, editedBy, updatedAt)
- `whiteboardOps[]`
- `chatLog[]`
- `feedbacks[]`
- `status`, `remainingSeconds`, `durationMinutes`

Call this on cold-load if the user navigates directly into a room URL.

### 4.6 Browse question bank

```bash
# All
curl -s "$BASE/api/interview/questions"

# Filter
curl -s "$BASE/api/interview/questions?type=DSA&level=MID&tag=array"

# Random
curl -s "$BASE/api/interview/questions/random?type=SYSTEM_DESIGN&level=SENIOR"

# Detail
curl -s "$BASE/api/interview/questions/$QUESTION_ID"
```

### 4.7 History

```bash
curl -s "$BASE/api/interview/history" -H "Authorization: Bearer $TOKEN"
```

### 4.8 Feedback received

```bash
curl -s "$BASE/api/interview/feedback" -H "Authorization: Bearer $TOKEN"
```

### 4.9 Submit feedback (post-interview)

```bash
curl -s -X POST "$BASE/api/interview/feedback" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "roomId": "abc12345",
    "toUsername": "candidate_alice",
    "verdict": "HIRE",
    "overallRating": 4,
    "skillRatings": {
      "problemSolving": 4,
      "codeQuality": 5,
      "communication": 4,
      "dataStructures": 4,
      "systemDesign": 3
    },
    "strengths": "Clean code, asked great clarifying questions.",
    "improvements": "Could improve on time complexity analysis.",
    "detailedNotes": "Solved 2 of 3 problems...",
    "tags": ["recommended", "strong-coding"]
  }'
```

---

## 5. WebSocket setup

Use **STOMP over SockJS**. Same endpoint as the rest of the app: `/ws`.

```js
// Frontend (sockjs + @stomp/stompjs)
import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";

const client = new Client({
  webSocketFactory: () => new SockJS(`${BASE}/ws`),
  connectHeaders: { Authorization: `Bearer ${TOKEN}` },
  reconnectDelay: 3000,
  onConnect: () => {
    // 1) Subscribe to room broadcast
    client.subscribe(`/topic/interview/${roomId}`, (msg) =>
      handleRoomEvent(JSON.parse(msg.body))
    );
    // 2) Subscribe to private events (state snapshot, errors, private notes)
    client.subscribe(`/user/queue/interview`, (msg) =>
      handlePrivateEvent(JSON.parse(msg.body))
    );
    // 3) Join the room
    client.publish({
      destination: `/app/interview/join/${roomId}`,
      body: JSON.stringify({ role: "CANDIDATE", accessCode: null }),
    });
  },
});
client.activate();
```

> **First event you receive** after `join` is `ROOM_STATE` on
> `/user/queue/interview`. Use it to seed the entire UI.

---

## 6. WebSocket destinations (client → server)

All payloads are JSON. `roomId` is required where shown.

| Destination                              | Purpose                              | Payload |
|------------------------------------------|--------------------------------------|---------|
| `/app/interview/join/{roomId}`           | Join the room                        | `{ "role": "INTERVIEWER\|CANDIDATE\|OBSERVER", "accessCode": "optional" }` |
| `/app/interview/leave/{roomId}`          | Leave the room                       | `{}` |
| `/app/interview/role/{roomId}`           | Change role (host/interviewer only)  | `{ "role": "OBSERVER" }` |
| `/app/interview/ready/{roomId}`          | Toggle ready                          | `{ "ready": true }` |
| `/app/interview/media`                   | Update media state                    | `{ "roomId":"..", "videoOn":true, "audioOn":false, "screenSharing":true }` |
| `/app/interview/start/{roomId}`          | Host: start interview                 | `{}` |
| `/app/interview/end/{roomId}`            | Host: end interview                   | `{}` |
| `/app/interview/timer`                   | Control timer (interviewer/host)      | `{ "roomId":"..", "action":"START\|PAUSE\|RESUME\|RESET\|ADD_TIME\|SET", "seconds":120 }` |
| `/app/interview/question`                | Push/clear/hint question              | see below |
| `/app/interview/code`                    | Code editor sync                      | `{ "roomId":"..", "code":"...", "language":"javascript", "cursorLine":12, "cursorColumn":4, "patch":{...} }` |
| `/app/interview/whiteboard`              | Whiteboard ops                        | `{ "roomId":"..", "op":"stroke\|shape\|text\|erase\|clear", "data":{...} }` |
| `/app/interview/chat`                    | Send chat or private note             | `{ "roomId":"..", "message":"...", "privateNote":false, "questionId":"q1" }` |
| `/app/interview/evaluate`                | Per-question evaluation               | `{ "roomId":"..", "questionId":"q1", "verdict":"SOLVED\|PARTIAL\|NOT_SOLVED", "score":8, "comments":"..." }` |
| `/app/interview/recording/{roomId}`      | Toggle recording / publish URL        | `{ "started": true, "url":"..." }` or `{ "publishedUrl":"https://cdn/.../rec.mp4" }` |

### Question payloads

Push from bank:
```json
{ "roomId":"r1", "action":"PUSH_FROM_BANK", "questionId":"q-id-from-bank" }
```

Push custom:
```json
{
  "roomId":"r1",
  "action":"PUSH_CUSTOM",
  "title":"Reverse a linked list",
  "description":"...",
  "starterCode":"function reverse(head) {}",
  "language":"javascript",
  "recommendedTimeMinutes":20
}
```

Reveal hint:
```json
{ "roomId":"r1", "action":"REVEAL_HINT", "hintIndex":0 }
```

Clear:
```json
{ "roomId":"r1", "action":"CLEAR" }
```

---

## 7. Events (server → client)

All events arrive on either `/topic/interview/{roomId}` (broadcast) or
`/user/queue/interview` (private). Shape:

```ts
type InterviewEvent = {
  type: string;          // see enum below
  roomId: string;
  status?: string;       // WAITING | IN_PROGRESS | PAUSED | ENDED
  message?: string;
  actor?: string;        // who triggered it
  // typed payloads (only the ones relevant to the event type are populated)
  participants?: Participant[];
  hostUsername?: string;
  durationMinutes?: number;
  remainingSeconds?: number;
  question?: Question;
  hintIndex?: number;
  hint?: string;
  code?: { code, language, editedBy, updatedAt, cursorLine?, cursorColumn?, patch? };
  op?: string;
  whiteboard?: { op, by, at, data };
  sender?: string;
  content?: string;
  privateNote?: boolean;
  questionId?: string;
  evaluation?: { questionId, verdict, score, comments, by, at };
  feedback?: Feedback;
  recordingUrl?: string;
  data?: Record<string, any>;   // ROOM_STATE full snapshot
};
```

Event types:

| Type                     | When                                       | Where        |
|--------------------------|--------------------------------------------|--------------|
| `ROOM_STATE`             | Right after you `join` (full snapshot)     | private      |
| `PARTICIPANT_JOINED`     | Someone joined / reconnected                | broadcast    |
| `PARTICIPANT_LEFT`       | Someone left                                | broadcast    |
| `ROLE_CHANGED`           | A participant role was changed              | broadcast    |
| `READY_STATE_CHANGED`    | Someone toggled ready                       | broadcast    |
| `MEDIA_STATE_CHANGED`    | Camera/mic/share toggle                     | broadcast    |
| `INTERVIEW_STARTED`      | Host pressed start                          | broadcast    |
| `INTERVIEW_PAUSED`       | Host paused                                 | broadcast    |
| `INTERVIEW_RESUMED`      | Host resumed                                | broadcast    |
| `INTERVIEW_ENDED`        | Host ended → time to fill feedback          | broadcast    |
| `QUESTION_PUSHED`        | New question presented                      | broadcast    |
| `HINT_REVEALED`          | Interviewer released a hint                 | broadcast    |
| `QUESTION_CLEARED`       | Question removed                            | broadcast    |
| `CODE_UPDATED`           | Code editor changed                         | broadcast    |
| `WHITEBOARD_UPDATED`     | New stroke / shape / text                   | broadcast    |
| `WHITEBOARD_CLEARED`     | Cleared                                     | broadcast    |
| `TIMER_STARTED`          | Timer started                               | broadcast    |
| `TIMER_TICK`             | Every 5s, every 1s for last 30s, on ADD/SET | broadcast    |
| `TIMER_PAUSED`           | Paused                                      | broadcast    |
| `TIMER_RESUMED`          | Resumed                                     | broadcast    |
| `TIMER_RESET`            | Reset to full duration                      | broadcast    |
| `TIMER_EXPIRED`          | Time hit zero                               | broadcast    |
| `CHAT_MESSAGE`           | Public chat                                 | broadcast    |
| `PRIVATE_NOTE_ADDED`     | Interviewer-only note                       | private (to interviewers) |
| `EVALUATION_SUBMITTED`   | Per-question evaluation                     | broadcast    |
| `FEEDBACK_SUBMITTED`     | Final feedback                              | broadcast    |
| `RECORDING_STARTED`      | Recording on                                | broadcast    |
| `RECORDING_STOPPED`      | Recording off                               | broadcast    |
| `RECORDING_AVAILABLE`    | Recording uploaded, URL ready               | broadcast    |
| `ERROR`                  | Anything that failed                        | private      |

---

## 8. End-to-end flow

```
[Interviewer]                              [Candidate]
    │                                          │
    │  POST /api/interview/rooms (create)      │
    │  ───────────────► roomId returned        │
    │                                          │
    │  CONNECT /ws (Bearer)                    │  CONNECT /ws (Bearer)
    │  SUB /topic/interview/{roomId}           │  SUB /topic/interview/{roomId}
    │  SUB /user/queue/interview               │  SUB /user/queue/interview
    │  SEND /app/interview/join/{roomId}       │  SEND /app/interview/join/{roomId}
    │       {role:INTERVIEWER}                 │       {role:CANDIDATE}
    │                                          │
    │  ◄── ROOM_STATE (private)                │  ◄── ROOM_STATE (private)
    │  ◄── PARTICIPANT_JOINED (both)           │  ◄── PARTICIPANT_JOINED (both)
    │                                          │
    │  SEND /app/interview/start/{roomId}      │
    │  ◄── INTERVIEW_STARTED + TIMER_STARTED   │  ◄── INTERVIEW_STARTED + TIMER_STARTED
    │                                          │
    │  SEND /app/interview/question            │
    │       {action:PUSH_FROM_BANK,            │
    │        questionId:"q-xxxx"}              │
    │  ◄── QUESTION_PUSHED                     │  ◄── QUESTION_PUSHED
    │                                          │
    │                              SEND /app/interview/code (every keystroke, debounced)
    │  ◄── CODE_UPDATED                        │  ◄── CODE_UPDATED (echo, can ignore for editor owner)
    │                                          │
    │  SEND /app/interview/question REVEAL_HINT (when stuck)
    │  ◄── HINT_REVEALED                       │  ◄── HINT_REVEALED
    │                                          │
    │  SEND /app/interview/evaluate            │
    │       {questionId, verdict:"SOLVED",     │
    │        score:8}                          │
    │  ◄── EVALUATION_SUBMITTED                │  ◄── EVALUATION_SUBMITTED
    │                                          │
    │  SEND /app/interview/end/{roomId}        │
    │  ◄── INTERVIEW_ENDED                     │  ◄── INTERVIEW_ENDED
    │                                          │
    │  POST /api/interview/feedback            │
    │  ────────────────► fb id returned        │
```

---

## 9. Frontend implementation pointers

### Code editor
- Use Monaco / CodeMirror.
- Debounce `CODE_UPDATED` sends (e.g., 200ms).
- Apply incoming `CODE_UPDATED` only when `editedBy !== self`.
- Persist cursor position with `cursorLine` / `cursorColumn` if you want
  to render remote carets.

### Whiteboard
- Use Excalidraw / tldraw / your own canvas.
- Encode each operation in `data`. Server doesn't interpret it — it just
  fans out and stores so late joiners can replay (`whiteboardOps[]` in
  `ROOM_STATE`).

### Timer
- Don't local-tick from a server tick — render
  `remainingSeconds - (now - lastTickTime)` for smoothness.
- Server emits `TIMER_TICK` every 5s + last-30s rapid mode.

### WebRTC video/audio
- Use the existing `/api/signal/**` controller (already in the project).
- Treat audio/video toggles as *cosmetic* state via `MEDIA_STATE_CHANGED` —
  the actual mute happens in your local MediaStream tracks.

### Recording
- Record locally with `MediaRecorder`, upload the blob to your storage,
  then send `{ "publishedUrl": "https://cdn/.../rec.mp4" }` over
  `/app/interview/recording/{roomId}` — backend broadcasts
  `RECORDING_AVAILABLE` so everyone can grab the link.

### Reconnect / late join
- On socket reconnect, just resubscribe and `join` again. Server treats
  re-join as reconnect, then re-sends `ROOM_STATE`.

### Roles & permissions (server-enforced)
- Only host can: start, end, transfer, set duration.
- Only interviewer / host can: control timer, push questions, reveal
  hints, evaluate, toggle recording, send private notes.
- Candidates can: edit code, edit whiteboard, chat, toggle media.
- Observers: read-only.

---

## 10. Smoke test (one-shot)

```bash
BASE=http://localhost:8080

# 1) login (assuming /api/auth/login exists)
TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"pass"}' | jq -r .data.token)

# 2) create room
ROOM=$(curl -s -X POST $BASE/api/interview/rooms \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"type":"DSA","level":"MID","durationMinutes":45,"role":"INTERVIEWER"}' \
  | jq -r .data.roomId)
echo "Room: $ROOM"

# 3) lobby should now list it
curl -s $BASE/api/interview/rooms | jq .

# 4) browse bank
curl -s "$BASE/api/interview/questions?type=DSA&level=MID" | jq .

# 5) get a random Q
curl -s "$BASE/api/interview/questions/random?type=DSA" | jq .
```

Then connect a SockJS client to `/ws` to play the live flow.

---

## 11. File map

```
backend/src/main/java/com/devconnect/interview/
├── model/
│   ├── InterviewType.java         (15 categories)
│   ├── InterviewLevel.java        (INTERN..PRINCIPAL)
│   ├── ParticipantRole.java       (INTERVIEWER | CANDIDATE | OBSERVER)
│   ├── InterviewRoom.java         (room state, timer, code, whiteboard, chat)
│   ├── InterviewParticipant.java  (per-user state)
│   ├── Question.java              (bank entry)
│   ├── Feedback.java              (post-interview rating)
│   └── CodeSnapshot.java          (code editor state)
├── dto/
│   ├── CreateInterviewRoomRequest.java
│   ├── JoinInterviewRoomRequest.java
│   ├── CodeUpdateRequest.java
│   ├── WhiteboardUpdateRequest.java
│   ├── QuestionControlRequest.java
│   ├── TimerControlRequest.java
│   ├── ChatMessageRequest.java
│   ├── MediaStateRequest.java
│   ├── EvaluationRequest.java
│   ├── FeedbackRequest.java
│   └── InterviewEvent.java        (server → client unified envelope)
├── service/
│   ├── QuestionBankService.java   (in-memory seeded bank)
│   └── InterviewRoomService.java  (orchestrator)
└── controller/
    ├── InterviewController.java          (REST)
    └── InterviewWebSocketController.java (STOMP)
```

That's it — production-shaped, drop-in module. Frontend can build the
seven tabs against the contracts above with no further backend coordination.
