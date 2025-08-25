# Object Detection Application

A full-stack web application for object detection using YOLOv8 model with FastAPI backend and React frontend.

## Features

- Upload images for object detection
- Real-time object detection using YOLOv8
- Display of detection results with bounding boxes
- List of detected objects with confidence scores
- Responsive design that works on desktop and mobile

## Prerequisites

- Python 3.8+
- Node.js 14+
- npm or yarn

## Setup Instructions

### Backend Setup

1. Navigate to the project root directory:
   ```bash
   cd path/to/object_detection_project
   ```

2. Create and activate a virtual environment (recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the FastAPI server:
   ```bash
   cd app
   uvicorn main:app --reload
   ```

   The backend server will be available at `http://localhost:8000`

### Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Start the React development server:
   ```bash
   npm start
   ```

   The frontend will be available at `http://localhost:3000`

## Usage

1. Open your web browser and navigate to `http://localhost:3000`
2. Click "Choose an image..." to select an image file
3. Click "Detect Objects" to process the image
4. View the detection results with bounding boxes and object list

## Project Structure

```
Object_detection_project/
├── app/                    # Backend code
│   └── main.py             # FastAPI application
├── frontend/               # Frontend React application
│   ├── public/
│   └── src/
│       ├── App.js          # Main React component
│       ├── App.css         # Styling
│       └── ...
├── models/                 # YOLO model files
├── uploads/                # Directory for uploaded images
├── requirements.txt        # Python dependencies
└── README.md              # This file
```

## API Endpoints

- `POST /detect`: Upload an image for object detection
  - Request: Form-data with 'file' field containing the image
  - Response: JSON with detection results and image URLs

## License

This project is licensed under the MIT License.
