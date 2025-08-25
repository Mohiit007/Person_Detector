# Person Detector

A full-stack web application branded as "Person Detector". It performs object/face detection using a YOLOv8 model with a FastAPI backend and a React (Vite) frontend.

<!-- Badges -->
![Python](https://img.shields.io/badge/Python-3.8%2B-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.104.1-009688)
![Uvicorn](https://img.shields.io/badge/Uvicorn-0.24.0-4B8BBE)
![React](https://img.shields.io/badge/React-18-61dafb)
![Vite](https://img.shields.io/badge/Vite-5-646cff)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- Upload images for object detection
- Real-time object detection using YOLOv8
- Display of detection results with bounding boxes
- List of detected objects with confidence scores
- Responsive design that works on desktop and mobile

## Tech Stack

- Backend: FastAPI, Uvicorn, PyTorch, Ultralytics (YOLOv8), OpenCV
- Frontend: React + Vite
- Packaging: `requirements.txt` (Python), `package.json` (Node)
- Model weights: `.pt` files under `models/`

## Prerequisites

- Python 3.8+
- Node.js 16+
- npm or yarn

## Setup Instructions

### Backend Setup

1. Navigate to the project root directory:
   ```bash
   cd path/to/Person_detector
   ```

2. Create and activate a virtual environment (recommended):
   ```bash
   python -m venv venv
   # macOS/Linux
   source venv/bin/activate
   # Windows (PowerShell)
   .\venv\Scripts\Activate.ps1
   ```

3. Install backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the FastAPI server (from the project root):
   ```bash
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

   The backend server will be available at `http://127.0.0.1:8000`

### Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Start the React development server (Vite):
   ```bash
   npm run dev
   ```

   The frontend will be available at the URL Vite prints (usually `http://localhost:5173`).

## Usage

1. Open your web browser and navigate to the Vite URL (usually `http://localhost:5173`)
2. Click "Choose an image..." to select an image file
3. Click "Detect Objects" to process the image
4. View the detection results with bounding boxes and object list

## Screenshots / GIFs

Add your UI previews under `docs/screenshots/` and reference them here. Example:

```markdown
![Overview](docs/screenshots/overview.png)
![Detection Flow](docs/screenshots/detection.gif)
```

Tips:
- Prefer small, optimized images/GIFs.
- Keep large media out of Git by using Git LFS or linking from releases/issues if needed.

## Project Structure

```
Person_detector/
├── app/                    # Backend code
│   └── main.py             # FastAPI application
├── frontend/               # Frontend React application
│   ├── public/
│   └── src/
│       ├── App.js          # Main React component
│       ├── App.css         # Styling
│       └── ...
├── models/                 # YOLO model files (.pt)
├── app/uploads/           # Directory for uploaded and result images
├── requirements.txt        # Python dependencies
└── README.md              # This file
```

## API Endpoints

- `GET /` — Basic API status
- `GET /health` — Health check with device info (CPU/GPU)
- `POST /detect` — Upload an image for detection
  - Request: multipart/form-data with field `file`
  - Response: JSON with detections and image URLs under `/uploads`
- `POST /detect/live` — Send raw image bytes for detection (no disk writes)
- `GET /uploads/{filename}` — Serve uploaded/result images

Notes:
- The face detection model path defaults to `models/face_detection.pt`. You can override via env vars `FACE_MODEL_PATH` or `MODEL_PATH`.
- Uploads are saved to `app/uploads/` and auto-served by the backend.

## Environment Variables

`app/main.py` supports overriding the model location via environment variables:

- `FACE_MODEL_PATH` — Absolute or relative path to a `.pt` model to use for detection
- `MODEL_PATH` — Fallback variable (used if `FACE_MODEL_PATH` is not set)

Examples:

```bash
# Windows PowerShell
$env:FACE_MODEL_PATH="C:\\path\\to\\models\\face_detection.pt"; uvicorn app.main:app --reload

# macOS/Linux
export FACE_MODEL_PATH="/absolute/path/to/models/face_detection.pt"
uvicorn app.main:app --reload
```

If neither is set, the app will look for `models/face_detection.pt` under the project root.

## Running both servers together (dev)

Open two terminals:
- Terminal A (backend):
  ```bash
  uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
  ```
- Terminal B (frontend):
  ```bash
  cd frontend
  npm run dev
  ```
Configure the frontend to call the backend at `http://127.0.0.1:8000`.

## Deployment

### Option A: Docker (backend) + any static host (frontend)

Backend `Dockerfile` (place at project root):

```dockerfile
FROM python:3.10-slim AS runtime

WORKDIR /app

# System deps (opencv requirements)
RUN apt-get update && apt-get install -y \
    libglib2.0-0 libsm6 libxrender1 libxext6 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy only backend code and models
COPY app ./app
COPY models ./models

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run:

```bash
docker build -t person-detector-backend .
docker run -p 8000:8000 --name person-detector person-detector-backend
```

Frontend build and serve (one-liner for preview):

```bash
cd frontend
npm install
npm run build
npm run preview  # serves on 4173 by default
```

For production static serving, copy `frontend/dist/` to any static host (Nginx, Netlify, Vercel, S3+CloudFront, etc.).

### Option B: docker-compose (backend + frontend dev)

Example `docker-compose.yml` for local dev:

```yaml
version: "3.8"
services:
  backend:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - ./app:/app/app
      - ./models:/app/models
      - ./app/uploads:/app/app/uploads
    environment:
      - FACE_MODEL_PATH=/app/models/face_detection.pt

  frontend:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - ./frontend:/app
    command: sh -c "npm install && npm run dev -- --host"
    ports:
      - "5173:5173"
```

Run:

```bash
docker compose up --build
```

### Hosting notes

- Render/Railway/Fly.io: deploy the backend container with port 8000 and health path `/health`.
- Netlify/Vercel: serve `frontend/dist/` as a static site; configure env var `VITE_API_BASE_URL` if your frontend uses one.
- If placing behind a reverse proxy, ensure CORS is allowed in the backend (currently `allow_origins=["*"]` in `app/main.py`).

## Git: Initialize and push to GitHub

```bash
# From project root
git init
git branch -M main
git add .
git commit -m "Initial commit: Person_detector"
git remote add origin https://github.com/<your-username>/Person_detector.git
git push -u origin main
```

## License

This project is licensed under the MIT License.
