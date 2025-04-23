from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)  # Active CORS pour toutes les routes

@app.route('/')
def home():
    return jsonify({'message': "Bienvenue sur l'API Trafine 🚗"})

@app.route('/api/route')
def get_route():
    start = request.args.get('start')
    end = request.args.get('end')

    if not start or not end:
        return jsonify({'error': 'Champs manquants'}), 400

    try:
        # Exemple : start="49.1813403,-0.3635615" et end="49.4404591,1.0939658"
        url = f"http://osrm:5000/route/v1/driving/{start};{end}"
        params = {
            'overview': 'full',
            'geometries': 'geojson',
            'steps': 'true',
            'alternatives': 'true'
        }
        res = requests.get(url, params=params)
        res.raise_for_status()  # Pour lever une exception en cas de statut HTTP 4xx/5xx
        data = res.json()
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': f"Erreur API Trafine : {str(e)}"}), 500
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
