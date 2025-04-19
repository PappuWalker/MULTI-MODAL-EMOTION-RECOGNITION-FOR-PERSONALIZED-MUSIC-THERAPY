from flask import Flask, render_template, request, jsonify
import cv2
import numpy as np
from tensorflow.keras.models import load_model # type: ignore
from googleapiclient.discovery import build
import os
from dotenv import load_dotenv
import base64

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Initialize YouTube API
YOUTUBE_API_KEY = os.getenv('YOUTUBE_API_KEY')
youtube = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)

# Create and load the model
try:
    emotion_model = load_model('emotion_model.h5')
except:
    from create_model import create_and_save_model
    emotion_model = create_and_save_model()

emotion_labels = ['Angry', 'Happy', 'Neutral', 'Sad', 'Surprised']

def detect_emotion(image):
    """
    Detect emotion from image using the model
    """
    # Preprocess image
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    faces = face_cascade.detectMultiScale(gray, 1.3, 5)
    
    if len(faces) == 0:
        return None
    
    # Get the first face
    (x, y, w, h) = faces[0]
    face_roi = gray[y:y+h, x:x+w]
    face_roi = cv2.resize(face_roi, (48, 48))
    face_roi = face_roi.astype("float") / 255.0
    face_roi = np.expand_dims(face_roi, axis=0)
    face_roi = np.expand_dims(face_roi, axis=-1)
    
    # Predict emotion
    preds = emotion_model.predict(face_roi, verbose=0)[0]
    emotion = emotion_labels[np.argmax(preds)]
    return emotion

# Rest of your code remains the same...
def search_youtube(artist, language, emotion):
    """
    Search for songs on YouTube based on artist, language, and emotion
    """
    # Map emotions to music moods
    emotion_to_mood = {
        'Happy': 'upbeat',
        'Sad': 'melancholic',
        'Angry': 'intense',
        'Neutral': 'calm',
        'Surprised': 'energetic'
    }
    
    mood = emotion_to_mood.get(emotion, '')
    search_query = f"{artist} {mood} {language} song"
    
    try:
        request = youtube.search().list(
            part="snippet",
            q=search_query,
            type="video",
            maxResults=5
        )
        response = request.execute()
        
        videos = []
        for item in response['items']:
            video = {
                'title': item['snippet']['title'],
                'videoId': item['id']['videoId'],
                'thumbnail': item['snippet']['thumbnails']['default']['url']
            }
            videos.append(video)
        return videos
    except Exception as e:
        print(f"Error searching YouTube: {e}")
        return []

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/capture_emotion', methods=['POST'])
def capture_emotion():
    try:
        # Get image data from the request
        image_data = request.json['image']
        image_data = image_data.split(',')[1]
        image_array = np.frombuffer(base64.b64decode(image_data), np.uint8)
        image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        
        # Detect emotion
        emotion = detect_emotion(image)
        if emotion is None:
            return jsonify({'error': 'No face detected'})
        
        return jsonify({'emotion': emotion})
    except Exception as e:
        return jsonify({'error': str(e)})

@app.route('/search_songs', methods=['POST'])
def search_songs():
    data = request.json
    artist = data.get('artist', '')
    language = data.get('language', '')
    emotion = data.get('emotion', '')
    
    videos = search_youtube(artist, language, emotion)
    return jsonify({'videos': videos})

if __name__ == '__main__':
    app.run(debug=True)