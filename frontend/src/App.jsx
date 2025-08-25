import React, { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';

const API_BASE_URL = 'http://localhost:8000';

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [page, setPage] = useState('upload'); // 'upload' | 'live'
  // Theme state
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  });

  // Live detection state/refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const offscreenCanvasRef = useRef(null);
  const intervalRef = useRef(null);
  // File input ref
  const fileInputRef = useRef(null);
  const [liveRunning, setLiveRunning] = useState(false);
  const [liveError, setLiveError] = useState('');
  const [mirror, setMirror] = useState(true);
  // Live tuning
  const [liveFps, setLiveFps] = useState(2); // frames per second
  const [liveConf, setLiveConf] = useState(0.25); // confidence 0-1

  // Toast notifications
  const [toasts, setToasts] = useState([]);
  const showToast = (message, type = 'error', timeout = 3500) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, timeout);
  };

  // Handle drag events
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  // Handle file drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      handleFileChange({ target: { files: [droppedFile] } });
    }
  }, []);

  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/bmp'];
      if (!allowedTypes.includes(selectedFile.type)) {
        setError('Invalid file type. Please upload a JPG, PNG, or BMP image.');
        return;
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (selectedFile.size > maxSize) {
        setError('Image size is too large. Maximum size is 5MB.');
        return;
      }

      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setError('');
      setResult(null);
    }
  };

  // Draw detection boxes on overlay canvas
  const drawDetections = (width, height, detections = []) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 2;
    ctx.font = '14px Arial';
    detections.forEach((det) => {
      let { x1, y1, x2, y2 } = det.box;
      if (mirror) {
        // Mirror horizontally so labels remain readable (canvas not CSS-mirrored)
        const mx1 = width - x2;
        const mx2 = width - x1;
        x1 = mx1;
        x2 = mx2;
      }
      const w = x2 - x1;
      const h = y2 - y1;
      ctx.strokeStyle = getConfidenceColor(det.confidence);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.strokeRect(x1, y1, w, h);
      const label = `${det.class} ${(det.confidence * 100).toFixed(0)}%`;
      const textWidth = ctx.measureText(label).width;
      const textHeight = 16;
      ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
      ctx.fillRect(x1, Math.max(0, y1 - textHeight - 4), textWidth + 8, textHeight + 4);
      ctx.fillStyle = '#000';
      ctx.fillText(label, x1 + 4, Math.max(12, y1 - 4));
    });
  };

  // Capture a frame and send to backend
  const processLiveFrame = async () => {
    try {
      const video = videoRef.current;
      if (!video) return;
      if (video.readyState < 2) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!offscreenCanvasRef.current) {
        offscreenCanvasRef.current = document.createElement('canvas');
      }
      const off = offscreenCanvasRef.current;
      off.width = w;
      off.height = h;
      const ctx = off.getContext('2d');
      ctx.drawImage(video, 0, 0, w, h);
      const blob = await new Promise((resolve) => off.toBlob(resolve, 'image/jpeg', 0.8));
      if (!blob) return;
      try {
        const q = new URLSearchParams({ conf: String(liveConf) }).toString();
        const response = await fetch(`${API_BASE_URL}/detect/live?${q}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: blob,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Live detection failed');
        drawDetections(w, h, data.detections || []);
        setLiveError('');
      } catch (err) {
        console.error(err);
        showToast('Live detection error.', 'error');
        stopLive();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const startLive = async () => {
    setLiveError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setLiveRunning(true);
      // Start interval loop based on FPS
      const interval = Math.max(100, Math.round(1000 / Math.max(1, liveFps)));
      intervalRef.current = setInterval(processLiveFrame, interval);
    } catch (err) {
      showToast('Could not access the webcam.', 'error');
      setLiveRunning(false);
    }
  };

  const stopLive = () => {
    setLiveRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const video = videoRef.current;
    if (video && video.srcObject) {
      const tracks = video.srcObject.getTracks();
      tracks.forEach(t => t.stop());
      video.srcObject = null;
    }
    // Clear overlay
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx && ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  useEffect(() => () => stopLive(), []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // If FPS changes while running, reset interval
  useEffect(() => {
    if (!liveRunning) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    const interval = Math.max(100, Math.round(1000 / Math.max(1, liveFps)));
    intervalRef.current = setInterval(processLiveFrame, interval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [liveFps, liveRunning]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select an image file');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/detect`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Error detecting objects');
      }

      setResult(data);
    } catch (err) {
      setError(err.message || 'An error occurred while processing the image');
    } finally {
      setLoading(false);
    }
  };

  // Reset the form
  const handleReset = () => {
    // Revoke preview URL to free memory
    if (preview) {
      try { URL.revokeObjectURL(preview); } catch {}
    }
    setFile(null);
    setPreview('');
    setResult(null);
    setError('');
    // Clear native file input value
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Get confidence color based on value
  const getConfidenceColor = (confidence) => {
    if (confidence > 0.7) return '#28a745'; // Green
    if (confidence > 0.4) return '#ffc107'; // Yellow
    return '#dc3545'; // Red
  };

  return (
    <div className="app">
      <header className="header sticky">
        <div className="toolbar container">
          <h1 className="title">Face Detection</h1>
          <div className="toolbar-actions">
            <button onClick={toggleTheme} className="btn btn-ghost" aria-label="Toggle theme">
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>
          </div>
        </div>
        <div className="container">
          <p>Upload an image or use webcam for live face detection</p>
          {result?.device && (
            <div className="device-info">Running on: {result.device.toUpperCase()}</div>
          )}
        </div>
      </header>

      <div className="layout container">
        <aside className="sidebar">
          <nav className="nav">
            <button
              className={`nav-item ${page === 'upload' ? 'active' : ''}`}
              onClick={() => setPage('upload')}
            >
              📤 Upload
            </button>
            <button
              className={`nav-item ${page === 'live' ? 'active' : ''}`}
              onClick={() => setPage('live')}
            >
              🎥 Live
            </button>
          </nav>
        </aside>
        <main className="content">
        {page === 'upload' && (
          <section className="upload-section">
          <form 
            className="upload-form" 
            onSubmit={handleSubmit}
            onDragEnter={handleDrag}
          >
            <div 
              className={`file-upload-container ${dragActive ? 'drag-active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                id="file-upload"
                className="file-input"
                accept="image/*"
                onChange={handleFileChange}
                ref={fileInputRef}
              />
              <label htmlFor="file-upload" className="file-label">
                <div className="upload-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                </div>
                <h3>Drag & drop an image here</h3>
                <p>or click to browse files</p>
                {file && (
                  <div className="file-preview">
                    <span>{file.name}</span>
                    <span>{Math.round(file.size / 1024)} KB</span>
                  </div>
                )}
              </label>
            </div>

            {error && <div className="error-message">{error}</div>}
            
            <div className="button-group">
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={handleReset}
                disabled={!file && !result}
              >
                Reset
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={!file || loading}
              >
                {loading ? (
                  <>
                    <span className="spinner"></span>
                    Processing...
                  </>
                ) : (
                  'Detect'
                )}
              </button>
            </div>
          </form>

          {result?.processed_image && (
            <div className="image-wrapper">
              <h3>Detection Results</h3>
              <img 
                src={`${API_BASE_URL}${result.processed_image}`} 
                alt="Detection results" 
                className="image-preview"
              />
            </div>
          )}

            {result?.detections?.length > 0 ? (
              <div className="detections">
                <h3>Detected Objects ({result.detections.length})</h3>
                <div className="detections-grid">
                  {result.detections.map((detection, index) => (
                    <div key={`${detection.class}-${index}`} className="detection-item">
                      <span className="detection-class">
                        {detection.class.replace(/_/g, ' ')}
                      </span>
                      <div className="confidence-bar-container">
                        <div 
                          className="confidence-bar"
                          style={{
                            width: `${(detection.confidence * 100).toFixed(0)}%`,
                            backgroundColor: getConfidenceColor(detection.confidence)
                          }}
                        ></div>
                      </div>
                      <span className="detection-confidence">
                        Confidence: {(detection.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : result?.detections?.length === 0 ? (
              <div className="no-detections">
                <p>No objects detected in the image.</p>
              </div>
            ) : null}
          </section>
        )}
        {page === 'live' && (
        <section className="live-section">
          <h2>Live Webcam Detection</h2>
          <div className="button-group mb-2">
            {!liveRunning ? (
              <button className="btn btn-primary" onClick={startLive}>Start Live</button>
            ) : (
              <button className="btn btn-secondary" onClick={stopLive}>Stop Live</button>
            )}
            <label className="inline-control">
              <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
              Mirror
            </label>
            <div className="tuning">
              <label className="tuning-label">FPS: {liveFps}
                <input type="range" min="1" max="10" step="1" value={liveFps} onChange={(e) => setLiveFps(Number(e.target.value))} />
              </label>
              <label className="tuning-label">Conf: {liveConf.toFixed(2)}
                <input type="range" min="0" max="1" step="0.05" value={liveConf} onChange={(e) => setLiveConf(Number(e.target.value))} />
              </label>
            </div>
          </div>
          {liveError && <span className="error-message">{liveError}</span>}
          <div className="live-container">
            <video ref={videoRef} playsInline muted className={mirror ? 'mirror' : ''} />
            <canvas ref={canvasRef} className="live-overlay" />
          </div>
        </section>
        )}
        </main>
      </div>

      <footer className="footer">
        <div className="container">
          <p>Object Detection App &copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
