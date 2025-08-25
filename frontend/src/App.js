import React, { useState, useCallback } from 'react';
import './App.css';

const API_BASE_URL = 'http://localhost:8000';

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);

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
    setFile(null);
    setPreview('');
    setResult(null);
    setError('');
  };

  // Get confidence color based on value
  const getConfidenceColor = (confidence) => {
    if (confidence > 0.7) return '#28a745'; // Green
    if (confidence > 0.4) return '#ffc107'; // Yellow
    return '#dc3545'; // Red
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Object Detection</h1>
        <p>Upload an image to detect objects using YOLOv8</p>
        {result?.device && (
          <div className="device-info">
            Running on: {result.device.toUpperCase()}
          </div>
        )}
      </header>

      <main className="container">
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
                ) : 'Detect Objects'}
              </button>
            </div>
          </form>
        </section>

        {(preview || result) && (
          <section className="results-container">
            <div className="images-container">
              <div className="image-wrapper">
                <h3>Original Image</h3>
                <img 
                  src={preview} 
                  alt="Original preview" 
                  className="image-preview"
                />
              </div>

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
            </div>

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
      </main>

      <footer className="footer">
        <div className="container">
          <p>Object Detection App &copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
