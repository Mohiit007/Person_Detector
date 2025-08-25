from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import uuid
from pathlib import Path
from typing import List, Optional
import cv2
import numpy as np
from ultralytics import YOLO
import torch

app = FastAPI(
    title="Object Detection API",
    version="1.0.0",
    description="A REST API for object detection using YOLOv8"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Resolve important paths relative to this file to avoid CWD issues
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent

# Create uploads directory inside the app folder
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Load the Face Detection model
# You can override via environment variable MODEL_PATH or FACE_MODEL_PATH
env_model = os.getenv("FACE_MODEL_PATH") or os.getenv("MODEL_PATH")
MODEL_PATH = Path(env_model) if env_model else (PROJECT_ROOT / "models" / "face_detection.pt")

# Check if CUDA is available for GPU acceleration
device = 'cuda' if torch.cuda.is_available() else 'cpu'
try:
    model_source = None
    if Path(MODEL_PATH).exists():
        model_source = str(MODEL_PATH)
    else:
        if env_model:
            # Env var points to a non-existing file
            print(f"[WARN] Specified model path does not exist: {MODEL_PATH}")
            model_source = str(MODEL_PATH)  # will raise below
        else:
            # No local file and no env override; keep using configured path (will raise) to make issue explicit
            print(f"[ERROR] Face model not found at expected path: {MODEL_PATH}. Place 'face_detection.pt' under 'models/' or set FACE_MODEL_PATH/MODEL_PATH env var.")
            model_source = str(MODEL_PATH)

    model = YOLO(model_source).to(device)
    print(f"Model loaded successfully on {device.upper()} from {model_source}")
except Exception as e:
    print(f"Error loading model from {MODEL_PATH}: {e}")
    model = None

@app.get("/")
async def root():
    return {"message": "Object Detection API is running"}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "device": device}

@app.post("/detect")
async def detect_objects(file: UploadFile = File(...)):
    """
    Process an image and detect objects using YOLOv8.
    
    Args:
        file: The image file to process
        
    Returns:
        dict: Contains paths to the original and processed images, and detection results
    """
    if model is None:
        raise HTTPException(status_code=500, detail="Model not loaded")
        
    try:
        # Validate file type
        allowed_extensions = {'.jpg', '.jpeg', '.png', '.bmp'}
        file_extension = os.path.splitext(file.filename.lower())[1]
        if file_extension not in allowed_extensions:
            raise HTTPException(status_code=400, detail="Invalid file type. Only JPG, JPEG, PNG, and BMP are supported.")

        # Ensure uploads directory exists
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        
        # Save the uploaded file
        filename = f"{uuid.uuid4()}{file_extension}"
        file_path = str(UPLOAD_DIR / filename)
        
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
        
        # Read the image
        image = cv2.imread(file_path)
        if image is None:
            raise HTTPException(status_code=400, detail="Could not read the image")
        
        # Convert BGR to RGB
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Run object detection
        results = model(image_rgb, conf=0.25)  # confidence threshold of 0.25
        
        # Process results
        detections = []
        for result in results:
            boxes = result.boxes.xyxy.cpu().numpy()
            confidences = result.boxes.conf.cpu().numpy()
            class_ids = result.boxes.cls.cpu().numpy()
            
            for i, (box, conf, cls_id) in enumerate(zip(boxes, confidences, class_ids)):
                cls_name = model.names[int(cls_id)]
                detections.append({
                    "id": i,
                    "class": cls_name,
                    "confidence": float(conf),
                    "box": {
                        "x1": float(box[0]),
                        "y1": float(box[1]),
                        "x2": float(box[2]),
                        "y2": float(box[3])
                    }
                })
        
        # Draw bounding boxes on the image
        for det in detections:
            box = det["box"]
            x1, y1, x2, y2 = int(box["x1"]), int(box["y1"]), int(box["x2"]), int(box["y2"])
            
            # Draw rectangle
            cv2.rectangle(image, (x1, y1), (x2, y2), (0, 255, 0), 2)
            
            # Create text label
            label = f"{det['class']} {det['confidence']:.2f}"
            
            # Get text size
            (text_width, text_height), _ = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2
            )
            
            # Draw background rectangle for text
            cv2.rectangle(
                image,
                (x1, y1 - text_height - 10),
                (x1 + text_width, y1),
                (0, 255, 0),
                -1  # Filled rectangle
            )
            
            # Draw text
            cv2.putText(
                image,
                label,
                (x1, y1 - 5),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 0, 0),  # Black text
                1,
                cv2.LINE_AA
            )
        
        # Save the result image
        result_filename = f"result_{filename}"
        result_path = str(UPLOAD_DIR / result_filename)
        # Save as BGR (do not convert to RGB for disk)
        cv2.imwrite(result_path, image)
        
        return {
            "success": True,
            "original_image": f"/uploads/{filename}",
            "processed_image": f"/uploads/{result_filename}",
            "detections": detections,
            "device": device
        }
        
    except Exception as e:
        print(f"Error in detect_objects: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while processing the image: {str(e)}"
        )

@app.post("/detect/live")
async def detect_live(request: Request):
    """
    Live detection endpoint.
    Accepts raw image bytes (e.g., image/jpeg) in the request body and returns detections only.
    Does not write files to disk.
    """
    if model is None:
        raise HTTPException(status_code=500, detail="Model not loaded")

    try:
        # Read bytes
        body = await request.body()
        if not body:
            raise HTTPException(status_code=400, detail="Empty request body")

        # Convert bytes to numpy array and decode image
        np_arr = np.frombuffer(body, np.uint8)
        image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if image is None:
            raise HTTPException(status_code=400, detail="Could not decode image")

        # Convert BGR to RGB for model
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        # Confidence threshold from query string
        try:
            conf_q = request.query_params.get('conf')
            conf = float(conf_q) if conf_q is not None else 0.25
            conf = max(0.0, min(1.0, conf))
        except Exception:
            conf = 0.25

        # Inference
        results = model(image_rgb, conf=conf)

        detections = []
        for result in results:
            boxes = result.boxes.xyxy.cpu().numpy()
            confidences = result.boxes.conf.cpu().numpy()
            class_ids = result.boxes.cls.cpu().numpy()

            for i, (box, conf, cls_id) in enumerate(zip(boxes, confidences, class_ids)):
                cls_name = model.names[int(cls_id)]
                detections.append({
                    "id": i,
                    "class": cls_name,
                    "confidence": float(conf),
                    "box": {
                        "x1": float(box[0]),
                        "y1": float(box[1]),
                        "x2": float(box[2]),
                        "y2": float(box[3])
                    }
                })

        return {
            "success": True,
            "detections": detections,
            "device": device
        }

    except Exception as e:
        print(f"Error in detect_live: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Live detection error: {str(e)}")

# Mount the uploads folder
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

@app.get("/uploads/{filename}")
async def get_uploaded_file(filename: str):
    """Serve uploaded files"""
    file_path = str(UPLOAD_DIR / filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
